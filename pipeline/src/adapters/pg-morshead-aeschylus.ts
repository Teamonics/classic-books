import { readFileSync } from "node:fs";
import { join } from "node:path";
import { parseHTML } from "linkedom";
import type { Block, Division, VerseLine, WorkIR } from "../model.ts";
import { collapseWs, inlineText } from "../util.ts";

// Morshead's Aeschylus on Project Gutenberg: the Oresteia as "The House of
// Atreus" (#8604) and the other four plays as "Four Plays of Aeschylus"
// (#8714). One translator, all seven surviving plays, public domain
// everywhere (Morshead d. 1912).
//
// The two volumes were transcribed to different standards, as PG texts
// always are:
//   #8604  verse in <p class="drama">, speakers as <b>NAME</b><br>
//   #8714  verse in <p class="noindent">, speakers as bare "NAME.<br>"
// Both are handled here; a paragraph's first <br>-delimited segment is
// treated as a speaker when it is all-caps or bold.

const VERSE_CLASSES = new Set(["drama", "noindent", "pfirst", "poem", ""]);
const STAGE_CLASSES = new Set(["right", "scenedesc", "center"]);

// Single capitals that stand alone as words: a dropcap "I" is followed by a
// space, "L" in "Lord" is not.
const STANDALONE_CAPS = new Set(["I", "A", "O"]);

// Transcription typos in the PG source, verified against context.
const SPEAKER_FIXES: Record<string, string> = {
  CLYTEMNESTSA: "CLYTEMNESTRA", // The Libation-Bearers
};

// Speakers arrive both all-caps (bold labels) and title-case (italic
// labels); normalize so ORESTES and Orestes are one character.
function fixSpeaker(name: string): string {
  const upper = collapseWs(name).toUpperCase();
  return SPEAKER_FIXES[upper] ?? upper;
}

function isSpeakerText(s: string): boolean {
  const t = s.replace(/[.:]$/, "").trim();
  if (!t || t.length > 42) return false;
  if (!/[A-Z]/.test(t)) return false;
  return !/[a-z]/.test(t); // all-caps line
}

export function adapt(
  rawDir: string,
  opts: { sourceFile?: string; playTitle?: string } = {},
): WorkIR {
  const { sourceFile, playTitle } = opts;
  if (!sourceFile || !playTitle) throw new Error("pg-morshead requires sourceFile and playTitle");
  const { document } = parseHTML(readFileSync(join(rawDir, sourceFile), "utf-8"));

  // Collect the chapter divs belonging to this play: from the div whose h2
  // names it, up to the next div that carries any h2.
  const chapters = [...document.querySelectorAll("div.chapter")];
  const startIdx = chapters.findIndex(
    (d: any) => collapseWs(d.querySelector("h2")?.textContent ?? "").toUpperCase() === playTitle.toUpperCase(),
  );
  if (startIdx < 0) throw new Error(`${sourceFile}: no chapter titled ${JSON.stringify(playTitle)}`);
  // Volume two repeats each play's name on a half-title div, so collection
  // stops only at an h2 naming a *different* work.
  const mine: any[] = [chapters[startIdx]];
  for (let i = startIdx + 1; i < chapters.length; i++) {
    const h2 = collapseWs(chapters[i]!.querySelector("h2")?.textContent ?? "");
    if (h2 && h2.toUpperCase() !== playTitle.toUpperCase()) break;
    mine.push(chapters[i]);
  }

  const blocks: Block[] = [];
  let lineNo = 0;
  let paraNo = 0;
  let inPlay = false;
  let current: { speaker: string; blocks: Block[]; lines: VerseLine[] } | null = null;
  const personae = new Set<string>();

  // Stage directions occur inside speeches ("Enter ATOSSA" mid-chorus), so
  // they close the running verse block but never the speech itself.
  const flushLines = () => {
    if (current && current.lines.length) {
      current.blocks.push({ type: "verse", lines: current.lines });
      current.lines = [];
    }
  };
  const flush = () => {
    flushLines();
    if (current && current.blocks.length) {
      blocks.push({ type: "speech", speaker: current.speaker, blocks: current.blocks });
    }
    current = null;
  };

  // Split a paragraph's children into <br>-delimited line groups, then
  // flatten each group with inlineText so marks survive.
  const lineGroups = (p: any): { text: string; marks: any[]; leading: number }[] => {
    const groups: { text: string; marks: any[]; leading: number }[] = [];
    let holder = document.createElement("span");
    const push = () => {
      const raw = holder.textContent ?? "";
      const leading = (raw.match(/^\s*/)?.[0].match(/ {2,}/) ? 1 : 0);
      const { text, marks } = inlineText(holder);
      if (text) groups.push({ text, marks, leading });
      holder = document.createElement("span");
    };
    for (const node of [...p.childNodes]) {
      if (node.nodeType === 1 && (node as any).tagName?.toLowerCase() === "br") push();
      else holder.appendChild(node.cloneNode(true));
    }
    push();
    return groups;
  };

  for (const chapter of mine) {
    for (const el of chapter.children) {
      const tag = el.tagName?.toLowerCase();
      const cls = (el.getAttribute("class") ?? "").trim();

      if (/^h[2-6]$/.test(tag)) {
        const t = collapseWs(el.textContent ?? "");
        if (!t || t.toUpperCase() === playTitle.toUpperCase()) continue;
        flush();
        blocks.push({ type: "heading", level: 3, text: t });
        continue;
      }
      if (tag !== "p") continue;

      if (STAGE_CLASSES.has(cls)) {
        const { text, marks } = inlineText(el);
        // Stripping the printed brackets shifts every offset, so the marks
        // have to move with the text.
        const lead = text.match(/^\[\s*/)?.[0].length ?? 0;
        const clean = text.slice(lead).replace(/\s*\]\s*$/, "").trim();
        if (!clean) continue;
        const shifted = marks
          .map((m) => ({ ...m, s: Math.max(0, m.s - lead), e: Math.min(Math.max(0, m.e - lead), clean.length) }))
          .filter((m) => m.e > m.s);
        const stage: Block = { type: "stage", text: clean, ...(shifted.length ? { marks: shifted } : {}) };
        if (current) {
          flushLines();
          current.blocks.push(stage);
        } else {
          blocks.push(stage);
        }
        continue;
      }
      if (!VERSE_CLASSES.has(cls)) continue;

      // Dramatis personae list: names, kept as content and used to tell
      // italic speaker labels from italic scene settings.
      const prevHeading = blocks[blocks.length - 1];
      if (prevHeading?.type === "heading" && /dramatis personae/i.test(prevHeading.text)) {
        for (const g of lineGroups(el)) {
          const name = g.text.replace(/[.,]$/, "").trim();
          if (name) personae.add(name.toUpperCase());
          blocks.push({ type: "para", text: g.text });
        }
        continue;
      }

      const groups = lineGroups(el);
      if (!groups.length) continue;

      // A paragraph that is nothing but italics is either a speaker label or
      // a scene setting; the personae list decides which.
      const onlyItalic =
        groups.length === 1 &&
        groups[0]!.marks.length === 1 &&
        groups[0]!.marks[0].k === "em" &&
        groups[0]!.marks[0].s === 0 &&
        groups[0]!.marks[0].e === groups[0]!.text.length;
      if (onlyItalic) {
        const label = groups[0]!.text.replace(/[.,]$/, "").trim();
        // Only a name from the cast list starts a new speech; every other
        // italic aside is a stage direction within the running one.
        if (personae.has(label.toUpperCase())) flush();
        if (personae.has(label.toUpperCase())) {
          current = { speaker: fixSpeaker(label), blocks: [], lines: [] };
          inPlay = true;
        } else if (current) {
          flushLines();
          current.blocks.push({ type: "stage", text: groups[0]!.text });
        } else {
          blocks.push({ type: "stage", text: groups[0]!.text });
        }
        continue;
      }

      let start = 0;
      const first = groups[0]!;
      const firstIsBold =
        first.marks.some((m: any) => m.k === "strong" && m.s === 0 && m.e === first.text.length);
      if (firstIsBold || isSpeakerText(first.text)) {
        flush();
        current = { speaker: fixSpeaker(collapseWs(first.text.replace(/[.:]$/, ""))), blocks: [], lines: [] };
        inPlay = true;
        start = 1;
      } else if (!current) {
        // Front matter before the first speaker: the translator's argument,
        // dedication or preface. Prose stays prose; his dedicatory verse
        // keeps its lines but belongs to no character.
        if (!inPlay) {
          if (groups.length === 1) {
            paraNo += 1;
            blocks.push({
              type: "para",
              n: paraNo,
              text: first.text,
              ...(first.marks.length ? { marks: first.marks } : {}),
            });
          } else {
            blocks.push({
              type: "verse",
              lines: groups.map((g) => ({
                text: g.text,
                ...(g.marks.length ? { marks: g.marks } : {}),
                ...(g.leading ? { indent: 1 } : {}),
              })),
            });
          }
          continue;
        }
        throw new Error(`${playTitle}: speech with no speaker attribution: ${JSON.stringify(first.text.slice(0, 60))}`);
      }

      for (let i = start; i < groups.length; i++) {
        const g = groups[i]!;
        lineNo += 1;
        current!.lines.push({
          n: lineNo,
          text: g.text,
          ...(g.marks.length ? { marks: g.marks } : {}),
          ...(g.leading ? { indent: 1 } : {}),
        });
      }
    }
  }
  flush();

  if (!blocks.some((b) => b.type === "speech")) throw new Error(`${playTitle}: no speeches parsed`);
  return { divisions: [{ ref: "1", title: playTitle.replace(/\b\w+/g, (w) => w[0]! + w.slice(1).toLowerCase()), blocks }] };
}

export { STANDALONE_CAPS };
