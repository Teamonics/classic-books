import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { parseHTML } from "linkedom";
import type { Block, Division, WorkIR } from "../model.ts";
import { collapseWs, inlineText, romanToInt } from "../util.ts";

// Owen's Organon (Bohn, 1853) as transcribed on Wikisource from page scans.
//
// Two things are particular to this transcription. Chapter headings come in
// two shapes: the first chapter of a treatise sits in a centred div that also
// carries the running title ("ARISTOTLE'S ORGANON. THE CATEGORIES. Chap. I.—
// Of Homonyms…"), while later chapters are ordinary section headings
// ("Chapter 2"). And Owen's marginal analysis is transcribed as sidenote
// spans placed *inside* the paragraphs, at the point of the margin — so they
// land mid-sentence and without spacing: "of that which 1. Doctrine of
// conversion, with example of conversion is predicated…". They are apparatus,
// they are reproduced in full in the page's own table of contents, and they
// corrupt the sentence they sit in, so they come out.

const DROP_SELECTORS = [
  ".wst-sidenote",
  ".wst-auxtoc",
  ".ws-noexport",
  ".wst-nop",
  ".wst-header",
  ".wst-pagebreak",
  ".pagenum",
  ".ws-pagenum",
  ".mw-editsection",
  ".reference",
  ".mw-references-wrap",
  ".licenseContainer",
  ".prp-page-image",
  "figure",
  "style",
  "link",
  "table",
].join(", ");

// "Chap. IV.—Enumeration of the Categories." within a longer running head.
const CHAP_RE = /Chap\.\s*([IVXLC]+)\.?\s*[—–-]?\s*(.*)$/i;
const HEADING_RE = /^Chapter\s+(\d+)$/i;

export function adapt(rawDir: string): WorkIR {
  const files = readdirSync(rawDir)
    .filter((f) => f.endsWith(".html"))
    .sort((a, b) => {
      const na = Number(a.match(/\d+/)?.[0] ?? NaN);
      const nb = Number(b.match(/\d+/)?.[0] ?? NaN);
      return Number.isNaN(na) || Number.isNaN(nb) ? a.localeCompare(b) : na - nb;
    });
  if (!files.length) throw new Error(`${rawDir}: no snapshot files`);
  const multiBook = files.length > 1;

  const divisions: Division[] = [];
  for (const file of files) {
    const book = multiBook ? Number(file.match(/book-(\d+)/)?.[1] ?? 0) : 0;
    if (multiBook && !book) throw new Error(`${rawDir}/${file}: cannot read a book number from the file name`);

    const { document } = parseHTML(readFileSync(join(rawDir, file), "utf-8"));
    for (const el of document.querySelectorAll(DROP_SELECTORS)) el.remove();
    const root = document.querySelector(".prp-pages-output") ?? document.querySelector(".mw-parser-output");
    if (!root) throw new Error(`${rawDir}/${file}: no page content`);

    let current: Division | null = null;
    let paraNo = 0;
    const open = (n: number, title: string) => {
      const ref = multiBook ? `${book}.${n}` : String(n);
      if (divisions.some((d) => d.ref === ref)) throw new Error(`${rawDir}: duplicate ref ${ref}`);
      const label = title ? `Chapter ${n}. ${title}` : `Chapter ${n}`;
      current = {
        ref,
        title: multiBook ? `Book ${book}, ${label}` : label,
        blocks: [],
      };
      divisions.push(current);
      paraNo = 0;
    };

    for (const el of root.querySelectorAll("div.wst-center, .mw-heading, p")) {
      const tag = el.tagName?.toLowerCase();
      const text = collapseWs(el.textContent ?? "");
      if (!text) continue;

      if (tag === "div") {
        // A centred line: the first chapter of the treatise, or a running
        // title with no chapter in it (which is furniture).
        const m = text.match(CHAP_RE);
        if (m) open(romanToInt(m[1]!), collapseWs(m[2] ?? "").replace(/\.$/, ""));
        else if (el.classList?.contains("mw-heading")) {
          const h = text.match(HEADING_RE);
          if (h) open(Number(h[1]), "");
        }
        continue;
      }

      if (!current) continue; // front matter above the first chapter
      const { text: flat, marks } = inlineText(el);
      const clean = collapseWs(flat);
      if (!clean) continue;
      paraNo += 1;
      current.blocks.push({
        type: "para",
        n: paraNo,
        text: clean,
        ...(marks.length ? { marks: marks.filter((mk) => mk.e <= clean.length) } : {}),
      });
    }
  }

  if (!divisions.length) throw new Error(`${rawDir}: no chapters found`);
  return { divisions };
}
