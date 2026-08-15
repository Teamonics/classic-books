# Classic Books

A fast, free, offline-capable web reader for public-domain translations of
the classics. Static-first: texts are pre-built JSON on a CDN; all user state
lives in localStorage. See PLAN.md (architecture) and SOURCING.md (per-title
translation/source decisions).

- `raw/` — committed source snapshots (Standard Ebooks repos, Project
  Gutenberg HTML, Wikisource), each with a SNAPSHOT.json provenance record.
- `pipeline/` — TypeScript build pipeline: adapters → block model → canonical
  refs → chunks → validation → content-hashed JSON. `npx tsx src/build.ts`.
- `build/` — committed, reproducible pipeline output (chunks, manifests,
  catalog.json, sources.json).
- `app/` — SvelteKit reader (Phase 2).
