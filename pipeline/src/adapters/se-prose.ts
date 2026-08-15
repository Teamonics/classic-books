import { readFileSync } from "node:fs";
import { join } from "node:path";
import { parseHTML } from "linkedom";
import type { Block, Division, Note, WorkIR } from "../model.ts";
import { collapseWs, inlineText } from "../util.ts";
import { headerTitle, loadEndnotes, parseBlockquote, spineFiles } from "./se-common.ts";

// Generic adapter for Standard Ebooks prose works.
//
// Walks the spine; every top-level <section> with body content becomes a
// division. Content-less sections typed "part"/"volume"/"division" set the
// running part context used in division titles. SE machinery files are
// skipped; anything else unrecognized fails the build so each new work is
// consciously reviewed.

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
  const m = id.match(/^(?:chapter|book|letter|essay|section|canto)-(\d+)$/);
  return m ? m[1]! : id;
}

export function adapt(rawDir: string, opts: { skipFiles?: string[] } = {}): WorkIR {
  const epubDir = join(rawDir, "epub");
  const notesById = loadEndnotes(epubDir);
  const skip = new Set([...MACHINERY, ...(opts.skipFiles ?? [])]);

  const divisions: Division[] = [];
  let partLabel: string | null = null;
  const problems: string[] = [];

  for (const file of spineFiles(epubDir)) {
    if (skip.has(file)) continue;
    const { document } = parseHTML(readFileSync(join(epubDir, "text", file), "utf-8"));
    const sections = [...document.querySelectorAll("body > section, body > article")];
    if (!sections.length) {
      problems.push(`${file}: no top-level section`);
      continue;
    }
    for (const section of sections) {
      const id = section.getAttribute("id") ?? file.replace(/\.xhtml$/, "");
      const epubType = section.getAttribute("epub:type") ?? "";
      const { title: headTitle, summary } = headerTitle(section);

      const blocks: Block[] = [];
      const noteIds: string[] = [];
      let paraNo = 0;

      const pushInline = (el: any, role?: "argument" | "summary") => {
        const { text, marks } = inlineText(el);
        if (!text) return;
        if (role) blocks.push({ type: "para", role, text, ...(marks.length ? { marks } : {}) });
        else {
          paraNo += 1;
          blocks.push({ type: "para", n: paraNo, text, ...(marks.length ? { marks } : {}) });
        }
      };

      // Single exhaustive pass over the finished block tree: collecting note
      // refs at each push site is too easy to forget (nested summaries did).
      const collectNoteIds = (bs: Block[]) => {
        for (const b of bs) {
          if (b.type === "verse") {
            for (const l of b.lines) for (const m of l.marks ?? []) {
              if (m.k === "note" && m.ref) noteIds.push(m.ref);
            }
          } else if (b.type === "quote" || b.type === "speech") {
            collectNoteIds(b.blocks);
          } else {
            for (const m of (b as { marks?: { k: string; ref?: string }[] }).marks ?? []) {
              if (m.k === "note" && m.ref) noteIds.push(m.ref);
            }
          }
        }
      };

      const walkBody = (parent: any) => {
        for (const child of parent.children) {
          const tag = child.tagName?.toLowerCase();
          const ctype = child.getAttribute?.("epub:type") ?? "";
          if (tag === "header" || tag === "hgroup" || tag === "hr") continue;
          if (/^h[2-6]$/.test(tag)) continue; // handled via headerTitle
          if (tag === "p") {
            if (ctype.includes("bridgehead")) continue; // already the summary
            pushInline(child);
          } else if (tag === "blockquote") {
            const q = parseBlockquote(child);
            if (q) blocks.push(q);
          } else if (tag === "ol" || tag === "ul") {
            for (const li of child.children) pushInline(li);
          } else if (tag === "dl") {
            // Definition lists are lookup tables in these texts (e.g. Pierre's
            // gematria in War and Peace). The block model has no table type,
            // so pairs are flattened into one readable paragraph rather than
            // dropped.
            const pairs: string[] = [];
            for (const dt of child.querySelectorAll("dt")) {
              const term = collapseWs(dt.textContent ?? "");
              const dd = dt.parentElement?.querySelector("dd");
              const def = collapseWs(dd?.textContent ?? "");
              if (term) pairs.push(def ? `${term} = ${def}` : term);
            }
            if (pairs.length) {
              paraNo += 1;
              blocks.push({ type: "para", n: paraNo, text: pairs.join(", ") });
            }
          } else if (tag === "footer") {
            // signature/valediction lines (e.g. a dedication's sign-off)
            for (const p of child.querySelectorAll("p")) pushInline(p);
          } else if (tag === "section") {
            // nested subsection: keep its heading inline, then its content
            const sub = headerTitle(child);
            if (sub.title) blocks.push({ type: "heading", level: 3, text: sub.title });
            if (sub.summary) blocks.push(sub.summary);
            walkBody(child);
          } else if (tag === "figure" || tag === "img" || tag === "table" || tag === "nav") {
            // images/tables are not supported in v1 (deferred with the
            // science volumes); dropped, counted, reported.
            problems.push(`${file}#${id}: dropped <${tag}>`);
          } else if (tag === "div") {
            walkBody(child);
          } else {
            problems.push(`${file}#${id}: unhandled <${tag}>`);
          }
        }
      };

      if (summary) blocks.push(summary);
      walkBody(section);
      collectNoteIds(blocks);

      const hasContent = blocks.some((b) => b.type !== "heading");
      if (!hasContent) {
        // A titled section with no text of its own is a divider page (a
        // part, book, or section header); it becomes the running context for
        // the divisions that follow. Untitled and empty is a real problem.
        if (headTitle) {
          partLabel = headTitle;
          continue;
        }
        problems.push(`${file}#${id}: empty section (type=${epubType})`);
        continue;
      }

      const notes: Note[] = [];
      const seen = new Set<string>();
      for (const nid of noteIds) {
        if (seen.has(nid)) continue;
        seen.add(nid);
        const note = notesById.get(nid);
        if (!note) throw new Error(`${file}#${id}: noteref ${nid} has no endnote`);
        notes.push(note);
      }

      // "V" or "I: Loomings" → "Chapter V" / "Chapter I: Loomings" when the
      // header carries only the ordinal (SE convention for numbered divisions)
      let base = headTitle ?? humanize(id);
      const noun = id.match(/^(chapter|book|letter|essay)-\d+$/)?.[1];
      if (noun && /^[IVXLCDM0-9]+(:|$)/.test(base)) {
        base = `${noun[0]!.toUpperCase()}${noun.slice(1)} ${base}`;
      }
      divisions.push({
        ref: refFor(id),
        title: partLabel && refFor(id) !== id ? `${partLabel} · ${base}` : base,
        blocks,
        ...(notes.length ? { notes } : {}),
      });
    }
  }

  const dropped = problems.filter((p) => p.includes("dropped"));
  const hard = problems.filter((p) => !p.includes("dropped"));
  if (dropped.length) console.warn(`  [se-prose] ${dropped.length} dropped element(s): ${dropped.slice(0, 3).join("; ")}${dropped.length > 3 ? "…" : ""}`);
  if (hard.length) throw new Error(`se-prose problems:\n  ${hard.join("\n  ")}`);
  if (!divisions.length) throw new Error("no divisions found");
  return { divisions };
}
