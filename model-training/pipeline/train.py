"""Train 4 LightGBM models (one per dimension) + isotonic calibration.

Phase 1: python3 train.py
Phase 2: python3 train.py --phase 2
"""

import json
import pickle
import sys
from pathlib import Path

import numpy as np
import lightgbm as lgb
from sklearn.isotonic import IsotonicRegression

from config import PROFILES_PATH, MODELS_DIR, LIGHTGBM_PARAMS, DATA_DIR
from normalize import normalize_profile, normalize_job
from features import extract_features, FEATURE_NAMES
from embeddings import EmbeddingCache, serialize_profile_skills, serialize_job_skills

DIMENSIONS = ["skills", "seniority", "domain", "location"]
ML_DIMENSIONS = ["skills"]  # only skills needs LightGBM; seniority, location, domain are deterministic

SCRAPED_JOBS_PATH = DATA_DIR / "scraped_jobs.json"
PAIRS_PATH = DATA_DIR / "phase3_pairs.json"
LABELS_PATH = DATA_DIR / "phase3_labels.json"
PHASE2_PAIRS_PATH = DATA_DIR / "phase2_pairs.json"
PHASE2_LABELS_PATH = DATA_DIR / "phase2_labels.json"


EMBEDDINGS_CACHE_PATH = MODELS_DIR / "embedding_cache.pkl"


def load_training_data(profiles_raw):
    """Load labeled pairs — combines phase2 + phase3 when both available."""
    with open(SCRAPED_JOBS_PATH) as f:
        scraped_jobs = json.load(f)

    pairs = []
    labels_map = {}

    # Load phase2 data
    if PHASE2_PAIRS_PATH.exists() and PHASE2_LABELS_PATH.exists():
        with open(PHASE2_PAIRS_PATH) as f:
            pairs.extend(json.load(f))
        with open(PHASE2_LABELS_PATH) as f:
            for l in json.load(f):
                labels_map[l["pair_id"]] = l
        print(f"  Phase2: {len(pairs)} pairs, {len(labels_map)} labels")

    # Load phase3 data (overrides duplicate pair_ids with phase3 labels)
    if PAIRS_PATH.exists() and LABELS_PATH.exists():
        with open(PAIRS_PATH) as f:
            p3_pairs = json.load(f)
        with open(LABELS_PATH) as f:
            for l in json.load(f):
                labels_map[l["pair_id"]] = l
        existing_ids = {p["pair_id"] for p in pairs}
        new_pairs = [p for p in p3_pairs if p["pair_id"] not in existing_ids]
        pairs.extend(new_pairs)
        print(f"  Phase3: {len(p3_pairs)} pairs ({len(new_pairs)} new), {len(labels_map)} total labels")
    profiles_map = {p["profile_id"]: p for p in profiles_raw}
    jobs_map = {j["id"]: j for j in scraped_jobs}

    norm_profiles_cache = {}
    norm_jobs_cache = {}

    X_train = {d: [] for d in ML_DIMENSIONS}
    y_train = {d: [] for d in ML_DIMENSIONS}
    skipped = 0

    # Normalize all profiles and jobs first
    for pair in pairs:
        pid = pair["profile_id"]
        jid = pair["job_id"]
        if pid not in norm_profiles_cache:
            p_raw = profiles_map.get(pid)
            if p_raw:
                norm_profiles_cache[pid] = normalize_profile(p_raw)
        if jid not in norm_jobs_cache:
            j_raw = jobs_map.get(jid)
            if j_raw:
                norm_jobs_cache[jid] = normalize_job(j_raw)

    # Precompute embeddings in batch
    print("  Loading embedding model and precomputing embeddings...")
    embeddings = EmbeddingCache()
    embeddings.load(EMBEDDINGS_CACHE_PATH)
    profile_texts = [serialize_profile_skills(p) for p in norm_profiles_cache.values()]
    job_texts = [serialize_job_skills(j) for j in norm_jobs_cache.values()]
    embeddings.encode_batch(profile_texts + job_texts)
    MODELS_DIR.mkdir(parents=True, exist_ok=True)
    embeddings.save(EMBEDDINGS_CACHE_PATH)
    print(f"  Embeddings cached: {len(profile_texts)} profiles, {len(job_texts)} jobs")

    for pair in pairs:
        label = labels_map.get(pair["pair_id"])
        if not label:
            skipped += 1
            continue

        pid = pair["profile_id"]
        jid = pair["job_id"]
        if pid not in norm_profiles_cache or jid not in norm_jobs_cache:
            skipped += 1
            continue

        feats = extract_features(norm_profiles_cache[pid], norm_jobs_cache[jid], embeddings=embeddings)
        for dim in ML_DIMENSIONS:
            X_train[dim].append(feats)
            y_train[dim].append(label[dim])

    print(f"  Phase 2 pairs loaded: {len(X_train['skills'])}, skipped: {skipped}")
    return X_train, y_train


def main():
    print("=== Training Phase 2 ===\n")
    print("Loading data...")

    with open(PROFILES_PATH) as f:
        profiles_raw = json.load(f)

    X_train, y_train = load_training_data(profiles_raw)

    for dim in ML_DIMENSIONS:
        X_train[dim] = np.array(X_train[dim])
        y_train[dim] = np.array(y_train[dim], dtype=float)

    n_train = X_train["skills"].shape[0]
    print(f"Training pairs: {n_train}")
    print(f"Features per pair: {X_train['skills'].shape[1]}")
    print(f"ML model: {ML_DIMENSIONS}")
    print(f"Deterministic: seniority, location, domain")

    MODELS_DIR.mkdir(parents=True, exist_ok=True)

    models = {}
    calibrations = {}

    from sklearn.model_selection import KFold

    for dim in ML_DIMENSIONS:
        print(f"\n{'='*60}")
        print(f"Training {dim.upper()} model...")
        print(f"{'='*60}")

        X, y = X_train[dim], y_train[dim]

        # Cross-validated calibration: get out-of-fold predictions
        kf = KFold(n_splits=5, shuffle=True, random_state=42)
        oof_preds = np.zeros(len(y))
        for fold_train, fold_val in kf.split(X):
            fold_model = lgb.LGBMRegressor(**LIGHTGBM_PARAMS)
            fold_model.fit(X[fold_train], y[fold_train])
            oof_preds[fold_val] = fold_model.predict(X[fold_val])

        iso = IsotonicRegression(y_min=50, y_max=100, out_of_bounds="clip")
        iso.fit(oof_preds, y)
        calibrations[dim] = iso

        oof_cal = iso.predict(oof_preds)
        oof_mae = np.mean(np.abs(oof_cal - y))
        print(f"  Cross-validated MAE (calibrated): {oof_mae:.2f}")

        # Train final model on all data
        model = lgb.LGBMRegressor(**LIGHTGBM_PARAMS)
        model.fit(X, y)
        models[dim] = model

        importances = model.feature_importances_
        top_features = sorted(zip(FEATURE_NAMES, importances), key=lambda x: -x[1])[:5]
        print(f"  Top features: {', '.join(f'{n}({v})' for n, v in top_features)}")

    print(f"\nSaving models to {MODELS_DIR}...")
    for dim in ML_DIMENSIONS:
        with open(MODELS_DIR / f"{dim}_model.pkl", "wb") as f:
            pickle.dump(models[dim], f)
        with open(MODELS_DIR / f"{dim}_calibration.pkl", "wb") as f:
            pickle.dump(calibrations[dim], f)

    with open(MODELS_DIR / "feature_names.json", "w") as f:
        json.dump(FEATURE_NAMES, f)

    print("Done. Run evaluate.py for full metrics.")


if __name__ == "__main__":
    main()
