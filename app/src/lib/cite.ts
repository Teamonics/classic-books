import { base } from "$app/paths";
import type { Block, Chunk, Manifest } from "./types";
import { blockText } from "./blocktext";

// Locate the verse line (its printed n) containing a canonical-text offset
// of a top-level block, mirroring blockText's "\n" joins.
export function lineAt(block: Block, offset: number): number | undefined {
  let pos = 0;
  let found: number | undefined;
  const walk = (b: Block): boolean => {
    switch (b.type) {
      case "para":
      case "stage":
      case "heading":
        pos += b.text.length + 1;
        return pos > offset;
      case "verse":
        for (const l of b.lines) {
          pos += l.text.length + 1;
          if (pos > offset) {
            found = l.n;
            return true;
          }
        }
        return false;
      case "speech":
      case "quote":
        for (const c of b.blocks) if (walk(c)) return true;
        return false;
    }
  };
  walk(block);
  return found;
}

export interface CiteTarget {
  fineRef: string; // deep-linkable canonical ref
  locator: string; // human-readable
}

export function citeTarget(manifest: Manifest, chunk: Chunk, blockIndex: number, offset: number): CiteTarget {
  const block = chunk.blocks[blockIndex]!;
  const scheme = manifest.refScheme.primary;
  const line = lineAt(block, offset);
  if (line !== undefined && (scheme.includes(":line") || scheme === "line")) {
    return { fineRef: `${chunk.ref}:${line}`, locator: `${chunk.title}, line ${line}` };
  }
  if (block.type === "para" && block.n !== undefined && scheme.includes("paragraph")) {
    return { fineRef: `${chunk.ref}.${block.n}`, locator: `${chunk.title}, ¶${block.n}` };
  }
  return { fineRef: chunk.ref, locator: chunk.title };
}

export function citationText(
  manifest: Manifest,
  target: CiteTarget,
  quote: string | null,
): string {
  const url = `${location.origin}${base}/${manifest.author}/${manifest.slug}/${target.fineRef}`;
  const src = `${manifest.authorName}, ${manifest.title}, ${target.locator}${manifest.translator ? ` (tr. ${manifest.translator})` : ""}`;
  const q = quote ? `“${quote.length > 300 ? quote.slice(0, 300) + "…" : quote}”\n— ` : "";
  return `${q}${src}\n${url}`;
}

export async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    const ta = document.createElement("textarea");
    ta.value = text;
    ta.style.position = "fixed";
    ta.style.opacity = "0";
    document.body.appendChild(ta);
    ta.select();
    const ok = document.execCommand("copy");
    ta.remove();
    return ok;
  }
}

export function anchorSnippet(chunk: Chunk, blockIndex: number): string {
  const b = chunk.blocks[blockIndex];
  if (!b) return chunk.title;
  const t = blockText(b).replace(/\n/g, " ");
  return t.length > 60 ? t.slice(0, 60) + "…" : t;
}
