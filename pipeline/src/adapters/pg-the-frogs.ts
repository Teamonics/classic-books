import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { Block, Division, VerseLine, WorkIR } from "../model.ts";
import type { Mark } from "../model.ts";

// PG #7998, Rogers' verse Frogs. The play text lives in <pre> blocks with
// hard line breaks = verse lines. Speaker changes appear either as a
// standalone italic line (<i>XANTHIAS</i>) or as an inline ALL-CAPS prefix
// ("DIO. Aye, what you will..."). This edition carries no stage directions
// and no printed line numbers; we number the translation's lines
// sequentially across the play (manifest declares lineation:"translation").
// The edition's editorial introduction is NOT Rogers' text and is dropped.

const SPEAKERS: Record<string, string> = {
  DIONYSUS: "Dionysus",
  DIO: "Dionysus",
  XANTHIAS: "Xanthias",
  XAN: "Xanthias",
  HERACLES: "Heracles",
  HER: "Heracles",
  CORPSE: "Corpse",
  CORP: "Corpse",
  CHARON: "Charon",
  CHAR: "Charon",
  FROGS: "Chorus of Frogs",
  FROG: "Chorus of Frogs",
  FR: "Chorus of Frogs",
  // Transcription typos in PG #7998, verified against context:
  ABAC: "Aeacus", // OCR artifact for AEAC (Aeacus flogging scene)
  DRO: "Dionysus", // OCR artifact for DIO ("Perdition seize me…" is Dionysus)
  HOS: "Hostess",
  CHORUS: "Chorus",
  CHOR: "Chorus",
  CHO: "Chorus",
  AEACUS: "Aeacus",
  AEAC: "Aeacus",
  MAID: "Maidservant",
  MAIDSERVANT: "Maidservant",
  HOSTESS: "Hostess",
  LANDLADY: "Landlady",
  PLATHANE: "Plathane",
  PLA: "Plathane",
  EURIPIDES: "Euripides",
  EUR: "Euripides",
  AESCHYLUS: "Aeschylus",
  AES: "Aeschylus",
  AESCH: "Aeschylus",
  PLUTO: "Pluto",
  PLU: "Pluto",
  SERVANT: "Servant",
  SER: "Servant",
};

function decodeEntities(s: string): string {
  return s
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(Number(d)))
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)));
}

// Minimal inline parser for <pre> content: only <i> occurs in this text.
function parseInline(raw: string): { text: string; marks: Mark[] } {
  let text = "";
  const marks: Mark[] = [];
  const stack: number[] = [];
  const parts = raw.split(/(<\/?i>)/);
  for (const part of parts) {
    if (part === "<i>") stack.push(text.length);
    else if (part === "</i>") {
      const s = stack.pop();
      if (s !== undefined && text.length > s) marks.push({ s, e: text.length, k: "em" });
    } else {
      text += decodeEntities(part.replace(/<[^>]+>/g, ""));
    }
  }
  const trimmed = text.replace(/\s+/g, " ").trim();
  const shift = text.indexOf(trimmed.charAt(0));
  const adj = marks
    .map((m) => ({ ...m, s: Math.max(0, m.s - shift), e: Math.max(0, m.e - shift) }))
    .map((m) => ({ ...m, s: Math.min(m.s, trimmed.length), e: Math.min(m.e, trimmed.length) }))
    .filter((m) => m.e > m.s);
  return { text: trimmed, marks: adj };
}

export function adapt(rawDir: string): WorkIR {
  const html = readFileSync(join(rawDir, "pg7998.html"), "utf-8");

  const cast: string[] = [];
  const castSection = html.match(/DRAMATIS PERSON[^<]*<\/b>[\s\S]*?<hr>/);
  if (castSection) {
    for (const pm of castSection[0].matchAll(/<p>\s*([\s\S]*?)\s*<\/p>/g)) {
      const { text } = parseInline(pm[1]!);
      if (text && !/^DRAMATIS/.test(text)) cast.push(text);
    }
  }

  // Transcription damage in PG #7998, verified against the printed text:
  const repaired = html.replace(/\bDIOnysus\b/g, "Dionysus");

  const pres = [...repaired.matchAll(/<pre>([\s\S]*?)<\/pre>/g)].map((m) => m[1]!);
  if (pres.length === 0) throw new Error("no <pre> blocks found");

  const blocks: Block[] = [];
  blocks.push({ type: "heading", level: 2, text: "Dramatis Personae" });
  for (const c of cast) blocks.push({ type: "para", text: c });

  let current: { speaker: string; blocks: Block[] } | null = null;
  let currentLines: VerseLine[] = [];
  let lineNo = 0;
  const unknownSpeakers = new Set<string>();

  const flushStanza = () => {
    if (currentLines.length && current) {
      current.blocks.push({ type: "verse", lines: currentLines });
      currentLines = [];
    }
  };
  const flushSpeech = () => {
    flushStanza();
    if (current && current.blocks.length) {
      blocks.push({ type: "speech", speaker: current.speaker, blocks: current.blocks });
    }
    current = null;
  };
  const startSpeech = (token: string) => {
    flushSpeech();
    const key = token.replace(/[^A-Z]/g, "");
    const name = SPEAKERS[key];
    if (!name) {
      unknownSpeakers.add(token);
      current = { speaker: token, blocks: [] };
    } else {
      current = { speaker: name, blocks: [] };
    }
  };
  const pushLine = (raw: string) => {
    // A leading parenthetical italic is a stage direction:
    // "(<i>Striking out</i>.) Hands off!"
    const stage = raw.match(/^\(\s*<i>\s*(.*?)\s*<\/i>\s*\.?\s*\)\s*(.*)$/);
    if (stage) {
      if (!current) throw new Error(`stage direction before any speaker`);
      flushStanza();
      const { text } = parseInline(stage[1]!);
      if (text) current.blocks.push({ type: "stage", text });
      raw = stage[2]!;
    }
    const { text, marks } = parseInline(raw);
    if (!text) return;
    if (!current) throw new Error(`verse line before any speaker: ${JSON.stringify(text)}`);
    lineNo += 1;
    currentLines.push({ n: lineNo, text, ...(marks.length ? { marks } : {}) });
  };

  for (const pre of pres) {
    for (const rawLine of pre.split("\n")) {
      const s = rawLine.trim();
      if (!s) {
        flushStanza();
        continue;
      }
      const standalone = s.match(/^<i>\s*([A-Z][A-Z .]{1,30}?)\s*<\/i>$/);
      if (standalone) {
        startSpeech(standalone[1]!.trim());
        continue;
      }
      // Joint speaker: "FR. and DIO. Brekekekex, ko-ax, ko-ax."
      const joint = s.match(/^([A-Z]{2,})\. and ([A-Z]{2,})\.\s+(.*)$/);
      if (joint && SPEAKERS[joint[1]!] && SPEAKERS[joint[2]!]) {
        flushSpeech();
        current = { speaker: `${SPEAKERS[joint[1]!]} and ${SPEAKERS[joint[2]!]}`, blocks: [] };
        pushLine(joint[3]!);
        continue;
      }
      // Speaker prefix alone on its own line; speech begins on the next line.
      const bare = s.match(/^([A-Z]{2,}[A-Z .]*?)\.$/);
      if (bare && SPEAKERS[bare[1]!.replace(/[^A-Z]/g, "")]) {
        startSpeech(bare[1]!.trim());
        continue;
      }
      const inline = s.match(/^([A-Z]{2,}[A-Z .]*?)\.\s+(.*)$/);
      if (inline && SPEAKERS[inline[1]!.replace(/[^A-Z]/g, "")]) {
        startSpeech(inline[1]!.trim());
        pushLine(inline[2]!);
        continue;
      }
      // A prefix that looks like a speaker but is unknown must fail loudly:
      // it is either a new character or a parsing bug.
      if (inline && /^[A-Z]{2,6}$/.test(inline[1]!.replace(/[^A-Z]/g, ""))) {
        throw new Error(`unknown speaker prefix: ${JSON.stringify(inline[1])} in line ${JSON.stringify(s.slice(0, 80))}`);
      }
      pushLine(s);
    }
    flushStanza();
  }
  flushSpeech();

  if (unknownSpeakers.size) {
    throw new Error(`unknown standalone speakers: ${[...unknownSpeakers].join(", ")}`);
  }

  return {
    divisions: [{ ref: "play", title: "The Frogs", blocks }],
  };
}
