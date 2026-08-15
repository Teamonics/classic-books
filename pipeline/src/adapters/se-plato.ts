import { readFileSync } from "node:fs";
import { join } from "node:path";
import { parseHTML } from "linkedom";
import type { Block, Division, Note, WorkIR } from "../model.ts";
import { collapseWs, inlineText } from "../util.ts";
import { loadEndnotes, parseBlockquote } from "./se-common.ts";

// Standard Ebooks ships Jowett's complete Plato as one repo with a file per
// dialogue. Each dialogue is its own reader unit here (one work = one thing
// you sit down to read), so a work config names its sourceFile inside the
// shared snapshot.
//
// File shape: <article id="X"> containing <section id="X-introduction">
// (Jowett's essay), optionally <section id="X-dramatis-personae">, and
// <section id="X-text"> — which for the long dialogues holds
// <section epub:type="division"> per book.
//
// Refs: "introduction", "persons", then 1..N for the dialogue proper, so
// /plato/republic/1 is Book I and /plato/apology/1 is the dialogue.
// Stephanus numbers are absent from this source; they arrive later as an
// alias layer (see PLAN §1.3) without disturbing these permalinks.

export function adapt(rawDir: string, opts: { sourceFile?: string } = {}): WorkIR {
  const file = opts.sourceFile;
  if (!file) throw new Error("se-plato requires sourceFile");
  const epubDir = join(rawDir, "epub");
  const notesById = loadEndnotes(epubDir);
  const { document } = parseHTML(readFileSync(join(epubDir, "text", file), "utf-8"));

  const divisions: Division[] = [];

  const build = (section: any, ref: string, title: string) => {
    const blocks: Block[] = [];
    let paraNo = 0;

    const walk = (parent: any) => {
      for (const child of parent.children) {
        const tag = child.tagName?.toLowerCase();
        if (tag === "header" || tag === "hgroup" || tag === "hr") continue;
        if (/^h[2-6]$/.test(tag)) continue;
        if (tag === "p") {
          const { text, marks } = inlineText(child);
          if (!text) continue;
          paraNo += 1;
          blocks.push({ type: "para", n: paraNo, text, ...(marks.length ? { marks } : {}) });
        } else if (tag === "blockquote") {
          const q = parseBlockquote(child);
          if (q) blocks.push(q);
        } else if (tag === "ol" || tag === "ul") {
          for (const li of child.children) {
            const { text, marks } = inlineText(li);
            if (!text) continue;
            paraNo += 1;
            blocks.push({ type: "para", n: paraNo, text, ...(marks.length ? { marks } : {}) });
          }
        } else if (tag === "section" || tag === "div") {
          const h = child.querySelector(":scope > h3, :scope > h4, :scope > h5");
          const label = collapseWs(h?.textContent ?? "");
          if (label) blocks.push({ type: "heading", level: 3, text: label });
          walk(child);
        }
      }
    };
    walk(section);
    if (!blocks.length) return;

    const noteIds: string[] = [];
    const collect = (bs: Block[]) => {
      for (const b of bs) {
        if (b.type === "verse") {
          for (const l of b.lines) for (const m of l.marks ?? []) {
            if (m.k === "note" && m.ref) noteIds.push(m.ref);
          }
        } else if (b.type === "speech" || b.type === "quote") collect(b.blocks);
        else for (const m of (b as { marks?: { k: string; ref?: string }[] }).marks ?? []) {
          if (m.k === "note" && m.ref) noteIds.push(m.ref);
        }
      }
    };
    collect(blocks);
    const notes: Note[] = [];
    const seen = new Set<string>();
    for (const nid of noteIds) {
      if (seen.has(nid)) continue;
      seen.add(nid);
      const note = notesById.get(nid);
      if (!note) throw new Error(`${file}#${ref}: noteref ${nid} has no endnote`);
      notes.push(note);
    }
    divisions.push({ ref, title, blocks, ...(notes.length ? { notes } : {}) });
  };

  const article = document.querySelector("body > article, body > section");
  if (!article) throw new Error(`${file}: no article`);

  for (const section of article.querySelectorAll(":scope > section")) {
    const id = section.getAttribute("id") ?? "";
    if (id.endsWith("-introduction")) {
      build(section, "introduction", "Introduction and Analysis");
      continue;
    }
    if (id.endsWith("-dramatis-personae")) {
      build(section, "persons", "Persons of the Dialogue");
      continue;
    }
    // the dialogue proper: split into its books when it has them
    const books = [...section.querySelectorAll(':scope > section[epub\\:type~="division"]')];
    if (books.length) {
      for (const dp of section.querySelectorAll(':scope > section[epub\\:type~="z3998:dramatis-personae"]')) {
        build(dp, "persons", "Persons of the Dialogue");
      }
      books.forEach((book, i) => {
        const h = book.querySelector(":scope > h3, :scope > h4");
        const label = collapseWs(h?.textContent ?? "") || `Book ${i + 1}`;
        build(book, String(i + 1), label);
      });
    } else {
      const h = section.querySelector(":scope > h3, :scope > h4");
      build(section, "1", collapseWs(h?.textContent ?? "") || "The Dialogue");
    }
  }

  if (!divisions.length) throw new Error(`${file}: no divisions`);
  return { divisions };
}
