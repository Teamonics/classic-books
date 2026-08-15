import { browser } from "$app/environment";
import type { Manifest } from "./types";

// position: last reading location per work
// progress: set of chunk refs the reader has finished

export interface Position {
  ref: string;
  blockIndex: number;
}

const posKey = (work: string) => `cb.v1.position.${work}`;
const progKey = (work: string) => `cb.v1.progress.${work}`;

export function getPosition(work: string): Position | null {
  if (!browser) return null;
  try {
    return JSON.parse(localStorage.getItem(posKey(work)) ?? "null");
  } catch {
    return null;
  }
}

export function savePosition(work: string, pos: Position) {
  if (!browser) return;
  localStorage.setItem(posKey(work), JSON.stringify(pos));
}

export function getReadRefs(work: string): Set<string> {
  if (!browser) return new Set();
  try {
    return new Set(JSON.parse(localStorage.getItem(progKey(work)) ?? "[]"));
  } catch {
    return new Set();
  }
}

export function markRead(work: string, ref: string) {
  if (!browser) return;
  const set = getReadRefs(work);
  if (set.has(ref)) return;
  set.add(ref);
  localStorage.setItem(progKey(work), JSON.stringify([...set]));
}

// "Book 3 of 24" — never a percentage (PLAN: locked decision).
// Prefaces/proems are excluded from the count.
export function progressLabel(manifest: Manifest, work: string): string | null {
  const pos = getPosition(work);
  if (!pos) return null;
  const numbered = manifest.toc.filter((t) => /(^|\.)\d+$/.test(t.ref));
  const i = numbered.findIndex((t) => t.ref === pos.ref);
  if (i < 0) return manifest.toc.some((t) => t.ref === pos.ref) ? "In progress" : null;
  const noun = manifest.refScheme.primary.startsWith("cantica")
    ? "Canto"
    : manifest.refScheme.primary.startsWith("book")
      ? "Book"
      : "Part";
  return `${noun} ${i + 1} of ${numbered.length}`;
}
