---
language: en
license: apache-2.0
tags:
  - job-matching
  - lightgbm
  - cross-encoder
  - sentence-transformers
  - onnx
datasets:
  - oksomu/role-radar-dataset
base_model:
  - cross-encoder/ms-marco-MiniLM-L-6-v2
  - sentence-transformers/all-MiniLM-L6-v2
pipeline_tag: text-classification
---

# Role Radar — Job-Profile Fit Scoring Models

Local-first two-stage scoring pipeline for job-candidate fit prediction. Trained on Indian job market data across 15 role families.

**GitHub:** [somus/role-radar](https://github.com/somus/role-radar) | **Dataset:** [oksomu/role-radar-dataset](https://huggingface.co/datasets/oksomu/role-radar-dataset)

## Models

| Model | Size | Purpose | Latency |
|-------|------|---------|---------|
| `skills_lgbm.onnx` | 501 KB | Skills scoring (all jobs) | <1ms batch |
| `embedding_encoder.onnx` | 87 MB | Cosine sim feature | Cached |
| `reranker.onnx` | 87 MB | Semantic reranking (shortlist) | ~14ms/pair |

## Architecture

```
LightGBM scores all jobs (<1ms each)
  → Composite = skills×0.5 + location×0.25 + seniority×0.15 + domain×0.10
  → Shortlist: composite > 60
    → MiniLM reranker reranks shortlist (~14ms/pair)
      → Final ranked feed
```

## Metrics (108 gold eval pairs)

| Metric | Score |
|--------|-------|
| NDCG | 0.996 |
| MRR | 0.887 |
| Composite MAE | 5.1 |
| Composite Pearson r | 0.837 |
| Reranker skills r | 0.828 |

## Latency (M1 Pro)

| Pipeline | 25 jobs | 50 jobs |
|----------|---------|---------|
| LightGBM only | 18ms | 32ms |
| Full + reranker | 109ms | 222ms |

## Training Data

- 2,500 jobs (LinkedIn India, 12 cities, 15 role families)
- 640 profiles (438 synthetic + 202 real)
- 22,465 labeled pairs (Gemini 2.5 Flash Lite teacher)

## Usage

All models use ONNX Runtime:

```python
import onnxruntime as ort

# LightGBM
session = ort.InferenceSession("skills_lgbm.onnx")
score = session.run(None, {"features": feature_vector})[0]

# Reranker
session = ort.InferenceSession("reranker.onnx")
logits = session.run(None, {"input_ids": ids, "attention_mask": mask})[0]
```

## Files

```
skills_lgbm.onnx              — LightGBM skills scorer
skills_calibration.json       — isotonic regression (raw → 50-100 scale)
embedding_encoder.onnx        — MiniLM encoder for cosine sim feature
embedding_encoder.onnx.data   — encoder weights
embedding_tokenizer/          — tokenizer for encoder
reranker.onnx                 — MiniLM cross-encoder
reranker.onnx.data            — reranker weights
reranker_tokenizer/           — tokenizer for reranker
config.json                   — feature names, composite weights, thresholds
```

## Score Bands

| Score | Label |
|-------|-------|
| 90-100 | Perfect Match |
| 80-89 | Great Match |
| 70-79 | Good Match |
| 60-69 | Worth a Look |
| 45-59 | Stretch |
