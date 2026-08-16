import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { parseHTML } from "linkedom";
import type { Block, Division, WorkIR } from "../model.ts";
import { collapseWs, inlineText, romanToInt } from "../util.ts";

// Aristotle as transcribed on English Wikisource. Two transcription styles
// are covered, because the corpus is spread across both.
//
// The plain style — On the Heavens, the biological works, Freese's Rhetoric —
// is a run of section headings ("Part 1", "Chapter 1") with paragraphs
// between them, one page per book. Not every page of a work is transcribed to
// the same standard, though: On the Generation of Animals marks its chapters
// with headings in Book I and with bare numbered paragraphs in Books II-V, so
// both are recognised. A file that yields no chapters at all is an error
// rather than an empty stretch of book — that is how four fifths of that work
// went missing without the build noticing.
//
// Owen's Organon (Bohn, 1853) is transcribed from page scans and is stranger.
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
const HEADING_RE = /^(Chapter|Part|Section)\s+(\d+)$/i;
// A paragraph that is nothing but a number is a chapter mark; one that is
// nothing but "Book II" is the page's own running title.
const BARE_NUMBER_RE = /^(\d{1,3})\.?$/;
const RUNNING_TITLE_RE = /^Book\s+([IVXLC]+|\d+)\.?$/i;

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
  // Book numbers appear in the page titles as arabic ("Book 1") or roman
  // ("Book I"), and the acquirer slugs whatever was there.
  const bookNumber = (file: string): number => {
    const m = file.match(/book-([0-9]+|[ivxlc]+)/i);
    if (!m) return 0;
    return /^\d+$/.test(m[1]!) ? Number(m[1]) : romanToInt(m[1]!.toUpperCase());
  };

  const divisions: Division[] = [];
  for (const file of files) {
    const book = multiBook ? bookNumber(file) : 0;
    if (multiBook && !book) throw new Error(`${rawDir}/${file}: cannot read a book number from the file name`);

    const { document } = parseHTML(readFileSync(join(rawDir, file), "utf-8"));
    for (const el of document.querySelectorAll(DROP_SELECTORS)) el.remove();
    const root = document.querySelector(".prp-pages-output") ?? document.querySelector(".mw-parser-output");
    if (!root) throw new Error(`${rawDir}/${file}: no page content`);

    let current: Division | null = null;
    let paraNo = 0;
    const open = (n: number, title: string, word = "Chapter") => {
      const ref = multiBook ? `${book}.${n}` : String(n);
      if (divisions.some((d) => d.ref === ref)) throw new Error(`${rawDir}: duplicate ref ${ref}`);
      const label = title ? `${word} ${n}. ${title}` : `${word} ${n}`;
      current = {
        ref,
        title: multiBook ? `Book ${book}, ${label}` : label,
        blocks: [],
      };
      divisions.push(current);
      paraNo = 0;
    };

    const before = divisions.length;
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
          // keep the source's own word for the division: Bekker "parts" and
          // chapters are not the same cut of the text
          if (h) open(Number(h[2]), "", h[1]![0]!.toUpperCase() + h[1]!.slice(1).toLowerCase());
        }
        continue;
      }

      if (RUNNING_TITLE_RE.test(text)) continue;
      const bare = text.match(BARE_NUMBER_RE);
      if (bare) {
        open(Number(bare[1]), "", "Part");
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

    if (divisions.length === before) {
      throw new Error(
        `${rawDir}/${file}: no chapters found — the page is transcribed to a shape this adapter does not recognise`,
      );
    }
  }

  if (!divisions.length) throw new Error(`${rawDir}: no chapters found`);
  return { divisions };
}
