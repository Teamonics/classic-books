import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { routeAction, resolveRef } from "../src/lib/refs.ts";
import type { Manifest } from "../src/lib/types.ts";

// The reader's route decision, exercised against the real built manifests.
// This is a Node test on purpose: the failure it guards against is an effect
// that reloads forever, which in a browser costs a pinned CPU to observe.
//
//   npx tsx scripts/refs.test.ts

const WORKS = join(import.meta.dirname, "..", "..", "build", "works");
const PASSAGES = join(import.meta.dirname, "..", "..", "build", "passages.json");

const manifests = new Map<string, Manifest>();
for (const author of readdirSync(WORKS)) {
  for (const slug of readdirSync(join(WORKS, author))) {
    const dir = join(WORKS, author, slug);
    const file = readdirSync(dir).find((f) => f.startsWith("manifest."));
    if (file) manifests.set(slug, JSON.parse(readFileSync(join(dir, file), "utf-8")));
  }
}

let failures = 0;
const check = (name: string, cond: boolean, detail = "") => {
  if (!cond) {
    failures++;
    console.log(`  ✗ ${name}${detail ? ` — ${detail}` : ""}`);
  }
};

// Simulate what the reader does with a route: act, apply, repeat. A correct
// decision reaches a fixed point; the bug this replaces never did.
function settle(manifest: Manifest, work: string, target: string, maxSteps = 8) {
  let chunks: { ref: string; work: string }[] = [];
  let anchoredFor = "";
  const trace: string[] = [];
  for (let i = 0; i < maxSteps; i++) {
    const act = routeAction(target, manifest, chunks, work, anchoredFor);
    trace.push(act.kind);
    if (act.kind === "none") return { trace, chunks, settled: true };
    anchoredFor = target;
    if (act.kind === "load") {
      const resolved = resolveRef(manifest, target) ?? { chunkRef: manifest.toc[0]!.ref };
      chunks = [{ ref: resolved.chunkRef, work }];
    }
    // an "anchor" performs a scroll and changes no state the effect reads
  }
  return { trace, chunks, settled: false };
}

// 1. Every passage ref must reach a fixed point, and land on a real chunk.
const passages = JSON.parse(readFileSync(PASSAGES, "utf-8")) as { work: string; ref: string; title: string }[];
for (const p of passages) {
  const m = manifests.get(p.work)!;
  const { trace, chunks, settled } = settle(m, p.work, p.ref);
  check(`passage "${p.title}" settles`, settled, `${p.work} ${p.ref} → ${trace.join(",")}`);
  check(`passage "${p.title}" loads its chunk`, chunks.length === 1 && !!m.chunkFiles[chunks[0]!.ref]);
}

// 2. The three ref shapes, on works whose chunk refs contain dots themselves.
for (const [work, ref, kind] of [
  ["antigone", "1.2", "para"],
  ["hamlet", "3.1:63", "line"],
  ["hamlet", "3.1", "chunk"],
  ["the-divine-comedy", "inferno.3:9", "line"],
  ["the-brothers-karamazov", "chapter-2-5-5.19", "para"],
  ["gargantua-and-pantagruel", "1.57.3", "para"],
  ["epictetus-short-works", "the-enchiridion.6", "para"],
] as const) {
  const m = manifests.get(work)!;
  const r = resolveRef(m, ref);
  check(`${work} ${ref} resolves`, !!r);
  check(`${work} ${ref} is a ${kind}`, kind === "chunk" ? !r?.line && !r?.para : kind === "line" ? r?.line !== undefined : r?.para !== undefined);
  check(`${work} ${ref} settles`, settle(m, work, ref).settled);
}

// 3. Scrolling rewrites the URL to the plain chunk ref. That must not reload,
//    and must not re-anchor — the reader would be dragged back up the page.
{
  const m = manifests.get("antigone")!;
  const chunks = [{ ref: "1", work: "antigone" }];
  const afterAnchor = routeAction("1", m, chunks, "antigone", "1.2");
  check("scroll rewrite does nothing", afterAnchor.kind === "none", afterAnchor.kind);
  const again = routeAction("1.2", m, chunks, "antigone", "1.2");
  check("re-entering the same anchor does nothing", again.kind === "none", again.kind);
  const other = routeAction("1.5", m, chunks, "antigone", "1.2");
  check("a different anchor in the same chunk anchors", other.kind === "anchor", other.kind);
}

// 4. A ref that resolves to nothing still loads (the reader falls back to the
//    first chunk) rather than sitting on an empty page.
{
  const m = manifests.get("antigone")!;
  check("junk ref loads", routeAction("nonsense", m, [], "antigone", "").kind === "load");
}

// 5. Crossing to another work reloads even if the ref string matches.
{
  const m = manifests.get("antigone")!;
  const act = routeAction("1", m, [{ ref: "1", work: "medea" }], "antigone", "");
  check("other work's chunk reloads", act.kind === "load", act.kind);
}

console.log(failures ? `\n${failures} failing check(s)` : `\nall checks passed (${passages.length} passages)`);
process.exit(failures ? 1 : 0);
