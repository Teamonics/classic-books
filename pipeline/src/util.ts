import { createHash } from "node:crypto";
import type { Block, Mark } from "./model.ts";

export function contentHash(s: string): string {
  return createHash("sha256").update(s).digest("hex").slice(0, 12);
}

// Deterministic JSON: keys emitted in insertion order everywhere, no
// timestamps in hashed files. Insertion order is fixed by construction,
// so plain stringify is stable across runs.
export function stableJson(v: unknown): string {
  return JSON.stringify(v);
}

const ROMAN: Record<string, number> = { I: 1, V: 5, X: 10, L: 50, C: 100, D: 500, M: 1000 };

export function romanToInt(roman: string): number {
  const s = roman.toUpperCase().replace(/[^IVXLCDM]/g, "");
  if (!s) throw new Error(`not a roman numeral: ${JSON.stringify(roman)}`);
  let total = 0;
  for (let i = 0; i < s.length; i++) {
    const cur = ROMAN[s[i]!]!;
    const next = ROMAN[s[i + 1] ?? ""] ?? 0;
    total += cur < next ? -cur : cur;
  }
  return total;
}

export function collapseWs(s: string): string {
  return s.replace(/\s+/g, " ").trim();
}

// Flatten an element's inline content to plain text + offset marks.
// Supported inline elements: i/em -> em, b/strong -> strong,
// a[epub:type=noteref] / a.fn -> note mark (ref = note id).
export function inlineText(el: any): { text: string; marks: Mark[] } {
  let text = "";
  const marks: Mark[] = [];
  function walk(node: any, active: { k: Mark["k"]; ref?: string }[]) {
    for (const child of node.childNodes ?? []) {
      if (child.nodeType === 3) {
        text += child.data;
      } else if (child.nodeType === 1) {
        const tag = child.tagName?.toLowerCase();
        if (tag === "br") {
          text += " ";
          continue;
        }
        let mark: { k: Mark["k"]; ref?: string } | null = null;
        if (tag === "i" || tag === "em") mark = { k: "em" };
        else if (tag === "b" || tag === "strong") mark = { k: "strong" };
        else if (tag === "a") {
          const epubType = child.getAttribute("epub:type") ?? "";
          const href = child.getAttribute("href") ?? "";
          if (epubType.includes("noteref") || /#note/.test(href)) {
            // The anchor's visible numeral is presentation, not content:
            // record a zero-width note mark and do not emit the digit.
            const m = href.match(/#(.+)$/);
            marks.push({ s: text.length, e: text.length, k: "note", ...(m ? { ref: m[1]! } : {}) });
            continue;
          }
        }
        const start = text.length;
        walk(child, mark ? [...active, mark] : active);
        if (mark) {
          const span = { s: start, e: text.length, k: mark.k, ...(mark.ref ? { ref: mark.ref } : {}) };
          if (span.e > span.s || mark.k === "note") marks.push(span);
        }
      }
    }
  }
  walk(el, []);
  // normalize whitespace while remapping mark offsets
  const rawText = text;
  let out = "";
  const map: number[] = []; // raw index -> normalized index
  let pendingSpace = false;
  for (let i = 0; i < rawText.length; i++) {
    const c = rawText[i]!;
    if (/\s/.test(c)) {
      pendingSpace = out.length > 0;
      map[i] = out.length;
    } else {
      if (pendingSpace) {
        out += " ";
        pendingSpace = false;
      }
      map[i] = out.length;
      out += c;
    }
  }
  map[rawText.length] = out.length;
  const normMarks = marks
    .map((m) => ({ ...m, s: map[m.s] ?? out.length, e: map[m.e] ?? out.length }))
    .filter((m) => m.e > m.s || m.k === "note");
  return { text: out, marks: normMarks };
}

export function wordCount(blocks: Block[]): number {
  let n = 0;
  const countText = (t: string) => {
    const m = t.match(/\S+/g);
    n += m ? m.length : 0;
  };
  for (const b of blocks) {
    if (b.type === "verse") for (const l of b.lines) countText(l.text);
    else if (b.type === "speech" || b.type === "quote") n += wordCount(b.blocks);
    else countText(b.text);
  }
  return n;
}
