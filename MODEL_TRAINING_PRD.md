# Model Training PRD — Local Scorer + Semantic Reranker

## Scope

This PRD covers the **model training pipeline only**. The app is built separately using Gemini for scoring during development. These trained models replace Gemini in the app when offline evaluation metrics confirm quality parity or better.

## Problem Statement

Role Radar needs fast, stable, private **Fit Score** ranking for real-world **Jobs** without cloud inference at runtime.

Local Ollama-based LLM scoring is too slow for batch scoring (tested, confirmed). Cloud Gemini scoring works but violates local-first privacy goals for production.

Need:
- fully local runtime scoring via trained ML models,
- better ranking than **Heuristic Score** alone,
- preserved **Fit Score** rubric,
- training pipeline using real English-language Jobs from same public LinkedIn guest API family already used by app,
- broad training coverage across many professional role families, not only tech,
- synthetic data generation via Claude Code / Claude API,
- Gemini restricted to offline teacher labeling only.

---

## Solution

Build fully local two-stage scoring pipeline:

1. **Local Scorer**
   - lightweight structured model
   - runs on every candidate **Job**
   - predicts dimension priors and **Overqualified**

2. **Semantic Reranker**
   - small local cross-encoder
   - reranks shortlisted Jobs using full **Profile** + full **Job** detail

3. **Deterministic Explanation Layer**
   - emits **Match** and **Gap** evidence from normalized overlaps and rules
   - no runtime LLM required

Offline training pipeline:
- real English **Job** snapshots from LinkedIn guest job endpoints (target 2–3K jobs),
- synthetic **Profiles**, resume text, and counterfactuals generated via Claude Code / Claude API,
- Gemini 2.5 Flash used only to label candidate–job fit or adjudicate borderline examples (target 10K labeled pairs).

Runtime app:
- no Gemini,
- no cloud scoring fallback,
- local-first scoring remains true.

---

## User Stories

1. As a job seeker, I want **Fit Scores** computed locally, so that my **Profile** stays private.
2. As a job seeker, I want scoring to be much faster than current LLM-heavy flows, so that reviewing batches feels quick.
3. As a job seeker, I want rankings to stay stable across repeated runs, so that I trust ordering.
4. As a job seeker, I want **Overqualified** flagged accurately, so that step-down roles are obvious.
5. As a job seeker, I want **Match** and **Gap** explanations even without cloud inference, so that I understand scores.
6. As a job seeker, I want transferable-skill Jobs recognized, so that adjacent-role opportunities are not missed.
7. As a job seeker, I want bulk scoring for 25–50 Jobs to stay practical, so that refreshes remain usable.
8. As a maintainer, I want runtime scoring completely local, so that production cost stays near zero.
9. As a maintainer, I want synthetic data generation decoupled from Gemini, so that dataset generation can use any agent workflow I choose.
10. As a maintainer, I want Gemini limited to offline teacher labeling, so that its role is narrow and auditable.
11. As a maintainer, I want training data built from English professional Jobs across many role families, so that models generalize beyond software roles.
12. As a maintainer, I want rate-limited Job collection from public LinkedIn guest endpoints, so that scraping does not get blocked or banned.
13. As a maintainer, I want label provenance tracked separately from generation provenance, so that generator bias and teacher bias are visible.
14. As a maintainer, I want benchmark Jobs excluded from training, so that evaluation remains honest.
15. As an ML engineer, I want pairwise ranking labels plus dimension-score labels, so that models learn both ordering and calibration.
16. As an ML engineer, I want deterministic explanation atoms, so that explanation quality does not depend on free-form generation.
17. As a product owner, I want strong privacy claims to remain true in scoring behavior, not only storage behavior.
18. As a product owner, I want app scoring to keep working if Gemini is unavailable, so that runtime reliability is not tied to external providers.

---

## Implementation Decisions

### Core Product Decisions

- Production app uses **no Gemini inference** (Gemini used during development only, replaced by trained models).
- Production app uses **no cloud fallback scoring**.
- Synthetic data generated via **Claude Code / Claude API**, not Gemini.
- Gemini used only for **offline teacher labeling / adjudication**.
- Visible **Fit Score** remains primary user-facing score.
- **Heuristic Score** remains internal-only.
- Rollout validation via **offline eval metrics only** — deploy when metrics confirm quality.

### Runtime Model Architecture

#### 1. Local Scorer
**Model: LightGBM (boosted trees).**

Four separate LightGBM models, one per dimension:
- skills score model
- seniority score model
- domain score model
- location score model

Composite = user-weighted sum at runtime (preserves adjustable dimension weight sliders from main PRD).

**Overqualified** detection: deterministic threshold, not ML. `seniority_delta >= 2` → overqualified. Explainable, no separate model needed.

Properties:
- CPU-friendly, <1ms per job per model
- fully deterministic
- ~1–5MB total for all 4 models
- bundled in app binary (no download)

Input: 16 hand-crafted features from normalized Profile × Job (see Feature Vector section).

Purpose:
- score every discovered **Job**
- filter obvious poor fits
- create shortlist for deeper reranking via dynamic threshold

#### 2. Semantic Reranker
**Model: MiniLM-class cross-encoder** fine-tuned on Role Radar data.

- input: full **Profile** + full **Job** (serialized structured text)
- output: scalar relevance / fit score for reranking
- target: semantic nuance, transferable skills, adjacent stacks, borderline cases
- size: ~80–120MB (ONNX)
- runtime: ONNX Runtime with GPU acceleration via Electrobun
- inference: ~20–30ms per pair on M1 Pro with GPU accel
- downloads on first app run (not bundled — too large for BSDIFF patches)

Shortlist strategy: **dynamic threshold**. Rerank all jobs with `local_prior > 60` (configurable). Scores cached. Re-rerank only on profile change or new job arrival.

#### 3. Final Score Composer
Combines:
- local scorer dimension outputs
- reranker score
- explicit normalized signals

Produces:
- **Dimension Scores**
- final **Fit Score**
- **Overqualified**
- **Match**
- **Gap**

### Feature Vector

The Local Scorer consumes a 16-feature numeric vector per Profile × Job pair:

| # | Feature | Type | Dimension |
|---|---------|------|-----------|
| 1 | must_have_skill_overlap_ratio | float | skills |
| 2 | nice_to_have_skill_overlap_ratio | float | skills |
| 3 | total_skill_overlap_count | int | skills |
| 4 | missing_must_have_count | int | skills |
| 5 | seniority_delta | int (signed) | seniority |
| 6 | seniority_match_exact | bool | seniority |
| 7 | role_family_match | bool | seniority |
| 8 | role_family_adjacent | bool | seniority |
| 9 | domain_match | bool | domain |
| 10 | domain_adjacent | bool | domain |
| 11 | location_compatible | bool | location |
| 12 | remote_match | bool | location |
| 13 | experience_years_delta | float | seniority |
| 14 | title_similarity | float | seniority |
| 15 | management_mismatch | bool | seniority |
| 16 | dealbreaker_violated | bool | post-score filter |

`dealbreaker_violated` is **not** a model input — it is a post-score hard filter applied after scoring, per main PRD ("regardless of Fit Score"). Included in feature table for completeness.

Add features only if evaluation shows gaps in dimension coverage.

### Model Interface Contracts

Not every model should expose rich structured JSON internally, but the pipeline must expose **structured contracts at boundaries**.

#### Normalization Layer

**Approach: hybrid — lookup tables for known terms, LLM fallback for unknowns.**

Lookup tables built from training corpus + LinkedIn skill taxonomy. LLM fallback (Claude API or Gemini) used during offline data prep for novel terms. Acceptable cost since normalization runs once per snapshot in batch.

Input:
- raw **Profile** source text / structured profile fields
- raw **Job** metadata and full job description

Output:
- canonical structured JSON for training and inference

Example shape:

```json
{
  "profile": {
    "role_family": "frontend",
    "seniority": "senior",
    "skills": ["React", "TypeScript", "Next.js"],
    "domains": ["SaaS"],
    "location_preferences": ["Bangalore", "Remote India"]
  },
  "job": {
    "title": "Senior Frontend Engineer",
    "role_family": "frontend",
    "must_have_skills": ["React", "TypeScript"],
    "nice_to_have_skills": ["GraphQL"],
    "domain": "SaaS",
    "location_mode": "remote"
  }
}
```

#### Local Scorer Contract
Input:
- 16-feature numeric vector derived from normalized **Profile** + **Job** (see Feature Vector section)

Each of the 4 LightGBM models receives the same feature vector and predicts one dimension score.

Output (combined from 4 models + deterministic logic):

```json
{
  "skills": 82,
  "seniority": 76,
  "domain": 68,
  "location": 95,
  "overqualified": false,
  "local_prior": 79
}
```

#### Semantic Reranker Contract
Input source:
- structured normalized **Profile** + **Job**

Model input form:
- serialized field-aware text pair, not necessarily JSON tensor input

Example serialization:

```text
[PROFILE]
Role family: frontend
Seniority: senior
Skills: React, TypeScript, Next.js
Domains: SaaS
Location prefs: Bangalore, Remote India

[JOB]
Title: Senior Frontend Engineer
Must-have: React, TypeScript
Nice-to-have: GraphQL
Domain: SaaS
Location: Remote India
Description: ...
```

Output:

```json
{
  "reranker_score": 0.87
}
```

Decision:
- reranker may consume serialized text and emit scalar score,
- pipeline still remains structured because its inputs are canonicalized and its outputs feed structured composer.

#### Final Runtime Output Contract
Output shown to app:

```json
{
  "dimensions": {
    "skills": 84,
    "seniority": 78,
    "domain": 70,
    "location": 95
  },
  "composite": 82,
  "overqualified": false,
  "matches": [
    "Strong React + TypeScript overlap",
    "Remote India compatible"
  ],
  "gaps": [
    "No explicit GraphQL evidence"
  ]
}
```

#### Teacher Labeling Contract
Gemini offline labeler should use structured input/output wherever possible.

Input:
- canonical normalized **Profile** + **Job** pair
- fixed rubric

Output:
- dimension labels
- overqualified label
- composite label
- optional rationale atoms for audit

### Explanation Decision

No runtime LLM explanations.

**Approach: hybrid — feature vector drives which atoms appear, separate module enriches with readable context.**

Feature vector determines which explanation atoms fire (positive features → Match atoms, negative features → Gap atoms). A separate enrichment module adds human-readable context using normalized Profile + Job data (actual skill names, company details, location specifics).

Example:
- Feature `must_have_overlap_ratio = 0.83` → Match: "5 of 6 required skills present: React, TypeScript, Node.js, GraphQL, AWS"
- Feature `missing_must_have_count = 1` → Gap: "Missing required skill: Kubernetes"
- Feature `seniority_delta = +2` → Flag: "Overqualified — Senior profile, Junior role"

Signal types:
- must-have skill overlap
- missing must-haves
- title/role similarity
- seniority delta
- domain adjacency
- location compatibility
- management mismatch
- preference / dealbreaker interaction where relevant

### English-Only Decision

- Training corpus for v1 is **English only**.
- Job descriptions must be English-dominant.
- Synthetic resumes / Profiles must be English.
- Non-English postings excluded from training and eval.
- Mixed-language jobs allowed only if main professional content is English and normalization quality stays high.

Reason:
- target market is India professional environment, where English dominates job descriptions and resumes
- narrower language scope reduces label noise and model size

### Training Coverage Decision: Broad Role Families

Training data must **not** focus only on tech.

Minimum role-family coverage for v1:
- software / IT
- data / analytics
- product / program / project
- design / UX / content design
- sales / business development / account management
- marketing / performance / brand / content
- customer success / support / operations
- finance / accounting / FP&A
- HR / recruiting / talent ops
- procurement / supply chain / logistics / operations
- administrative / business ops / PMO
- legal / compliance / risk where English postings are plentiful

Coverage rules:
- no single role family should dominate training labels
- include junior, mid, senior, lead, manager where applicable
- include India city, remote India, hybrid, and onsite distributions
- include multiple industries: SaaS, fintech, healthcare, retail, manufacturing, consulting, media, logistics, education, BPO/operations, etc.

### Job Data Acquisition Decision

Use public LinkedIn guest job endpoints described in supplied gist:

- Search:
  - `https://www.linkedin.com/jobs-guest/jobs/api/seeMoreJobPostings/search`
- Job detail:
  - `https://www.linkedin.com/jobs-guest/jobs/api/jobPosting/$job_id`
- Company typeahead:
  - `https://www.linkedin.com/jobs-guest/api/typeaheadHits?typeaheadType=COMPANY`
- Geo typeahead:
  - `https://www.linkedin.com/jobs-guest/api/typeaheadHits?origin=jserp&typeaheadType=GEO&geoTypes=POPULATED_PLACE`

Use pagination via `start` in increments of 25.

Key search filters available:
- `keywords`
- `location`
- `f_E` experience level
- `f_JT` job type
- `f_WT` onsite / remote / hybrid
- `f_TPR` recency
- `f_PP` city id
- `f_C` company id

Job HTML extraction should use configurable selectors, not hardcoded assumptions.

### Rate Limiting / Anti-Ban Decision

Collection must be conservative. Target ~200 jobs/hour with varied timeouts. Machine can run all day for sustained collection.

Default crawl policy:
- search requests sequential only
- search request jitter: varied timeouts targeting ~200 jobs/hour throughput
- job detail requests: 3–6s jitter
- detail concurrency: start at `1`, only raise to `2` after soak testing
- typeahead endpoints heavily cached
- fetch each Job detail once per snapshot window, not repeatedly
- dedupe by job id and normalized title+company+location hash
- back off immediately on `429`, `403`, suspicious HTML, interstitial, captcha, or empty anti-bot responses
- exponential cooldown: minutes → hours → full-day pause
- daily caps configurable and intentionally low at first
- stagger keywords, cities, and time windows
- auto-stop scraper when ban signals cluster

Reason:
- protect source access,
- avoid account / IP bans,
- keep dataset growth sustainable.

### Training Data Decision

Training corpus built from:
- real English **Job** snapshots from app source
- synthetic structured **Profiles**
- optional rendered synthetic resumes
- counterfactual variants
- hard negatives
- adjacent-role confusers
- human-reviewed seed labels
- Gemini silver labels

Important split:
- **generation source** and **label source** stored separately

Example provenance:
- `generator_source = claude-code-v1` or `claude-api-v1`
- `label_source = gemini-2.5-flash`
- `review_source = human` optional

### Synthetic Data Decision

Synthetic data generated via **Claude Code / Claude API**. Fixed output schema matching Profile type. Prompt recipes versioned alongside training code.

Pipeline must support:
- importing synthetic Profiles (fixed JSON schema)
- importing synthetic resume text
- importing counterfactual edits
- tagging generator identity/version/prompt recipe (e.g., `claude-code-v1`, `claude-api-sonnet-v2`)
- lower confidence tier for purely synthetic examples unless reviewed
- broad non-tech coverage, not only software resumes

Hard negative generation uses **all methods combined**:
- counterfactual edits on positive pairs (flip one dimension: location, key skill, seniority)
- cross-pairing profiles with jobs from adjacent role families
- Claude-generated deliberate confusers (misleading titles, partial skill overlap)

Gemini must not be used for:
- synthetic Profile generation
- synthetic resume generation
- synthetic Job generation
- counterfactual generation

### Public Datasets to Use

**Decision: adapt `resume-ats-score-v1-en` only for training. All others eval/reference only.**

Adaptation process: convert to Profile schema → run through normalization layer → re-label via Gemini Flash using our rubric → tag with `data_origin: public-dataset-ats-v1`.

| Dataset | Use | Notes |
|---|---|---|
| `0xnbk/resume-ats-score-v1-en` — https://huggingface.co/datasets/0xnbk/resume-ats-score-v1-en | **Adapt for training bootstrap** | ~6.4K examples. Convert to our schema, re-label with our rubric via Gemini Flash (~$5). ATS score ≠ Fit Score so re-labeling required. |
| `Suriyaganesh/54k-resume` — https://huggingface.co/datasets/Suriyaganesh/54k-resume | Profile diversity reference only | Good for synthetic profile realism. No fit labels. Not used in training directly. |
| `facehuggerapoorv/resume-jd-match` — https://huggingface.co/datasets/facehuggerapoorv/resume-jd-match | Skip for v1 | Needs provenance/license audit. Marginal value vs effort. |
| `NataliaVanetik/vacancy-resume-matching-dataset` — https://github.com/NataliaVanetik/vacancy-resume-matching-dataset | Skip — GPL-3.0 risk | Too small and GPL-3.0 is contagious. |
| `jminc/resume-matching-dataset-v2` — https://huggingface.co/datasets/jminc/resume-matching-dataset-v2 | Skip for v1 | Tech-heavy only. Contradicts broad role coverage goal. |

Explicitly exclude from main v1 training:
- AliYun / Tianchi job-resume datasets, because Chinese
- datasets without clear license/provenance
- datasets too narrow to one niche unless used only as auxiliary stress tests

### Labeling Strategy

**Teacher model: Gemini 2.5 Flash.** Target 10K labeled pairs for v1.

All 25 existing synthetic benchmark labels used as **few-shot calibration examples** for Gemini teacher. These are synthetic/LLM-generated benchmarks — useful for teaching rubric but not for honest evaluation.

**Separate real eval set required:** hand-label 30–50 real scraped jobs paired with real profile. This is the gold truth for evaluation metrics.

Primary supervision:
- pairwise ranking labels
- dimension score labels (per-dimension, supporting 4 separate LightGBM models)
- binary **Overqualified** (from deterministic threshold, not teacher)
- composite calibration targets

Gemini may be used only to:
- score Profile–Job fit offline
- adjudicate borderline examples
- assign dimension labels under fixed rubric
- optionally draft audit rationale for review

Hierarchy:
- human-reviewed labels on real jobs = gold
- rubric + Gemini labels = silver
- synthetic-only heuristic labels = weak

### Dataset Modules

1. **Job Snapshot Builder**
   - ingests real Jobs via wrapper script around existing `src/bun/linkedin-adapter.ts`
   - dedupes duplicates / near-duplicates
   - versions snapshots
   - writes to separate training data store (not app SQLite)
   - target: 2–3K diverse real English jobs across 12 role families

2. **Synthetic Data Importer**
   - accepts Claude Code / Claude API–generated Profiles, resumes, and counterfactuals
   - fixed JSON schema matching Profile type
   - records generator provenance, prompt recipe, and batch id
   - validates schema before dataset inclusion

3. **Normalization Layer**
   - hybrid: lookup tables for known terms, LLM fallback for unknowns (offline batch)
   - standardizes roles, skills, seniority, domains, location buckets, remote mode, management signals

4. **Pair Generator**
   - pairs real Jobs with synthetic or real Profiles
   - builds positives, negatives, and hard negatives

5. **Teacher Labeling Pipeline**
   - applies rubric
   - invokes Gemini for offline labels only
   - records confidence and teacher version

6. **Feature Builder**
   - produces structured overlap features and explanation atoms

7. **Reranker Dataset Builder**
   - creates pairwise/listwise reranking sets

8. **Calibration Trainer**
   - isotonic regression on gold + silver labels
   - maps raw model outputs to visible 0–100 **Fit Score** matching rubric (90+ = perfect, 70–89 = strong, 50–69 = possible, <50 = poor)
   - retrain calibration whenever model changes

9. **Model Registry**
   - versions datasets, generators, teacher models, calibration maps, eval results

10. **Inference Orchestrator**
    - local-only runtime pipeline
    - no remote scoring branch

### Runtime Flow

1. normalize **Profile**
2. discover **Jobs**
3. normalize Job metadata (lookup tables at runtime, no LLM)
4. run 4 LightGBM dimension models on all Jobs (<1ms each)
5. apply dealbreaker hard filter
6. compute `local_prior` = weighted composite from dimension scores
7. select shortlist: all Jobs with `local_prior > 60` (configurable threshold)
8. fetch or use stored full **Job** detail for shortlisted Jobs
9. run MiniLM cross-encoder reranker on shortlist (ONNX Runtime + GPU, ~20–30ms/pair)
10. cache reranker scores (re-rerank only on profile change or new job)
11. compose final **Dimension Scores** + **Fit Score** via isotonic calibration
12. apply deterministic threshold for **Overqualified** (`seniority_delta >= 2`)
13. derive **Match** + **Gap** (feature-driven atoms + enriched context)
14. emit results to feed

No Gemini branch. No cloud scoring branch.

### Evaluation Decision

Need honest holdout evaluation:
- split by time
- split by company
- split by role family
- split by geography where useful
- exclude benchmark Jobs from training
- avoid near-duplicate leakage

Primary metrics:
- top-K ranking quality
- NDCG / MRR
- shortlist recall
- dimension-score MAE
- **Overqualified** precision/recall
- end-to-end latency
- batch stability
- local CPU / memory cost

Also report:
- role-family sliced performance
- city / remote sliced performance
- synthetic-vs-real provenance sliced performance
- tech vs non-tech performance

### Rollout Decision

**Validation: offline eval metrics only.** No shadow scoring in app. Trust the numbers, deploy when they're good.

1. **Offline training + eval**
   - compare local scorer, reranker, hybrid against Gemini baseline on real eval set

2. **Deploy when metrics pass**
   - replace Gemini scoring in app with local models
   - no gradual transition — clean cutover

End state:
- scoring fully local
- Gemini absent from app runtime
- synthetic generation via Claude Code / Claude API

### Model Shipping Decision

- **LightGBM models** (~2–5MB total for 4): bundled in app binary
- **MiniLM ONNX** (~80–120MB): downloads on first app run with progress indicator
- Model updates shipped via Electrobun BSDIFF patches (LightGBM) or re-download (MiniLM)
- **Retrain cadence: manual.** Retrain when score drift noticed or significant new data available (e.g., new job source added). No automation for v1.

### Training Infrastructure Decision

All training runs locally on **M1 Pro 32GB**:
- LightGBM: trains on CPU (fast, minutes)
- MiniLM fine-tuning: via MPS (Metal Performance Shaders) — PyTorch GPU backend for Apple Silicon. ~30–60 min for 10K pairs.
- Python scripts in `scripts/training/` within this repo
- No cloud/Colab dependency

### Privacy and Provenance Decision

Must track separately:
- `data_origin`: real vs synthetic
- `generator_source`: agent/workflow used to create synthetic data
- `label_source`: human / Gemini / heuristic
- `review_status`
- `confidence`
- `language`
- `role_family`

This separation is required for honest analysis.

---

## Testing Decisions

### What makes good test

Good test validates:
- scoring behavior
- ranking behavior
- calibration behavior
- explanation contract
- provenance integrity
- scraper throttling behavior

Not internals.

### Modules to Test

1. **Job Snapshot Builder**
   - dedupe
   - pagination handling
   - versioning
   - malformed input handling

2. **Rate Limit Controller**
   - jitter scheduling
   - backoff escalation
   - ban-signal detection
   - daily cap enforcement
   - auto-stop behavior

3. **Synthetic Data Importer**
   - schema validation
   - provenance capture
   - rejection of incomplete synthetic records
   - generator metadata persistence

4. **Normalization Layer**
   - title normalization
   - skill extraction
   - seniority mapping
   - location bucketing
   - remote/hybrid parsing
   - domain tagging
   - English-language filtering

5. **Pair Generator**
   - positive/negative balance
   - hard-negative creation
   - no leakage
   - broad role-family coverage checks

6. **Teacher Labeling Pipeline**
   - provenance tracking
   - confidence assignment
   - retry/failure handling
   - strict no-generation responsibility

7. **Feature Builder**
   - overlap features
   - missing must-have counts
   - explanation atoms

8. **Local Scorer**
   - deterministic inference
   - valid score ranges
   - overqualified behavior
   - non-tech role sanity checks

9. **Semantic Reranker**
   - pair ordering quality
   - truncation behavior
   - local latency
   - batch behavior
   - role-family sliced eval

10. **Final Score Composer**
    - monotonicity
    - calibration
    - dimension consistency

11. **Inference Orchestrator**
    - local-only flow
    - no remote scoring dependency
    - final output shape

12. **Evaluation Harness**
    - metric correctness
    - train/test isolation
    - benchmark exclusion
    - provenance-sliced reporting

### Regression Cases

Need fixed hard-case suite:
- React vs Vue transfer
- Java backend vs Node backend adjacency
- finance analyst vs ops analyst overlap
- sales ops vs business ops adjacency
- customer success vs account management overlap
- recruiter vs HR generalist overlap
- Bangalore vs other India city nuance
- remote-only vs onsite mismatch
- clearly overqualified step-down role
- sparse / noisy Job descriptions
- non-tech managerial roles with broad wording

---

### MVP Phased Milestones

Training pipeline is built in phases with go/no-go gates:

**Phase 1 — Prove LightGBM works (1–2 days)**
- use 25 existing synthetic benchmarks + 200 synthetic profiles
- <1K pairs
- train 4 LightGBM models
- eval: do dimension scores correlate with benchmark labels?
- **gate:** if correlation is weak, revisit feature engineering before proceeding

**Phase 2 — Add real data (1 week)**
- scrape 500 real LinkedIn jobs across 6 role families
- generate 5K pairs with hard negatives
- label via Gemini Flash
- retrain, eval against Phase 1
- **gate:** if metrics improve, proceed to full scale

**Phase 3 — Full v1 training (ongoing)**
- scale to 2–3K jobs, all 12 role families
- 10K+ labeled pairs
- fine-tune MiniLM reranker
- build real eval set (30–50 hand-labeled real job pairs)
- calibration, full metric suite
- **gate:** offline metrics vs Gemini baseline — deploy when parity achieved

---

## Out of Scope

- Gemini runtime scoring (Gemini used during app development only, replaced by trained models)
- cloud fallback scoring
- fine-tuning 0.5B chat model as primary scorer (Ollama too slow, confirmed)
- free-form LLM explanations in scoring path
- recruiter-side candidate search
- multi-source expansion beyond LinkedIn in this phase (other Indian job sites planned for future)
- online RL from broad user behavior
- automated retraining pipeline (manual retrain for v1)
- shadow scoring / A/B testing in app (offline eval only)

---

## Further Notes

Reference for public LinkedIn guest API usage:
- supplied gist: `linkedIn_jobs_api.md`

Big rules:
- **generator (Claude Code/API) != labeler (Gemini Flash)**
- **English only**
- **broad role-family coverage, not tech-only**
- **structured contracts at pipeline boundaries**
- **reranker uses serialized structured text → scalar output**
- **scraper conservative: ~200 jobs/hour, varied timeouts, auto-stop on ban signals**
- **this PRD = training pipeline only; app built separately**

Shipped shape:
- 4 LightGBM models (one per dimension) on all Jobs, bundled in app
- MiniLM cross-encoder reranker on dynamic shortlist (local_prior > 60), downloaded on first run
- ONNX Runtime with GPU acceleration via Electrobun
- deterministic threshold for overqualified (seniority_delta >= 2)
- hybrid explanation layer (feature-driven atoms + enriched context)
- isotonic regression calibration to 0–100 Fit Score
- Gemini only as offline teacher labeler (25 synthetic benchmarks as few-shot)
- all training local on M1 Pro 32GB
