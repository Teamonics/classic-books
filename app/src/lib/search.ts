import { tokenize, stem, buildGroupLookup } from "$search/text";
import synonyms from "$search/synonyms.json";
import { workDir } from "./data";
import type { Manifest, SearchIndex } from "./types";

const groupOf = buildGroupLookup(synonyms as Record<string, string[]>);

const shardCache = new Map<string, Promise<SearchIndex>>();

function loadShard(manifest: Manifest, file: string): Promise<SearchIndex> {
  const key = `${manifest.author}/${manifest.slug}/${file}`;
  if (!shardCache.has(key)) {
    shardCache.set(
      key,
      fetch(`${workDir(manifest)}/${file}`).then((r) => {
        if (!r.ok) throw new Error(`${r.status} loading search index`);
        return r.json();
      }),
    );
  }
  return shardCache.get(key)!;
}

function postingsFor(index: SearchIndex, term: string): number[] | null {
  // binary search over sorted terms
  let lo = 0;
  let hi = index.terms.length - 1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    const t = index.terms[mid]!;
    if (t === term) return index.postings[mid]!;
    if (t < term) lo = mid + 1;
    else hi = mid - 1;
  }
  return null;
}

export interface SearchHit {
  chunkIdx: number;
  blockIdx: number;
  score: number; // number of query tokens matched in this block
}

function expansionsFor(tok: string): Set<string> {
  const out = new Set<string>([stem(tok)]);
  const g = groupOf(tok) ?? (tok.endsWith("s") ? groupOf(tok.slice(0, -1)) : undefined);
  if (g) out.add("@" + g);
  return out;
}

export function queryShard(index: SearchIndex, tokens: string[]): SearchHit[] {
  if (!tokens.length) return [];
  const matches = new Map<number, number>();
  const KEY = (c: number, b: number) => c * 100000 + b;

  tokens.forEach((tok: string, ti: number) => {
    const seen = new Set<number>();
    for (const term of expansionsFor(tok)) {
      const p = postingsFor(index, term);
      if (!p) continue;
      for (let j = 0; j < p.length; j += 2) {
        const key = KEY(p[j]!, p[j + 1]!);
        if (seen.has(key)) continue;
        seen.add(key);
        matches.set(key, (matches.get(key) ?? 0) | (1 << ti));
      }
    }
  });

  const hits: SearchHit[] = [];
  for (const [key, bits] of matches) {
    let score = 0;
    for (let i = 0; i < tokens.length; i++) if (bits & (1 << i)) score++;
    hits.push({ chunkIdx: Math.floor(key / 100000), blockIdx: key % 100000, score });
  }
  hits.sort((a, b) => b.score - a.score || a.chunkIdx - b.chunkIdx || a.blockIdx - b.blockIdx);
  return hits;
}

// Search a work shard by shard, yielding after each so results appear in
// document order while later shards are still downloading.
export async function* search(
  manifest: Manifest,
  q: string,
  signal?: { cancelled: boolean },
): AsyncGenerator<{ hits: SearchHit[]; shard: number; shards: number }> {
  const tokens = tokenize(q);
  const files = manifest.search ?? [];
  if (!tokens.length || !files.length) return;
  for (let i = 0; i < files.length; i++) {
    const index = await loadShard(manifest, files[i]!);
    if (signal?.cancelled) return;
    yield { hits: queryShard(index, tokens), shard: i + 1, shards: files.length };
  }
}

// Words to visually mark in snippets: the query tokens plus every synonym
// variant in their groups (a "Zeus" query should light up "Jove").
export function highlightWords(q: string): string[] {
  const words = new Set<string>();
  for (const tok of tokenize(q)) {
    words.add(tok);
    const g = groupOf(tok) ?? (tok.endsWith("s") ? groupOf(tok.slice(0, -1)) : undefined);
    if (g) {
      words.add(g);
      for (const v of (synonyms as Record<string, string[]>)[g] ?? []) words.add(v);
    }
  }
  return [...words];
}

export function makeSnippet(text: string, words: string[], radius = 70): { snippet: string; matched: boolean } {
  const flat = text.replace(/\n/g, " ");
  const lower = flat.toLowerCase();
  let pos = -1;
  for (const w of words) {
    const i = lower.indexOf(w);
    if (i >= 0 && (pos < 0 || i < pos)) pos = i;
  }
  if (pos < 0) return { snippet: flat.slice(0, radius * 2) + (flat.length > radius * 2 ? "…" : ""), matched: false };
  const start = Math.max(0, pos - radius);
  const end = Math.min(flat.length, pos + radius);
  return {
    snippet: (start > 0 ? "…" : "") + flat.slice(start, end) + (end < flat.length ? "…" : ""),
    matched: true,
  };
}
