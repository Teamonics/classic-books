import { readFileSync } from "node:fs";
import { join } from "node:path";
import { parseHTML } from "linkedom";
import type { Block, Division, Note, WorkIR } from "../model.ts";
import { collapseWs, inlineText } from "../util.ts";

const CANTICHE = ["inferno", "purgatorio", "paradiso"] as const;

function parseVerseSection(section: any): { blocks: Block[]; noteIds: string[]; lineCount: number } {
  const blocks: Block[] = [];
  const noteIds: string[] = [];
  let lineNo = 0;

  const header = section.querySelector("header");
  if (header) {
    const bridge = header.querySelector('[epub\\:type="se:bridgehead"]');
    if (bridge) {
      const { text, marks } = inlineText(bridge);
      blocks.push({ type: "para", role: "summary", text, ...(marks.length ? { marks } : {}) });
    }
  }

  for (const p of section.querySelectorAll(":scope > p")) {
    if (p.closest("header")) continue;
    const lines = [];
    for (const span of p.querySelectorAll(":scope > span")) {
      const { text, marks } = inlineText(span);
      if (!text) continue;
      lineNo += 1;
      for (const m of marks) if (m.k === "note" && m.ref) noteIds.push(m.ref);
      const cls = span.getAttribute("class") ?? "";
      const indentMatch = cls.match(/\bi(\d)\b/);
      lines.push({
        n: lineNo,
        text,
        ...(marks.length ? { marks } : {}),
        ...(indentMatch ? { indent: Number(indentMatch[1]) } : {}),
      });
    }
    if (lines.length) blocks.push({ type: "verse", lines });
  }
  return { blocks, noteIds, lineCount: lineNo };
}

function parseNoteBody(li: any): Block[] {
  // strip SE backlinks (↩) before flattening
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
      const inner: Block[] = [];
      const spans = child.querySelectorAll(":scope > p > span");
      if (spans.length) {
        // quoted verse
        for (const p of child.querySelectorAll(":scope > p")) {
          const lines = [];
          for (const span of p.querySelectorAll(":scope > span")) {
            const { text, marks } = inlineText(span);
            if (text) lines.push({ text, ...(marks.length ? { marks } : {}) });
          }
          if (lines.length) inner.push({ type: "verse", lines });
        }
        if (inner.length) blocks.push({ type: "quote", kind: "verse", blocks: inner });
      } else {
        for (const p of child.querySelectorAll("p")) {
          const { text, marks } = inlineText(p);
          if (text) inner.push({ type: "para", text, ...(marks.length ? { marks } : {}) });
        }
        if (inner.length) blocks.push({ type: "quote", kind: "prose", blocks: inner });
      }
    }
  }
  if (!blocks.length) {
    const { text, marks } = inlineText(li);
    if (text) blocks.push({ type: "para", text, ...(marks.length ? { marks } : {}) });
  }
  return blocks;
}

export function adapt(rawDir: string): WorkIR {
  const textDir = join(rawDir, "epub", "text");

  const notesDoc = parseHTML(readFileSync(join(textDir, "endnotes.xhtml"), "utf-8")).document;
  const notesById = new Map<string, Note>();
  for (const li of notesDoc.querySelectorAll('li[id^="note-"]')) {
    const id = li.getAttribute("id")!;
    notesById.set(id, { id, blocks: parseNoteBody(li) });
  }

  const divisions: Division[] = [];
  for (const cantica of CANTICHE) {
    const doc = parseHTML(readFileSync(join(textDir, `${cantica}.xhtml`), "utf-8")).document;
    const canticaTitle = cantica[0]!.toUpperCase() + cantica.slice(1);

    for (const section of doc.querySelectorAll("section[id]")) {
      const id = section.getAttribute("id")!;
      let ref: string;
      let title: string;
      const cantoMatch = id.match(new RegExp(`^${cantica}-canto-(\\d+)$`));
      if (cantoMatch) {
        ref = `${cantica}.${cantoMatch[1]}`;
        const h = section.querySelector("header h3");
        title = h ? collapseWs(h.textContent ?? "") : `Canto ${cantoMatch[1]}`;
      } else if (id === `${cantica}-preface`) {
        ref = `${cantica}.preface`;
        const h = section.querySelector("header h3, header h2");
        title = h ? collapseWs(h.textContent ?? "") : "Proem";
      } else {
        continue; // cantica wrapper section
      }
      const { blocks, noteIds } = parseVerseSection(section);
      if (!blocks.length) throw new Error(`empty section: ${id}`);
      const notes: Note[] = [];
      for (const nid of noteIds) {
        const note = notesById.get(nid);
        if (!note) throw new Error(`noteref ${nid} in ${id} has no endnote`);
        notes.push(note);
      }
      divisions.push({
        ref,
        title: `${canticaTitle}: ${title}`,
        blocks,
        ...(notes.length ? { notes } : {}),
      });
    }
  }
  return { divisions };
}
