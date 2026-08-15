import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { parseHTML } from "linkedom";
import type { Block, Note } from "../model.ts";
import { collapseWs, inlineText } from "../util.ts";

// Spine order from content.opf, mapped to text/ filenames.
export function spineFiles(epubDir: string): string[] {
  const opf = readFileSync(join(epubDir, "content.opf"), "utf-8");
  const { document } = parseHTML(opf);
  const hrefById = new Map<string, string>();
  for (const item of document.querySelectorAll("manifest item")) {
    hrefById.set(item.getAttribute("id")!, item.getAttribute("href")!);
  }
  const files: string[] = [];
  for (const ref of document.querySelectorAll("spine itemref")) {
    const href = hrefById.get(ref.getAttribute("idref")!);
    if (href?.startsWith("text/")) files.push(href.slice("text/".length));
  }
  if (!files.length) throw new Error(`empty spine in ${epubDir}`);
  return files;
}

export function parseNoteBody(li: any): Block[] {
  for (const a of li.querySelectorAll("a")) {
    const t = a.getAttribute("epub:type") ?? "";
    if (t.includes("backlink") || collapseWs(a.textContent ?? "") === "↩") a.remove();
  }
  const blocks: Block[] = [];
  for (const child of li.children) {
    const tag = child.tagName?.toLowerCase();
    if (tag === "p") {
      const { text, marks } = inlineText(child);
      if (text) blocks.push({ type: "para", text, ...(marks.length ? { marks } : {}) });
    } else if (tag === "blockquote") {
      const inner = parseBlockquote(child);
      if (inner) blocks.push(inner);
    }
  }
  if (!blocks.length) {
    const { text, marks } = inlineText(li);
    if (text) blocks.push({ type: "para", text, ...(marks.length ? { marks } : {}) });
  }
  return blocks;
}

export function loadEndnotes(epubDir: string): Map<string, Note> {
  const notes = new Map<string, Note>();
  const path = join(epubDir, "text", "endnotes.xhtml");
  if (!existsSync(path)) return notes;
  const { document } = parseHTML(readFileSync(path, "utf-8"));
  for (const li of document.querySelectorAll('li[id^="note-"]')) {
    const id = li.getAttribute("id")!;
    notes.set(id, { id, blocks: parseNoteBody(li) });
  }
  return notes;
}

export function parseVerseLines(container: any): { text: string; marks?: any }[] {
  const lines: { text: string; marks?: any }[] = [];
  for (const span of container.querySelectorAll(":scope > p > span, :scope > span")) {
    const { text, marks } = inlineText(span);
    if (text) lines.push({ text, ...(marks.length ? { marks } : {}) });
  }
  return lines;
}

export function parseBlockquote(bq: any): Block | null {
  const epubType = bq.getAttribute("epub:type") ?? "";
  if (epubType.includes("verse") || epubType.includes("poem") || epubType.includes("song")) {
    const lines = parseVerseLines(bq);
    if (lines.length) return { type: "quote", kind: "verse", blocks: [{ type: "verse", lines }] };
  }
  const inner: Block[] = [];
  for (const child of bq.children) {
    const tag = child.tagName?.toLowerCase();
    if (tag === "p" || tag === "cite" || tag === "footer") {
      const { text, marks } = inlineText(child);
      if (text) inner.push({ type: "para", text, ...(marks.length ? { marks } : {}) });
    } else if (tag === "blockquote") {
      const nested = parseBlockquote(child);
      if (nested) inner.push(nested);
    }
  }
  return inner.length ? { type: "quote", kind: "prose", blocks: inner } : null;
}

export function headerTitle(section: any): { title: string | null; summary: Block | null } {
  const header = section.querySelector(":scope > header, :scope > hgroup, :scope > h2, :scope > h3, :scope > h4");
  if (!header) return { title: null, summary: null };
  // A heading can carry a noteref; its printed numeral is presentation, and
  // would otherwise end up glued to the title ("The Knight's Tale277").
  for (const a of header.querySelectorAll('a[epub\\:type~="noteref"]')) a.remove();
  let summary: Block | null = null;
  const bridge = section.querySelector('[epub\\:type="se:bridgehead"]');
  if (bridge) {
    const { text, marks } = inlineText(bridge);
    if (text) summary = { type: "para", role: "summary", text, ...(marks.length ? { marks } : {}) };
  }
  const tag = header.tagName?.toLowerCase();
  if (tag === "h2" || tag === "h3" || tag === "h4") {
    return { title: collapseWs(header.textContent ?? "") || null, summary };
  }
  const parts: string[] = [];
  for (const child of header.children) {
    const t = child.tagName?.toLowerCase();
    if (/^h[2-6]$/.test(t)) parts.push(collapseWs(child.textContent ?? ""));
    else if (t === "p" && !(child.getAttribute("epub:type") ?? "").includes("bridgehead")) {
      const txt = collapseWs(child.textContent ?? "");
      if (txt) parts.push(txt);
    }
  }
  return { title: parts.filter(Boolean).join(": ") || null, summary };
}
