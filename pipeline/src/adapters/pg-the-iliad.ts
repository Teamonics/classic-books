import { readFileSync } from "node:fs";
import { join } from "node:path";
import { parseHTML } from "linkedom";
import type { Block, Division, WorkIR } from "../model.ts";
import { collapseWs, inlineText, romanToInt } from "../util.ts";

// PG #2199, Butler's prose Iliad. Structure: 24 <div class="chapter">, each
// <h2><a id="chapNN"></a>BOOK N.</h2>, one <p class="intro"> (Butler's
// argument), then plain <p> paragraphs. This edition has no footnotes.
// PG header/footer/boilerplate live outside div.chapter and are never read.
export function adapt(rawDir: string): WorkIR {
  const html = readFileSync(join(rawDir, "pg2199.html"), "utf-8");
  const { document } = parseHTML(html);
  const divisions: Division[] = [];

  for (const chapter of document.querySelectorAll("div.chapter")) {
    const h2 = chapter.querySelector("h2");
    if (!h2) throw new Error("chapter without h2");
    const headText = collapseWs(h2.textContent ?? "");
    const m = headText.match(/^BOOK\s+([IVXLC]+)\.?$/i);
    if (!m) throw new Error(`unrecognized book heading: ${JSON.stringify(headText)}`);
    const bookNum = romanToInt(m[1]!);

    const blocks: Block[] = [];
    let paraNo = 0;
    for (const p of chapter.querySelectorAll(":scope > p")) {
      const { text, marks } = inlineText(p);
      if (!text) continue;
      const isIntro = (p.getAttribute("class") ?? "").includes("intro");
      if (isIntro) {
        blocks.push({ type: "para", role: "argument", text, ...(marks.length ? { marks } : {}) });
      } else {
        paraNo += 1;
        blocks.push({ type: "para", n: paraNo, text, ...(marks.length ? { marks } : {}) });
      }
    }
    if (!blocks.length) throw new Error(`empty book ${bookNum}`);
    divisions.push({ ref: String(bookNum), title: `Book ${m[1]!.toUpperCase()}`, blocks });
  }

  if (divisions.length !== 24) {
    throw new Error(`expected 24 books, found ${divisions.length}`);
  }
  return { divisions };
}
