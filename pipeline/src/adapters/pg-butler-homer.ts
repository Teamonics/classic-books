import { readFileSync } from "node:fs";
import { join } from "node:path";
import { parseHTML } from "linkedom";
import type { Block, Division, WorkIR } from "../model.ts";
import { collapseWs, inlineText, romanToInt } from "../util.ts";

// Butler's prose Homer on Project Gutenberg: the Iliad (#2199) and the
// Odyssey (#1727) share a structure — <div class="chapter"> per division,
// each headed <h2>BOOK N</h2>, optionally with a <p class="intro"> carrying
// Butler's argument, then plain <p> paragraphs. Front matter (prefaces) sits
// in the same chapter divs and is kept as its own divisions. PG
// header/footer boilerplate lives outside div.chapter and is never read.
export function adapt(rawDir: string, opts: { sourceFile?: string } = {}): WorkIR {
  const html = readFileSync(join(rawDir, opts.sourceFile ?? "pg2199.html"), "utf-8");
  const { document } = parseHTML(html);
  const divisions: Division[] = [];

  for (const chapter of document.querySelectorAll("div.chapter")) {
    const h2 = chapter.querySelector("h2");
    if (!h2) {
      // Butler's Odyssey opens with an unheaded dedication (to Cav. Biagio
      // Ingroia, in Italian). Keep it; a second unheaded div would collide
      // on this ref and fail validation, which is the intent.
      const fm = collectBlocks(chapter);
      if (fm.length) divisions.push({ ref: "dedication", title: "Dedication", blocks: fm });
      continue;
    }
    const headText = collapseWs(h2.textContent ?? "");
    const m = headText.match(/^BOOK\s+([IVXLC]+)\.?$/i);
    if (!m) {
      // front matter (prefaces, title block): keep, but not as a book
      const slug = headText.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
      const fm = collectBlocks(chapter);
      if (fm.length && slug && slug !== "the-odyssey" && slug !== "the-iliad") {
        divisions.push({ ref: slug, title: titleCase(headText), blocks: fm });
      }
      continue;
    }
    const bookNum = romanToInt(m[1]!);

    const blocks = collectBlocks(chapter);
    if (!blocks.length) throw new Error(`empty book ${bookNum}`);
    divisions.push({ ref: String(bookNum), title: `Book ${m[1]!.toUpperCase()}`, blocks });
  }

  const books = divisions.filter((d) => /^\d+$/.test(d.ref));
  if (books.length !== 24) {
    throw new Error(`expected 24 books, found ${books.length}`);
  }
  return { divisions };
}

function titleCase(s: string): string {
  return s.toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase());
}

function collectBlocks(chapter: any): Block[] {
  const blocks: Block[] = [];
  let paraNo = 0;
  for (const p of chapter.querySelectorAll(":scope > p")) {
    const { text, marks } = inlineText(p);
    if (!text) continue;
    if ((p.getAttribute("class") ?? "").includes("intro")) {
      blocks.push({ type: "para", role: "argument", text, ...(marks.length ? { marks } : {}) });
    } else {
      paraNo += 1;
      blocks.push({ type: "para", n: paraNo, text, ...(marks.length ? { marks } : {}) });
    }
  }
  return blocks;
}
