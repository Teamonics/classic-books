import { readFileSync } from "node:fs";
import { join } from "node:path";
import { parseHTML } from "linkedom";
import type { Block, Division, Note, VerseLine, WorkIR } from "../model.ts";
import { collapseWs, inlineText, romanToInt } from "../util.ts";
import { headerTitle, loadEndnotes, parseBlockquote, spineFiles } from "./se-common.ts";

// Standard Ebooks verse works: Milton, Dryden's Virgil, Chaucer, and the
// Shakespeare poetry volume. Verse is one <span> per line inside a <p>, the
// same convention the Divine Comedy uses; prose paragraphs (Milton's
// arguments, Chaucer's prose tales) sit alongside and stay prose.
//
// Line numbers count the lines of a division, which for these poems is the
// canonical unit — Paradise Lost I.254, Aeneid VI.126.

const MACHINERY = new Set([
  "titlepage.xhtml",
  "halftitlepage.xhtml",
  "imprint.xhtml",
  "colophon.xhtml",
  "uncopyright.xhtml",
  "toc.xhtml",
  "endnotes.xhtml",
  "loi.xhtml",
]);

function humanize(id: string): string {
  return id.replace(/-/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

function refFor(id: string): string {
  const m = id.match(/^(?:book|canto|chapter|part|sonnet|poem)-(\d+)$/);
  return m ? m[1]! : id;
}

export function adapt(rawDir: string, opts: { skipFiles?: string[] } = {}): WorkIR {
  const epubDir = join(rawDir, "epub");
  const notesById = loadEndnotes(epubDir);
  const skip = new Set([...MACHINERY, ...(opts.skipFiles ?? [])]);
  const divisions: Division[] = [];
  const problems: string[] = [];

  const build = (section: any, ref: string, title: string, file: string) => {
    const blocks: Block[] = [];
    const noteIds: string[] = [];
    let lineNo = 0;
    let paraNo = 0;

    const walk = (parent: any) => {
      for (const child of parent.children) {
        const tag = child.tagName?.toLowerCase();
        const ctype = child.getAttribute?.("epub:type") ?? "";
        if (tag === "header" || tag === "hgroup" || tag === "hr" || /^h[2-6]$/.test(tag)) continue;
        if (tag === "p") {
          if (ctype.includes("bridgehead")) continue; // already the summary
          const spans = [...child.querySelectorAll(":scope > span")];
          if (spans.length > 1 || (spans.length === 1 && child.querySelector("br"))) {
            const lines: VerseLine[] = [];
            for (const span of spans) {
              const { text, marks } = inlineText(span);
              if (!text) continue;
              lineNo += 1;
              const cls = span.getAttribute("class") ?? "";
              const indent = cls.match(/\bi(\d)\b/);
              lines.push({
                n: lineNo,
                text,
                ...(marks.length ? { marks } : {}),
                ...(indent ? { indent: Math.min(6, Number(indent[1])) } : {}),
              });
            }
            if (lines.length) blocks.push({ type: "verse", lines });
            continue;
          }
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
        } else if (tag === "section" || tag === "article" || tag === "div") {
          const sub = headerTitle(child);
          if (sub.title) blocks.push({ type: "heading", level: 3, text: sub.title });
          if (sub.summary) blocks.push(sub.summary);
          walk(child);
        } else if (tag === "footer") {
          // dedicatory sign-off (Venus and Adonis closes with one)
          for (const el of child.querySelectorAll("p")) {
            const { text, marks } = inlineText(el);
            if (!text) continue;
            paraNo += 1;
            blocks.push({ type: "para", n: paraNo, text, ...(marks.length ? { marks } : {}) });
          }
        } else if (tag === "figure" || tag === "img" || tag === "table") {
          problems.push(`${file}#${ref}: dropped <${tag}>`);
        } else {
          problems.push(`${file}#${ref}: unhandled <${tag}>`);
        }
      }
    };

    const { summary } = headerTitle(section);
    if (summary) blocks.push(summary);
    walk(section);
    if (!blocks.length) return false;

    const collect = (bs: Block[]) => {
      for (const b of bs) {
        if (b.type === "verse") {
          for (const l of b.lines) for (const m of l.marks ?? []) {
            if (m.k === "note" && m.ref) noteIds.push(m.ref);
          }
        } else if (b.type === "quote" || b.type === "speech") collect(b.blocks);
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
    return true;
  };

  for (const file of spineFiles(epubDir)) {
    if (skip.has(file)) continue;
    const { document } = parseHTML(readFileSync(join(epubDir, "text", file), "utf-8"));
    for (const section of document.querySelectorAll("body > section, body > article")) {
      const id = section.getAttribute("id") ?? file.replace(/\.xhtml$/, "");
      const { title: headTitle } = headerTitle(section);
      let base = headTitle ?? humanize(id);
      const noun = id.match(/^(book|canto|sonnet)-\d+$/)?.[1];
      if (noun && /^[IVXLCDM0-9]+(:|$)/.test(base)) {
        base = `${noun[0]!.toUpperCase()}${noun.slice(1)} ${base}`;
      }
      if (!build(section, refFor(id), base, file)) {
        // A wrapper section (e.g. "Sonnets") whose poems are separate
        // articles: emit each child instead.
        for (const child of section.querySelectorAll(":scope > article, :scope > section")) {
          const cid = child.getAttribute("id") ?? "";
          const ct = headerTitle(child).title ?? humanize(cid);
          const label = /^[IVXLCDM]+$/.test(ct) ? `${humanize(id).replace(/s$/, "")} ${ct}` : ct;
          build(child, refFor(cid) || cid, label, file);
        }
      }
    }
  }

  const dropped = problems.filter((p) => p.includes("dropped"));
  const hard = problems.filter((p) => !p.includes("dropped"));
  if (dropped.length) console.warn(`  [se-verse] ${dropped.length} dropped: ${dropped.slice(0, 2).join("; ")}`);
  if (hard.length) throw new Error(`se-verse problems:\n  ${hard.slice(0, 8).join("\n  ")}`);
  if (!divisions.length) throw new Error("no divisions found");
  void romanToInt;
  return { divisions };
}
