import { readFileSync } from "node:fs";
import { join } from "node:path";
import { parseHTML } from "linkedom";
import type { Block, Division, WorkIR } from "../model.ts";
import { collapseWs, inlineText, romanToInt } from "../util.ts";

// A configurable adapter for the ordinary shape of a Project Gutenberg HTML
// text: a flat run of headings with paragraphs between them. Every PG file
// is transcribed to its own standard, so what varies is expressed as config
// rather than as another copy of this file:
//
//   headingLevel  which heading starts a division (h2 for most, h3 where the
//                 transcriber used h2 for front matter — Berkeley, Kant)
//   bookPattern   headings that advance a book counter instead of starting a
//                 division, giving book.chapter refs (Rabelais, Bacon)
//   stopAt        where the text ends and PG's apparatus begins
//   skipHeadings  headings that are navigation, not text
//
// Anything the walk does not recognise is reported, not silently dropped.

export interface PgGenericOptions {
  headingLevel?: 2 | 3 | 4 | 5;
  bookPattern?: string;
  stopAt?: string;
  skipHeadings?: string;
  refMode?: "slug" | "index" | "roman" | "number";
  // When the transcription's heading levels do not identify divisions
  // reliably, name the divisions outright. Spinoza needs this: the source
  // simply has no "PART V" heading, only its subtitle.
  divisionPattern?: string;
  // Some transcriptions carry the whole reference in the heading itself:
  // Rabelais numbers its chapters "Chapter 1.V.—…". Two capture groups,
  // book then chapter.
  refPattern?: string;
  // One PG volume can hold several works (the Eleven Comedies carries five
  // plays each). A work takes the slice from its own title heading up to the
  // next one.
  sliceFrom?: string;
  sliceUntil?: string;
  // Transcription debris to delete from the text, as a regex. Applied to text
  // nodes before any offsets are computed, so inline marks stay aligned.
  // Ellis's Politics carries a stray "[Bekker 1252a]" and an "Ed." in its
  // opening sentence and nowhere else — one-offs, not a numbering system.
  stripText?: string;
  // Where chapters restart their numbering in every book, the chapter heading
  // alone ("Chapter I") names eight different places. Carry the book into the
  // title so a table of contents and a citation stay unambiguous.
  titleWithBook?: string; // label, e.g. "Book"
}

const DEFAULT_SKIP = /^(contents?|table of contents|footnotes?|list of illustrations|index|transcriber|the full project gutenberg)/i;
const DEFAULT_STOP = /^(the full project gutenberg|footnotes?|project gutenberg)/i;

function slugify(s: string): string {
  return collapseWs(s).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 60);
}

function titleCase(s: string): string {
  const t = collapseWs(s);
  if (t !== t.toUpperCase()) return t; // already mixed case: leave it
  return t
    .toLowerCase()
    .replace(/\b\w/g, (c) => c.toUpperCase())
    // roman numerals must not become "Ii" or "Xiii"
    .replace(/\b(?:[IVXLC]+)\b/gi, (w) => (/^[ivxlc]+$/i.test(w) && w.length > 1 ? w.toUpperCase() : w));
}

export function adapt(
  rawDir: string,
  opts: { sourceFile?: string; pg?: PgGenericOptions } = {},
): WorkIR {
  const cfg = opts.pg ?? {};
  const level = cfg.headingLevel ?? 2;
  const bookRe = cfg.bookPattern ? new RegExp(cfg.bookPattern, "i") : null;
  const stopRe = cfg.stopAt ? new RegExp(cfg.stopAt, "i") : DEFAULT_STOP;
  const skipRe = cfg.skipHeadings ? new RegExp(cfg.skipHeadings, "i") : DEFAULT_SKIP;
  const divisionRe = cfg.divisionPattern ? new RegExp(cfg.divisionPattern, "i") : null;
  const refRe = cfg.refPattern ? new RegExp(cfg.refPattern, "i") : null;
  const sliceFromRe = cfg.sliceFrom ? new RegExp(cfg.sliceFrom, "i") : null;
  const sliceUntilRe = cfg.sliceUntil ? new RegExp(cfg.sliceUntil, "i") : null;
  let active = !sliceFromRe;

  const html = readFileSync(join(rawDir, opts.sourceFile!), "utf-8");
  const { document } = parseHTML(html);

  if (cfg.stripText) {
    const strip = new RegExp(cfg.stripText, "g");
    const scrub = (node: any) => {
      for (const child of [...node.childNodes]) {
        if (child.nodeType === 3) child.nodeValue = (child.nodeValue ?? "").replace(strip, "");
        else scrub(child);
      }
    };
    scrub(document.body ?? document);
  }
  for (const el of document.querySelectorAll(
    // ".side" carries transcriber navigation ("BOOK1|CHAPTER1 ^paragraph 70")
    // that otherwise reads as if Kant wrote it.
    ".pg-boilerplate, #pg-machine-header, #project-gutenberg-license, .pgkilled, .toc, .fig, .side",
  )) {
    el.remove();
  }

  const divisions: Division[] = [];
  let current: Division | null = null;
  let book = 0;
  let bookLabel = ""; // the book's own numeral, as printed
  let index = 0;
  let paraNo = 0;
  let stopped = false;

  // A division must carry real text. Title-page fragments and a bare
  // "CONTENTS" line are apparatus that some transcriptions leave at h2.
  const wordsIn = (bs: Block[]): number => {
    let n = 0;
    for (const b of bs) {
      if (b.type === "verse") for (const l of b.lines) n += l.text.match(/\S+/g)?.length ?? 0;
      else if (b.type === "quote" || b.type === "speech") n += wordsIn(b.blocks);
      else if (b.type !== "heading") n += (b as { text: string }).text.match(/\S+/g)?.length ?? 0;
    }
    return n;
  };

  const isSubstantive = (d: Division): boolean => {
    // Poems arrive as quoted verse rather than paragraphs, so every kind of
    // text counts here — Milton's shorter poems were being dropped when only
    // prose did.
    if (wordsIn(d.blocks) < 25) return false;
    const paras = d.blocks.filter((b) => b.type === "para") as { text: string }[];
    return !(paras.length === 1 && d.blocks.length === 1 && /^contents$/i.test(paras[0]!.text.trim()));
  };

  const flush = () => {
    if (current && isSubstantive(current)) divisions.push(current);
    current = null;
  };

  const startDivision = (text: string) => {
    flush();
    index += 1;
    // The ref is settled once the division is known to have content, so
    // headings that turn out to be empty leave no gaps in the numbering.
    let ref: string;
    const fromHeading = refRe?.exec(text);
    if (fromHeading) {
      const b = fromHeading[1]!;
      const c = fromHeading[2]!;
      const num = (v: string) => (/^\d+$/.test(v) ? Number(v) : romanToInt(v));
      ref = `${num(b)}.${num(c)}`;
    } else if (bookRe && book > 0) {
      const n = text.match(/\b([IVXLC]+|\d+)\b/);
      let chapter = index;
      if (n) {
        try {
          chapter = /^\d+$/.test(n[1]!) ? Number(n[1]) : romanToInt(n[1]!);
        } catch {
          /* keep the running index */
        }
      }
      ref = `${book}.${chapter}`;
    } else if (cfg.refMode === "number") {
      // "QUESTION 12" -> 12; the Summa is cited by question number
      const n = text.match(/(\d+)/);
      ref = n ? n[1]! : slugify(text);
    } else if (cfg.refMode === "roman") {
      const n = text.match(/\b([IVXLC]+)\b/);
      ref = n ? String(romanToInt(n[1]!)) : slugify(text);
    } else {
      ref = slugify(text) || String(index);
    }
    let title = titleCase(text);
    if (cfg.titleWithBook && bookRe && book > 0 && !bookRe.test(text)) {
      title = `${cfg.titleWithBook} ${bookLabel}, ${title}`;
    }
    current = { ref, title, blocks: [] };
    paraNo = 0;
  };

  const body = document.querySelector("body");
  if (!body) throw new Error("no body");

  for (const el of body.querySelectorAll("h1, h2, h3, h4, h5, h6, p, pre, blockquote")) {
    if (stopped) break;
    const tag = el.tagName.toLowerCase();
    const text = collapseWs(el.textContent ?? "");

    if (/^h[1-6]$/.test(tag)) {
      if (!text) continue;
      if (sliceFromRe) {
        if (!active) {
          if (sliceFromRe.test(text)) active = true;
          else continue;
        } else if (sliceUntilRe?.test(text) && !sliceFromRe.test(text)) {
          // The volume repeats a play's own title above its dialogue, so
          // only a *different* work's title ends the slice.
          stopped = true;
          break;
        }
      }
      if (stopRe.test(text)) {
        stopped = true;
        break;
      }
      if (skipRe.test(text)) {
        flush();
        continue;
      }
      if (tag === "h1") continue;
      if (bookRe?.test(text)) {
        flush();
        book += 1;
        bookLabel = text.match(/\b([IVXLC]+|\d+)\b/)?.[1] ?? String(book);
        index = 0;
        continue;
      }
      const headingLevel = Number(tag[1]);
      const isDivision = divisionRe ? divisionRe.test(text) : headingLevel === level;
      if (isDivision) {
        startDivision(text);
      } else if (current) {
        current.blocks.push({ type: "heading", level: 3, text: titleCase(text) });
      }
      continue;
    }

    if (!active || !current) continue;

    if (tag === "pre") {
      const lines = (el.textContent ?? "")
        .split("\n")
        .map((l) => collapseWs(l))
        .filter(Boolean);
      if (lines.length) {
        current.blocks.push({
          type: "quote",
          kind: "verse",
          blocks: [{ type: "verse", lines: lines.map((t) => ({ text: t })) }],
        });
      }
      continue;
    }

    if (tag === "blockquote") {
      const inner: Block[] = [];
      for (const p of el.querySelectorAll("p")) {
        const { text: t, marks } = inlineText(p);
        if (t) inner.push({ type: "para", text: t, ...(marks.length ? { marks } : {}) });
      }
      if (inner.length) current.blocks.push({ type: "quote", kind: "prose", blocks: inner });
      continue;
    }

    if (el.closest("blockquote, pre")) continue; // already captured
    if (el.querySelectorAll("a.pginternal").length > 2) continue; // a contents list
    const { text: t, marks } = inlineText(el);
    if (!t) continue;
    paraNo += 1;
    current.blocks.push({ type: "para", n: paraNo, text: t, ...(marks.length ? { marks } : {}) });
  }
  flush();

  if (!divisions.length) throw new Error(`${opts.sourceFile}: no divisions found`);
  if (cfg.refMode === "index") {
    divisions.forEach((d, i) => {
      d.ref = String(i + 1);
    });
  }
  // Front matter can repeat a heading (Rabelais has several "The Author's
  // Prologue"); refs must stay unique to stay addressable.
  const seen = new Map<string, number>();
  for (const d of divisions) {
    const n = (seen.get(d.ref) ?? 0) + 1;
    seen.set(d.ref, n);
    if (n > 1) d.ref = `${d.ref}-${n}`;
  }
  return { divisions };
}
