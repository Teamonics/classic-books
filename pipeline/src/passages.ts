import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import type { Block, Chunk, Manifest } from "./model.ts";
import { collapseWs } from "./util.ts";

// Famous passages: an anthology page that opens the corpus at a single
// paragraph or a handful of lines.
//
// The editorial file supplies only a locator — a short distinctive phrase the
// passage is known by — and the words that appear on the card are then read
// back out of the built text. A card can therefore never quote a translation
// we do not actually serve, which is the failure mode that matters here:
// most of these passages are famous in some *other* translator's phrasing.
//
// A locator that matches nothing, or matches in more than one place, fails
// the build rather than guessing.

export interface PassageSource {
  work: string;
  find: string; // distinctive phrase, matched against the built text
  title: string; // what the passage is called
  note: string; // one line of context
  lines?: number; // verse: how many lines to show (default 4)
  chars?: number; // prose: excerpt budget (default 300)
}

export interface BuiltPassage {
  work: string;
  workTitle: string;
  author: string;
  authorName: string;
  translator?: string;
  composedYear: number;
  ref: string; // canonical ref, addressing the line or paragraph where known
  chunkTitle: string;
  title: string;
  note: string;
  speaker?: string;
  kind: "verse" | "prose";
  excerpt: string;
}

interface Located {
  kind: "verse" | "prose";
  excerpt: string;
  ref: string;
  speaker?: string;
}

const norm = (s: string) => collapseWs(s).toLowerCase().replace(/[’‘]/g, "'").replace(/[“”]/g, '"');

// Where the locator sits in the *raw* block text. Matching on the normalized
// copy would give an offset into a shorter string, and in a long paragraph the
// drift is enough to open the excerpt in the wrong sentence.
function rawIndex(text: string, find: string): number {
  const pattern = find
    .trim()
    .split(/\s+/)
    .map((word) =>
      word
        .replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
        .replace(/['’‘]/g, "['’‘]")
        .replace(/["“”]/g, '["“”]'),
    )
    .join("\\s+");
  return text.search(new RegExp(pattern, "i"));
}

// Walk a chunk's blocks in reading order, carrying the speaker of any speech
// the block sits inside so drama cards can be attributed.
function* walk(blocks: Block[], speaker?: string): Generator<{ block: Block; speaker?: string }> {
  for (const block of blocks) {
    if (block.type === "speech") {
      yield* walk(block.blocks, block.speaker);
    } else if (block.type === "quote") {
      yield* walk(block.blocks, speaker);
    } else {
      yield { block, speaker };
    }
  }
}

// Verse: the matched line plus the next few, so a passage reads as a passage.
function verseExcerpt(lines: { text: string; n?: number }[], from: number, want: number): string {
  return lines
    .slice(from, from + want)
    .map((l) => l.text)
    .join("\n");
}

// Prose: open at a sentence boundary and close at one, within the budget, so
// the card never begins or ends mid-clause. Some of these authors write
// sentences longer than a whole card — Thucydides especially — so when the
// sentence start is too far back the excerpt opens at a clause boundary near
// the phrase instead, rather than running out of room before reaching it.
function proseExcerpt(text: string, at: number, matchLen: number, budget: number): string {
  let start = 0;
  for (const m of text.slice(0, at).matchAll(/[.?!]["'’”]?\s+/g)) {
    start = m.index! + m[0].length;
  }
  let lead = "";
  if (at - start > budget * 0.5) {
    const from = Math.max(0, at - Math.floor(budget * 0.5));
    // The earliest boundary in the window, so the phrase keeps some run-up;
    // a semicolon or dash starts a clause that can stand alone, where a comma
    // tends to open on a fragment, so those are preferred when present.
    const window = text.slice(from, at);
    const clause =
      [...window.matchAll(/[;:—–]\s*/g)].shift() ?? [...window.matchAll(/,\s+/g)].shift();
    start = clause ? from + clause.index! + clause[0].length : at;
    lead = "…";
  }

  const rest = text.slice(start);
  const need = at - start + matchLen; // the phrase itself must survive the cut
  if (rest.length <= budget) return lead + rest.trim();
  const window = rest.slice(0, Math.max(budget, need) + 120);
  let cut = -1;
  for (const m of window.matchAll(/[.?!]["'’”]?(\s|$)/g)) {
    cut = m.index! + m[0].trimEnd().length;
    if (cut >= Math.min(Math.max(budget, need), window.length)) break;
  }
  if (cut < need) return lead + window.slice(0, Math.max(budget, need)).trim() + "…";
  return lead + window.slice(0, cut).trim();
}

function locate(chunk: Chunk, src: PassageSource): Located[] {
  const needle = norm(src.find);
  const hits: Located[] = [];

  for (const { block, speaker } of walk(chunk.blocks)) {
    if (block.type === "verse") {
      for (let i = 0; i < block.lines.length; i++) {
        // A locator may run across a line break, so match against the line and
        // its successors joined, not the line alone.
        const joined = norm(block.lines.slice(i, i + 4).map((l) => l.text).join(" "));
        if (!joined.startsWith(needle) && !norm(block.lines[i]!.text).includes(needle)) continue;
        if (i > 0) {
          const prev = norm(block.lines.slice(i - 1, i + 3).map((l) => l.text).join(" "));
          if (prev.includes(needle) && !norm(block.lines[i]!.text).includes(needle)) continue;
        }
        const n = block.lines[i]!.n;
        hits.push({
          kind: "verse",
          excerpt: verseExcerpt(block.lines, i, src.lines ?? 4),
          ref: n !== undefined ? `${chunk.ref}:${n}` : chunk.ref,
          ...(speaker ? { speaker } : {}),
        });
      }
    } else if (block.type === "para") {
      const text = block.text;
      if (!norm(text).includes(needle)) continue;
      const at = Math.max(0, rawIndex(text, src.find));
      hits.push({
        kind: "prose",
        excerpt: proseExcerpt(text, at, src.find.length, src.chars ?? 300),
        ref: block.n !== undefined ? `${chunk.ref}.${block.n}` : chunk.ref,
        ...(speaker ? { speaker } : {}),
      });
    }
  }
  return hits;
}

export function resolvePassages(
  passagesDir: string,
  manifests: Map<string, Manifest>,
  worksDir: string,
): { built: BuiltPassage[]; errors: string[] } {
  const files = readdirSync(passagesDir).filter((f) => f.endsWith(".json")).sort();
  const sources: PassageSource[] = [];
  for (const file of files) {
    const parsed = JSON.parse(readFileSync(join(passagesDir, file), "utf-8"));
    if (!Array.isArray(parsed)) throw new Error(`passages/${file}: expected an array`);
    sources.push(...parsed);
  }

  const built: BuiltPassage[] = [];
  const errors: string[] = [];
  const chunkCache = new Map<string, Chunk[]>();

  for (const src of sources) {
    const manifest = manifests.get(src.work);
    if (!manifest) {
      errors.push(`${src.title}: unknown work "${src.work}"`);
      continue;
    }
    if (!src.find || !src.title || !src.note) {
      errors.push(`${src.work}: passage missing find, title, or note`);
      continue;
    }

    let chunks = chunkCache.get(src.work);
    if (!chunks) {
      const dir = join(worksDir, manifest.author, manifest.slug, "chunks");
      chunks = manifest.toc.map(
        (t) => JSON.parse(readFileSync(join(dir, manifest.chunkFiles[t.ref]!), "utf-8")) as Chunk,
      );
      chunkCache.set(src.work, chunks);
    }

    const hits = chunks.flatMap((c) => locate(c, src));
    if (!hits.length) {
      errors.push(`${src.work} — ${src.title}: no text matches ${JSON.stringify(src.find)}`);
      continue;
    }
    if (hits.length > 1) {
      errors.push(
        `${src.work} — ${src.title}: ${JSON.stringify(src.find)} matches ${hits.length} places (${hits
          .slice(0, 4)
          .map((h) => h.ref)
          .join(", ")}); lengthen it`,
      );
      continue;
    }

    const hit = hits[0]!;
    const chunkRef = hit.ref.split(/[.:]/)[0]!;
    built.push({
      work: src.work,
      workTitle: manifest.title,
      author: manifest.author,
      authorName: manifest.authorName,
      ...(manifest.translator ? { translator: manifest.translator } : {}),
      composedYear: manifest.composedYear,
      ref: hit.ref,
      chunkTitle: manifest.toc.find((t) => t.ref === chunkRef)?.title ?? chunkRef,
      title: src.title,
      note: src.note,
      ...(hit.speaker ? { speaker: hit.speaker } : {}),
      kind: hit.kind,
      excerpt: hit.excerpt,
    });
  }

  built.sort((a, b) => a.composedYear - b.composedYear || a.workTitle.localeCompare(b.workTitle));
  return { built, errors };
}

export function buildPassages(
  passagesDir: string,
  manifests: Map<string, Manifest>,
  worksDir: string,
): BuiltPassage[] {
  const { built, errors } = resolvePassages(passagesDir, manifests, worksDir);
  if (errors.length) throw new Error(`passages invalid:\n  ${errors.join("\n  ")}`);
  return built;
}
