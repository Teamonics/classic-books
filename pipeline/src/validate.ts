import type { Block, Chunk, Manifest } from "./model.ts";
import { Chunk as ChunkSchema } from "./model.ts";

// Strings that must never appear in emitted text: trademark/boilerplate
// tripwire (PG trademark must be stripped; SE apparatus must not leak).
const TRIPWIRES = [/project\s+gutenberg/i, /gutenberg\.org/i, /standardebooks\.org/i, /standard\s+ebooks/i];

function* allText(blocks: Block[]): Generator<string> {
  for (const b of blocks) {
    if (b.type === "verse") for (const l of b.lines) yield l.text;
    else if (b.type === "speech" || b.type === "quote") yield* allText(b.blocks);
    else yield b.text;
  }
}

function checkMarks(blocks: Block[], where: string, errors: string[]) {
  for (const b of blocks) {
    if (b.type === "speech" || b.type === "quote") {
      checkMarks(b.blocks, where, errors);
    } else if (b.type === "verse") {
      for (const l of b.lines) {
        for (const m of l.marks ?? []) {
          if (m.e > l.text.length) errors.push(`${where}: mark out of range (${m.s},${m.e}) on len ${l.text.length}`);
        }
      }
    } else {
      for (const m of b.marks ?? []) {
        if (m.e > b.text.length) errors.push(`${where}: mark out of range (${m.s},${m.e}) on len ${b.text.length}`);
      }
    }
  }
}

export function validateWork(manifest: Manifest, chunks: Chunk[]): string[] {
  const errors: string[] = [];
  const byRef = new Map(chunks.map((c) => [c.ref, c]));

  if (byRef.size !== chunks.length) errors.push("duplicate chunk refs");

  // TOC <-> chunks bijection
  const tocRefs = new Set(manifest.toc.map((t) => t.ref));
  for (const t of manifest.toc) if (!byRef.has(t.ref)) errors.push(`TOC entry has no chunk: ${t.ref}`);
  for (const c of chunks) if (!tocRefs.has(c.ref)) errors.push(`orphan chunk not in TOC: ${c.ref}`);
  for (const ref of Object.keys(manifest.chunkFiles)) if (!byRef.has(ref)) errors.push(`chunkFiles entry has no chunk: ${ref}`);
  for (const c of chunks) if (!manifest.chunkFiles[c.ref]) errors.push(`chunk has no chunkFiles entry: ${c.ref}`);

  // prev/next chain integrity in TOC order
  manifest.toc.forEach((t, i) => {
    const c = byRef.get(t.ref);
    if (!c) return;
    const expectedPrev = i === 0 ? null : manifest.toc[i - 1]!.ref;
    const expectedNext = i === manifest.toc.length - 1 ? null : manifest.toc[i + 1]!.ref;
    if (c.prev !== expectedPrev) errors.push(`${c.ref}: prev=${c.prev}, expected ${expectedPrev}`);
    if (c.next !== expectedNext) errors.push(`${c.ref}: next=${c.next}, expected ${expectedNext}`);
  });

  for (const c of chunks) {
    const parsed = ChunkSchema.safeParse(c);
    if (!parsed.success) {
      errors.push(`${c.ref}: schema violation: ${parsed.error.issues[0]?.message} at ${parsed.error.issues[0]?.path.join(".")}`);
      continue;
    }
    if (c.work !== manifest.slug) errors.push(`${c.ref}: work=${c.work} != ${manifest.slug}`);

    for (const text of allText(c.blocks)) {
      for (const re of TRIPWIRES) {
        if (re.test(text)) errors.push(`${c.ref}: tripwire ${re} matched: ${JSON.stringify(text.slice(0, 60))}`);
      }
    }
    checkMarks(c.blocks, c.ref, errors);

    // verse line numbers strictly increasing within a chunk
    let last = 0;
    let sawNumbered = false;
    const walkVerse = (blocks: Block[]) => {
      for (const b of blocks) {
        if (b.type === "verse") {
          for (const l of b.lines) {
            if (l.n !== undefined) {
              sawNumbered = true;
              if (l.n <= last) errors.push(`${c.ref}: line numbers not increasing at ${l.n}`);
              last = l.n;
            }
          }
        } else if (b.type === "speech" || b.type === "quote") {
          if (b.type === "speech") walkVerse(b.blocks); // quoted verse is unnumbered
        }
      }
    };
    walkVerse(c.blocks);
    void sawNumbered;

    // note marks resolve to attached notes
    const noteIds = new Set((c.notes ?? []).map((n) => n.id));
    const walkNotes = (blocks: Block[]) => {
      for (const b of blocks) {
        if (b.type === "speech" || b.type === "quote") walkNotes(b.blocks);
        else if (b.type === "verse") {
          for (const l of b.lines) for (const m of l.marks ?? []) {
            if (m.k === "note" && m.ref && !noteIds.has(m.ref)) errors.push(`${c.ref}: unresolved note ${m.ref}`);
          }
        } else {
          for (const m of b.marks ?? []) {
            if (m.k === "note" && m.ref && !noteIds.has(m.ref)) errors.push(`${c.ref}: unresolved note ${m.ref}`);
          }
        }
      }
    };
    walkNotes(c.blocks);
  }
  return errors;
}
