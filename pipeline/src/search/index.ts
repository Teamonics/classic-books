import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { Block, Division } from "../model.ts";
import { blockTextOf } from "./blocktext.ts";
import { analyze, buildGroupLookup } from "./text.ts";

const synonyms: Record<string, string[]> = JSON.parse(
  readFileSync(join(import.meta.dirname, "synonyms.json"), "utf-8"),
);
export const groupOf = buildGroupLookup(synonyms);

export interface SearchIndex {
  schema: 1;
  work: string;
  // chunk range this shard covers, in TOC order (half-open)
  fromChunk: number;
  toChunk: number;
  terms: string[]; // sorted
  // postings[i] belongs to terms[i]: flat [chunkIdx, blockIdx, chunkIdx, blockIdx, ...]
  // chunkIdx values are global (TOC positions), not shard-relative.
  postings: number[][];
}

// Works longer than this get their index split by chunk range, so a search
// never pulls one huge file: shards load progressively and results stream in
// document order (Gibbon and War and Peace are the ones that need it).
const MAX_SHARD_WORDS = 250_000;

function wordsIn(div: Division): number {
  let n = 0;
  const count = (b: Block) => {
    if (b.type === "verse") for (const l of b.lines) n += (l.text.match(/\S+/g) ?? []).length;
    else if (b.type === "speech" || b.type === "quote") b.blocks.forEach(count);
    else n += (b.text.match(/\S+/g) ?? []).length;
  };
  div.blocks.forEach(count);
  return n;
}

// Contiguous chunk ranges, each under the word cap (a single oversized
// division still gets its own shard).
export function shardRanges(divisions: Division[]): [number, number][] {
  const ranges: [number, number][] = [];
  let start = 0;
  let acc = 0;
  divisions.forEach((div, i) => {
    const w = wordsIn(div);
    if (acc > 0 && acc + w > MAX_SHARD_WORDS) {
      ranges.push([start, i]);
      start = i;
      acc = 0;
    }
    acc += w;
  });
  ranges.push([start, divisions.length]);
  return ranges;
}

export function buildIndexes(work: string, divisions: Division[]): SearchIndex[] {
  return shardRanges(divisions).map(([from, to]) => {
    const map = new Map<string, number[]>();
    for (let chunkIdx = from; chunkIdx < to; chunkIdx++) {
      divisions[chunkIdx]!.blocks.forEach((block: Block, blockIdx: number) => {
        const seen = new Set<string>();
        for (const term of analyze(blockTextOf(block), groupOf)) {
          if (seen.has(term)) continue; // one posting per block
          seen.add(term);
          let arr = map.get(term);
          if (!arr) map.set(term, (arr = []));
          arr.push(chunkIdx, blockIdx);
        }
      });
    }
    const terms = [...map.keys()].sort();
    return {
      schema: 1 as const,
      work,
      fromChunk: from,
      toChunk: to,
      terms,
      postings: terms.map((t) => map.get(t)!),
    };
  });
}

export function validateIndexes(indexes: SearchIndex[], divisions: Division[]): string[] {
  const errors: string[] = [];
  let expectedNext = 0;
  for (const index of indexes) {
    if (index.fromChunk !== expectedNext) {
      errors.push(`shard gap: expected fromChunk ${expectedNext}, got ${index.fromChunk}`);
    }
    expectedNext = index.toChunk;
    if (index.terms.length !== index.postings.length) errors.push("terms/postings length mismatch");
    index.postings.forEach((p, i) => {
      if (p.length % 2 !== 0) errors.push(`odd posting list for ${index.terms[i]}`);
      for (let j = 0; j < p.length; j += 2) {
        const c = p[j]!;
        const b = p[j + 1]!;
        if (c < index.fromChunk || c >= index.toChunk) {
          errors.push(`term ${index.terms[i]}: chunkIdx ${c} outside shard [${index.fromChunk},${index.toChunk})`);
        } else if (b < 0 || b >= divisions[c]!.blocks.length) {
          errors.push(`term ${index.terms[i]}: bad blockIdx ${b} in chunk ${c}`);
        }
      }
    });
  }
  if (expectedNext !== divisions.length) {
    errors.push(`shards cover ${expectedNext} chunks, work has ${divisions.length}`);
  }
  return errors;
}
