import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import type { Block, Chunk, Manifest } from "./model.ts";

// Editorial aid: grep the built corpus for a phrase and print where it sits,
// so a passage locator can be copied from the text we actually serve rather
// than from memory of some other translation.
//
//   npx tsx src/find-text.ts <work-slug> <regex> [maxHits]

const ROOT = join(import.meta.dirname, "..", "..");
const WORKS = join(ROOT, "build", "works");

const [slug, pattern, maxArg] = process.argv.slice(2);
if (!slug || !pattern) throw new Error("usage: find-text <work-slug> <regex> [maxHits]");
const max = Number(maxArg ?? 6);
const re = new RegExp(pattern, "i");

let manifest: Manifest | undefined;
for (const author of readdirSync(WORKS)) {
  const dir = join(WORKS, author, slug);
  let file: string | undefined;
  try {
    file = readdirSync(dir).find((f) => f.startsWith("manifest."));
  } catch {
    continue;
  }
  if (file) manifest = JSON.parse(readFileSync(join(dir, file), "utf-8"));
}
if (!manifest) throw new Error(`no built work "${slug}"`);

function* walk(blocks: Block[], speaker?: string): Generator<{ block: Block; speaker?: string }> {
  for (const block of blocks) {
    if (block.type === "speech") yield* walk(block.blocks, block.speaker);
    else if (block.type === "quote") yield* walk(block.blocks, speaker);
    else yield { block, speaker };
  }
}

let hits = 0;
outer: for (const t of manifest.toc) {
  const chunk = JSON.parse(
    readFileSync(join(WORKS, manifest.author, slug, "chunks", manifest.chunkFiles[t.ref]!), "utf-8"),
  ) as Chunk;
  for (const { block, speaker } of walk(chunk.blocks)) {
    if (block.type === "verse") {
      for (let i = 0; i < block.lines.length; i++) {
        const two = block.lines.slice(i, i + 2).map((l) => l.text).join(" ");
        if (!re.test(two)) continue;
        console.log(
          `\n[${t.ref}${block.lines[i]!.n !== undefined ? `:${block.lines[i]!.n}` : ""}] ${t.title}${speaker ? ` — ${speaker}` : ""}`,
        );
        console.log(block.lines.slice(i, i + 4).map((l) => "  " + l.text).join("\n"));
        if (++hits >= max) break outer;
      }
    } else if (block.type === "para" && re.test(block.text)) {
      const at = block.text.search(re);
      console.log(`\n[${t.ref}${block.n !== undefined ? `.${block.n}` : ""}] ${t.title}${speaker ? ` — ${speaker}` : ""}`);
      console.log("  " + block.text.slice(Math.max(0, at - 90), at + 320).replace(/\s+/g, " "));
      if (++hits >= max) break outer;
    }
  }
}
if (!hits) console.log("no match");
