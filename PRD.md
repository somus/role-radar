# Role Radar — Product Requirements Document

**Product:** Personalized Job Discovery + Fit Scoring + Resume Generator
**Phase 1 Scope:** LinkedIn
**Deployment:** Single-user local desktop app (Electrobun)
**Core Principle:** Only show scores after full job detail analysis (LLM-based). No heuristic/embedding scores shown to users.

---

## Problem Statement

Job seekers waste hours scrolling through irrelevant listings, manually comparing job requirements against their experience, and rewriting resumes for each application. Existing job boards show everything — no personalization, no fit assessment, no way to know which jobs are worth applying to without reading every description. The process is slow, demoralizing, and leaves qualified candidates applying to poor-fit roles while missing strong matches buried in noise.

---

## Solution

A local-first application that ingests a user's resume, builds a rich professional profile (enhanced by targeted follow-up questions), automatically discovers relevant jobs from LinkedIn, scores each job against the profile using multi-dimensional LLM analysis, and generates tailored resumes on demand. Scores appear progressively as jobs are analyzed. The user sees a ranked, filterable feed of high-confidence matches — not raw listings. Everything runs locally: no data leaves the machine.

---

## User Stories

1. As a job seeker, I want to upload my PDF resume, so that the system can understand my professional background without manual data entry.
2. As a job seeker, I want to review and edit my extracted profile before job discovery starts, so that I can correct any LLM parsing errors.
3. As a job seeker, I want to answer targeted questions about my career goals and dealbreakers, so that the system understands what I want next — not just what I've done.
4. As a job seeker, I want to describe a challenging problem I solved at a previous job, so that the system has concrete stories to draw from when tailoring my resume.
5. As a job seeker, I want the system to automatically search for relevant jobs, so that I don't have to manually craft search queries.
6. As a job seeker, I want to see jobs appear in my feed immediately after discovery, even before scoring is complete, so that I know the system is working.
7. As a job seeker, I want scores to appear progressively as each job is analyzed, so that I can start reviewing top matches while others are still being scored.
8. As a job seeker, I want to see a composite Fit Score (0–100) for each job, so that I can quickly prioritize which jobs to investigate.
9. As a job seeker, I want to see structured matches (exact, inferred, partial) with context for each job, so that I understand why a job scored the way it did.
10. As a job seeker, I want to see structured gaps with context, so that I know what skills or experience I'd need to strengthen.
11. As a job seeker, I want an "overqualified" flag on jobs below my seniority level, so that I can distinguish between poor-fit and step-down opportunities.
12. As a job seeker, I want to filter jobs by minimum Fit Score, so that I only see jobs worth applying to.
13. As a job seeker, I want jobs grouped into Top Matches (80+), Good Matches (65–80), and Others, so that I can scan the feed efficiently.
14. As a job seeker, I want to adjust the scoring dimension weights (skills, seniority, domain, location), so that the ranking reflects what matters most to me.
15. As a job seeker, I want weight changes to instantly re-rank the feed without re-running LLM scoring, so that I can experiment with priorities quickly.
16. As a job seeker, I want to view the full LLM reasoning behind any score, so that I can understand and trust the system's assessment.
17. As a job seeker, I want to generate a tailored resume for a specific job, so that I can apply with a document that emphasizes my relevant experience.
18. As a job seeker, I want the tailored resume to rewrite my existing bullets — not fabricate experience, so that the output is truthful and credible.
19. As a job seeker, I want jobs where I generated a resume to be preserved permanently, so that I have a history of my applications.
20. As a job seeker, I want jobs without generated resumes to auto-expire after 30 days, so that stale listings don't clutter my feed.
21. As a job seeker, I want the app to refresh job searches daily, so that new postings appear without manual action.
22. As a job seeker, I want a "New" badge on jobs discovered since my last visit, so that I can quickly spot fresh opportunities.
23. As a job seeker, I want to re-upload my resume or edit my profile at any time, so that the system stays current as my experience or goals change.
24. As a job seeker, I want profile changes to trigger re-scoring of all existing jobs, so that rankings reflect my updated profile.
25. As a job seeker, I want to see a clear error when the Gemini API key is missing or invalid, with instructions to get one, so that I can fix the issue without debugging.
26. As a job seeker, I want failed jobs to appear in the feed with a retry button, so that transient failures don't silently drop results.
27. As a job seeker, I want a progress indicator showing "42/50 scored, 8 failed", so that I always know the pipeline's state.
28. ~~(Removed — model is now fixed to Gemini 2.5 Flash Lite)~~
29. As a job seeker, I want dealbreakers (e.g., "no onsite", "no startups") to filter or flag jobs regardless of Fit Score, so that hard constraints are always respected.
30. As a job seeker, I want all my data to stay on my machine, so that my resume, profile, and job search activity remain private.

---

## Implementation Decisions

### Architecture

- **Single-user local desktop app** built with Electrobun. No auth, no multi-tenancy, no server deployment.
- **Desktop shell:** Electrobun — Bun-native desktop framework. Main process IS Bun (no sidecar). Frontend runs in system webview. Built-in typed RPC between main and webview.
- **Communication:** Electrobun's native typed RPC for all main↔webview communication. No HTTP server (Hono dropped). Route logic organized as plain functions exposed via RPC.
- **Database:** bun:sqlite for app data (jobs, profiles, scores). Runs directly in main process. Separate from bunqueue's internal SQLite. Stored in platform app data directory (`~/Library/Application Support/RoleRadar/` on macOS, `%APPDATA%/RoleRadar/` on Windows).
- **Migrations:** Sequential numbered migration files. `_migrations` table tracks applied. Run pending migrations on app startup. Never modify existing migrations.
- **System tray:** App minimizes to tray on window close (not quit). Background daily refresh runs while minimized. Tray icon shows notification badge when new jobs found. Explicit "Quit" to exit.
- **Auto-update:** Electrobun BSDIFF patching. Check for updates on launch. Download tiny patches. Critical for shipping LinkedIn selector fixes fast.
- **First-run:** Guided setup wizard — prompt for Gemini API key → validate → store encrypted → proceed to resume upload.
- **Offline:** Graceful degradation. Cached jobs browsable, LLM scoring works on jobs with details already fetched, resume generation works fully offline. Discovery/fetch show "No internet" inline — no modal blocking.
- **File storage:** Original uploaded resume PDFs stored in app data directory. Generated resume PDFs save via Save As dialog to user-chosen location. Logs in app data directory (Pino, rotating, capped).

### Modules

1. **Gemini Client** — Wraps all LLM interaction via Gemini 2.5 Flash Lite REST API. Health check on startup. Inference with `responseJsonSchema` structured output + Zod validation + 3 retries with error feedback in prompt. Single interface: `infer(prompt, schema) → T`. API key stored encrypted in SQLite.
2. **Resume Parser** — `@libpdf/core` for PDF text extraction. LLM parses text into both the compact structured Profile and a full structured resume JSON artifact for later Typst rendering. Zod validates output. Interface: `parse(pdfBuffer) → { profile: Profile, resume: StructuredResume }`.
3. **Profile Enrichment** — LLM generates 5 questions from parsed profile covering career intent + dealbreakers, problem-solving stories from past roles, and technical depth. Free-text answers with guided prompts. LLM extracts structured enrichment data. Re-answerable anytime from profile page. Interface: `generateQuestions(profile) → Question[]`, `enrichProfile(profile, answers) → EnrichedProfile`.
4. **Profile Store** — CRUD for profiles in SQLite, including raw extracted resume text, original PDF path, and corrected structured resume JSON. On update (via PDF re-upload, form edit, or re-enrichment), triggers full pipeline re-run: regenerate queries → new search → re-score all jobs.
5. **Query Generator** — LLM generates 3–5 structured search query objects (keywords, location, experience level) from profile. Code maps objects to LinkedIn API parameters. Interface: `generate(profile) → SearchQuery[]`.
6. **LinkedIn Adapter** — Implements `JobSourceAdapter` interface. Search via `/jobs-guest/jobs/api/seeMoreJobPostings/search`, detail fetch via `/jobs/view/{jobId}`. HTML parsing with Cheerio using JSON-configurable selectors (not hardcoded). Validates parsed output — missing critical fields = `parse_failed` status. Conservative rate limiting: 2–3s delay between requests, exponential backoff (30s base) on 429/403, circuit-break after 5 failures via bunqueue.
7. **Heuristic Scorer** — Pure function scoring title similarity to profile roles + location match to preferences + recency. Used internally to filter ~200 discovered jobs to top ~50 for LLM scoring. Never exposed to user. Interface: `score(job, profile) → number`.
8. **LLM Scorer** — Multi-dimensional scoring on 4 axes: skills match, seniority match, domain relevance, location fit. Each axis scored individually by LLM. Outputs structured matches/gaps with `{skill, type: exact|inferred|partial, context}`. Overqualified flag when seniority mismatch detected. Full prompt + response stored as LLM Reasoning. Interface: `score(jobDetail, profile) → FitResult`.
9. **Score Weights** — Pure function computing weighted composite from dimension scores. Default weights: 40% skills, 20% seniority, 15% domain, 25% location. User-adjustable via UI sliders. Changing weights re-computes all composites instantly without LLM re-run. Interface: `composite(dimensions, weights) → number`.
10. **Job Pipeline** — Orchestrates bunqueue (embedded mode, SQLite-backed). Two queues: detail-fetch (concurrency ~5, dynamic based on hardware), LLM scoring (concurrency 1, dynamic). Manages job lifecycle state transitions (discovered → queued → fetching → scoring → ready | failed). Dedup: DB unique constraint on `job_id` + bunqueue dedup.
11. **Resume Generator** — LLM rewrites existing resume bullets to emphasize skills matching a specific job. Does not fabricate experience. Rendered as PDF via Typst using the `basic-resume` template. One template for MVP. Jobs with generated resumes flagged `resume_generated = true` for permanent retention. Interface: `generate(profile, structuredResume, jobDetail, fitResult) → PDFBuffer`.
12. **Background Refresh** — Daily automatic re-query of job sources. Reuses query generator + LinkedIn adapter. Dedup prevents re-scoring existing jobs. New discoveries get "New" badge in feed.
13. **RPC Layer** — Electrobun typed RPC handlers exposed to webview. Functions for: profile CRUD, resume upload, enrichment Q&A, job feed (paginated, filterable), settings (model selection, weights), resume generation trigger, pipeline status subscriptions.
14. **Database Layer** — SQLite schema for jobs, profiles, scores, enrichment answers, LLM reasoning. 30-day TTL cleanup (skip jobs with `resume_generated = true`). Sequential numbered migrations run on startup.
15. **Frontend** — React + Vite + Tailwind + shadcn/ui (in Electrobun webview). Views: setup wizard, resume upload, profile review/edit, enrichment Q&A, job feed with progressive scoring, job detail with matches/gaps/reasoning, settings (model picker, weight sliders), resume preview/download.

### Scoring Calibration

Explicit rubric in LLM scoring prompt:
- **90–100:** Near-perfect match. Role, skills, seniority, domain, location all align.
- **70–89:** Strong match with minor gaps. Core requirements met, 1–2 skills to grow.
- **50–69:** Possible with growth. Significant gaps but transferable skills present.
- **Below 50:** Poor fit. Major misalignment on multiple dimensions.

### Profile Schema

```json
{
  "roles": ["Backend Engineer", "Staff SRE"],
  "skills_primary": ["Node.js", "AWS", "PostgreSQL"],
  "skills_secondary": ["Docker", "Terraform"],
  "experience_years": 8,
  "seniority": "Senior",
  "domains": ["Fintech", "AdTech"],
  "preferences": {
    "locations": ["Bengaluru", "Remote"],
    "remote": true,
    "min_salary": 3000000,
    "company_sizes": ["startup", "mid"]
  },
  "career_intent": "...",
  "dealbreakers": ["no onsite", "no consulting"],
  "problem_solving_stories": ["..."],
  "technical_depth": ["..."]
}
```

### Fit Score Output Schema

```json
{
  "dimensions": {
    "skills": 85,
    "seniority": 90,
    "domain": 60,
    "location": 100
  },
  "composite": 82,
  "overqualified": false,
  "matches": [
    { "skill": "Node.js", "type": "exact", "context": "5 years Node.js, job requires Node.js" },
    { "skill": "AWS", "type": "inferred", "context": "EC2/S3 experience maps to AWS requirement" }
  ],
  "gaps": [
    { "skill": "Kubernetes", "type": "exact", "context": "Job requires 3+ years, not on resume" }
  ],
  "dealbreaker_violations": [
    { "dealbreaker": "no onsite", "reason": "Job requires three days in office" }
  ],
  "summary": "Strong backend match. Skill alignment high, domain shift from Fintech to Healthcare is the main gap."
}
```

Scoring schema changes that add new fit semantics, such as dealbreaker evaluation, require existing score rows to be regenerated before the feed treats them as current.

### Job Lifecycle

```
discovered → queued → fetching → scoring → ready
                                          → failed
```

Additional flags (not states): `resume_generated: boolean`, `is_new: boolean`.

### Data Retention

- Default: 30-day TTL on all jobs.
- Exception: Jobs with `resume_generated = true` persist permanently.
- bunqueue manages its own SQLite database separately from app data.

### Rate Limiting (LinkedIn)

- 2–3 second delay between requests.
- Max 5 concurrent detail fetches.
- On 429/403: exponential backoff starting at 30s, max 5 retries.
- Circuit-break adapter after 5 consecutive failures (bunqueue native).
- Daily background refresh = one batch per day (conservative).

### Tech Stack

| Layer | Choice |
|-------|--------|
| Runtime | Bun |
| Desktop | Electrobun (Bun-native, system webview, BSDIFF auto-update) |
| IPC | Electrobun typed RPC (no HTTP server) |
| Queue | bunqueue (embedded, SQLite-backed) |
| DB | bun:sqlite |
| PDF parse | @libpdf/core |
| PDF gen | Typst via `basic-resume` |
| LLM | Gemini 2.5 Flash Lite (cloud API, encrypted key) |
| Frontend | React + Vite + Tailwind + shadcn/ui (in webview) |
| Validation | Zod |
| Logging | Pino (rotating file, capped, in app data dir) |
| HTML parse | Cheerio (JSON-configurable selectors) |
| Concurrency | p-limit + bunqueue native |

---

## Testing Decisions

### What makes a good test

Tests should verify external behavior through module interfaces, not implementation details. A test should break only when the module's contract changes — not when internals are refactored. Mock external dependencies (Gemini API, LinkedIn HTTP), never mock internal functions.

### Modules under test

1. **Gemini Client** — Health check detection, retry loop on malformed JSON, Zod validation failure handling. Mock HTTP responses from Gemini API.
2. **Resume Parser** — PDF text extraction → structured Profile. Test with sample PDF buffers. Verify Zod schema compliance. Test malformed PDF handling.
3. **Heuristic Scorer** — Pure function, no mocks needed. Test title matching (exact, partial, unrelated), location matching, recency weighting. Verify ordering is stable.
4. **LLM Scorer** — Mock Gemini Client. Verify 4-dimension output structure. Test overqualified flag detection. Test structured match/gap generation. Verify calibration rubric boundaries.
5. **Score Weights** — Pure function. Test default weights, custom weights, edge cases (all zeros, single dimension). Verify composite matches manual calculation.
6. **Query Generator** — Mock Gemini Client. Verify output maps to valid LinkedIn API params. Test with different profile shapes (sparse, complete).
7. **LinkedIn Adapter** — Mock HTTP responses with saved HTML snapshots. Test search result parsing, detail page parsing. Test rate limit handling (429 response → backoff). Test HTML structure changes (graceful degradation).
8. **Job Pipeline** — Integration tests with real bunqueue (embedded) + SQLite. Test lifecycle transitions, dedup behavior, failure handling, re-scoring on profile update.

---

## Out of Scope

- **Embeddings** for fast filtering (future enhancement).
- **Multi-source aggregation** beyond LinkedIn (adapter interface is ready, but only LinkedIn implemented in MVP).
- **Adaptive learning** from user feedback on scores.
- **Analytics** dashboard or usage tracking.
- **Multi-user support**, authentication, or tenant isolation.
- **Local LLM runtime** (using cloud Gemini API for MVP).
- **Multiple resume templates** (one template for MVP).
- **Job application tracking** beyond the `resume_generated` flag.
- **Browser extension** or LinkedIn integration.
- **Salary data enrichment** from external sources.

---

## Further Notes

- **Domain language** is defined in `CONTEXT.md` at the project root. All modules should use these terms consistently.
- **LinkedIn scraping will break.** The adapter pattern exists specifically to make source-swapping cheap. Build resilient, not invisible.
- **LLM model is fixed to Gemini 2.5 Flash Lite.** Fast, cheap, good structured output. Model selection may be added later if needed.
- **Profile enrichment questions are the key differentiator.** Resumes show what you've done; the questions capture what you want next and the stories that make tailored resumes compelling. This data feeds both scoring and resume generation.
- **Dealbreakers are hard filters.** A job violating a dealbreaker should be flagged or filtered regardless of Fit Score. This is distinct from low-scoring — a 90% fit job in a wrong location with "no onsite" as a dealbreaker should still be flagged.
- **The heuristic scorer is a cost-reduction mechanism, not a quality signal.** It exists solely to reduce the number of expensive LLM scoring calls. False negatives here mean good jobs never get scored — keep the filter loose (err toward including, not excluding).
