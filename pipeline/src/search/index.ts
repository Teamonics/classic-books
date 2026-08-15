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
  terms: string[]; // sorted
  // postings[i] belongs to terms[i]: flat [chunkIdx, blockIdx, chunkIdx, blockIdx, ...]
  postings: number[][];
}

export function buildIndex(work: string, divisions: Division[]): SearchIndex {
  const map = new Map<string, number[]>();
  divisions.forEach((div, chunkIdx) => {
    div.blocks.forEach((block: Block, blockIdx: number) => {
      const seen = new Set<string>();
      for (const term of analyze(blockTextOf(block), groupOf)) {
        if (seen.has(term)) continue; // one posting per block
        seen.add(term);
        let arr = map.get(term);
        if (!arr) map.set(term, (arr = []));
        arr.push(chunkIdx, blockIdx);
      }
    });
  });
  const terms = [...map.keys()].sort();
  return { schema: 1, work, terms, postings: terms.map((t) => map.get(t)!) };
}

export function validateIndex(index: SearchIndex, divisions: Division[]): string[] {
  const errors: string[] = [];
  if (index.terms.length !== index.postings.length) errors.push("terms/postings length mismatch");
  index.postings.forEach((p, i) => {
    if (p.length % 2 !== 0) errors.push(`odd posting list for ${index.terms[i]}`);
    for (let j = 0; j < p.length; j += 2) {
      const c = p[j]!;
      const b = p[j + 1]!;
      if (c < 0 || c >= divisions.length) errors.push(`term ${index.terms[i]}: bad chunkIdx ${c}`);
      else if (b < 0 || b >= divisions[c]!.blocks.length)
        errors.push(`term ${index.terms[i]}: bad blockIdx ${b} in chunk ${c}`);
    }
  });
  return errors;
}
