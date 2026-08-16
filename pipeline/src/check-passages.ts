import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import type { Manifest } from "./model.ts";
import { resolvePassages } from "./passages.ts";

// Editorial aid: resolve passages/ against the last build and report what
// landed and what did not, without failing anything. The real build treats
// the same errors as fatal.

const ROOT = join(import.meta.dirname, "..", "..");
const WORKS = join(ROOT, "build", "works");

const manifests = new Map<string, Manifest>();
for (const author of readdirSync(WORKS)) {
  for (const slug of readdirSync(join(WORKS, author))) {
    const dir = join(WORKS, author, slug);
    const file = readdirSync(dir).find((f) => f.startsWith("manifest."));
    if (file) manifests.set(slug, JSON.parse(readFileSync(join(dir, file), "utf-8")));
  }
}

const { built, errors } = resolvePassages(join(ROOT, "passages"), manifests, WORKS);

if (process.argv.includes("--show")) {
  for (const p of built) {
    console.log(`\n── ${p.title} — ${p.workTitle} ${p.ref}${p.speaker ? ` (${p.speaker})` : ""}`);
    console.log(p.excerpt);
  }
}

console.log(`\nresolved ${built.length}, failed ${errors.length}`);
for (const e of errors) console.log(`  ✗ ${e}`);
