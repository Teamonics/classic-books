import { z } from "zod";

// Inline formatting is offset-based marks over plain text so that annotation
// offsets are stable against rendering changes. "note" marks carry the id of
// an entry in the chunk's notes array.
export const Mark = z.object({
  s: z.number().int().nonnegative(),
  e: z.number().int().nonnegative(),
  k: z.enum(["em", "strong", "smallcaps", "note", "term"]),
  ref: z.string().optional(),
});
export type Mark = z.infer<typeof Mark>;

// A canonical reference that begins mid-block (Stephanus-style).
export const InlineRefAnchor = z.object({
  ref: z.string(),
  offset: z.number().int().nonnegative(),
});

const textFields = {
  text: z.string(),
  marks: z.array(Mark).optional(),
};

export const ParaBlock = z.object({
  type: z.literal("para"),
  // "argument": translator's/editor's prefixed summary of a division
  role: z.enum(["argument", "summary"]).optional(),
  n: z.number().int().positive().optional(), // paragraph number within division
  refs: z.array(InlineRefAnchor).optional(),
  ...textFields,
});

export const VerseLine = z.object({
  n: z.number().int().positive().optional(), // line number within division (or work)
  indent: z.number().int().min(1).max(3).optional(), // hanging/metrical indent level
  part: z.enum(["start", "mid", "end"]).optional(), // antilabe: partial verse line
  ...textFields,
});
export type VerseLine = z.infer<typeof VerseLine>;

export const VerseBlock = z.object({
  type: z.literal("verse"),
  lines: z.array(VerseLine).min(1),
});

export const StageBlock = z.object({
  type: z.literal("stage"),
  ...textFields,
});

export const HeadingBlock = z.object({
  type: z.literal("heading"),
  level: z.number().int().min(1).max(4),
  ...textFields,
});

export type Block =
  | z.infer<typeof ParaBlock>
  | z.infer<typeof VerseBlock>
  | z.infer<typeof StageBlock>
  | z.infer<typeof HeadingBlock>
  | { type: "speech"; speaker: string; blocks: Block[] }
  | { type: "quote"; kind: "verse" | "prose"; blocks: Block[] };

export const Blk: z.ZodType<Block> = z.lazy(() =>
  z.union([
    ParaBlock,
    VerseBlock,
    StageBlock,
    HeadingBlock,
    z.object({
      type: z.literal("speech"),
      speaker: z.string().min(1),
      blocks: z.array(Blk).min(1),
    }),
    z.object({
      type: z.literal("quote"),
      kind: z.enum(["verse", "prose"]),
      blocks: z.array(Blk).min(1),
    }),
  ]),
);

export const Note = z.object({
  id: z.string().min(1),
  blocks: z.array(Blk).min(1),
});
export type Note = z.infer<typeof Note>;

export const Chunk = z.object({
  schema: z.literal(1),
  ref: z.string().min(1),
  work: z.string().min(1),
  title: z.string().min(1),
  prev: z.string().nullable(),
  next: z.string().nullable(),
  blocks: z.array(Blk).min(1),
  notes: z.array(Note).optional(),
});
export type Chunk = z.infer<typeof Chunk>;

// Intermediate representation produced by adapters: one Division per
// canonical top-level unit (book, canto, play). The chunker maps
// divisions to chunks (1:1 in v1; grouping stays possible later).
export interface Division {
  ref: string;
  title: string;
  blocks: Block[];
  notes?: Note[];
}

export interface WorkIR {
  divisions: Division[];
}

export interface RefScheme {
  primary: string;
  aliases: string[];
  // "translation" = line numbers follow the translation's own lineation,
  // not the original language's. null for prose schemes.
  lineation: "translation" | "original" | null;
}

export interface WorkConfig {
  slug: string;
  author: string;
  authorName: string;
  title: string;
  composedYear: number; // negative = BCE
  era: string;
  adapter: string;
  rawDir: string; // relative to repo root
  translator: string | null;
  refScheme: RefScheme;
  skipFiles?: string[]; // extra source files to skip (adapter-specific)
  expectDivisions?: number; // golden check: exact division count
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
  refScheme: RefScheme;
  toc: { ref: string; title: string; words: number }[];
  chunkFiles: Record<string, string>; // ref -> hashed filename
  search?: string; // hashed search-index filename
}
