import { existsSync, lstatSync, mkdirSync, cpSync, symlinkSync, rmSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

// The pipeline writes the corpus to build/ at the repo root; the app publishes
// it as /data. Locally that is a symlink, which git does not carry (it is
// ignored, so a 154MB tree is not duplicated in the working copy). A fresh
// clone — including a CI runner — therefore has no static/data at all and
// would build a site whose catalog 404s. This recreates the link before every
// build, copying instead where symlinks are awkward.
const here = dirname(fileURLToPath(import.meta.url));
const appDir = resolve(here, "..");
const corpus = resolve(appDir, "..", "build");
const target = join(appDir, "static", "data");

if (!existsSync(corpus)) {
  console.error(`link-data: no corpus at ${corpus} — run the pipeline first:\n` +
    `  cd pipeline && npx tsx src/build.ts`);
  process.exit(1);
}

mkdirSync(join(appDir, "static"), { recursive: true });

let ok = false;
try {
  ok = lstatSync(target).isSymbolicLink() || existsSync(join(target, "catalog.json"));
} catch {
  ok = false;
}
if (ok) {
  console.log("link-data: static/data already present");
  process.exit(0);
}

rmSync(target, { recursive: true, force: true });
try {
  symlinkSync(resolve(corpus), target, "dir");
  console.log("link-data: linked static/data -> ../build");
} catch {
  cpSync(corpus, target, { recursive: true });
  console.log("link-data: copied build/ into static/data");
}
