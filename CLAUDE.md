# Role Radar

Local-first job discovery + fit scoring + resume generation app. Bun runtime, Gemini for LLM scoring + query generation, React + shadcn/ui frontend.

See `PRD.md` for full product requirements. See `CONTEXT.md` for domain language glossary.

## Build system

- **Frontend**: React + Tailwind + shadcn/ui, built with Vite. Output to `dist/`.
- **Desktop**: Electrobun copies `dist/` to `views/mainview/` during app build. `views: {}` in electrobun.config.ts because Vite handles view builds.
- **Backend**: Bun bundles `src/bun/index.ts` as main process.
- **Dev**: `bun run dev` runs `vite build && electrobun dev --watch`.
- **Path aliases**: `@/` → `src/mainview/` (configured in both vite.config.ts and tsconfig.json).

## Multi-source ingestion

Job sources are pluggable via the `JobSource` interface in `src/bun/sources/job-source.ts`. Each board (LinkedIn shipped; 9 more in flight) implements `search()` + optional `fetchDetails()` and declares `JobSourceCapabilities` (`http | native`, page size, rate limit, posted-at quality). The registry (`src/bun/sources/registry.ts`) maps `JobSourceId` to source instances.

- **`JOB_SOURCE_IDS`** in `src/shared/types.ts` is the single source of truth for board ids. `db.ts` startup runs `ensureSourceCoverage()` to backfill any missing `source_health` / `user_source_settings` rows.
- **Posted-at normalization**: `posted-at-normalizer.ts` parses ISO, relative ("2 days ago"), and explicit dates into `posted_at_ts` + `posted_at_confidence` (`exact | relative | estimated | missing`). Raw board string preserved in `posted_text`.
- **Feed filters**: `JobFeedFilters` carries `enabledSources` + `sortMode` (`best_match | most_recent`). `getJobFeed()` applies both. Default is frozen via `Object.freeze` to prevent mutation.
- **Source health**: `source_health` table with `ok | broken | quarantined | disabled`. Auto-quarantine after 3 consecutive zero-insert runs (Phase 2 wiring).

## Frontend module layout

Components stay focused on rendering. Logic and effect orchestration live in two seam types:

- **View models (`*-view-model.ts`)**: pure functions that derive display strings, sections, chips, or row structures from domain types. Examples: `feed-view-model.ts`, `job-detail-view-model.ts`, `onboarding-flow.ts`. Unit-test these directly with `bun test` — they are fast and deterministic.
- **Hooks (`use-*.ts`)**: encapsulate async, RPC, and pipeline-event wiring. Examples: `use-auto-search.ts`, `use-enrichment-questions.ts`, `use-job-reasoning.ts`. They expose a small state surface to their hosting component.

When adding feature logic, prefer extending an existing view model or hook over inlining new state in a screen-level component.

## Commit rules

- Never add `Co-Authored-By`, `Generated-By`, or any AI/agent attribution to commit messages.
- No agent signatures, footers, or trailers of any kind.

## Agent skills

### Issue tracker

Issues tracked via GitHub Issues. See `docs/agents/issue-tracker.md`.

### Triage labels

Default label vocabulary (needs-triage, needs-info, ready-for-agent, ready-for-human, wontfix). See `docs/agents/triage-labels.md`.

### Domain docs

Single-context repo. One `CONTEXT.md` at root, `docs/adr/` for architectural decisions. See `docs/agents/domain.md`.
