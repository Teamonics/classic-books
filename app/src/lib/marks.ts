import type { Mark } from "./types";

export interface Segment {
  text: string;
  em?: boolean;
  strong?: boolean;
  smallcaps?: boolean;
}

export interface NotePoint {
  offset: number;
  ref: string;
}

// Split text into styled segments; zero-width note marks become NotePoints.
export function segment(text: string, marks: Mark[] | undefined): { segments: (Segment | NotePoint)[]; hasNotes: boolean } {
  if (!marks?.length) return { segments: [{ text }], hasNotes: false };

  const notes = marks.filter((m) => m.k === "note");
  const spans = marks.filter((m) => m.k !== "note" && m.e > m.s);

  const cuts = new Set<number>([0, text.length]);
  for (const m of spans) {
    cuts.add(m.s);
    cuts.add(m.e);
  }
  for (const n of notes) cuts.add(n.s);
  const points = [...cuts].sort((a, b) => a - b);

  const out: (Segment | NotePoint)[] = [];
  for (let i = 0; i < points.length - 1; i++) {
    const s = points[i]!;
    for (const n of notes) if (n.s === s && n.ref) out.push({ offset: s, ref: n.ref });
    const e = points[i + 1]!;
    if (e <= s) continue;
    const seg: Segment = { text: text.slice(s, e) };
    for (const m of spans) {
      if (m.s <= s && m.e >= e) {
        if (m.k === "em") seg.em = true;
        else if (m.k === "strong") seg.strong = true;
        else if (m.k === "smallcaps") seg.smallcaps = true;
      }
    }
    out.push(seg);
  }
  const last = points[points.length - 1]!;
  for (const n of notes) if (n.s === last && n.ref) out.push({ offset: last, ref: n.ref });

  return { segments: out, hasNotes: notes.length > 0 };
}

export function isNotePoint(x: Segment | NotePoint): x is NotePoint {
  return (x as NotePoint).ref !== undefined && (x as Segment).text === undefined;
}
