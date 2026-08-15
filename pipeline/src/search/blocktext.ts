import type { Block } from "../model.ts";

// Canonical plain text of a block — must match app/src/lib/blocktext.ts.
export function blockTextOf(b: Block): string {
  switch (b.type) {
    case "para":
    case "stage":
    case "heading":
      return b.text;
    case "verse":
      return b.lines.map((l) => l.text).join("\n");
    case "speech":
    case "quote":
      return b.blocks.map(blockTextOf).join("\n");
  }
}
