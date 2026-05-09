# ADR 0001 — Detail-fetch queue

Status: Accepted (issue #7)
Date: 2026-05-10

## Context

After job discovery (issue #5) we have ~200 raw `discovered` rows with title/company/location only. LLM scoring (issue #8) requires the full job description, but each detail page is ~2.5 s and LinkedIn rate-limits aggressively. We need a stage that:

- Picks the most promising ~50 jobs (Heuristic Scorer).
- Fetches them in parallel without tripping LinkedIn's throttle.
- Survives transient failures and stops if the source is broken.
- Tracks per-job lifecycle so the UI can show real-time status.

## Decision

### Concurrency model: `bunqueue` (embedded mode)

Chosen because it gives us, in one in-process dependency:

- Concurrency cap (worker pool of 5).
- Token-bucket rate limiter (1 request / 2.5 s).
- Circuit breaker (open after 5 consecutive failures).
- Deduplication & retry primitives.
- SQLite persistence (so an interrupted batch resumes after relaunch).

Alternatives considered:

- **Hand-rolled `p-limit`-style pool.** Already a dep, but we'd reimplement the limiter, breaker, and persistence — meaningful surface area. Skipped.
- **BullMQ.** Requires Redis. Out of scope for a local-first desktop app.

### Status lifecycle

`discovered → queued → fetching → ready_for_scoring | fetch_failed`

The DB column `jobs.status` is the **source of truth**. Bunqueue's internal queue is treated as an ephemeral execution channel.

- `discovered` — list-page parse only.
- `queued` — selected for detail fetch, sitting in bunqueue.
- `fetching` — worker is currently fetching.
- `ready_for_scoring` — detail HTML parsed, criteria/description populated.
- `fetch_failed` — fetch errored or timed out. Re-queued automatically once 24 h have elapsed (`getJobsForHeuristicScoring`).

### Deduplication

We deliberately do **not** rely on bunqueue's deduplication primitive. Reason: with `removeOnComplete: true`, dedup keys orphan once the job record is gone, leading to surprising re-add behaviour within the TTL window.

Instead, `DetailFetchQueue.enqueue()` filters out any job whose current `status ∈ {queued, fetching, ready_for_scoring}` before pushing to bunqueue. The DB invariant carries the dedup guarantee.

### Per-job timeout

Every fetch is wrapped in a 30 s `Promise.race` timeout. Without it a stuck socket would prevent `drain()` from ever returning.

### Rate limit

Token-bucket: 1 fetch per 2.5 s globally. Combined with concurrency 5 this gives an in-flight window of ~5 jobs for the first 12.5 s, then steady-state of one completion per 2.5 s. LinkedIn's guest endpoints tolerate ~10 req/min in our experience; this leaves comfortable headroom.

### Pipeline trigger

Auto-runs at the tail of every `searchJobs` / `runGeneratedSearches` / `fetchMoreJobs` RPC handler. Top-N is read from the `top_n_detail_fetch` settings row (default 50). No new RPC verbs.

## Consequences

- Adds a single npm dep (`bunqueue@2.7.10`) with a separate SQLite file under `userData/bunqueue.db`.
- Frontend feed must subscribe to `detail:*` events (issue #14) to surface progress; until then the feed only refreshes after `job:search:complete`.
- LinkedIn endpoint `/jobs-guest/jobs/api/jobPosting/{id}` is reverse-engineered, same family as the search endpoint — fragile to LinkedIn HTML changes (selectors live in `config/linkedin-selectors.json` for fast patching).
