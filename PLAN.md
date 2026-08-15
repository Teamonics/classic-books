# Classic Books — Phase 0 Plan

Status: **awaiting approval** — no code scaffolded.
Date: 2026-08-15. All catalog/copyright facts below were verified against
standardebooks.org and the standardebooks GitHub org on this date.

---

## 1. Verification findings — read this section first

The brief said "all available from Standard Ebooks... verify each before
building." I did, and the results change the plan materially.

### 1.1 The SE catalog listings include unproduced placeholders

SE author pages list both released ebooks and "wanted" placeholders that have
no text behind them. Distinguishing them (via the `placeholder-cover` marker),
the actual availability for the Phase 1 list is:

**Released on SE (verified):**

| Work | Translator | Notes |
|---|---|---|
| Homer, Iliad + Odyssey | **William Cullen Bryant** | Blank verse — **not Butler's prose** (see 1.4) |
| Aeschylus (3 of 7 plays) | Gilbert Murray | Copyright problem (see 1.2) |
| Sophocles, all 7 plays | Francis Storr (d. 1919) | Verse drama, clean |
| Aristophanes, The Birds only | The Athenian Society (1912) | **All 10 Rogers plays are placeholders** |
| Herodotus, Histories | G. C. Macaulay (d. 1915) | |
| Thucydides, Peloponnesian War | Richard Crawley | Verify unrevised (not Feetham) from content.opf |
| Plato, Dialogues (complete) | Benjamin Jowett | **No Stephanus numbers in source** (see 1.3) |
| Epictetus, Discourses + Short Works | George Long | |
| Marcus Aurelius, Meditations | George Long | |
| Virgil, Eclogues + Georgics + Aeneid | **John Dryden** | Rhymed couplets, not a modern-ish prose/blank verse |
| Augustine, City of God | Dods/Wilson/Smith | **Confessions is a placeholder** |
| Dante, Divine Comedy | Longfellow | Line-per-`<span>` markup; numbers derivable by counting |
| Chaucer, Canterbury Tales | (Middle English) | Troilus is a placeholder; verify edition = Skeat |
| Machiavelli, The Prince + Discourses on Livy | Marriott / Thomson | |
| Hobbes, Leviathan | — | |
| Shakespeare | — | 38 plays + Poetry; effectively complete |
| Cervantes, Don Quixote | John Ormsby | |
| Milton, Paradise Lost | — | Poetry, Samson, **Areopagitica are placeholders** |
| Locke, Two Treatises | — | **Essay Concerning Human Understanding is a placeholder** |
| Hume, Enquiry (Human Understanding) | — | Treatise is a placeholder |
| Swift, Gulliver's Travels; Sterne, Tristram Shandy; Fielding, Tom Jones | — | |
| Rousseau, The Social Contract | G. D. H. Cole | Copyright problem (see 1.2) |
| Adam Smith, Wealth of Nations + Moral Sentiments | — | |
| Gibbon, Decline and Fall (complete) | — | |
| Mill, On Liberty + Subjection of Women + Autobiography | — | Utilitarianism, Representative Govt are placeholders |
| Melville, Moby-Dick | — | |
| Marx/Engels, Communist Manifesto | Samuel Moore | **Capital is a placeholder** |
| Tolstoy, War and Peace | Maude | Plus Anna Karenina (Garnett), Hadji Murad, etc. |
| Dostoevsky, Brothers Karamazov | Constance Garnett | Plus C&P, Idiot, Demons, etc. |
| Federalist Papers | — | |

**Placeholders only (must come from Project Gutenberg or be deferred):**
Euripides (all 19 — nothing released), Aristophanes except The Birds,
Aeschylus (4 of 7), Lucretius (Munro), Plutarch Parallel Lives, Tacitus
(Church & Brodribb), Plotinus, Augustine Confessions, Aquinas Summa, Chaucer
Troilus, Rabelais, Montaigne (Cotton), Bacon (all), Spinoza Ethics, Pascal
(all), Berkeley, Montesquieu, Kant (all 8), Locke Essay, Hume Treatise,
Milton poetry/Areopagitica, Marx Capital, Mill Utilitarianism.

That is roughly **25 SE-sourced works vs ~25 PG-sourced titles**, at the
brief's own estimate of ~1 day per PG title. Phase 5 is therefore much larger
than "ingest the rest from SE," and the PG adapter is a first-class citizen,
not an afterthought. Alternatively we ship a leaner catalog first (SE-only)
and grow it; my recommendation in §7.

### 1.2 Copyright flags (PD in US **and** life+70 required)

- **Aeschylus — Gilbert Murray** (d. 1957): life+70 until **Jan 1, 2028**.
  Fails our rule today. Substitute E. D. A. Morshead (d. 1912) or Herbert Weir
  Smyth (d. 1937) from PG, or defer Aeschylus ~18 months and take Murray then.
- **Plotinus — MacKenna & Page**: B. S. Page co-translated Ennead VI (1930)
  and was still revising editions in 1969, so he died 1969 at the earliest →
  life+70 protection into at least 2040. **Recommend deferring Plotinus**
  alongside Aristotle. (The brief's assumption on this one is wrong; there is
  no PD-everywhere complete Enneads.)
- **Rousseau — G. D. H. Cole** (d. 1959): life+70 until **2030**. Substitute
  H. J. Tozer's Social Contract (PG) or defer.
- **Euripides — Gilbert Murray plays**: same 2028 issue; use Coleridge
  (d. 1936, clean) from PG for all plays.
- **Pascal Pensées — W. F. Trotter**: death date not yet verified; must be
  confirmed before building (PG source anyway).
- Everything else spot-checked is clean: Storr 1919, Coleridge 1936, Macaulay
  1915, Crawley 1893, Jowett 1893, Long 1879, Bryant 1878, Longfellow 1882,
  Dryden 1700, Marriott 1927, Ormsby 1895, Dods 1909, Garnett 1946 (clear
  since 2017), the Maudes 1938/1939, Moore 1911/Aveling 1898, Athenian
  Society 1912.

A `sources.json` entry will carry translator death year + verification date
for every work, so this never has to be re-researched.

### 1.3 Canonical ref recovery is the hard pipeline problem

I pulled SE's actual XHTML and checked:

- **Plato (Jowett, `republic.xhtml`): zero Stephanus numbers.** Only
  `<section epub:type="division">` per book. `/plato/republic/514a` cannot be
  derived from the SE source. Restoring Stephanus numbers means aligning
  Jowett's text against a Stephanus-keyed edition — real scholarly work, per
  dialogue.
- **Dante (Longfellow, `inferno.xhtml`): no line numbers**, but every line is
  a discrete `<span>` inside per-tercet `<p>`s, so line numbers fall out of
  counting spans per canto. Good.
- Verse translations generally carry the **translation's own lineation**, not
  the original's (Bryant's blank-verse Iliad does not match Greek line
  numbers). Refs must therefore be honest about which lineation they encode.

Plan consequences (also raised in §8):

1. The manifest declares a **ref scheme per work**, and every work always has
   a guaranteed *structural* scheme (division + block index) even when a
   scholarly scheme is unavailable.
2. Plato ships in v1 with `dialogue → book/section → paragraph` refs
   (`/plato/republic/7.12`), stable forever. Stephanus becomes an **alias ref
   layer** added in a later phase via alignment, without breaking existing
   URLs. Schema supports multiple schemes per work from day one.
3. Verse works record `lineation: "translation"` in the manifest and the
   colophon says so. (Longfellow tracks the Italian closely; Bryant does not
   track the Greek.)

### 1.4 Phase 1 test texts — proposed swap

The brief's trio (Butler Homer / Rogers Aristophanes / Longfellow Dante)
assumed SE has Butler and Rogers; it has neither. Proposed replacement, four
texts to cover every block type **plus both source adapters**:

1. **Bryant's Iliad** (SE) — epic verse, book+line refs, speeches in verse.
2. **Storr's Oedipus Rex** (SE) — verse drama: speakers, stage directions,
   choral odes, stichomythia/antilabe.
3. **Longfellow's Divine Comedy** (SE) — canto+line, margin numbers, the
   flagship verse case.
4. **Rogers' Frogs** (PG) — drama + comic verse, and it forces the PG adapter
   and boilerplate-stripping to exist in Phase 1 rather than being discovered
   in Phase 5. Rogers' verse-with-speakers is also the gnarliest markup case.

If you specifically want Butler's prose Homer as the reading text we can
ingest it from PG instead of (or alongside) Bryant — flagging that Bryant is
what SE has, and prose Homer loses per-line addressing. Herodotus (SE,
Macaulay) is the backup pure-prose test if we want one without touching PG.

---

## 2. Repo structure

```
classic-books/
├── PLAN.md
├── raw/                          # committed sources; never fetched at runtime
│   ├── se/<work-slug>/           #   snapshot of SE repo src/epub/ (+ SNAPSHOT.json:
│   │                             #   repo URL, commit SHA, date retrieved)
│   └── pg/<work-slug>/           #   PG HTML + SNAPSHOT.json (PG id, URL, date)
├── pipeline/                     # Node 22 + TypeScript, no runtime deps in app
│   ├── src/
│   │   ├── acquire/              # scripted `clone SE @ pinned SHA → raw/` (run manually)
│   │   ├── adapters/
│   │   │   ├── se.ts             # one adapter for SE semantic XHTML
│   │   │   └── pg/<slug>.ts      # one adapter per PG title (expected: each is custom)
│   │   ├── model/                # block model types + zod schemas (shared w/ app)
│   │   ├── refs/                 # ref-scheme mappers (bookLine, cantoLine, actSceneLine,
│   │   │                         #   bookChapterSection, structural, aliases)
│   │   ├── chunk.ts              # canonical-boundary chunking, 5–10k word target
│   │   ├── search/               # tokenizer, stemmer, synonyms, index emitter
│   │   │   └── synonyms.json     # ~200 proper-name variants (Ulysses/Odysseus…)
│   │   ├── validate.ts           # invariants; nonzero exit on any violation
│   │   └── emit.ts               # chunks, manifests, indexes, sources.json, hashing
│   └── works.config.ts           # registry: slug, source, adapter, ref scheme, chunking,
│                                 #   translator + death year + license verification fields
├── build/                        # committed pipeline output (reproducible, diffable)
│   ├── works/<slug>/manifest.json
│   ├── works/<slug>/chunks/<ref>.<hash>.json
│   ├── search/<slug>/<shard>.<hash>.json
│   ├── sources.json
│   └── catalog.<hash>.json       # bookshelf: all works, era, ordering, cover data
├── app/                          # SvelteKit reader (details §5)
└── paths/                        # curated reading paths, authored YAML → built into catalog
```

- Work granularity: **one work = one reader unit**, not one SE repo. SE's
  Plato "Dialogues" splits into per-dialogue works (`/plato/republic/...`);
  Shakespeare is per-play. Author+work slugs give the URL scheme from the
  brief.
- `build/` is committed: diffs act as a regression test on the corpus, and
  deploys are `app build + copy build/` with no network dependency.

## 3. Build pipeline

Stages (each a pure function, each unit-testable):

```
raw/ → [adapter] → WorkIR (blocks + heading tree, no refs yet)
     → [ref mapper] → refs assigned (scheme per work; structural always)
     → [chunker] → chunks at canonical boundaries (5–10k words, never splitting
                   a division; small divisions like cantos stay whole)
     → [indexer] → per-work search shards (synonym-expanded, stemmed)
     → [emitter] → JSON + content hashes + manifest + catalog + sources.json
     → [validator] → fail loudly (see below)
```

- **Idempotent**: same `raw/` + config ⇒ byte-identical `build/` (sorted keys,
  no timestamps in hashed files; retrieval dates live in sources.json only).
- **Validator invariants**: every chunk parses against schema; every TOC entry
  resolves to a chunk; every ref in every index resolves; ref sequences are
  monotonic and complete for line-numbered schemes (gaps must be declared,
  e.g. lacunae); no orphan chunks; no unmapped-ref emissions (**hard fail**,
  per brief); every work has a complete sources.json entry including
  translator death year and license basis; PG texts contain no PG boilerplate
  or trademark strings (grep-based tripwire).
- **Caching/immutability**: every chunk/index/manifest file is emitted as
  `name.<12-char content hash>.json` → `Cache-Control: immutable`. The only
  mutable fetch is a tiny `catalog.json` pointer (short max-age) that names
  current manifest hashes.

## 4. Data schemas (abridged; zod is the source of truth, shared app ↔ pipeline)

### Chunk

```jsonc
{
  "schema": 1,
  "ref": "iliad.1",              // canonical chunk ref
  "work": "iliad",
  "title": "Book I",
  "prev": null, "next": "iliad.2",
  "blocks": [ /* Block[] */ ],
  "notes": [ { "id": "n12", "blocks": [] } ]   // translator end/footnotes
}
```

### Blocks — structured text, no HTML strings

Inline formatting is offset-based marks over plain text, so annotation offsets
survive rendering changes:

```jsonc
{ "type": "para", "text": "…", "marks": [{"s":10,"e":18,"k":"em"}],
  "refs": [{"ref":"514a","offset":123}] }          // mid-block canonical refs (Stephanus-style)

{ "type": "verse", "lines": [
    { "n": 1, "text": "…" },
    { "n": 2, "text": "…", "part": "end" }         // antilabe: split line continuation
  ] }

{ "type": "speech", "speaker": "DIONYSUS", "blocks": [ /* verse or para or stage */ ] }
{ "type": "stage",  "text": "Enter XANTHIAS with baggage." }
{ "type": "quote",  "kind": "verse", "blocks": [] } // verse quoted inside prose
{ "type": "heading", "level": 2, "text": "…" }
```

Covers the markup contract: prose (para), verse (verse w/ per-line `n`,
hanging-indent metadata via `indent`), drama (speech/stage nesting), and
verse-in-prose (quote). Margin line numbers render from `n` — the canonical
addressing made visible.

### Manifest (per work)

```jsonc
{
  "slug": "republic", "author": "plato", "title": "Republic",
  "composedYear": -375, "era": "classical-greece",
  "translator": "Benjamin Jowett",
  "refScheme": { "primary": "book.paragraph", "aliases": [],
                 "lineation": null },              // "translation" for verse works
  "toc": [ { "ref": "republic.1", "title": "Book I", "words": 12400 } ],
  "refIndex": [ /* ordered [ref → chunk] map for URL resolution */ ],
  "chunkFiles": { "republic.1": "republic.1.a3f9c2d41b77.json" },
  "search": ["shard-0.bb01…json"]
}
```

### sources.json (per work)

source type (se|pg), repo URL + commit SHA or PG id, retrieval date,
translator, translation first-publication year, translator death year,
license basis ("US PD pre-1930 + translator d. 1893"), verification date,
revision identity notes (e.g. "Crawley unrevised, not Feetham").

### User state (localStorage, `cb.v1.*` keys, versioned migrations)

Per brief, with the highlight anchor following the W3C Web Annotation model —
each highlight stores **both** selectors so anchors are repairable:

```jsonc
{ "work":"iliad", "ref":"iliad.1", "blockIndex":42,
  "position":  { "startOffset":100, "endOffset":161 },        // TextPositionSelector (block-scoped)
  "quote":     { "exact":"…", "prefix":"…", "suffix":"…" },   // TextQuoteSelector (repair)
  "color":"amber", "note":"…", "createdAt":"…" }
```

Progress is stored per-chunk (`read: true`) and displayed as "Book 3 of 24."
Export: one JSON file (full fidelity, re-importable) and one Markdown file
(grouped by work → ref, quote + note + citation link) — v1 requirement.

## 5. Reader architecture

### Framework recommendation: **SvelteKit 2 (Svelte 5) + adapter-static + TypeScript**

Why, versus React:

- **Payload**: the entire framework runtime is ~40 KB gz vs ~140+ KB for a
  comparable React stack. On a product whose one promise is "faster and
  cleaner than Gutenberg," shell size is product.
- **Long-document DOM**: infinite scroll over tens of thousands of text nodes
  is where VDOM diffing hurts; Svelte's compiled fine-grained updates touch
  only what changed, and theme/typography changes are pure CSS-custom-property
  flips with zero re-render.
- **Static story**: adapter-static prerenders the bookshelf, work landing/TOC,
  paths, about/colophon pages to real HTML (SEO for the catalog), while the
  reader hydrates client-side. One `_redirects` SPA fallback handles deep
  canonical-ref URLs on Cloudflare Pages/Netlify.
- Pipeline and app share one language and the zod block-model types.

(If you'd rather bet on React's ecosystem/hiring pool, everything else in this
plan is framework-agnostic — say so and I'll swap this section.)

### Routes

```
/                                bookshelf (prerendered)
/paths, /paths/<slug>            curated paths (prerendered)
/<author>/<work>                 landing + TOC + progress (prerendered)
/<author>/<work>/<ref>           reader; chunk-level refs prerendered as shells,
                                 finer refs (514a, 1.123) resolved client-side via
                                 manifest refIndex → scroll to anchored block
/about, /colophon                provenance from sources.json (prerendered)
```

### Components (core)

- `Reader` — orchestrates chunk windowing: keeps current ±1 chunk in DOM
  (chunks are 5–10k words, so windowing is per-chunk, not per-block —
  simpler than a virtual list and plays well with browser find/accessibility),
  prefetches next chunk, IntersectionObserver tracks reading position →
  debounced localStorage.
- `Block` renderers — `Para`, `Verse` (margin `n` numbers, hanging indents),
  `Speech`/`Stage`, `Quote`, `NoteRef` (tappable sidenote).
- `SelectionMenu` — selection → highlight (4 colors) / note / **copy
  citation** (resolves selection to nearest canonical ref + URL).
- `AnnotationLayer` — applies stored marks to blocks at render time; repair
  pass via quote selectors when position selectors fail validation.
- `SettingsPanel` — 4 themes (CSS custom properties; sepia default-adjacent),
  font size in rem, serif/sans/dyslexia-friendly (Atkinson Hyperlegible or
  OpenDyslexic, self-hosted), **measure capped 65–75ch**, line height.
  Instant apply; persisted.
- `SearchPanel` — loads per-work shards on demand; results grouped by
  division, linking to canonical refs.
- `ExportModal`, `ProgressBadge`, `Bookshelf` (typographic spines, era color
  bands, chronological), `PathCard`.
- Service worker: precache shell; cache-first runtime caching for immutable
  chunk/index files; per-work "Download for offline" button warms the cache
  for a whole work. PWA manifest.
- Accessibility from day one: semantic elements (`<article>`, `<section>`,
  `<nav>`, real headings), full keyboard map (j/k or arrows chunk nav, `/`
  search, `g` go-to-ref), focus management on chunk swap, `prefers-reduced-motion`,
  screen-reader pass in Phase 2 (not deferred to Phase 6; Phase 6 is the audit).

### Curated paths data structure (content later, structure v1)

```yaml
slug: stoicism-30-days
title: …
steps: [ { work: "meditations", ref: "meditations.1", label: "Day 1", blurb: "…" } ]
```

Built into `catalog.json`; per-path progress in localStorage. Glossary (v2) is
pre-designed for: a `term` mark kind exists in the block model from day one,
so tap-to-define needs no re-parse later.

## 6. Search design & sizing

Per-work static index, custom format (no lunr/minisearch runtime — a
tokenizer + binary-search over sorted terms is ~1 KB of code):

- Index time: lowercase, strip diacritics, Porter-stem, stopword-drop,
  **synonym-expand proper names** (Ulysses→odysseus, Jove→zeus/jupiter,
  Athene→athena… ~200 curated names in `synonyms.json`, applied so either
  variant matches either spelling).
- Format: sorted term array + delta-varint postings of (chunkIdx, blockIdx).
  Snippets are rendered by fetching the (cached, immutable) chunk and
  excerpting around the block — no stored snippet text.
- **Sizing** (estimates at ~1.7 tokens/word after dedupe-per-block):
  typical work (100–300k words) → 300–800 KB raw, **100–250 KB gz** — fine as
  one file. Gibbon (~1.5M words) → ~2 MB gz single-file — too big for one
  tap. **Proposal: works > ~500k words shard their index by top-level
  division group** (Gibbon: 6 shards by volume; Summa: by Part; Plutarch: by
  Lives group), loaded progressively with results streaming in shard order.
  UI shows per-shard progress ("searching vol. IV…"). This keeps every fetch
  under ~400 KB gz.

## 7. Milestones

- **M0 (this document)** — approval gate.
- **M1 — Pipeline proof**: SE adapter + PG adapter (Frogs); block model +
  ref mappers for the 4 test texts (§1.4); chunker, validator, emitter;
  `build/` committed; golden-file tests. *Exit: all 4 works emit valid,
  hash-stable JSON with correct refs (spot-checked against print editions).*
- **M2 — Reader shell**: bookshelf, work landing, reader with chunk
  windowing + prefetch; 4 themes; typography controls incl. measure; position
  + progress persistence; keyboard nav; deployed to Cloudflare Pages.
  *Exit: read all 4 works end to end on desktop + phone; Lighthouse a11y ≥ 95;
  reader JS < 60 KB gz.*
- **M3 — Annotations**: highlights, notes, bookmarks, copy-citation, JSON +
  Markdown export, quote-based anchor repair.
- **M4 — Search**: indexer + synonyms + shard loading + results UI.
- **M5 — Corpus growth, SE tranche first**: the ~25 verified SE works (§1.1)
  through the existing adapter — high volume, low risk. Then PG tranche in
  priority order (Euripides/Coleridge, Rogers' remaining Aristophanes,
  Montaigne, Pascal, Kant, Lucretius, Plutarch, Tacitus, Aquinas, Bacon,
  Spinoza, Rabelais, Berkeley, Montesquieu, substitutes for
  Aeschylus/Rousseau), each with per-title license verification recorded in
  sources.json. *Recommendation: ship publicly after the SE tranche — ~45+
  works is already a real product — and let PG titles land weekly.*
- **M6 — PWA/offline, performance pass, full accessibility + screen-reader
  audit, colophon.*
- **Post-v1**: Stephanus/Bekker alias layer for Plato (alignment tooling),
  page-turn mode, glossary/tap-to-define, sync tier.

> **Addendum 2026-08-15 (later the same day):** per your direction —
> content first, best easily-downloadable PD versions, drop anything with
> copyright concerns, prefer the Franklin/1952-set translations wherever
> possible — full per-title sourcing is now resolved in **SOURCING.md**.
> It settles §8 items 1, 2, and 4 (Phase 1 reverts to the brief's original
> Butler/Rogers/Longfellow trio, now that Butler and Rogers turned out to be
> obtainable from PG; Plotinus, Rousseau, Montesquieu, and Pensées are out
> for now; Virgil is SE Dryden). Fitzgerald's Iliad is in copyright until
> the 2050s–60s and cannot be used; Butler (the 1952 set's Homer) is
> sourced instead. Still open: §8 items 3 (Plato refs), 5 (framework),
> 6 (launch shape), 7 (endnotes), and the Dante Norton-vs-Longfellow call
> at the end of SOURCING.md. A Wikisource adapter joins the pipeline
> (5 works source from WS).

## 8. Decisions I need from you

1. **Phase 1 texts**: approve the swap (§1.4): Bryant Iliad + Storr Oedipus
   Rex + Longfellow Comedy + Rogers Frogs-from-PG? Or insist on Butler's
   prose Homer (PG) in place of/alongside Bryant?
2. **Copyright substitutions** (§1.2): defer Plotinus; Aeschylus via
   Morshead/Smyth now or Murray in 2028; Rousseau via Tozer or defer —
   confirm each.
3. **Plato refs** (§1.3): accept structural refs (`/plato/republic/7.12`) for
   v1 with Stephanus as a later alias layer — or fund the alignment work up
   front for at least the Republic?
4. **Virgil**: SE only has **Dryden's** rhymed translations. Acceptable, or
   source a literal prose Virgil (e.g. J. W. Mackail, d. 1945 ⇒ clear 2016)
   from PG?
5. **Framework**: SvelteKit per §5, or React?
6. **Launch shape** (§7 M5): public launch after the SE tranche (~45 works),
   PG titles landing continuously after — or hold for the full list?
7. **Translator endnotes**: keep as tappable sidenotes (my recommendation) or
   strip them?
