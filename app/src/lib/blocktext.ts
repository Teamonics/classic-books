import type { Block } from "./types";

// Canonical plain text of a top-level block. Annotation offsets are scoped
// to this string. Must stay in sync with what BlockView renders as content
// text (speaker labels and margin numbers are chrome, not content).
export function blockText(b: Block): string {
  switch (b.type) {
    case "para":
    case "stage":
    case "heading":
      return b.text;
    case "verse":
      return b.lines.map((l) => l.text).join("\n");
    case "speech":
    case "quote":
      return b.blocks.map(blockText).join("\n");
  }
}

export interface HlRange {
  s: number;
  e: number;
  color: string;
  id: string;
}

// Clip ranges to the window [start, start+len) and shift to window-local
// coordinates. Used to distribute a top-level block's highlights down to
// nested blocks and verse lines.
export function sliceRanges(ranges: HlRange[] | undefined, start: number, len: number): HlRange[] | undefined {
  if (!ranges?.length) return undefined;
  const out: HlRange[] = [];
  for (const r of ranges) {
    const s = Math.max(r.s, start);
    const e = Math.min(r.e, start + len);
    if (e > s) out.push({ ...r, s: s - start, e: e - start });
  }
  return out.length ? out : undefined;
}

// Windows (offset, length) of each child of a speech/quote block within the
// parent's canonical text ("\n" joins), and of each verse line.
export function childWindows(texts: string[]): { start: number; len: number }[] {
  const out: { start: number; len: number }[] = [];
  let pos = 0;
  for (const t of texts) {
    out.push({ start: pos, len: t.length });
    pos += t.length + 1; // "\n"
  }
  return out;
}
