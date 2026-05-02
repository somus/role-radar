"""Generate strategic profile-job pairs for training.

Uses normalized role families (not raw hints) and skill overlap scoring.

Usage: python3 pair_generator.py
"""

import json
import random
from pathlib import Path
from collections import defaultdict

from config import DATA_DIR, are_roles_adjacent, normalize_skill
from normalize import normalize_job, normalize_profile

SCRAPED_JOBS_PATH = DATA_DIR / "scraped_jobs.json"
PROFILES_PATH = DATA_DIR / "synthetic_profiles.json"
OUTPUT_PATH = DATA_DIR / "phase3_pairs.json"

TARGET_PAIRS = 5000
POSITIVE_RATIO = 0.30
NEGATIVE_RATIO = 0.30
HARD_NEGATIVE_RATIO = 0.40

random.seed(42)

NON_TECH_FAMILIES = {"sales", "marketing", "hr", "finance", "operations",
                     "customer_success", "legal"}


def _skill_overlap(profile_skills: set[str], job_skills: set[str]) -> float:
    if not job_skills:
        return 0.0
    return len(profile_skills & job_skills) / len(job_skills)


def main():
    print("Loading data...")
    with open(SCRAPED_JOBS_PATH) as f:
        jobs_raw = json.load(f)
    with open(PROFILES_PATH) as f:
        profiles_raw = json.load(f)

    jobs_with_desc = [j for j in jobs_raw if j.get("description")]
    print(f"Jobs: {len(jobs_raw)} total, {len(jobs_with_desc)} with descriptions")
    print(f"Profiles: {len(profiles_raw)}")

    print("Normalizing jobs and profiles...")
    norm_jobs = {}
    for j in jobs_with_desc:
        nj = normalize_job(j)
        norm_jobs[j["id"]] = nj

    norm_profiles = {}
    for p in profiles_raw:
        np_ = normalize_profile(p)
        norm_profiles[p["profile_id"]] = np_

    jobs_by_family: dict[str, list[dict]] = defaultdict(list)
    for j in jobs_with_desc:
        family = norm_jobs[j["id"]].role_family
        j["_norm_family"] = family
        jobs_by_family[family].append(j)

    profiles_by_family: dict[str, list[dict]] = defaultdict(list)
    for p in profiles_raw:
        family = norm_profiles[p["profile_id"]].role_family
        p["_norm_family"] = family
        profiles_by_family[family].append(p)

    print(f"\nJobs by family:")
    for k, v in sorted(jobs_by_family.items(), key=lambda x: -len(x[1])):
        print(f"  {k}: {len(v)}")
    print(f"Profiles by family:")
    for k, v in sorted(profiles_by_family.items(), key=lambda x: -len(x[1])):
        print(f"  {k}: {len(v)}")

    n_positive = int(TARGET_PAIRS * POSITIVE_RATIO)
    n_negative = int(TARGET_PAIRS * NEGATIVE_RATIO)
    n_hard_negative = TARGET_PAIRS - n_positive - n_negative

    pairs = []
    seen = set()

    def add_pair(profile: dict, job: dict, pair_type: str) -> bool:
        pair_id = f"{profile['profile_id']}_{job['id']}"
        if pair_id in seen:
            return False
        seen.add(pair_id)

        np_ = norm_profiles[profile["profile_id"]]
        nj = norm_jobs[job["id"]]
        p_skills = {s.lower() for s in np_.skills}
        j_skills = {s.lower() for s in nj.must_have_skills + nj.nice_to_have_skills}

        pairs.append({
            "pair_id": pair_id,
            "profile_id": profile["profile_id"],
            "job_id": job["id"],
            "pair_type": pair_type,
            "profile_role_family": profile["_norm_family"],
            "job_role_family": job["_norm_family"],
            "profile_seniority": profile["seniority"],
            "skill_overlap": round(_skill_overlap(p_skills, j_skills), 3),
        })
        return True

    all_job_families = list(jobs_by_family.keys())
    all_profile_families = list(profiles_by_family.keys())

    # --- Positive pairs: same family or adjacent with high skill overlap ---
    print(f"\nGenerating {n_positive} positive pairs...")
    positive_count = 0
    attempts = 0
    while positive_count < n_positive and attempts < n_positive * 10:
        attempts += 1
        family = random.choice(all_job_families)
        candidates = profiles_by_family.get(family, [])
        if not candidates:
            adj_fams = [f for f in all_profile_families if are_roles_adjacent(f, family)]
            if adj_fams:
                family_p = random.choice(adj_fams)
                candidates = profiles_by_family.get(family_p, [])
        if not candidates or not jobs_by_family[family]:
            continue

        job = random.choice(jobs_by_family[family])
        profile = random.choice(candidates)

        np_ = norm_profiles[profile["profile_id"]]
        nj = norm_jobs[job["id"]]
        p_skills = {s.lower() for s in np_.skills}
        j_skills = {s.lower() for s in nj.must_have_skills + nj.nice_to_have_skills}
        overlap = _skill_overlap(p_skills, j_skills)

        if overlap >= 0.2 or not j_skills:
            if add_pair(profile, job, "positive"):
                positive_count += 1

    print(f"  Created {positive_count} positive pairs")

    # --- Negative pairs: non-adjacent families ---
    print(f"Generating {n_negative} negative pairs...")
    negative_count = 0
    attempts = 0
    while negative_count < n_negative and attempts < n_negative * 10:
        attempts += 1
        fam1 = random.choice(all_profile_families)
        fam2 = random.choice(all_job_families)
        if fam1 == fam2 or are_roles_adjacent(fam1, fam2):
            continue
        if not profiles_by_family.get(fam1) or not jobs_by_family.get(fam2):
            continue

        profile = random.choice(profiles_by_family[fam1])
        job = random.choice(jobs_by_family[fam2])
        if add_pair(profile, job, "negative"):
            negative_count += 1

    print(f"  Created {negative_count} negative pairs")

    # --- Hard-negative pairs ---
    print(f"Generating {n_hard_negative} hard-negative pairs...")
    hard_neg_count = 0
    attempts = 0
    strategies = ["adjacent_family", "wrong_seniority", "cross_family_partial",
                  "tech_nontech_crossover"]
    while hard_neg_count < n_hard_negative and attempts < n_hard_negative * 10:
        attempts += 1
        strategy = random.choice(strategies)

        if strategy == "adjacent_family":
            fam1 = random.choice(all_profile_families)
            adjacent_fams = [f for f in all_job_families if f != fam1 and are_roles_adjacent(fam1, f)]
            if not adjacent_fams:
                continue
            fam2 = random.choice(adjacent_fams)
            if not profiles_by_family.get(fam1) or not jobs_by_family.get(fam2):
                continue
            profile = random.choice(profiles_by_family[fam1])
            job = random.choice(jobs_by_family[fam2])

        elif strategy == "wrong_seniority":
            family = random.choice(all_job_families)
            if not jobs_by_family[family] or not profiles_by_family.get(family):
                continue
            job = random.choice(jobs_by_family[family])
            senior_profiles = [p for p in profiles_by_family[family]
                               if p["seniority"] in ("Staff", "Senior")]
            junior_profiles = [p for p in profiles_by_family[family]
                               if p["seniority"] in ("Junior",)]
            if random.random() < 0.5 and senior_profiles:
                profile = random.choice(senior_profiles)
            elif junior_profiles:
                profile = random.choice(junior_profiles)
            else:
                continue

        elif strategy == "tech_nontech_crossover":
            tech_fams = [f for f in all_profile_families if f not in NON_TECH_FAMILIES]
            nontech_fams = [f for f in all_job_families if f in NON_TECH_FAMILIES]
            if not tech_fams or not nontech_fams:
                continue
            if random.random() < 0.5:
                fam1 = random.choice(tech_fams)
                fam2 = random.choice(nontech_fams)
            else:
                fam1 = random.choice([f for f in all_profile_families if f in NON_TECH_FAMILIES])
                fam2 = random.choice([f for f in all_job_families if f not in NON_TECH_FAMILIES])
                if not fam1 or not fam2:
                    continue
            if not profiles_by_family.get(fam1) or not jobs_by_family.get(fam2):
                continue
            profile = random.choice(profiles_by_family[fam1])
            job = random.choice(jobs_by_family[fam2])

        else:  # cross_family_partial
            fam1 = random.choice(all_profile_families)
            other_fams = [f for f in all_job_families if f != fam1]
            if not other_fams:
                continue
            fam2 = random.choice(other_fams)
            if not profiles_by_family.get(fam1) or not jobs_by_family.get(fam2):
                continue
            profile = random.choice(profiles_by_family[fam1])
            job = random.choice(jobs_by_family[fam2])

        if add_pair(profile, job, "hard_negative"):
            hard_neg_count += 1

    print(f"  Created {hard_neg_count} hard-negative pairs")

    print(f"\nTotal pairs: {len(pairs)}")
    type_counts = defaultdict(int)
    for p in pairs:
        type_counts[p["pair_type"]] += 1
    print(f"By type: {dict(type_counts)}")

    family_counts = defaultdict(int)
    for p in pairs:
        family_counts[p["job_role_family"]] += 1
    print(f"By job family: {dict(sorted(family_counts.items(), key=lambda x: -x[1]))}")

    with open(OUTPUT_PATH, "w") as f:
        json.dump(pairs, f, indent=2)
    print(f"Saved to {OUTPUT_PATH}")


if __name__ == "__main__":
    main()
