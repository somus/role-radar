# Review Guidelines

Project-specific supplement for code reviews.

- Review actual behavior against `PRD.md` and domain terms in `CONTEXT.md`.
- Treat local-first guarantees seriously: avoid network work unless user-triggered or explicitly part of pipeline behavior.
- Flag stale Profile, Job, Search Query, and Fit Score state. User-visible results must match current Profile.
- Flag ambiguous LLM-triggering actions. UI should make it clear when Gemini is called versus cached/local data reused.
- Prefer tests at module seams (`query-generator`, stores, adapters) before adding broad UI harnesses.
- Treat frontend view models (`*-view-model.ts`) and `onboarding-flow.ts` as unit-testable pure functions. Hooks (`use-*.ts`) carry async/pipeline wiring; flag missing teardown of refs, timers, and shared module-level state (e.g. `pendingGenerations`).
- Do not add AI attribution, generated-by footers, or co-author trailers.
