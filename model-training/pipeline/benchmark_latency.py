"""Benchmark end-to-end scoring latency.

Measures each pipeline stage independently and combined.
Simulates real runtime: 1 profile × N jobs.

Usage: python3 benchmark_latency.py
"""

import json
import pickle
import time
from pathlib import Path

import numpy as np

from config import DATA_DIR, MODELS_DIR
from normalize import normalize_profile, normalize_job
from features import extract_features, FEATURE_NAMES
from embeddings import EmbeddingCache, serialize_profile_skills, serialize_job_skills

PROFILES_PATH = DATA_DIR / "synthetic_profiles.json"
SCRAPED_JOBS_PATH = DATA_DIR / "scraped_jobs.json"
RERANKER_DIR = MODELS_DIR / "reranker"
EMBEDDINGS_CACHE_PATH = MODELS_DIR / "embedding_cache.pkl"

BATCH_SIZES = [10, 25, 50]
SHORTLIST_THRESHOLD = 60
COMPOSITE_WEIGHTS = {"skills": 0.5, "location": 0.25, "seniority": 0.15, "domain": 0.10}


def time_fn(fn, *args, n=100, **kwargs):
    """Run fn n times and return (result, mean_ms, p95_ms)."""
    times = []
    result = None
    for _ in range(n):
        start = time.perf_counter()
        result = fn(*args, **kwargs)
        times.append((time.perf_counter() - start) * 1000)
    return result, np.mean(times), np.percentile(times, 95)


def main():
    print("Loading data...")
    with open(PROFILES_PATH) as f:
        profiles = json.load(f)
    with open(SCRAPED_JOBS_PATH) as f:
        jobs = json.load(f)

    # Load models
    with open(MODELS_DIR / "skills_model.pkl", "rb") as f:
        skills_model = pickle.load(f)
    with open(MODELS_DIR / "skills_calibration.pkl", "rb") as f:
        skills_cal = pickle.load(f)

    embeddings = EmbeddingCache()
    embeddings.load(EMBEDDINGS_CACHE_PATH)

    # Pick a sample profile and jobs
    profile_raw = profiles[0]
    sample_jobs = [j for j in jobs if j.get("description")][:50]

    print(f"Profile: {profile_raw['roles'][0]} ({profile_raw['seniority']})")
    print(f"Jobs: {len(sample_jobs)}")

    # --- Stage 1: Normalization ---
    print(f"\n{'='*60}")
    print("STAGE 1: Normalization")
    print(f"{'='*60}")

    norm_p, mean_ms, p95 = time_fn(normalize_profile, profile_raw)
    print(f"  Profile normalize:  {mean_ms:.2f}ms mean, {p95:.2f}ms p95")

    norm_j, mean_ms, p95 = time_fn(normalize_job, sample_jobs[0])
    print(f"  Job normalize (1):  {mean_ms:.2f}ms mean, {p95:.2f}ms p95")

    def normalize_batch(jobs_batch):
        return [normalize_job(j) for j in jobs_batch]

    for n_jobs in BATCH_SIZES:
        batch = sample_jobs[:n_jobs]
        _, mean_ms, p95 = time_fn(normalize_batch, batch, n=20)
        print(f"  Job normalize ({n_jobs}): {mean_ms:.1f}ms mean, {p95:.1f}ms p95")

    norm_jobs = [normalize_job(j) for j in sample_jobs]

    # --- Stage 2: Embedding computation ---
    print(f"\n{'='*60}")
    print("STAGE 2: Embedding computation")
    print(f"{'='*60}")

    p_text = serialize_profile_skills(norm_p)
    j_texts = [serialize_job_skills(nj) for nj in norm_jobs]

    # Warm cache
    embeddings.encode_batch([p_text] + j_texts)

    # Measure cache hit (normal runtime path)
    _, mean_ms, p95 = time_fn(embeddings.cosine_sim, p_text, j_texts[0])
    print(f"  Cosine sim (cached): {mean_ms:.3f}ms mean, {p95:.3f}ms p95")

    # --- Stage 3: Feature extraction ---
    print(f"\n{'='*60}")
    print("STAGE 3: Feature extraction")
    print(f"{'='*60}")

    _, mean_ms, p95 = time_fn(extract_features, norm_p, norm_jobs[0], embeddings)
    print(f"  Extract (1 pair):   {mean_ms:.2f}ms mean, {p95:.2f}ms p95")

    def extract_batch(nj_batch):
        return [extract_features(norm_p, nj, embeddings) for nj in nj_batch]

    for n_jobs in BATCH_SIZES:
        batch = norm_jobs[:n_jobs]
        _, mean_ms, p95 = time_fn(extract_batch, batch, n=20)
        print(f"  Extract ({n_jobs} pairs): {mean_ms:.1f}ms mean, {p95:.1f}ms p95")

    # --- Stage 4: LightGBM inference ---
    print(f"\n{'='*60}")
    print("STAGE 4: LightGBM inference")
    print(f"{'='*60}")

    feats = [extract_features(norm_p, nj, embeddings) for nj in norm_jobs]

    X_1 = np.array([feats[0]])
    _, mean_ms, p95 = time_fn(skills_model.predict, X_1)
    print(f"  Predict (1 job):    {mean_ms:.3f}ms mean, {p95:.3f}ms p95")

    for n_jobs in BATCH_SIZES:
        X_batch = np.array(feats[:n_jobs])
        _, mean_ms, p95 = time_fn(skills_model.predict, X_batch, n=50)
        print(f"  Predict ({n_jobs} jobs):  {mean_ms:.3f}ms mean, {p95:.3f}ms p95")

    # Calibration
    raw_pred = skills_model.predict(X_1)
    _, mean_ms, p95 = time_fn(skills_cal.predict, raw_pred)
    print(f"  Calibrate (1):      {mean_ms:.3f}ms mean, {p95:.3f}ms p95")

    # --- Stage 5: Reranker inference ---
    print(f"\n{'='*60}")
    print("STAGE 5: MiniLM reranker inference")
    print(f"{'='*60}")

    if RERANKER_DIR.exists() and (RERANKER_DIR / "model.safetensors").exists():
        from sentence_transformers import CrossEncoder
        from reranker import serialize_profile, serialize_job, get_device

        device = get_device()
        reranker = CrossEncoder(str(RERANKER_DIR), device=device)
        p_ser = serialize_profile(profile_raw)

        # Single pair
        pair = [(p_ser, serialize_job(sample_jobs[0]))]
        _, mean_ms, p95 = time_fn(reranker.predict, pair, n=20)
        print(f"  Rerank (1 pair):    {mean_ms:.1f}ms mean, {p95:.1f}ms p95  [{device}]")

        for n_jobs in [5, 10, 20]:
            pairs = [(p_ser, serialize_job(j)) for j in sample_jobs[:n_jobs]]
            _, mean_ms, p95 = time_fn(reranker.predict, pairs, n=10)
            print(f"  Rerank ({n_jobs} pairs):  {mean_ms:.1f}ms mean, {p95:.1f}ms p95")
    else:
        print("  Reranker not found — skipping")

    # --- End-to-end ---
    print(f"\n{'='*60}")
    print("END-TO-END: Profile × N jobs")
    print(f"{'='*60}")

    def end_to_end(profile_raw, jobs_batch):
        np_ = normalize_profile(profile_raw)
        njs = [normalize_job(j) for j in jobs_batch]

        feats = [extract_features(np_, nj, embeddings) for nj in njs]
        X = np.array(feats)
        raw = skills_model.predict(X)
        cal = skills_cal.predict(raw)
        return cal

    for n_jobs in BATCH_SIZES:
        batch = sample_jobs[:n_jobs]
        _, mean_ms, p95 = time_fn(end_to_end, profile_raw, batch, n=10)
        print(f"  LightGBM ({n_jobs} jobs): {mean_ms:.1f}ms mean, {p95:.1f}ms p95")

    # With reranker shortlist
    if RERANKER_DIR.exists() and (RERANKER_DIR / "model.safetensors").exists():
        def end_to_end_full(profile_raw, jobs_batch):
            np_ = normalize_profile(profile_raw)
            njs = [normalize_job(j) for j in jobs_batch]
            feats = [extract_features(np_, nj, embeddings) for nj in njs]
            X = np.array(feats)
            raw = skills_model.predict(X)
            cal = skills_cal.predict(raw)

            # Shortlist
            shortlist_idx = [i for i, s in enumerate(cal) if s > SHORTLIST_THRESHOLD]
            if shortlist_idx:
                p_ser = serialize_profile(profile_raw)
                pairs = [(p_ser, serialize_job(jobs_batch[i])) for i in shortlist_idx]
                reranker.predict(pairs)

            return cal

        for n_jobs in BATCH_SIZES:
            batch = sample_jobs[:n_jobs]
            _, mean_ms, p95 = time_fn(end_to_end_full, profile_raw, batch, n=5)
            print(f"  Full pipeline ({n_jobs} jobs): {mean_ms:.1f}ms mean, {p95:.1f}ms p95")

    print(f"\n{'='*60}")
    print("BUDGET: <200ms for 25 jobs = production ready")
    print(f"{'='*60}")


if __name__ == "__main__":
    main()
