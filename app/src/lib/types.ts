// Mirrors pipeline/src/model.ts emitted JSON.

export interface Mark {
  s: number;
  e: number;
  k: "em" | "strong" | "smallcaps" | "note" | "term";
  ref?: string;
}

export interface VerseLine {
  n?: number;
  indent?: number;
  part?: "start" | "mid" | "end";
  text: string;
  marks?: Mark[];
}

export type Block =
  | { type: "para"; role?: "argument" | "summary"; n?: number; text: string; marks?: Mark[] }
  | { type: "verse"; lines: VerseLine[] }
  | { type: "stage"; text: string; marks?: Mark[] }
  | { type: "heading"; level: number; text: string; marks?: Mark[] }
  | { type: "speech"; speaker: string; blocks: Block[] }
  | { type: "quote"; kind: "verse" | "prose"; blocks: Block[] };

export interface Note {
  id: string;
  blocks: Block[];
}

export interface Chunk {
  schema: 1;
  ref: string;
  work: string;
  title: string;
  prev: string | null;
  next: string | null;
  blocks: Block[];
  notes?: Note[];
}

export interface TocEntry {
  ref: string;
  title: string;
  words: number;
}

export interface Manifest {
  schema: 1;
  slug: string;
  author: string;
  authorName: string;
  title: string;
  composedYear: number;
  era: string;
  translator: string | null;
  refScheme: { primary: string; aliases: string[]; lineation: "translation" | "original" | null };
  toc: TocEntry[];
  chunkFiles: Record<string, string>;
  search?: string[];
}

export interface SearchIndex {
  schema: 1;
  work: string;
  fromChunk: number;
  toChunk: number;
  terms: string[];
  postings: number[][];
}

export interface CatalogEntry {
  slug: string;
  author: string;
  authorName: string;
  title: string;
  composedYear: number;
  era: string;
  translator: string | null;
  manifestFile: string;
  chunks: number;
  words: number;
}
