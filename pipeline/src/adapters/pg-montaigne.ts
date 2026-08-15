import { readFileSync } from "node:fs";
import { join } from "node:path";
import { parseHTML } from "linkedom";
import type { Block, Division, WorkIR } from "../model.ts";
import { collapseWs, inlineText, romanToInt } from "../util.ts";

// Cotton's Montaigne, edited by Hazlitt (PG #3600). The file is flat: a run
// of <h2> headings with paragraphs between them, no containers. Books are
// announced as "BOOK THE SECOND" and chapter numbers restart inside each, so
// refs are book.chapter — /michel-de-montaigne/essays/1.30 is Of Cannibals
// as this edition numbers it. (Editions disagree about Book I's divisions;
// following the text in front of us is the honest choice, and the ref scheme
// records that it is this edition's numbering.)
//
// Montaigne quotes verse constantly; the transcription puts those in <pre>,
// where the line breaks are the only thing preserving them.

const BOOK_WORDS: Record<string, number> = { FIRST: 1, SECOND: 2, THIRD: 3 };

function slugify(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 60);
}

function titleCase(s: string): string {
  return collapseWs(s)
    .toLowerCase()
    .replace(/\b\w/g, (c) => c.toUpperCase())
    .replace(/\b(Of|The|A|An|And|Or|To|In|On|For|That|Is|By|With|Upon)\b/g, (w, _m, i) =>
      i === 0 ? w : w.toLowerCase(),
    );
}

export function adapt(rawDir: string, opts: { sourceFile?: string } = {}): WorkIR {
  const html = readFileSync(join(rawDir, opts.sourceFile ?? "pg3600.html"), "utf-8");
  const { document } = parseHTML(html);

  // PG's own header, footer and licence live in tagged containers.
  for (const el of document.querySelectorAll(".pg-boilerplate, #pg-machine-header, #project-gutenberg-license")) {
    el.remove();
  }

  const divisions: Division[] = [];
  let book = 0;
  let sawChapter = false;
  let current: Division | null = null;
  let paraNo = 0;

  const start = (ref: string, title: string) => {
    if (current && current.blocks.length) divisions.push(current);
    current = { ref, title, blocks: [] };
    paraNo = 0;
  };

  const body = document.querySelector("body");
  if (!body) throw new Error("no body");

  for (const el of body.querySelectorAll("h1, h2, p, pre")) {
    const tag = el.tagName.toLowerCase();

    if (tag === "h1") continue; // the work's own title page

    if (tag === "h2") {
      const text = collapseWs(el.textContent ?? "");
      if (!text) continue;
      const bookMatch = text.match(/^BOOK THE (FIRST|SECOND|THIRD)$/i);
      if (bookMatch) {
        book = BOOK_WORDS[bookMatch[1]!.toUpperCase()]!;
        continue; // a divider, not a division of its own
      }
      // PG appends its own apparatus after the text; everything from there
      // on is not Montaigne.
      if (/^PROJECT GUTENBERG/i.test(text)) break;

      // "CHAPTER XII. — APOLOGY…" carries a stop after the numeral where
      // most chapters run straight into the dash.
      const chapterMatch = text.match(/^CHAPTER\s+([IVXLC]+)\.?\s*[—–-]+\s*(.+)$/i);
      if (chapterMatch) {
        if (book === 0) book = 1; // Book I is not announced; the first chapter opens it
        const n = romanToInt(chapterMatch[1]!);
        sawChapter = true;
        start(`${book}.${n}`, `${chapterMatch[1]!.toUpperCase()}. ${titleCase(chapterMatch[2]!)}`);
        continue;
      }
      if (sawChapter) {
        // a heading inside an essay (the Apology has one), not a new division
        if (current) current.blocks.push({ type: "heading", level: 3, text: titleCase(text) });
        continue;
      }
      start(slugify(text), titleCase(text)); // preface, life, letters
      continue;
    }

    if (!current) continue; // front matter before the first heading (the TOC)

    if (tag === "pre") {
      // a quoted poem: the transcription's line breaks are the poem's
      const lines = (el.textContent ?? "")
        .split("\n")
        .map((l) => l.replace(/\s+$/, ""))
        .filter((l) => l.trim().length);
      if (lines.length) {
        current.blocks.push({
          type: "quote",
          kind: "verse",
          blocks: [{ type: "verse", lines: lines.map((l) => ({ text: collapseWs(l) })) }],
        });
      }
      continue;
    }

    // Skip the table of contents: paragraphs that are just internal links.
    if (el.querySelectorAll("a.pginternal").length > 2) continue;

    const { text, marks } = inlineText(el);
    if (!text) continue;
    paraNo += 1;
    current.blocks.push({ type: "para", n: paraNo, text, ...(marks.length ? { marks } : {}) });
  }
  if (current && (current as Division).blocks.length) divisions.push(current);

  const essays = divisions.filter((d) => /^\d+\.\d+$/.test(d.ref));
  if (essays.length < 100) throw new Error(`montaigne: only ${essays.length} essays parsed`);
  const books = new Set(essays.map((d) => d.ref.split(".")[0]));
  if (books.size !== 3) throw new Error(`montaigne: found books ${[...books].join(", ")}, expected 3`);

  return { divisions };
}
