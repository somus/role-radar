"""Fine-tune MiniLM cross-encoder for semantic job-profile reranking.

Stage 2 of scoring pipeline: LightGBM filters → MiniLM reranks shortlist.

Input: serialized profile + job text pair
Output: scalar relevance score (0-1)

Usage:
  python3 reranker.py train          # fine-tune on labeled pairs
  python3 reranker.py evaluate       # evaluate on gold set
  python3 reranker.py export-onnx    # export to ONNX for runtime

Trains on MPS (Apple Silicon GPU) when available, CPU fallback.
"""

import json
import sys
import os
from pathlib import Path

import numpy as np
import torch
from torch.utils.data import Dataset, DataLoader

from config import DATA_DIR, MODELS_DIR

PHASE2_PAIRS_PATH = DATA_DIR / "phase2_pairs.json"
PHASE2_LABELS_PATH = DATA_DIR / "phase2_labels.json"
PHASE3_PAIRS_PATH = DATA_DIR / "phase3_pairs.json"
PHASE3_LABELS_PATH = DATA_DIR / "phase3_labels.json"
PROFILES_PATH = DATA_DIR / "synthetic_profiles.json"
SCRAPED_JOBS_PATH = DATA_DIR / "scraped_jobs.json"
BENCHMARKS_PATH = DATA_DIR / "benchmarks.json"
GOLD_PATH = DATA_DIR / "gold_labels.json"
ATS_PAIRS_PATH = DATA_DIR / "ats_reranker_pairs.json"
SCREENING_PAIRS_PATH = DATA_DIR / "screening_reranker_pairs.json"

RERANKER_DIR = MODELS_DIR / "reranker"
MODEL_NAME = "cross-encoder/ms-marco-MiniLM-L-6-v2"

EPOCHS = 3
BATCH_SIZE = 16
LEARNING_RATE = 2e-5
MAX_LENGTH = 384
WARMUP_RATIO = 0.1


def get_device():
    if torch.backends.mps.is_available():
        return torch.device("mps")
    return torch.device("cpu")


def serialize_profile(profile: dict) -> str:
    prefs = profile.get("preferences", {})
    parts = [
        f"Role: {', '.join(profile['roles'])}",
        f"Skills: {', '.join(profile['skills_primary'][:8])}",
    ]
    if profile.get("skills_secondary"):
        parts.append(f"Also: {', '.join(profile['skills_secondary'][:4])}")
    parts.append(f"Seniority: {profile['seniority']}")
    parts.append(f"Experience: {profile['experience_years']} years")
    parts.append(f"Domains: {', '.join(profile['domains'])}")
    return " | ".join(parts)


def serialize_job(job: dict) -> str:
    desc = job.get("description", "") or ""
    if len(desc) > 800:
        desc = desc[:800]
    parts = [f"Title: {job.get('title', '?')}"]
    if job.get("company"):
        parts.append(f"Company: {job['company']}")
    if job.get("location"):
        parts.append(f"Location: {job['location']}")
    if job.get("industry"):
        parts.append(f"Industry: {job['industry']}")
    if desc:
        parts.append(f"Description: {desc}")
    return " | ".join(parts)


def normalize_composite(score: int) -> float:
    """Map composite score (50-100) to regression target (0-1)."""
    return max(0.0, min(1.0, (score - 50) / 50.0))


def denormalize_score(val: float) -> int:
    """Map (0-1) back to (50-100)."""
    return int(round(val * 50 + 50))


class PairDataset(Dataset):
    def __init__(self, texts_a, texts_b, labels):
        self.texts_a = texts_a
        self.texts_b = texts_b
        self.labels = labels

    def __len__(self):
        return len(self.labels)

    def __getitem__(self, idx):
        return self.texts_a[idx], self.texts_b[idx], self.labels[idx]


def load_training_data():
    """Load all labeled pairs and serialize as text pairs."""
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

    labels_map = {}
    pairs = []

    for pairs_path, labels_path in [
        (PHASE2_PAIRS_PATH, PHASE2_LABELS_PATH),
        (PHASE3_PAIRS_PATH, PHASE3_LABELS_PATH),
    ]:
        if not pairs_path.exists() or not labels_path.exists():
            continue
        with open(pairs_path) as f:
            p_list = json.load(f)
        with open(labels_path) as f:
            for l in json.load(f):
                labels_map[l["pair_id"]] = l
        existing = {p["pair_id"] for p in pairs}
        pairs.extend(p for p in p_list if p["pair_id"] not in existing)

    texts_a, texts_b, targets = [], [], []
    skipped = 0

    for pair in pairs:
        label = labels_map.get(pair["pair_id"])
        if not label:
            skipped += 1
            continue
        pid = pair["profile_id"]
        jid = pair["job_id"]
        profile = profiles_map.get(pid)
        job = jobs_map.get(jid)
        if not profile or not job:
            skipped += 1
            continue

        texts_a.append(serialize_profile(profile))
        texts_b.append(serialize_job(job))
        targets.append(normalize_composite(label["skills"]))

    print(f"Loaded {len(targets)} Role Radar pairs (skills-only target), skipped {skipped}")

    # Public datasets available but disabled — added noise, reduced r from 0.839→0.834.
    # Our domain-specific labeled data is higher quality than coarse ATS/screening scores.
    # Re-enable with: AUGMENT_PUBLIC = True
    AUGMENT_PUBLIC = False
    if AUGMENT_PUBLIC:
        for path, name in [(ATS_PAIRS_PATH, "ATS"), (SCREENING_PAIRS_PATH, "Screening")]:
            if path.exists():
                with open(path) as f:
                    ext_pairs = json.load(f)
                count = 0
                for ep in ext_pairs:
                    texts_a.append(ep["profile_text"])
                    texts_b.append(ep["job_text"])
                    targets.append(normalize_composite(ep["skills_score"]))
                    count += 1
                print(f"Added {count} {name} dataset pairs")

    print(f"Total training pairs: {len(targets)}")
    return texts_a, texts_b, targets


def load_gold_data():
    """Load gold eval pairs."""
    with open(GOLD_PATH) as f:
        gold = json.load(f)
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

    texts_a, texts_b, targets, pair_ids = [], [], [], []
    for g in gold:
        pid, jid = g["pair_id"].split("_", 1)
        profile = profiles_map.get(int(pid))
        job = jobs_map.get(jid)
        if not profile or not job:
            continue
        texts_a.append(serialize_profile(profile))
        texts_b.append(serialize_job(job))
        targets.append(normalize_composite(g["skills"]))
        pair_ids.append(g["pair_id"])

    return texts_a, texts_b, targets, pair_ids


def train():
    from sentence_transformers import CrossEncoder, InputExample
    from sentence_transformers.cross_encoder.evaluation import CrossEncoderCorrelationEvaluator

    device = get_device()
    print(f"Device: {device}")

    print("Loading training data...")
    texts_a, texts_b, targets = load_training_data()

    # Split 90/10 for train/dev
    n = len(targets)
    indices = np.random.RandomState(42).permutation(n)
    split = int(n * 0.9)
    train_idx, dev_idx = indices[:split], indices[split:]

    train_samples = [
        InputExample(texts=[texts_a[i], texts_b[i]], label=targets[i])
        for i in train_idx
    ]
    dev_texts_a = [texts_a[i] for i in dev_idx]
    dev_texts_b = [texts_b[i] for i in dev_idx]
    dev_targets = [targets[i] for i in dev_idx]

    print(f"Train: {len(train_samples)}, Dev: {len(dev_texts_a)}")

    RERANKER_DIR.mkdir(parents=True, exist_ok=True)

    evaluator = CrossEncoderCorrelationEvaluator(
        sentence_pairs=list(zip(dev_texts_a, dev_texts_b)),
        scores=dev_targets,
        name="dev",
    )

    model = CrossEncoder(
        MODEL_NAME,
        num_labels=1,
        max_length=MAX_LENGTH,
        device=device,
    )

    train_dataloader = DataLoader(train_samples, shuffle=True, batch_size=BATCH_SIZE)
    warmup_steps = int(len(train_dataloader) * EPOCHS * WARMUP_RATIO)

    model.fit(
        train_dataloader=train_dataloader,
        evaluator=evaluator,
        epochs=EPOCHS,
        warmup_steps=warmup_steps,
        output_path=str(RERANKER_DIR),
        save_best_model=True,
        show_progress_bar=True,
    )

    model.save(str(RERANKER_DIR))
    print(f"\nModel saved to {RERANKER_DIR}")


def evaluate():
    from sentence_transformers import CrossEncoder
    from scipy.stats import pearsonr, spearmanr
    from sklearn.isotonic import IsotonicRegression

    device = get_device()

    print("Loading reranker model...")
    model = CrossEncoder(str(RERANKER_DIR), device=device)

    print("Loading gold data...")
    texts_a, texts_b, targets, pair_ids = load_gold_data()

    print(f"Evaluating {len(targets)} gold pairs...")
    pairs = list(zip(texts_a, texts_b))
    raw_scores = model.predict(pairs, show_progress_bar=True)
    raw_scores = np.array(raw_scores).flatten()

    true_scores = np.array([denormalize_score(t) for t in targets])

    # Correlation on raw logits
    pr, pp = pearsonr(true_scores, raw_scores)
    sr, sp = spearmanr(true_scores, raw_scores)

    # Isotonic calibration (fit on gold set itself — optimistic, but shows potential)
    iso = IsotonicRegression(y_min=50, y_max=100, out_of_bounds="clip")
    cal_scores = iso.fit_transform(raw_scores, true_scores)
    cal_mae = np.mean(np.abs(cal_scores - true_scores))

    # Uncalibrated MAE for comparison
    raw_mapped = np.clip(raw_scores, 0, 1) * 50 + 50
    raw_mae = np.mean(np.abs(raw_mapped - true_scores))

    print(f"\n{'='*60}")
    print("RERANKER EVALUATION (Gold Set)")
    print(f"{'='*60}")
    print(f"  Pairs:           {len(targets)}")
    print(f"  Pearson r:       {pr:.3f} (p={pp:.2e})")
    print(f"  Spearman r:      {sr:.3f} (p={sp:.2e})")
    print(f"  Raw MAE:         {raw_mae:.1f}")
    print(f"  Calibrated MAE:  {cal_mae:.1f} (isotonic on gold — optimistic)")
    print(f"  Raw score range: [{raw_scores.min():.2f}, {raw_scores.max():.2f}]")

    # Compare with LightGBM skills
    print(f"\n  vs LightGBM skills (from last eval):")
    print(f"    LightGBM skills r:      0.717")
    print(f"    Reranker skills r:      {pr:.3f}")
    print(f"    LightGBM skills MAE:    9.4")
    print(f"    Reranker calibrated MAE: {cal_mae:.1f}")


def export_onnx():
    from sentence_transformers import CrossEncoder
    import onnx

    print("Loading model for ONNX export...")
    model = CrossEncoder(str(RERANKER_DIR))

    onnx_path = RERANKER_DIR / "model.onnx"
    print(f"Exporting to {onnx_path}...")

    dummy_input = model.tokenizer(
        "profile text", "job text",
        return_tensors="pt", max_length=MAX_LENGTH, truncation=True, padding="max_length"
    )

    torch.onnx.export(
        model.model,
        (dummy_input["input_ids"], dummy_input["attention_mask"]),
        str(onnx_path),
        input_names=["input_ids", "attention_mask"],
        output_names=["score"],
        dynamic_axes={
            "input_ids": {0: "batch", 1: "seq"},
            "attention_mask": {0: "batch", 1: "seq"},
            "score": {0: "batch"},
        },
        opset_version=14,
    )
    print(f"ONNX model saved: {onnx_path} ({onnx_path.stat().st_size / 1024 / 1024:.1f} MB)")


def main():
    if len(sys.argv) < 2:
        print("Usage: python3 reranker.py [train|evaluate|export-onnx]")
        sys.exit(1)

    cmd = sys.argv[1]
    if cmd == "train":
        train()
    elif cmd == "evaluate":
        evaluate()
    elif cmd == "export-onnx":
        export_onnx()
    else:
        print(f"Unknown command: {cmd}")
        sys.exit(1)


if __name__ == "__main__":
    main()
