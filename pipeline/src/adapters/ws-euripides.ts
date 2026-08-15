import { readFileSync } from "node:fs";
import { join } from "node:path";
import { parseHTML } from "linkedom";
import type { Block, Division, VerseLine, WorkIR } from "../model.ts";
import { collapseWs, inlineText } from "../util.ts";

// Euripides from English Wikisource: Arthur S. Way's verse translation
// (d. 1930) for sixteen plays, Edward P. Coleridge's prose (d. 1936) for the
// two Way's edition lacks. Both are public domain in the US and in life+70
// jurisdictions.
//
// Wikisource serves proofread-page HTML: the text is wrapped in transclusion
// machinery — page-boundary spans, deduplicated template styles, reference
// superscripts — that must be stripped before parsing. What remains is
// regular enough:
//
//   speaker      a centred <p> whose only content is a smallcaps name
//   stage        a <p> that is entirely italic
//   verse        a <p> with <br>-separated lines (Way)
//   prose        a <p> of running text (Coleridge)
//
// Way's edition prints the canonical Greek line numbers every five lines as
// <span class="wst-pline">; those are read and used directly, so a reference
// like /euripides/medea/1:250 means what a scholar means by Medea 250.

const DROP_SELECTORS = [
  ".pagenum",
  ".ws-pagenum",
  ".ws-noexport",
  ".wst-pagebreak",
  ".reference",
  ".mw-cite-backlink",
  ".wst-dhr",
  ".wst-nop",
  "style",
  "link",
  "sup.reference",
  ".mw-references-wrap",
  ".similar",
  ".wst-header",
  ".plainSister",
  "#headertemplate",
].join(", ");

interface Piece {
  text: string;
  marks: { s: number; e: number; k: string; ref?: string }[];
  lineNo?: number;
}

function isAllSmallcaps(p: any): boolean {
  const spans = [...p.querySelectorAll("span.smallcaps")];
  if (!spans.length) return false;
  const spanText = spans.map((s: any) => collapseWs(s.textContent ?? "")).join(" ");
  const whole = collapseWs(p.textContent ?? "").replace(/[.:]$/, "").trim();
  return collapseWs(spanText).toLowerCase() === whole.toLowerCase();
}

function isAllItalic(p: any): boolean {
  const text = collapseWs(p.textContent ?? "").replace(/[.]$/, "").trim();
  if (!text) return false;
  const it = [...p.querySelectorAll("i, em")].map((e: any) => collapseWs(e.textContent ?? "")).join(" ");
  return collapseWs(it).length >= text.length - 2;
}

export function adapt(
  rawDir: string,
  opts: { sourceFile?: string; mode?: "verse" | "prose" } = {},
): WorkIR {
  const file = opts.sourceFile;
  const mode = opts.mode ?? "verse";
  if (!file) throw new Error("ws-euripides requires sourceFile");
  const { document } = parseHTML(readFileSync(join(rawDir, file), "utf-8"));

  for (const el of document.querySelectorAll(DROP_SELECTORS)) el.remove();

  const blocks: Block[] = [];
  let current: { speaker: string; blocks: Block[]; lines: VerseLine[] } | null = null;
  let lineNo = 0;
  let paraNo = 0;
  let inPlay = false;

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

  // Split a paragraph at <br>, capturing Way's printed line numbers.
  const pieces = (p: any): Piece[] => {
    const out: Piece[] = [];
    let holder = document.createElement("span");
    let pending: number | undefined;
    const push = () => {
      const { text, marks } = inlineText(holder);
      if (text) out.push({ text, marks, lineNo: pending });
      pending = undefined;
      holder = document.createElement("span");
    };
    for (const node of [...p.childNodes]) {
      const tag = node.nodeType === 1 ? (node as any).tagName?.toLowerCase() : null;
      if (tag === "br") {
        push();
        continue;
      }
      if (node.nodeType === 1 && (node as any).classList?.contains("wst-pline")) {
        const n = Number(collapseWs((node as any).textContent ?? ""));
        if (Number.isFinite(n) && n > 0) pending = n;
        continue;
      }
      holder.appendChild(node.cloneNode(true));
    }
    push();
    return out;
  };

  // Coleridge abbreviates speakers inline ("Her." for Hermes); the cast list
  // printed before the play expands them.
  const cast: string[] = [];
  for (const heading of document.querySelectorAll("p")) {
    if (!/dramatis person/i.test(collapseWs(heading.textContent ?? ""))) continue;
    let el: any = heading.parentElement?.nextElementSibling;
    for (let hops = 0; el && hops < 4; hops++, el = el.nextElementSibling) {
      const names = [...el.querySelectorAll("span.smallcaps")]
        .map((s: any) => collapseWs(s.textContent ?? ""))
        .join(" ");
      if (!names) continue;
      for (const raw of (el.innerHTML ?? "").split(/<br\s*\/?>/i)) {
        const name = collapseWs(raw.replace(/<[^>]+>/g, "")).replace(/[.,]$/, "");
        if (name && name.length < 48) cast.push(name);
      }
      break;
    }
    break;
  }
  const expand = (abbrev: string): string => {
    const a = abbrev.replace(/[.:]$/, "").trim().toLowerCase();
    const hit = cast.find((c) => c.toLowerCase().startsWith(a) || c.toLowerCase().split(/\s+/)[0] === a);
    const name = (hit ?? abbrev.replace(/[.:]$/, "")).toUpperCase();
    // Coleridge numbers individual chorus members ("10th Cho."); they are
    // the chorus.
    if (/^\d+(ST|ND|RD|TH)\s+CHO/.test(name)) return "CHORUS";
    if (/HALF-?CHO/.test(name)) return "HALF-CHORUS";
    return name;
  };

  const paragraphs = [...document.querySelectorAll("p")];
  for (const p of paragraphs) {
    const text = collapseWs(p.textContent ?? "");
    if (!text) continue;

    // Coleridge speech: a small-caps abbreviation followed by a full stop,
    // then the speech itself. (Way also opens verse with a small-caps word,
    // but without the stop.)
    const firstEl = p.firstElementChild;
    const afterFirst = firstEl?.classList?.contains("smallcaps")
      ? (p.textContent ?? "").slice((firstEl.textContent ?? "").length)
      : "";
    // Way's speaker labels are a small-caps name and nothing else, so the
    // inline form only applies when speech text follows the stop.
    if (/^\s*\./.test(afterFirst) && collapseWs(afterFirst.replace(/^\s*\.\s*/, "")).length > 0) {
      const speaker = expand(collapseWs(firstEl.textContent ?? ""));
      const clone = p.cloneNode(true) as any;
      clone.firstElementChild?.remove();
      const { text: body, marks } = inlineText(clone);
      const lead = body.match(/^\s*\.\s*/)?.[0].length ?? 0;
      const clean = body.slice(lead);
      if (!clean) continue;
      flush();
      paraNo += 1;
      const shifted = marks
        .map((m) => ({ ...m, s: Math.max(0, m.s - lead), e: Math.min(Math.max(0, m.e - lead), clean.length) }))
        .filter((m) => m.e > m.s);
      current = {
        speaker,
        blocks: [{ type: "para", n: paraNo, text: clean, ...(shifted.length ? { marks: shifted } : {}) }],
        lines: [],
      };
      inPlay = true;
      continue;
    }

    // Speaker label: a line that is nothing but a small-caps name.
    if (isAllSmallcaps(p) && text.length < 48) {
      flush();
      current = { speaker: text.replace(/[.:]$/, "").toUpperCase(), blocks: [], lines: [] };
      inPlay = true;
      continue;
    }

    // Stage direction: wholly italic.
    if (isAllItalic(p)) {
      const { text: t, marks } = inlineText(p);
      const clean = t.replace(/\.$/, "").trim();
      if (!clean) continue;
      const stage: Block = { type: "stage", text: clean };
      void marks;
      if (current) {
        flushLines();
        current.blocks.push(stage);
      } else {
        blocks.push(stage);
      }
      continue;
    }

    const parts = pieces(p);
    if (!parts.length) continue;

    if (!current) {
      // Front matter: the argument, the cast list, the scene note.
      if (parts.length === 1) {
        paraNo += 1;
        blocks.push({
          type: "para",
          n: paraNo,
          text: parts[0]!.text,
          ...(parts[0]!.marks.length ? { marks: parts[0]!.marks } : {}),
        });
      } else {
        for (const part of parts) {
          paraNo += 1;
          blocks.push({
            type: "para",
            n: paraNo,
            text: part.text,
            ...(part.marks.length ? { marks: part.marks } : {}),
          });
        }
      }
      continue;
    }

    if (mode === "prose") {
      // Coleridge translates into prose: a speech is one paragraph. (Way's
      // stichomythia is single verse lines with no <br>, so this must be
      // decided per translation, not per paragraph.)
      flushLines();
      for (const part of parts) {
        paraNo += 1;
        current.blocks.push({
          type: "para",
          n: paraNo,
          text: part.text,
          ...(part.marks.length ? { marks: part.marks } : {}),
        });
      }
      continue;
    }

    for (const part of parts) {
      // Way prints a number every fifth line; snap to it so references match
      // the canonical Greek lineation, but never move backwards — where the
      // printed count and ours disagree (a line the transclusion splits
      // differently), monotonic references matter more than matching a
      // marker exactly.
      // Markers are printed every five lines; one that leaps far ahead is
      // transcription noise (Helen carries a stray 14335), so ignore it.
      const marker = part.lineNo !== undefined && part.lineNo > lineNo && part.lineNo <= lineNo + 50
        ? part.lineNo
        : undefined;
      lineNo = marker ?? lineNo + 1;
      current.lines.push({
        n: lineNo,
        text: part.text,
        ...(part.marks.length ? { marks: part.marks } : {}),
      });
    }
  }
  flush();

  if (!inPlay) throw new Error(`${file}: no speakers found`);
  const speeches = blocks.filter((b) => b.type === "speech");
  if (speeches.length < 10) throw new Error(`${file}: only ${speeches.length} speeches parsed`);

  // Title the division with the play's own printed heading (a large centred
  // all-caps line) rather than a generic label.
  let title = "The Play";
  for (const el of document.querySelectorAll("div.wst-center p, div.tiInherit p")) {
    const t = collapseWs(el.textContent ?? "").replace(/\.$/, "");
    if (t && t.length < 40 && t === t.toUpperCase() && /[A-Z]{3}/.test(t) && !/DRAMATIS|ARGUMENT|PERSON/.test(t)) {
      title = t.replace(/\b\w+/g, (w) => w[0]! + w.slice(1).toLowerCase());
      break;
    }
  }

  return { divisions: [{ ref: "1", title, blocks }] };
}
