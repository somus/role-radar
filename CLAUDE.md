# Role Radar

Local-first job discovery + fit scoring + resume generation app. Bun runtime, Ollama for LLM, React + shadcn/ui frontend.

See `PRD.md` for full product requirements. See `CONTEXT.md` for domain language glossary.

## Build system

- **Frontend**: React + Tailwind + shadcn/ui, built with Vite. Output to `dist/`.
- **Desktop**: Electrobun copies `dist/` to `views/mainview/` during app build. `views: {}` in electrobun.config.ts because Vite handles view builds.
- **Backend**: Bun bundles `src/bun/index.ts` as main process.
- **Dev**: `bun run dev` runs `vite build && electrobun dev --watch`.
- **Path aliases**: `@/` → `src/mainview/` (configured in both vite.config.ts and tsconfig.json).

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
