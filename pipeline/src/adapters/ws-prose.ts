import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { parseHTML } from "linkedom";
import type { Block, Division, WorkIR } from "../model.ts";
import { collapseWs, inlineText } from "../util.ts";

// Prose works transcribed on English Wikisource: Church and Brodribb's
// Tacitus, Munro's Lucretius. One snapshot file per book; the file name
// gives the division ref, so the Annals keep their real book numbers
// (1–6 and 11–16 — books 7 to 10 have not survived).
//
// Wikisource's own furniture (page-number anchors, edit-section links,
// reference superscripts, headers) is stripped first. What survives is
// headings — which in the Tacitus transcription are the canonical chapter
// numbers — and paragraphs.

const DROP_SELECTORS = [
  ".pagenum",
  ".ws-pagenum",
  ".ws-noexport",
  ".mw-editsection",
  ".wst-pagebreak",
  ".reference",
  ".mw-cite-backlink",
  ".mw-references-wrap",
  ".wst-dhr",
  ".wst-nop",
  ".similar",
  ".wst-header",
  ".plainSister",
  "#headertemplate",
  ".licenseContainer",
  "style",
  "link",
  "table",
].join(", ");

function refFromFile(file: string): string {
  const m = file.match(/^book-(\d+)\.html$/);
  if (m) return m[1]!;
  return file.replace(/\.html$/, "");
}

export function adapt(rawDir: string): WorkIR {
  const files = readdirSync(rawDir)
    .filter((f) => f.endsWith(".html"))
    .sort((a, b) => {
      const na = Number(a.match(/\d+/)?.[0] ?? NaN);
      const nb = Number(b.match(/\d+/)?.[0] ?? NaN);
      if (Number.isNaN(na) && Number.isNaN(nb)) return a.localeCompare(b);
      if (Number.isNaN(na)) return -1; // "argument" and friends lead
      if (Number.isNaN(nb)) return 1;
      return na - nb;
    });
  if (!files.length) throw new Error(`${rawDir}: no snapshot files`);

  const divisions: Division[] = [];
  for (const file of files) {
    const { document } = parseHTML(readFileSync(join(rawDir, file), "utf-8"));
    for (const el of document.querySelectorAll(DROP_SELECTORS)) el.remove();

    // Interwiki pointers to the Latin original ride along at the end of each
    // chapter; they are navigation, not text.
    for (const a of document.querySelectorAll("a.extiw")) {
      if (/^(latin|greek|original)$/i.test(collapseWs(a.textContent ?? ""))) a.remove();
    }

    const root = document.querySelector(".mw-parser-output") ?? document.body;
    const blocks: Block[] = [];
    let paraNo = 0;
    let title: string | null = null;

    const visit = (parent: any) => {
      for (const child of parent.children ?? []) {
        const tag = child.tagName?.toLowerCase();
        if (/^h[1-6]$/.test(tag)) {
          const t = collapseWs(child.textContent ?? "");
          if (!t) continue;
          if (!title && blocks.length === 0) {
            title = t; // the page's own title, not a division heading
            continue;
          }
          blocks.push({ type: "heading", level: 3, text: t });
        } else if (tag === "p") {
          const flat = inlineText(child);
          // removing the interwiki link leaves its empty brackets behind
          const text = flat.text.replace(/\s*\(\s*\)\s*$/, "").trim();
          const marks = flat.marks.filter((m) => m.e <= text.length);
          if (!text) continue;
          // the transcriptions repeat the work and book title as a first
          // paragraph; it is chrome, not content
          if (blocks.length === 0 && text.length < 60 && text === text.toUpperCase()) {
            if (!title) title = collapseWs(text);
            continue;
          }
          paraNo += 1;
          blocks.push({ type: "para", n: paraNo, text, ...(marks.length ? { marks } : {}) });
        } else if (tag === "div" || tag === "section" || tag === "dl") {
          visit(child);
        } else if (tag === "blockquote") {
          const inner: Block[] = [];
          for (const p of child.querySelectorAll("p")) {
            const { text, marks } = inlineText(p);
            if (text) inner.push({ type: "para", text, ...(marks.length ? { marks } : {}) });
          }
          if (inner.length) blocks.push({ type: "quote", kind: "prose", blocks: inner });
        }
      }
    };
    visit(root);

    if (!blocks.some((b) => b.type === "para")) {
      throw new Error(`${rawDir}/${file}: no prose found`);
    }
    const ref = refFromFile(file);
    const label = /^\d+$/.test(ref) ? `Book ${ref}` : (title ?? ref.replace(/-/g, " "));
    divisions.push({ ref, title: label, blocks });
  }
  return { divisions };
}
