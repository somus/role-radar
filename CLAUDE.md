# Role Radar

Local-first job discovery + fit scoring + resume generation app. Bun runtime, Ollama for LLM, React + shadcn/ui frontend.

See `PRD.md` for full product requirements. See `CONTEXT.md` for domain language glossary.

## Build system

- **Frontend**: React + Tailwind + shadcn/ui, built with Vite. Output to `dist/`.
- **Desktop**: Electrobun copies `dist/` to `views/mainview/` during app build. `views: {}` in electrobun.config.ts because Vite handles view builds.
- **Backend**: Bun bundles `src/bun/index.ts` as main process.
- **Dev**: `bun run dev` runs `vite build && electrobun dev --watch`.
- **Path aliases**: `@/` → `src/mainview/` (configured in both vite.config.ts and tsconfig.json).

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
