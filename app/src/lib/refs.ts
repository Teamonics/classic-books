import type { Manifest } from "./types";

// Ref resolution and the reader's route decision. Deliberately free of
// SvelteKit imports and of any component state, so it can be exercised in a
// plain Node test — the reader's reload logic is the one place in this app
// where a wrong answer costs a spinning CPU rather than a wrong pixel.

export interface ResolvedRef {
  chunkRef: string;
  line?: number;
  para?: number;
}

// Resolve a possibly-finer-grained ref to its chunk ref plus an anchor.
// "inferno.1:61" -> chunk inferno.1, line 61; "3.12" -> chunk 3, para 12.
export function resolveRef(manifest: Manifest, ref: string): ResolvedRef | null {
  if (manifest.chunkFiles[ref]) return { chunkRef: ref };
  const colon = ref.match(/^(.+):(\d+)$/);
  if (colon && manifest.chunkFiles[colon[1]!]) {
    return { chunkRef: colon[1]!, line: Number(colon[2]) };
  }
  const dot = ref.match(/^(.+)\.(\d+)$/);
  if (dot && manifest.chunkFiles[dot[1]!]) {
    return { chunkRef: dot[1]!, para: Number(dot[2]) };
  }
  return null;
}

export type RouteAction =
  | { kind: "load"; target: string }
  | { kind: "anchor"; resolved: ResolvedRef }
  | { kind: "none" };

/**
 * What the reader should do when the route names `target`.
 *
 * Three cases, and the reason each exists:
 *  - the chunk is not on screen, so fetch it;
 *  - it is on screen and the ref names a line or paragraph, so scroll there —
 *    but only once, because scrolling rewrites the URL to the plain chunk ref
 *    and re-anchoring on every such rewrite would trap the reader in place;
 *  - it is on screen and names nothing finer, so leave the reader alone.
 *
 * Deciding "already on screen" by resolving the ref matters: a ref may address
 * a line ("3.1:63"), a paragraph ("1.2") or a whole chunk, and chunk refs
 * contain dots themselves ("inferno.1", "chapter-1-1"), so no prefix test on
 * the raw string gets all three right.
 */
export function routeAction(
  target: string,
  manifest: Manifest | null,
  loaded: { ref: string; work: string }[],
  work: string,
  anchoredFor: string,
): RouteAction {
  if (!manifest || loaded[0]?.work !== work) return { kind: "load", target };
  const resolved = resolveRef(manifest, target);
  if (!resolved || !loaded.some((c) => c.ref === resolved.chunkRef)) return { kind: "load", target };
  const anchors = resolved.line !== undefined || resolved.para !== undefined;
  if (anchors && anchoredFor !== target) return { kind: "anchor", resolved };
  return { kind: "none" };
}
