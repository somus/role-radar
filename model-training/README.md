---
language: en
license: apache-2.0
tags:
  - job-matching
  - candidate-scoring
  - lightgbm
  - cross-encoder
  - sentence-transformers
  - onnx
datasets:
  - custom (LinkedIn India jobs + synthetic profiles)
  - 0xnbk/resume-ats-score-v1-en
  - AzharAli05/Resume-Screening-Dataset
metrics:
  - pearson_r
  - mae
  - ndcg
  - mrr
pipeline_tag: text-classification
---

# Role Radar — Job-Profile Fit Scoring Models

Two-stage local scoring pipeline for job-candidate fit prediction. Trained on Indian job market data across 15 role families.

## Architecture

```
Profile + Job
    ↓
[Stage 1] LightGBM Scorer (all jobs, <1ms each)
    → Skills score (ML) + Seniority/Domain/Location (deterministic)
    → Composite = skills×0.5 + location×0.25 + seniority×0.15 + domain×0.10
    → Shortlist: composite > 60
    ↓
[Stage 2] MiniLM Cross-Encoder Reranker (shortlist only, ~14ms/pair)
    → Semantic skill relevance score
    → Final ranked feed
```

## Models

| Model | Base | Size | Purpose | Runtime |
|-------|------|------|---------|---------|
| `skills_lgbm.onnx` | LightGBM | 501 KB | Skills dimension scoring | <1ms batch |
| `embedding_encoder.onnx` | all-MiniLM-L6-v2 | 87 MB | Cosine similarity feature | Cached |
| `reranker.onnx` | ms-marco-MiniLM-L-6-v2 | 87 MB | Semantic reranking | ~14ms/pair |

## Training Data

| Dataset | Count | Source |
|---------|-------|--------|
| Jobs | 2,500 | LinkedIn India (12 cities, 15 role families) |
| Profiles | 640 | 438 synthetic + 202 extracted from public resumes |
| Training pairs | 22,465 | Gemini 2.5 Flash Lite labeled |
| Gold eval pairs | 108 | Gemini labeled + human reviewed |

### Role Family Coverage

| Family | Jobs | Profiles |
|--------|------|----------|
| fullstack | 312 | 236 |
| data | 244 | 65 |
| backend | 235 | 24 |
| operations | 196 | 20 |
| product | 189 | 40 |
| marketing | 181 | 31 |
| hr | 169 | 27 |
| frontend | 164 | 38 |
| finance | 160 | 22 |
| devops | 145 | 46 |
| sales | 136 | 17 |
| customer_success | 89 | 22 |
| legal | 78 | 18 |
| mobile | 74 | 35 |

## Evaluation Results (108 gold pairs)

### LightGBM Composite Scorer

| Dimension | MAE | Pearson r | Method |
|-----------|-----|-----------|--------|
| Skills | 10.2 | 0.750 | LightGBM (19 features) |
| Seniority | 0.1 | 0.994 | Deterministic |
| Domain | 0.0 | 1.000 | Deterministic |
| Location | 0.1 | 0.998 | Deterministic |
| **Composite** | **5.1** | **0.837** | Weighted sum |

### Ranking Quality

| Metric | Score |
|--------|-------|
| NDCG | 0.996 |
| MRR | 0.887 |

### MiniLM Reranker (skills-only target)

| Metric | Score |
|--------|-------|
| Pearson r | 0.828 |
| Spearman r | 0.836 |
| Calibrated MAE | 6.2 |

### vs Industry Benchmarks

| Metric | Min production | Optimal | **Ours** |
|--------|---------------|---------|----------|
| NDCG | 0.70 | 0.85+ | **0.996** |
| MRR | 0.60 | 0.80+ | **0.887** |
| Composite MAE | <15 | <10 | **5.1** |

## Latency (Apple M1 Pro)

| Pipeline | 10 jobs | 25 jobs | 50 jobs |
|----------|---------|---------|---------|
| LightGBM only | 10ms | 18ms | 32ms |
| Full (+ reranker) | 78ms | 109ms | 222ms |

| Stage | Latency |
|-------|---------|
| Job normalization | 0.9ms/job |
| Feature extraction | 0.02ms/pair |
| LightGBM predict | 0.4ms (batch) |
| Embedding cosine sim | 0.001ms (cached) |
| Reranker (single) | 14ms |
| Reranker (batched) | ~5ms/pair |
| Calibration | 0.02ms |

## Feature Vector (19 features)

The LightGBM model consumes a 19-feature vector per profile-job pair:

| # | Feature | Importance |
|---|---------|-----------|
| 1 | skill_embedding_sim | 1788 |
| 2 | experience_years_delta | 1230 |
| 3 | title_similarity | 527 |
| 4 | must_have_skill_overlap_ratio | 437 |
| 5 | seniority_delta | 432 |
| 6 | missing_must_have_count | — |
| 7 | nice_to_have_skill_overlap_ratio | — |
| 8 | total_skill_overlap_count | — |
| 9 | seniority_match_exact | — |
| 10 | role_family_match | — |
| 11 | role_family_adjacent | — |
| 12 | domain_match | — |
| 13 | domain_adjacent | — |
| 14 | location_compatible | — |
| 15 | remote_match | — |
| 16 | management_mismatch | — |
| 17 | adjacent_skill_overlap_ratio | — |
| 18 | industry_domain_match | — |
| 19 | industry_domain_adjacent | — |

`skill_embedding_sim` (MiniLM cosine similarity between profile and job skill texts) is the #1 most important feature — contributes more signal than all hand-crafted overlap features combined.

## Score Philosophy

- **Job-requirements-first**: score from the job's perspective
- **Optimistic bias**: users should feel encouraged, not rejected
- **50-100 scale**: even worst mismatches show 55-59, not single digits
- **Skill cap at 6**: evaluate top 6 job skills only
- **Adjacent skills = partial credit**: React ↔ Angular = 0.7 match

### Score Bands

| Score | Label | User Feeling |
|-------|-------|-------------|
| 90-100 | Perfect Match | "Apply now, this is yours" |
| 80-89 | Great Match | "Strong fit, go for it" |
| 70-79 | Good Match | "Solid option, minor gaps" |
| 60-69 | Worth a Look | "Transferable skills, could work" |
| 45-59 | Stretch | "Growth opportunity, expect ramp-up" |

## Training Infrastructure

- **Hardware**: Apple M1 Pro 32GB
- **LightGBM**: CPU, trains in seconds
- **MiniLM fine-tuning**: MPS (Metal Performance Shaders), ~10 min for 10K pairs
- **Labeling**: Gemini 2.5 Flash Lite, 10x concurrent, ~5 min for 5K pairs
- **Total pipeline**: ~30 min end-to-end (pair generation → labeling → training → evaluation)

## How to Train

```bash
cd model-training/pipeline
python3 -m venv venv
source venv/bin/activate
pip install -r requirements.txt

# Generate pairs
python3 pair_generator.py

# Label (needs GEMINI_API_KEY)
GEMINI_API_KEY=... python3 gemini_labeler.py

# Train LightGBM
python3 train.py

# Evaluate
python3 evaluate.py --gold

# Train reranker
python3 reranker.py train
python3 reranker.py evaluate

# Export ONNX
python3 export_onnx.py

# Benchmark latency
python3 benchmark_latency.py
```

## Files

```
model-training/
  pipeline/
    config.py          — mappings, adjacencies, skill synonyms, LightGBM params
    normalize.py       — profile/job normalization (lookup + regex)
    features.py        — 19-feature vector extraction
    embeddings.py      — MiniLM embedding cache + cosine similarity
    train.py           — LightGBM training with cross-validated calibration
    evaluate.py        — gold eval with NDCG/MRR/MAE/correlation
    reranker.py        — MiniLM cross-encoder fine-tuning
    pair_generator.py  — strategic pair generation (positive/negative/hard-negative)
    gemini_labeler.py  — Gemini teacher labeling (skills + domain)
    export_onnx.py     — ONNX export for all models
    benchmark_latency.py — per-stage latency measurement
    generate_profiles.py — synthetic profile generation
    extract_real_profiles.py — rule-based profile extraction from resumes
    gold_expander.py   — gold eval set expansion
    adapt_ats_dataset.py — resume-ats-score dataset adapter
    adapt_screening_dataset.py — resume screening dataset adapter
  scrape-jobs.ts       — LinkedIn job scraper (12 cities, 44 keywords)
  rescrape-details.ts  — backfill job detail fields
  GOLD_RUBRIC.md       — scoring rubric for gold label review
  data/                — gitignored, contains all training data + models
```

## Retraining with Existing Data

Retrain when you've updated normalization logic, feature engineering, or hyperparameters:

```bash
cd model-training/pipeline
source venv/bin/activate

# Retrain LightGBM (uses phase2 + phase3 pairs, ~10 seconds)
python3 train.py

# Evaluate to verify improvement
python3 evaluate.py --gold

# Retrain reranker (~10 min on MPS)
python3 reranker.py train
python3 reranker.py evaluate

# Re-export ONNX if models changed
python3 export_onnx.py
```

## Retraining with New Data

### Adding more jobs

```bash
# Scrape more LinkedIn jobs (resumes from existing, adds to scraped_jobs.json)
bun run model-training/scrape-jobs.ts

# Generate new pairs from expanded job set
python3 pair_generator.py

# Label new pairs (needs GEMINI_API_KEY, ~5 min per 5K pairs)
GEMINI_API_KEY=... python3 gemini_labeler.py

# Retrain both models
python3 train.py
python3 reranker.py train
```

### Adding more profiles

```bash
# Generate synthetic profiles (needs GEMINI_API_KEY)
# Edit PROFILE_SPECS in generate_profiles.py to set counts per family
GEMINI_API_KEY=... python3 generate_profiles.py

# Or extract from public resume datasets
GEMINI_API_KEY=... python3 extract_real_profiles.py

# Then regenerate pairs, label, retrain
python3 pair_generator.py
GEMINI_API_KEY=... python3 gemini_labeler.py
python3 train.py
python3 reranker.py train
```

### Adding a new job source (e.g., Naukri, Indeed India)

1. Write a scraper that outputs the same JSON schema as `scraped_jobs.json`
2. Merge new jobs into `scraped_jobs.json` (dedupe by title+company+location hash)
3. Run the pair → label → train pipeline above
4. Evaluate and compare metrics — new source may need normalization tuning

### Expanding gold eval set

```bash
# Generate balanced gold candidates and label them
GEMINI_API_KEY=... python3 gold_expander.py

# Manually review gold_labels.json — check skills scores make sense
# Gold labels marked review_status=pending until reviewed

# Re-evaluate with expanded gold
python3 evaluate.py --gold
```

## Fine-tuning from User Signals

The models are trained offline on Gemini labels. Real user behavior provides stronger signal. Here's how to incorporate it.

### Signal Collection (in the app)

Collect implicit and explicit signals per profile-job pair:

| Signal | Type | What it means | Score implication |
|--------|------|---------------|-------------------|
| **Applied** | Explicit positive | User thinks they fit | Boost score |
| **Saved/bookmarked** | Explicit positive | Interested but not ready | Mild boost |
| **Dismissed/hidden** | Explicit negative | User says "not for me" | Lower score |
| **Click → read 30s+** | Implicit positive | Engaged with description | Mild boost |
| **Skipped (no click)** | Implicit negative | Not interested | Mild lower |
| **Time on page** | Implicit | Engagement level | Gradient signal |

Store as event log:
```json
{
  "profile_id": "user_123",
  "job_id": "linkedin_456",
  "event": "applied",
  "timestamp": "2026-05-02T10:30:00Z",
  "model_score_at_time": 82,
  "model_version": "v1.0"
}
```

### Feedback Loop Architecture

```
[App collects signals]
    ↓ batch export (weekly/monthly)
[Convert signals to training labels]
    applied → skills_score = max(model_score + 5, 90)
    saved → skills_score = model_score + 3
    dismissed → skills_score = min(model_score - 10, 55)
    skipped → skills_score = model_score - 3
    ↓
[Add to training pairs alongside Gemini labels]
    tag: label_source = "user-signal-v1"
    weight: 2x vs Gemini labels (user signal > teacher model)
    ↓
[Retrain LightGBM + reranker]
    ↓
[Evaluate on gold + user-signal holdout]
    ↓
[Deploy if metrics improve]
```

### Implementation Steps

**Phase 1 — Collect signals (no model change)**
- Add event logging to app for applied/saved/dismissed/click
- Store with model version + score at time of action
- Accumulate for 2-4 weeks before using

**Phase 2 — Offline feedback training**
- Export signal log, convert to label adjustments
- Add as new training pairs with `label_source: user-signal`
- Retrain and evaluate — compare vs Gemini-only baseline
- Deploy if NDCG/MRR improve on gold set

**Phase 3 — Online learning (future)**
- Periodically retrain on rolling window of user signals
- A/B test new model vs current in app
- Auto-deploy when metrics pass threshold

### Key Principles

1. **User signals > Gemini labels.** A user applying to a job is stronger signal than Gemini predicting 85. Weight user signals 2-3x in training.

2. **Negative signals are gold.** "Dismissed" tells you more than "applied" — it means the model was wrong. Prioritize learning from dismissals.

3. **Don't overfit to power users.** One user dismissing everything ≠ bad model. Aggregate across users before adjusting.

4. **Keep Gemini labels as baseline.** User signals are sparse (only for jobs users saw). Gemini labels provide dense coverage for the long tail.

5. **Version everything.** Store model version with each signal so you can attribute improvements to specific model changes.

6. **Cold start problem.** New users have no signals — fall back to Gemini-trained model. Personalization kicks in after ~20 interactions.

## Limitations

- Training data is India-focused (English job descriptions from Indian cities)
- Synthetic profiles may not capture real resume diversity
- Gold eval set (108 pairs) is small — per-role-family evaluation has low statistical power
- Reranker trained on Gemini labels which have teacher model bias
- Non-tech skill matching is weaker than tech (fewer training examples)
- No real user feedback incorporated yet — all evaluation is offline
