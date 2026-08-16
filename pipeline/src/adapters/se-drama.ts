import { readFileSync } from "node:fs";
import { join } from "node:path";
import { parseHTML } from "linkedom";
import type { Block, Division, Note, VerseLine, WorkIR } from "../model.ts";
import { collapseWs, inlineText, romanToInt } from "../util.ts";
import { loadEndnotes, parseBlockquote, spineFiles } from "./se-common.ts";

// Standard Ebooks drama (Shakespeare). Each play is a table per scene:
// every <tr> is either a stage-direction row (empty persona cell) or a
// speech row (persona cell + content cell). Multi-line verse is marked
// z3998:verse with one <span> per line; single lines and prose share the
// same bare <td>, so they are separated by length (see PROSE_MIN).
//
// Line numbers are this edition's own count of verse lines within a scene.
// No digital edition can reproduce print lineation, because print numbers
// prose by typeset line; the manifest declares lineation:"edition" so the
// reader and colophon can say so.

const MACHINERY = new Set([
  "titlepage.xhtml",
  "halftitlepage.xhtml",
  "imprint.xhtml",
  "colophon.xhtml",
  "uncopyright.xhtml",
  "toc.xhtml",
  "endnotes.xhtml",
]);

// Measured across Hamlet: 99.8% of marked verse lines are under 80 chars
// (median 42, p99 61), while prose speeches run to hundreds.
const PROSE_MIN = 80;

function ordinal(el: any): number | null {
  const roman = el?.querySelector('[epub\\:type~="z3998:roman"], [epub\\:type~="z3998:ordinal"]');
  const text = collapseWs(roman?.textContent ?? "");
  if (!text) return null;
  try {
    return romanToInt(text);
  } catch {
    const n = Number(text);
    return Number.isFinite(n) ? n : null;
  }
}

export function adapt(rawDir: string, opts: { skipFiles?: string[] } = {}): WorkIR {
  const epubDir = join(rawDir, "epub");
  const notesById = loadEndnotes(epubDir);
  const skip = new Set([...MACHINERY, ...(opts.skipFiles ?? [])]);
  const divisions: Division[] = [];

  const buildScene = (section: any, refBase: string, title: string) => {
    const blocks: Block[] = [];
    const noteIds: string[] = [];
    let lineNo = 0;
    let paraNo = 0;

    const pushStage = (el: any) => {
      const { text, marks } = inlineText(el);
      if (text) blocks.push({ type: "stage", text, ...(marks.length ? { marks } : {}) });
    };

    const contentBlocks = (td: any): Block[] => {
      const type = td.getAttribute("epub:type") ?? "";
      if (type.includes("z3998:verse") || td.querySelector(":scope > p > span")) {
        const lines: VerseLine[] = [];
        for (const span of td.querySelectorAll(":scope > p > span, :scope > span")) {
          const { text, marks } = inlineText(span);
          if (!text) continue;
          lineNo += 1;
          lines.push({ n: lineNo, text, ...(marks.length ? { marks } : {}) });
        }
        return lines.length ? [{ type: "verse", lines }] : [];
      }
      const out: Block[] = [];
      for (const bq of td.querySelectorAll(":scope > blockquote")) {
        const q = parseBlockquote(bq);
        if (q) out.push(q);
        bq.remove();
      }
      const { text, marks } = inlineText(td);
      if (text) {
        if (text.length >= PROSE_MIN) {
          paraNo += 1;
          out.unshift({ type: "para", n: paraNo, text, ...(marks.length ? { marks } : {}) });
        } else {
          lineNo += 1;
          out.unshift({ type: "verse", lines: [{ n: lineNo, text, ...(marks.length ? { marks } : {}) }] });
        }
      }
      return out;
    };

    for (const el of section.children) {
      const tag = el.tagName?.toLowerCase();
      if (tag === "header" || tag === "hgroup" || /^h[2-6]$/.test(tag)) continue;
      if (tag === "p") {
        pushStage(el); // scene setting ("Elsinore. A platform before the castle.")
        continue;
      }
      if (tag !== "table") continue;
      for (const tr of el.querySelectorAll("tr")) {
        const cells = [...tr.querySelectorAll(":scope > td")];
        if (!cells.length) continue;
        const personaCell = cells.find((c: any) => (c.getAttribute("epub:type") ?? "").includes("persona"));
        const contentCell = cells[cells.length - 1];
        if (!contentCell) continue;

        if (!personaCell) {
          // A row without a speaker is either a stage direction, or speech
          // that carries no label because a preceding direction named the
          // speaker — Gower's choruses in Pericles work that way. Narrowing
          // to a nested stage-direction element discarded the speech around
          // it, so only take that path when the direction *is* the row.
          const stageEl = contentCell.querySelector('[epub\\:type~="z3998:stage-direction"]');
          const whole = collapseWs(contentCell.textContent ?? "");
          const stageOnly = collapseWs(stageEl?.textContent ?? "");
          if (stageEl && stageOnly.length >= whole.length - 2) {
            pushStage(stageEl);
          } else if (whole) {
            for (const b of contentBlocks(contentCell)) blocks.push(b);
          }
          continue;
        }
        const speaker = collapseWs(personaCell.textContent ?? "");
        const inner = contentBlocks(contentCell);
        if (!speaker || !inner.length) continue;
        blocks.push({ type: "speech", speaker, blocks: inner });
      }
    }

    if (!blocks.length) return;

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
      if (!note) throw new Error(`${refBase}: noteref ${nid} has no endnote`);
      notes.push(note);
    }
    divisions.push({ ref: refBase, title, blocks, ...(notes.length ? { notes } : {}) });
  };

  const files = spineFiles(epubDir).filter((f) => !skip.has(f));
  const docs = files.map((file) => ({
    file,
    document: parseHTML(readFileSync(join(epubDir, "text", file), "utf-8")).document,
  }));
  // Greek tragedy is one continuous scene with no acts; Shakespeare has acts
  // plus inductions, prologues and epilogues. Only the former gets the
  // "the play is division 1" treatment.
  const hasActs = docs.some((d) => d.document.querySelector('body > section[id^="act-"]'));

  for (const { file, document } of docs) {
    for (const section of document.querySelectorAll("body > section")) {
      const id = section.getAttribute("id") ?? file.replace(/\.xhtml$/, "");
      const actNum = /^act-\d+$/.test(id) ? ordinal(section.querySelector(":scope > h2")) : null;

      // Every child section of an act is a division. Scene numbers come from
      // SE's own ids (scene-2-1), so interludes without an ordinal — Romeo
      // and Juliet's Act II Prologue, the Henry V choruses — get a named ref
      // instead of colliding with Scene I.
      const scenes = [...section.querySelectorAll(":scope > section")];
      if (actNum !== null && scenes.length) {
        for (const scene of scenes) {
          const sceneId = scene.getAttribute("id") ?? "";
          const m = sceneId.match(/^scene-\d+-(\d+)$/);
          if (m) {
            buildScene(scene, `${actNum}.${m[1]}`, `Act ${actNum}, Scene ${m[1]}`);
          } else {
            const h = scene.querySelector(":scope > h3, :scope > h4");
            const label = collapseWs(h?.textContent ?? "") || sceneId || "Interlude";
            const slug = label.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
            buildScene(scene, `${actNum}.${slug}`, `Act ${actNum}, ${label}`);
          }
        }
      } else if (actNum !== null) {
        buildScene(section, String(actNum), `Act ${actNum}`);
      } else {
        // Greek tragedy has no act divisions: the play is one continuous
        // scene, preceded by a translator's introduction and a cast list.
        const h = section.querySelector(":scope > h2, :scope > h3");
        const title = collapseWs(h?.textContent ?? "") || id.replace(/-/g, " ");
        let ref = id;
        if (/dramatis-personae/.test(id) || /dramatis-personae/.test(file)) ref = "persons";
        else if (/introduction/.test(id) || /introduction/.test(file)) ref = "introduction";
        else if (/preface/.test(id) || /preface/.test(file)) ref = "preface";
        else if (!hasActs) ref = "1";
        buildScene(section, ref, title.replace(/\b\w/g, (c) => c.toUpperCase()));
      }
    }
  }

  if (!divisions.length) throw new Error(`${rawDir}: no scenes found`);
  return { divisions };
}
