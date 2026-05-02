"""Evaluate trained models against 25 LLM-generated benchmark labels.

Usage:
  python3 evaluate.py                  # current models
  python3 evaluate.py --compare-phase1 # compare with Phase 1 results
"""

import json
import pickle
import sys
from pathlib import Path

import numpy as np
import pandas as pd
from scipy.stats import pearsonr, spearmanr

from config import BENCHMARKS_PATH, MODELS_DIR, DATA_DIR, score_domain_static
from normalize import normalize_profile, normalize_job
from features import extract_features, FEATURE_NAMES
from embeddings import EmbeddingCache, serialize_profile_skills, serialize_job_skills

DIMENSIONS = ["skills", "seniority", "domain", "location"]
GOLD_PATH = DATA_DIR / "gold_labels.json"


def _dcg(relevances: np.ndarray) -> float:
    return sum(r / np.log2(i + 2) for i, r in enumerate(relevances))


def _ndcg(true_scores: np.ndarray, pred_scores: np.ndarray) -> float:
    pred_order = np.argsort(-pred_scores)
    ideal_order = np.argsort(-true_scores)
    dcg = _dcg(true_scores[pred_order])
    idcg = _dcg(true_scores[ideal_order])
    return dcg / idcg if idcg > 0 else 1.0
PROFILES_PATH = DATA_DIR / "synthetic_profiles.json"
SCRAPED_JOBS_PATH = DATA_DIR / "scraped_jobs.json"
COMPOSITE_WEIGHTS = {"skills": 0.5, "location": 0.25, "seniority": 0.15, "domain": 0.10}

PHASE1_RESULTS = {
    "skills": {"mae": 25.4, "pearson": 0.777, "spearman": 0.809},
    "seniority": {"mae": 11.8, "pearson": 0.896, "spearman": 0.881},
    "domain": {"mae": 13.7, "pearson": 0.847, "spearman": 0.842},
    "location": {"mae": 4.8, "pearson": 0.960, "spearman": 0.984},
    "composite": {"mae": 8.6, "pearson": 0.954},
}


EMBEDDINGS_CACHE_PATH = MODELS_DIR / "embedding_cache.pkl"


def _load_embeddings() -> EmbeddingCache:
    embeddings = EmbeddingCache()
    embeddings.load(EMBEDDINGS_CACHE_PATH)
    return embeddings


def evaluate_on_benchmarks(models, calibrations):
    with open(BENCHMARKS_PATH) as f:
        benchmarks = json.load(f)

    benchmark_profile = benchmarks["benchmark_profile"]
    jobs_raw = benchmarks["jobs"]
    baselines = {b["job_id"]: b for b in benchmarks["baselines"]}

    norm_profile = normalize_profile(benchmark_profile)
    norm_jobs = {j["id"]: normalize_job(j) for j in jobs_raw}

    embeddings = _load_embeddings()
    all_texts = [serialize_profile_skills(norm_profile)]
    all_texts += [serialize_job_skills(j) for j in norm_jobs.values()]
    embeddings.encode_batch(all_texts)

    results = []
    for job_id, job in norm_jobs.items():
        feats = extract_features(norm_profile, job, embeddings=embeddings)
        X = np.array([feats])
        baseline = baselines[job_id]

        row = {"job_id": job_id}
        for dim in DIMENSIONS:
            y_raw = models[dim].predict(X)[0]
            y_cal = calibrations[dim].predict([y_raw])[0]
            row[f"{dim}_true"] = baseline[dim]
            row[f"{dim}_pred"] = round(y_cal, 1)

        true_composite = baseline.get("composite", 0)
        pred_composite = sum(row[f"{dim}_pred"] * COMPOSITE_WEIGHTS[dim] for dim in DIMENSIONS)
        row["composite_true"] = true_composite
        row["composite_pred"] = round(pred_composite, 1)

        seniority_delta = norm_profile.seniority_level - job.seniority_level
        row["overqualified_true"] = baseline.get("overqualified", False)
        row["overqualified_pred"] = seniority_delta >= 2

        results.append(row)

    return pd.DataFrame(results)


def print_report(df, compare_phase1=False):
    print("\n" + "=" * 70)
    print("EVALUATION REPORT")
    print("=" * 70)

    all_pearson = []
    for dim in DIMENSIONS:
        y_true = df[f"{dim}_true"].values
        y_pred = df[f"{dim}_pred"].values
        mae = np.mean(np.abs(y_pred - y_true))
        rmse = np.sqrt(np.mean((y_pred - y_true) ** 2))
        pr, pp = pearsonr(y_true, y_pred)
        sr, sp = spearmanr(y_true, y_pred)
        all_pearson.append(pr)

        print(f"\n  {dim.upper()}")
        print(f"    MAE:        {mae:6.1f}", end="")
        if compare_phase1:
            p1 = PHASE1_RESULTS[dim]["mae"]
            delta = mae - p1
            arrow = "↓" if delta < 0 else "↑"
            print(f"  ({arrow} {abs(delta):.1f} vs Phase 1: {p1:.1f})", end="")
        print()
        print(f"    RMSE:       {rmse:6.1f}")
        print(f"    Pearson r:  {pr:6.3f}  (p={pp:.2e})", end="")
        if compare_phase1:
            p1r = PHASE1_RESULTS[dim]["pearson"]
            delta = pr - p1r
            arrow = "↑" if delta > 0 else "↓"
            print(f"  ({arrow} {abs(delta):.3f} vs Phase 1: {p1r:.3f})", end="")
        print()
        print(f"    Spearman r: {sr:6.3f}  (p={sp:.2e})")

    y_ct = df["composite_true"].values
    y_cp = df["composite_pred"].values
    comp_mae = np.mean(np.abs(y_cp - y_ct))
    comp_r, comp_p = pearsonr(y_ct, y_cp)
    print(f"\n  COMPOSITE")
    print(f"    MAE:        {comp_mae:6.1f}", end="")
    if compare_phase1:
        p1 = PHASE1_RESULTS["composite"]["mae"]
        delta = comp_mae - p1
        arrow = "↓" if delta < 0 else "↑"
        print(f"  ({arrow} {abs(delta):.1f} vs Phase 1: {p1:.1f})", end="")
    print()
    print(f"    Pearson r:  {comp_r:6.3f}  (p={comp_p:.2e})")

    # Ranking metrics: NDCG and MRR
    # Group by profile (first part of pair_id) and compute per-profile ranking quality
    id_col = "pair_id" if "pair_id" in df.columns else "job_id"
    if "pair_id" in df.columns:
        df["_profile_id"] = df["pair_id"].apply(lambda x: x.split("_")[0])
        profile_groups = df.groupby("_profile_id")
        ndcg_scores = []
        mrr_scores = []
        for _, group in profile_groups:
            if len(group) < 2:
                continue
            true_order = group.sort_values("composite_true", ascending=False).index
            pred_order = group.sort_values("composite_pred", ascending=False).index
            true_ranks = group["composite_true"].values
            pred_ranks = group["composite_pred"].values
            ndcg = _ndcg(true_ranks, pred_ranks)
            ndcg_scores.append(ndcg)
            best_true_idx = group["composite_true"].idxmax()
            pred_sorted = group.sort_values("composite_pred", ascending=False)
            rank_of_best = list(pred_sorted.index).index(best_true_idx) + 1
            mrr_scores.append(1.0 / rank_of_best)

        if ndcg_scores:
            print(f"\n  RANKING METRICS")
            print(f"    NDCG:       {np.mean(ndcg_scores):6.3f}  ({len(ndcg_scores)} profile groups)")
            print(f"    MRR:        {np.mean(mrr_scores):6.3f}")
        df.drop(columns=["_profile_id"], inplace=True)

    oq_true = df["overqualified_true"].astype(int).values
    oq_pred = df["overqualified_pred"].astype(int).values
    oq_correct = np.sum(oq_true == oq_pred)
    oq_total = len(oq_true)
    tp = np.sum((oq_true == 1) & (oq_pred == 1))
    fp = np.sum((oq_true == 0) & (oq_pred == 1))
    fn = np.sum((oq_true == 1) & (oq_pred == 0))
    oq_prec = tp / (tp + fp) if (tp + fp) > 0 else 0
    oq_rec = tp / (tp + fn) if (tp + fn) > 0 else 0
    print(f"\n  OVERQUALIFIED")
    print(f"    Accuracy:   {oq_correct}/{oq_total} ({oq_correct/oq_total*100:.0f}%)")
    print(f"    Precision:  {oq_prec:.2f}")
    print(f"    Recall:     {oq_rec:.2f}")

    print("\n" + "=" * 70)
    print("GATE DECISION")
    print("=" * 70)

    mean_r = np.mean(all_pearson)
    min_r = np.min(all_pearson)
    print(f"\n  Mean Pearson r:  {mean_r:.3f}")
    print(f"  Min Pearson r:   {min_r:.3f}  ({DIMENSIONS[np.argmin(all_pearson)]})")

    if compare_phase1:
        p1_mean = np.mean([PHASE1_RESULTS[d]["pearson"] for d in DIMENSIONS])
        improved = mean_r > p1_mean
        print(f"\n  Phase 1 mean r:  {p1_mean:.3f}")
        print(f"  Phase 2 mean r:  {mean_r:.3f}")
        if improved:
            print(f"  PASS -- Metrics improved. Proceed to Phase 3.")
        else:
            print(f"  FAIL -- No improvement. Investigate data quality.")
    else:
        if mean_r >= 0.7 and min_r >= 0.5:
            print("\n  PASS -- Correlation strong.")
        elif mean_r >= 0.5:
            print("\n  MARGINAL -- Correlation moderate.")
        else:
            print("\n  FAIL -- Correlation weak.")

    id_col = "pair_id" if "pair_id" in df.columns else "job_id"
    print("\nPer-pair predictions:")
    print(df[[id_col, "skills_true", "skills_pred", "seniority_true", "seniority_pred",
              "domain_true", "domain_pred", "location_true", "location_pred",
              "composite_true", "composite_pred"]].to_string(index=False))

    return mean_r


ML_DIMENSIONS = ["skills"]  # only skills needs LightGBM


PROFILE_SEN_MAP = {"Junior": 1, "Mid": 2, "Senior": 3, "Staff": 4, "Principal": 5, "Executive": 6}
JOB_SEN_MAP_EVAL = {"Entry level": 1, "Associate": 2, "Mid-Senior level": 3, "Director": 4, "Executive": 5, "Not Applicable": None}


def _infer_level_from_title(title: str):
    import re
    t = title.lower()
    if re.search(r"\b(intern|trainee)\b", t): return 1
    if re.search(r"\bjunior\b", t): return 1
    if re.search(r"\bassociate\b", t) and "director" not in t and "manager" not in t: return 1
    if re.search(r"\bsde\s*1\b|\bsde\s*i\b|\bengineer\s*i\b|\bsoftware\s*engineer\s*i\b", t): return 1
    if re.search(r"\bfreshers?\b|\bentry\b|\(l1\)", t): return 1
    if re.search(r"\bsenior\b|\blead\b|\bsde\s*[23]\b", t): return 3
    if re.search(r"\b(staff|principal|architect)\b", t): return 4
    if re.search(r"\b(director|vp|vice president|head of)\b", t): return 4
    if re.search(r"\bmanager\b", t): return 3
    return None


def _score_seniority_static(profile_raw, job_raw):
    p_lvl = PROFILE_SEN_MAP.get(profile_raw["seniority"], 3)
    j_sen_field = job_raw.get("seniority_level", "Not Applicable")
    j_lvl = JOB_SEN_MAP_EVAL.get(j_sen_field)
    if j_lvl is None:
        j_lvl = _infer_level_from_title(job_raw.get("title", ""))
    if j_lvl is None:
        return 95
    delta = p_lvl - j_lvl
    scores = {0: 95, 1: 88, 2: 78, 3: 65, -1: 85, -2: 72}
    return scores.get(delta, 58 if delta > 3 else 62)


def _score_location_static(profile_raw, job_raw):
    CITY_ALIASES = {"bangalore": "bangalore", "bengaluru": "bangalore", "bangalore urban": "bangalore", "bengaluru east": "bangalore",
                    "mumbai": "mumbai", "mumbai metropolitan": "mumbai", "navi mumbai": "mumbai",
                    "pune": "pune", "pune division": "pune", "pune city": "pune", "pimpri": "pune",
                    "hyderabad": "hyderabad", "nampally": "hyderabad", "chennai": "chennai",
                    "delhi": "delhi", "new delhi": "delhi", "noida": "delhi", "gurgaon": "delhi", "gurugram": "delhi"}
    prefs = profile_raw.get("preferences", {})
    j_loc = job_raw.get("location") or ""
    if not j_loc or j_loc == "None": return 83
    j_loc_lower = j_loc.lower()
    if "remote" in j_loc_lower and prefs.get("remote"): return 98
    j_city = None
    for alias, canonical in CITY_ALIASES.items():
        if alias in j_loc_lower: j_city = canonical; break
    for pl in prefs.get("locations", []):
        p_city = None
        for alias, canonical in CITY_ALIASES.items():
            if alias in pl.lower(): p_city = canonical; break
        if p_city and j_city and p_city == j_city: return 97
    if "india" in j_loc_lower or j_city is not None: return 68
    return 60


def evaluate_on_gold(models, calibrations):
    with open(GOLD_PATH) as f:
        gold = json.load(f)
    with open(PROFILES_PATH) as f:
        profiles = json.load(f)
    with open(SCRAPED_JOBS_PATH) as f:
        jobs = json.load(f)
    with open(BENCHMARKS_PATH) as f:
        benchmarks = json.load(f)

    profiles_map = {p["profile_id"]: p for p in profiles}
    jobs_map = {j["id"]: j for j in jobs}
    for j in benchmarks["jobs"]:
        jobs_map[j["id"]] = j

    # Precompute embeddings for all gold pairs
    embeddings = _load_embeddings()
    emb_texts = []
    for g in gold:
        pid, jid = g["pair_id"].split("_", 1)
        p_raw = profiles_map.get(int(pid))
        j_raw = jobs_map.get(jid)
        if p_raw and j_raw:
            emb_texts.append(serialize_profile_skills(normalize_profile(p_raw)))
            emb_texts.append(serialize_job_skills(normalize_job(j_raw)))
    embeddings.encode_batch(emb_texts)

    results = []
    for g in gold:
        pid, jid = g["pair_id"].split("_", 1)
        profile_raw = profiles_map.get(int(pid))
        job_raw = jobs_map.get(jid)
        if not profile_raw or not job_raw:
            continue

        norm_p = normalize_profile(profile_raw)
        norm_j = normalize_job(job_raw)
        feats = extract_features(norm_p, norm_j, embeddings=embeddings)
        X = np.array([feats])

        row = {"pair_id": g["pair_id"]}
        # ML dimensions
        for dim in ML_DIMENSIONS:
            y_raw = models[dim].predict(X)[0]
            y_cal = calibrations[dim].predict([y_raw])[0]
            row[f"{dim}_true"] = g[dim]
            row[f"{dim}_pred"] = round(y_cal, 1)

        # Deterministic dimensions — use raw data, same logic as gold scorer
        row["seniority_true"] = g["seniority"]
        row["seniority_pred"] = _score_seniority_static(profile_raw, job_raw)
        row["location_true"] = g["location"]
        row["location_pred"] = _score_location_static(profile_raw, job_raw)
        row["domain_true"] = g["domain"]
        row["domain_pred"] = score_domain_static(profile_raw.get("domains", []), job_raw.get("industry", ""))

        pred_composite = sum(row[f"{dim}_pred"] * COMPOSITE_WEIGHTS[dim] for dim in DIMENSIONS)
        row["composite_true"] = g["composite"]
        row["composite_pred"] = round(pred_composite, 1)
        row["overqualified_true"] = g.get("overqualified", False)
        row["overqualified_pred"] = (norm_p.seniority_level - norm_j.seniority_level) >= 2

        results.append(row)

    return pd.DataFrame(results)


def main():
    use_gold = "--gold" in sys.argv
    compare = "--compare-phase1" in sys.argv

    print("Loading models (skills + domain only)...")
    models = {}
    calibrations = {}
    for dim in ML_DIMENSIONS:
        with open(MODELS_DIR / f"{dim}_model.pkl", "rb") as f:
            models[dim] = pickle.load(f)
        with open(MODELS_DIR / f"{dim}_calibration.pkl", "rb") as f:
            calibrations[dim] = pickle.load(f)
    print(f"  Loaded: {list(models.keys())} (seniority + location = deterministic)")

    if use_gold:
        print("Evaluating on GOLD dataset (48 pairs)...")
        df = evaluate_on_gold(models, calibrations)
    else:
        print("Evaluating on benchmark pairs (25 synthetic)...")
        df = evaluate_on_benchmarks(models, calibrations)

    mean_r = print_report(df, compare_phase1=compare)

    label = "gold" if use_gold else ("phase2" if compare else "phase1")
    output_csv = MODELS_DIR / f"{label}_eval_results.csv"
    df.to_csv(output_csv, index=False)
    print(f"\nResults saved to {output_csv}")


if __name__ == "__main__":
    main()
