"""Adapt AzharAli05/Resume-Screening-Dataset for reranker training.

10.2K resume+JD pairs with select/reject decisions.
Maps to our skills score: select→80-95, reject→50-65 with reason-based gradation.

Usage: python3 adapt_screening_dataset.py
"""

import json
import re
from pathlib import Path

import numpy as np

from config import DATA_DIR

INPUT_PATH = DATA_DIR / "screening_dataset.json"
OUTPUT_PATH = DATA_DIR / "screening_reranker_pairs.json"

STRONG_REJECT_KEYWORDS = [
    "no experience", "lacks", "insufficient", "no relevant",
    "unrelated", "does not meet", "missing critical",
]
MILD_REJECT_KEYWORDS = [
    "needs improvement", "limited", "could benefit",
    "some gaps", "partial",
]
STRONG_SELECT_KEYWORDS = [
    "excellent", "impressive", "strong", "extensive",
    "deep expertise", "highly skilled", "outstanding",
]


def score_from_decision(decision: str, reason: str) -> float:
    reason_lower = reason.lower()

    if decision == "select":
        if any(kw in reason_lower for kw in STRONG_SELECT_KEYWORDS):
            return 90.0
        return 82.0
    else:
        if any(kw in reason_lower for kw in STRONG_REJECT_KEYWORDS):
            return 52.0
        if any(kw in reason_lower for kw in MILD_REJECT_KEYWORDS):
            return 60.0
        return 55.0


def main():
    with open(INPUT_PATH) as f:
        data = json.load(f)

    print(f"Screening dataset: {len(data)} examples")

    pairs = []
    skipped = 0

    for i, example in enumerate(data):
        resume = (example.get("Resume") or "").strip()
        job_desc = (example.get("Job_Description") or "").strip()
        decision = (example.get("Decision") or "").strip()
        reason = (example.get("Reason_for_decision") or "").strip()

        if len(resume) < 50 or len(job_desc) < 50:
            skipped += 1
            continue

        if len(resume) > 1500:
            resume = resume[:1500]
        if len(job_desc) > 1500:
            job_desc = job_desc[:1500]

        score = score_from_decision(decision, reason)

        pairs.append({
            "pair_id": f"screen_{i}",
            "profile_text": resume,
            "job_text": job_desc,
            "skills_score": score,
            "decision": decision,
            "role": example.get("Role", ""),
            "data_origin": "public-dataset-screening-v1",
        })

    with open(OUTPUT_PATH, "w") as f:
        json.dump(pairs, f, indent=2)

    scores = np.array([p["skills_score"] for p in pairs])
    decisions = {}
    for p in pairs:
        decisions[p["decision"]] = decisions.get(p["decision"], 0) + 1

    print(f"Adapted: {len(pairs)}, skipped: {skipped}")
    print(f"Score range: {scores.min():.1f} - {scores.max():.1f}")
    print(f"Score mean: {scores.mean():.1f}")
    print(f"By decision: {decisions}")
    print(f"Saved to {OUTPUT_PATH}")


if __name__ == "__main__":
    main()
