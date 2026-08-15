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

## Deploying

The build is static; `app/build` is the publishable site.

```bash
cd app && npm run build          # site at a domain root
BASE_PATH=/repo-name npm run build   # site in a subdirectory
```

**Cloudflare Pages / Netlify** — publish `app/build`. `_headers` applies, so
content-hashed files are cached immutably for a year and fetched once ever.

**GitHub Pages** — publish `app/build`. Three things matter:

- `.nojekyll` is emitted, without which Pages runs Jekyll and silently
  deletes `_app/` (the entire application).
- `404.html` is emitted as a copy of the shell, because Pages has no
  rewrite rules; it is what makes a deep link like `/plato/republic/7`
  boot the reader rather than 404.
- A **project page** (`user.github.io/repo/`) needs `BASE_PATH=/repo`.
  A user/org site or custom domain needs no base path.
  `_headers` is ignored by Pages, so hashed files get a ten-minute cache
  instead of a year; the service worker's cache-first strategy hides this
  after the first visit.

To check a deploy before pushing, serve it the way Pages actually behaves:

```bash
python3 scripts/serve-like-pages.py /tmp/site 4180 --site=repo-name
```
