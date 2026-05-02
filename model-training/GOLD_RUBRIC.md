# Gold Label Scoring Rubric — Optimistic, Job-Requirements-First

## Core Principle
Score from the job's perspective: "what % of THIS JOB's requirements does the profile satisfy?"
Extra skills the profile has beyond job requirements = irrelevant (not penalized).

## Composite Formula
composite = skills × 0.5 + location × 0.25 + seniority × 0.15 + domain × 0.10

## Architecture
- **Skills**: LightGBM model (18-feature vector)
- **Seniority**: Deterministic (level comparison lookup + title inference)
- **Location**: Deterministic (city alias matching)
- **Domain**: Deterministic (LinkedIn industry → domain mapping)

## Score Bands

| Score | Label | User Feeling |
|-------|-------|-------------|
| 90-100 | Perfect Match | "Apply now, this is yours" |
| 80-89 | Great Match | "Strong fit, go for it" |
| 70-79 | Good Match | "Solid option, minor gaps" |
| 60-69 | Worth a Look | "Transferable skills, could work" |
| 45-59 | Stretch | "Growth opportunity, expect ramp-up" |
| <45 | Weak Match | "Probably not the right fit" |

## Skills Dimension (0-100)

Job-requirements-first scoring. Cap evaluation at top 6 skills from job posting.
Skill ordering matters: first 3 listed = core (weight 1.0), next 3 = important (weight 0.7), rest = nice-to-have (weight 0.3).

| Condition | Score Range |
|-----------|------------|
| Profile matches 6+ job skills (or all listed) | 90-100 |
| Profile matches 80%+ of top-6 skills | 80-90 |
| Profile matches 60-80% of top-6 | 70-80 |
| Profile matches 40-60% | 55-70 |
| Profile matches <40% but adjacent stack | 45-60 |
| Completely unrelated stack | 20-40 |
| Generalist job posting with no specific skills | match against role family, 70-85 base |

### Skill Matching Tiers
- **Synonym** (counts as 1.0 match): React = React.js, PostgreSQL = Postgres, K8s = Kubernetes
- **Adjacent** (counts as 0.5 match): React ↔ Vue ↔ Angular, Django ↔ Flask ↔ FastAPI, Java ↔ Kotlin, AWS ↔ GCP ↔ Azure, TypeScript ↔ JavaScript
- **Same-language** (counts as 0.4): Python-data × Python-backend = partial credit for language familiarity

### Kitchen-Sink Rule
If job lists >6 must-have skills, evaluate only top 6 by listing order. Rest treated as nice-to-have bonus.

## Seniority Dimension (0-100)

| Gap (profile - job) | Score Range | Notes |
|---------------------|------------|-------|
| 0 (exact match) | 90-100 | Perfect level fit |
| +1 (slightly over) | 75-85 | Experienced, positive signal |
| -1 (slightly under) | 65-80 | Growth opportunity |
| +2 (overqualified) | 55-70 | Flag overqualified, but competent |
| -2 (underqualified) | 45-60 | Significant stretch |
| +3 or more | 30-50 | Very overqualified |
| -3 or more | 25-40 | Very underqualified |

Overqualified = flag when gap ≥ +2, but DON'T tank the score. Being experienced is an asset.

## Domain Dimension (0-100)

| Condition | Score Range |
|-----------|------------|
| Exact domain match | 90-100 |
| Adjacent domain | 60-80 |
| No domain match but transferable business knowledge | 30-50 |
| Dealbreaker domain (e.g., crypto when profile says no crypto) | 0-10 |

## Location Dimension (0-100)

| Condition | Score Range |
|-----------|------------|
| City match or remote match | 95-100 |
| Hybrid in matching city | 85-95 |
| Same country, different city | 55-70 |
| Null/unknown location | 65-70 (neutral) |
| International / incompatible | 25-45 |

## Non-Tech Roles
For non-tech roles (sales, HR, finance, marketing, operations):
- Replace skills dimension with **title similarity** — "Sales Manager" × "Account Manager" = high, "Sales Manager" × "HR Manager" = low
- Domain and seniority still apply normally

## Dealbreaker Override
If any dealbreaker is violated (e.g., crypto domain, company size):
- Hard cap composite at <40 regardless of other scores
- Applied as post-score filter

## Adjacent Role Families
Same family or adjacent family with >50% skill overlap → treat like same-family scoring.
Adjacent pairs: backend ↔ fullstack, frontend ↔ fullstack, data ↔ backend, devops ↔ backend, mobile ↔ frontend.
