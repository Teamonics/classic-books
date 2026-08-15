import { browser } from "$app/environment";
import type { Chunk, Manifest } from "./types";
import { blockText } from "./blocktext";
import { getPosition, getReadRefs } from "./progress.svelte";

export type HlColor = "amber" | "green" | "blue" | "rose";

export interface Highlight {
  id: string;
  work: string;
  ref: string; // chunk ref
  blockIndex: number;
  start: number; // TextPositionSelector, scoped to blockText
  end: number;
  quote: { exact: string; prefix: string; suffix: string }; // TextQuoteSelector, for repair
  color: HlColor;
  note?: string;
  createdAt: string;
  orphaned?: boolean;
}

export interface Bookmark {
  id: string;
  work: string;
  ref: string;
  blockIndex: number;
  label: string;
  createdAt: string;
}

const hlKey = (w: string) => `cb.v1.highlights.${w}`;
const bmKey = (w: string) => `cb.v1.bookmarks.${w}`;

function loadJson<T>(key: string, fallback: T): T {
  if (!browser) return fallback;
  try {
    return JSON.parse(localStorage.getItem(key) ?? "") ?? fallback;
  } catch {
    return fallback;
  }
}

const hlStores = new Map<string, Highlight[]>();
const bmStores = new Map<string, Bookmark[]>();

export function highlightsFor(work: string): Highlight[] {
  const existing = hlStores.get(work);
  if (existing) return existing;
  const arr = $state<Highlight[]>(loadJson<Highlight[]>(hlKey(work), []));
  hlStores.set(work, arr);
  return arr;
}

export function bookmarksFor(work: string): Bookmark[] {
  const existing = bmStores.get(work);
  if (existing) return existing;
  const arr = $state<Bookmark[]>(loadJson<Bookmark[]>(bmKey(work), []));
  bmStores.set(work, arr);
  return arr;
}

function persistHl(work: string) {
  if (browser) localStorage.setItem(hlKey(work), JSON.stringify(highlightsFor(work)));
}
function persistBm(work: string) {
  if (browser) localStorage.setItem(bmKey(work), JSON.stringify(bookmarksFor(work)));
}

export function newId(): string {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

export function addHighlight(h: Highlight) {
  highlightsFor(h.work).push(h);
  persistHl(h.work);
}

export function updateHighlight(work: string, id: string, patch: Partial<Highlight>) {
  const arr = highlightsFor(work);
  const i = arr.findIndex((h) => h.id === id);
  if (i >= 0) {
    Object.assign(arr[i]!, patch);
    persistHl(work);
  }
}

export function removeHighlight(work: string, id: string) {
  const arr = highlightsFor(work);
  const i = arr.findIndex((h) => h.id === id);
  if (i >= 0) {
    arr.splice(i, 1);
    persistHl(work);
  }
}

export function addBookmark(b: Bookmark) {
  bookmarksFor(b.work).push(b);
  persistBm(b.work);
}

export function removeBookmark(work: string, id: string) {
  const arr = bookmarksFor(work);
  const i = arr.findIndex((b) => b.id === id);
  if (i >= 0) {
    arr.splice(i, 1);
    persistBm(work);
  }
}

// Anchor repair: offsets are validated against the quote; if the text moved
// (e.g. a corrected transcription), relocate via the quote selectors.
// Runs when a chunk renders; self-heals offsets or marks the highlight orphaned.
export function repairAnchors(chunk: Chunk) {
  const arr = highlightsFor(chunk.work);
  let changed = false;
  for (const h of arr) {
    if (h.ref !== chunk.ref) continue;
    const block = chunk.blocks[h.blockIndex];
    const text = block ? blockText(block) : "";
    if (text.slice(h.start, h.end) === h.quote.exact) {
      if (h.orphaned) {
        delete h.orphaned;
        changed = true;
      }
      continue;
    }
    let fixed = false;
    // search the anchored block first, then all blocks in the chunk
    const candidates = block ? [h.blockIndex] : [];
    for (let i = 0; i < chunk.blocks.length; i++) if (i !== h.blockIndex) candidates.push(i);
    for (const bi of candidates) {
      const t = blockText(chunk.blocks[bi]!);
      let idx = t.indexOf(h.quote.prefix + h.quote.exact + h.quote.suffix);
      if (idx >= 0) idx += h.quote.prefix.length;
      else idx = t.indexOf(h.quote.exact);
      if (idx >= 0) {
        h.blockIndex = bi;
        h.start = idx;
        h.end = idx + h.quote.exact.length;
        delete h.orphaned;
        fixed = true;
        changed = true;
        break;
      }
    }
    if (!fixed && !h.orphaned) {
      h.orphaned = true;
      changed = true;
    }
  }
  if (changed) persistHl(chunk.work);
}

// ---- Export (v1 requirement: JSON + Markdown) ----

export function exportJson(manifest: Manifest): string {
  const work = manifest.slug;
  return JSON.stringify(
    {
      format: "classic-books-annotations",
      version: 1,
      exportedAt: new Date().toISOString(),
      work: { slug: work, title: manifest.title, author: manifest.authorName, translator: manifest.translator },
      position: getPosition(work),
      progress: [...getReadRefs(work)],
      bookmarks: bookmarksFor(work),
      highlights: highlightsFor(work),
    },
    null,
    2,
  );
}

export function exportMarkdown(manifest: Manifest): string {
  const work = manifest.slug;
  const hls = highlightsFor(work);
  const bms = bookmarksFor(work);
  const lines: string[] = [];
  lines.push(`# ${manifest.title} — annotations`);
  lines.push("");
  lines.push(`${manifest.authorName}${manifest.translator ? `, translated by ${manifest.translator}` : ""}. Exported ${new Date().toISOString().slice(0, 10)}.`);
  for (const t of manifest.toc) {
    const inChunk = hls.filter((h) => h.ref === t.ref);
    const bmsIn = bms.filter((b) => b.ref === t.ref);
    if (!inChunk.length && !bmsIn.length) continue;
    lines.push("");
    lines.push(`## ${t.title}`);
    for (const b of bmsIn) {
      lines.push("");
      lines.push(`🔖 **${b.label}**`);
    }
    for (const h of inChunk) {
      lines.push("");
      lines.push(`> ${h.quote.exact.replace(/\n/g, "\n> ")}`);
      if (h.note) {
        lines.push("");
        lines.push(h.note);
      }
      lines.push("");
      lines.push(`— ${manifest.title}, ${t.title} (${h.color}${h.orphaned ? ", unanchored" : ""})`);
    }
  }
  lines.push("");
  return lines.join("\n");
}

export function download(filename: string, content: string, type: string) {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}
