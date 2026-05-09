# Review Guidelines

Project-specific supplement for code reviews.

- Review actual behavior against `PRD.md` and domain terms in `CONTEXT.md`.
- Treat local-first guarantees seriously: avoid network work unless user-triggered or explicitly part of pipeline behavior.
- Flag stale Profile, Job, Search Query, and Fit Score state. User-visible results must match current Profile.
- Flag ambiguous LLM-triggering actions. UI should make it clear when Gemini is called versus cached/local data reused.
- Prefer tests at module seams (`query-generator`, stores, adapters) before adding broad UI harnesses.
- Do not add AI attribution, generated-by footers, or co-author trailers.
