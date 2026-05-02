"""Expand gold eval set with balanced role family coverage.

Selects candidate pairs, labels with Gemini, outputs for human review.

Usage: GEMINI_API_KEY=... python3 gold_expander.py
"""

import json
import os
import sys
import time
import random
from pathlib import Path
from collections import defaultdict, Counter
from functools import partial

print = partial(__builtins__.__dict__["print"], flush=True)

from config import DATA_DIR
from normalize import normalize_job, normalize_profile
from config import score_domain_static
from gemini_labeler import (
    call_gemini, build_few_shot_examples, format_profile, format_job,
    score_seniority_static, score_location_static,
    SCORING_PROMPT, GEMINI_RESPONSE_SCHEMA
)

GOLD_PATH = DATA_DIR / "gold_labels.json"
PROFILES_PATH = DATA_DIR / "synthetic_profiles.json"
SCRAPED_JOBS_PATH = DATA_DIR / "scraped_jobs.json"
BENCHMARKS_PATH = DATA_DIR / "benchmarks.json"
CANDIDATES_PATH = DATA_DIR / "gold_candidates.json"

GEMINI_MODEL = "gemini-2.5-flash-lite"
GEMINI_URL = "https://generativelanguage.googleapis.com/v1beta/models"

TARGET_NEW_PAIRS = 60

# Target coverage per family (minimum pairs including existing gold)
FAMILY_TARGETS = {
    "fullstack": 10, "backend": 10, "frontend": 8, "devops": 8,
    "data": 8, "mobile": 6, "product": 6, "systems": 4,
    "sales": 6, "marketing": 6, "hr": 6, "finance": 4,
    "operations": 4, "customer_success": 4, "legal": 2,
}

SENIORITY_TARGETS = {"Junior": 20, "Mid": 25, "Senior": 25, "Staff": 20}

random.seed(123)


def select_candidates(profiles_map, jobs_map, existing_gold_ids):
    norm_profiles = {pid: normalize_profile(p) for pid, p in profiles_map.items()}
    norm_jobs = {jid: normalize_job(j) for jid, j in jobs_map.items()
                 if j.get("description")}

    # Count existing gold coverage
    existing_job_families = Counter()
    existing_seniorities = Counter()
    for gid in existing_gold_ids:
        pid, jid = gid.split("_", 1)
        p = profiles_map.get(int(pid))
        j = jobs_map.get(jid)
        if p and j and jid in norm_jobs:
            existing_job_families[norm_jobs[jid].role_family] += 1
            existing_seniorities[p["seniority"]] += 1

    # Calculate how many new pairs each family needs
    family_needs = {}
    for fam, target in FAMILY_TARGETS.items():
        have = existing_job_families.get(fam, 0)
        need = max(0, target - have)
        family_needs[fam] = need

    print(f"Family needs: {dict(sorted(family_needs.items(), key=lambda x: -x[1]))}")

    # Group jobs and profiles by family
    jobs_by_family = defaultdict(list)
    for jid, nj in norm_jobs.items():
        jobs_by_family[nj.role_family].append(jid)

    profiles_by_family = defaultdict(list)
    for pid, np_ in norm_profiles.items():
        profiles_by_family[np_.role_family].append(pid)

    candidates = []
    seen = set(existing_gold_ids)

    # Strategy 1: Same-family positive pairs for underrepresented families
    for fam, need in sorted(family_needs.items(), key=lambda x: -x[1]):
        if need == 0:
            continue
        j_ids = jobs_by_family.get(fam, [])
        p_ids = profiles_by_family.get(fam, [])
        if not j_ids:
            # Use adjacent family profiles
            from config import ROLE_FAMILIES, are_roles_adjacent
            adj_profiles = []
            for f2, pids in profiles_by_family.items():
                if are_roles_adjacent(f2, fam):
                    adj_profiles.extend(pids)
            p_ids = adj_profiles

        if not j_ids or not p_ids:
            continue

        added = 0
        attempts = 0
        while added < need and attempts < need * 20:
            attempts += 1
            jid = random.choice(j_ids)
            pid = random.choice(p_ids)
            pair_id = f"{pid}_{jid}"
            if pair_id in seen:
                continue
            seen.add(pair_id)
            candidates.append({
                "pair_id": pair_id,
                "profile_id": pid,
                "job_id": jid,
                "strategy": "same_family",
                "job_family": fam,
            })
            added += 1

    # Strategy 2: Cross-family pairs for score diversity (low scores)
    all_families = list(jobs_by_family.keys())
    cross_needed = max(0, TARGET_NEW_PAIRS - len(candidates))
    cross_added = 0
    attempts = 0
    while cross_added < cross_needed and attempts < cross_needed * 20:
        attempts += 1
        fam1 = random.choice(list(profiles_by_family.keys()))
        fam2 = random.choice(all_families)
        if fam1 == fam2:
            continue
        p_ids = profiles_by_family[fam1]
        j_ids = jobs_by_family[fam2]
        if not p_ids or not j_ids:
            continue
        pid = random.choice(p_ids)
        jid = random.choice(j_ids)
        pair_id = f"{pid}_{jid}"
        if pair_id in seen:
            continue
        seen.add(pair_id)
        candidates.append({
            "pair_id": pair_id,
            "profile_id": pid,
            "job_id": jid,
            "strategy": "cross_family",
            "job_family": fam2,
        })
        cross_added += 1

    return candidates[:TARGET_NEW_PAIRS]


def label_candidates(candidates, profiles_map, jobs_map, api_key, benchmarks):
    few_shot = build_few_shot_examples(benchmarks)
    labeled = []
    batch_size = 5  # smaller batches for higher quality

    batches = [candidates[i:i+batch_size] for i in range(0, len(candidates), batch_size)]

    for i, batch in enumerate(batches):
        print(f"  Labeling batch {i+1}/{len(batches)} ({len(batch)} pairs)...")

        parts = [SCORING_PROMPT, "", "Calibration examples:", few_shot, "", "Score these pairs:"]
        for cand in batch:
            profile = profiles_map.get(cand["profile_id"])
            job = jobs_map.get(cand["job_id"])
            if not profile or not job:
                continue
            parts.append(f'\n--- Pair "{cand["pair_id"]}" ---')
            parts.append(f"[PROFILE]\n{format_profile(profile)}")
            parts.append(f"[JOB]\n{format_job(job)}")

        prompt = "\n".join(parts)
        scores = call_gemini(prompt, api_key)

        if scores:
            scores_map = {s["pairId"]: s for s in scores}
            for cand in batch:
                score = scores_map.get(cand["pair_id"])
                if not score:
                    continue
                profile = profiles_map[cand["profile_id"]]
                job = jobs_map[cand["job_id"]]
                seniority, overqualified = score_seniority_static(profile, job)
                location = score_location_static(profile, job)
                domain = score_domain_static(profile.get("domains", []), job.get("industry", ""))
                skills = score["skills"]
                composite = round(skills * 0.5 + location * 0.25 + seniority * 0.15 + domain * 0.10)
                labeled.append({
                    "pair_id": cand["pair_id"],
                    "skills": skills,
                    "seniority": seniority,
                    "domain": domain,
                    "location": location,
                    "composite": composite,
                    "overqualified": overqualified,
                    "matches": score.get("matches", []),
                    "gaps": score.get("gaps", []),
                    "job_family": cand["job_family"],
                    "strategy": cand["strategy"],
                    "review_status": "pending",
                })
        time.sleep(1)

    return labeled


def main():
    api_key = os.environ.get("GEMINI_API_KEY")
    if not api_key:
        print("Error: GEMINI_API_KEY not set")
        sys.exit(1)

    print("Loading data...")
    with open(GOLD_PATH) as f:
        existing_gold = json.load(f)
    with open(PROFILES_PATH) as f:
        profiles = json.load(f)
    with open(SCRAPED_JOBS_PATH) as f:
        scraped_jobs = json.load(f)
    with open(BENCHMARKS_PATH) as f:
        benchmarks = json.load(f)

    profiles_map = {p["profile_id"]: p for p in profiles}
    jobs_map = {j["id"]: j for j in scraped_jobs}
    for j in benchmarks["jobs"]:
        jobs_map[j["id"]] = j

    existing_ids = {g["pair_id"] for g in existing_gold}
    print(f"Existing gold: {len(existing_gold)} pairs")

    print("\nSelecting candidate pairs...")
    candidates = select_candidates(profiles_map, jobs_map, existing_ids)
    print(f"Selected {len(candidates)} candidates")

    family_dist = Counter(c["job_family"] for c in candidates)
    strategy_dist = Counter(c["strategy"] for c in candidates)
    print(f"By family: {dict(sorted(family_dist.items(), key=lambda x: -x[1]))}")
    print(f"By strategy: {dict(strategy_dist)}")

    print("\nLabeling with Gemini...")
    labeled = label_candidates(candidates, profiles_map, jobs_map, api_key, benchmarks)
    print(f"Labeled: {len(labeled)} pairs")

    # Save candidates for review
    with open(CANDIDATES_PATH, "w") as f:
        json.dump(labeled, f, indent=2)
    print(f"Saved candidates to {CANDIDATES_PATH}")

    # Merge into gold (pending review)
    merged = existing_gold + labeled
    with open(GOLD_PATH, "w") as f:
        json.dump(merged, f, indent=2)
    print(f"Merged gold set: {len(merged)} pairs (new ones marked review_status=pending)")

    # Coverage report
    print(f"\n{'='*60}")
    print("EXPANDED GOLD COVERAGE")
    print(f"{'='*60}")
    job_fam = Counter()
    score_bands = Counter()
    for g in merged:
        pid, jid = g["pair_id"].split("_", 1)
        j = jobs_map.get(jid)
        if j:
            nj = normalize_job(j)
            job_fam[nj.role_family] += 1
        comp = g["composite"]
        if comp >= 90: score_bands["90-100"] += 1
        elif comp >= 80: score_bands["80-89"] += 1
        elif comp >= 70: score_bands["70-79"] += 1
        elif comp >= 60: score_bands["60-69"] += 1
        else: score_bands["<60"] += 1

    print(f"\nJob families ({len(merged)} total):")
    for k, v in sorted(job_fam.items(), key=lambda x: -x[1]):
        print(f"  {k}: {v}")
    print(f"\nScore bands:")
    for k in ["90-100", "80-89", "70-79", "60-69", "<60"]:
        print(f"  {k}: {score_bands.get(k, 0)}")


if __name__ == "__main__":
    main()
