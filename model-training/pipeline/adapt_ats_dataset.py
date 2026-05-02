"""Adapt resume-ats-score-v1-en dataset for reranker training.

The ATS dataset has format: "resume [SEP] job_description" with ats_score (19-90).
We split on [SEP], use resume as profile text, job_description as job text,
and normalize ats_score to our 50-100 scale for reranker training.

Usage: python3 adapt_ats_dataset.py
"""

import json
from pathlib import Path

import numpy as np

from config import DATA_DIR

ATS_PATH = DATA_DIR / "ats_dataset_train.json"
OUTPUT_PATH = DATA_DIR / "ats_reranker_pairs.json"


def normalize_score(ats_score: float) -> float:
    """Map ATS score (19-90) to our scale (50-100)."""
    clamped = max(19.0, min(90.0, ats_score))
    return 50.0 + (clamped - 19.0) / (90.0 - 19.0) * 50.0


def main():
    with open(ATS_PATH) as f:
        data = json.load(f)

    print(f"ATS dataset: {len(data)} examples")

    pairs = []
    skipped = 0

    JD_MARKERS = ["Job Description", "Position Summary", "About the job",
                  "About Us\n", "Company Description", "About the Role"]

    for i, example in enumerate(data):
        text = example["text"]
        ats_score = example["ats_score"]

        if len(text) < 200:
            skipped += 1
            continue

        # Try to split on known markers
        resume_text = None
        job_text = None
        for marker in JD_MARKERS:
            idx = text.find(marker)
            if idx > 100:
                resume_text = text[:idx].strip()
                job_text = text[idx:].strip()
                break

        if not resume_text:
            # No marker found — split at ~60% (resumes tend to be longer)
            split_point = int(len(text) * 0.6)
            resume_text = text[:split_point].strip()
            job_text = text[split_point:].strip()

        if len(resume_text) < 50 or len(job_text) < 50:
            skipped += 1
            continue

        if len(resume_text) > 1500:
            resume_text = resume_text[:1500]
        if len(job_text) > 1500:
            job_text = job_text[:1500]

        score = normalize_score(ats_score)

        pairs.append({
            "pair_id": f"ats_{i}",
            "profile_text": resume_text,
            "job_text": job_text,
            "skills_score": round(score, 1),
            "original_ats_score": ats_score,
            "original_label": example["original_label"],
            "data_origin": "public-dataset-ats-v1",
        })

    with open(OUTPUT_PATH, "w") as f:
        json.dump(pairs, f, indent=2)

    scores = np.array([p["skills_score"] for p in pairs])
    labels = {}
    for p in pairs:
        labels[p["original_label"]] = labels.get(p["original_label"], 0) + 1

    print(f"Adapted: {len(pairs)}, skipped: {skipped}")
    print(f"Score range: {scores.min():.1f} - {scores.max():.1f}")
    print(f"Score mean: {scores.mean():.1f}, median: {np.median(scores):.1f}")
    print(f"By label: {labels}")
    print(f"Saved to {OUTPUT_PATH}")


if __name__ == "__main__":
    main()
