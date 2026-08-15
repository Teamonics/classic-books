import { copyFileSync, existsSync, writeFileSync } from "node:fs";
import { join } from "node:path";

// adapter-static writes the SPA shell as 404.html (what GitHub Pages serves
// for unknown paths). Every other host wants index.html for the site root,
// so publish both from the one shell.
const out = "build";
const shell = join(out, "404.html");
if (!existsSync(shell)) {
  console.error("finish-build: no 404.html shell; did the adapter run?");
  process.exit(1);
}
copyFileSync(shell, join(out, "index.html"));

// Belt and braces: .nojekyll must exist even if the static copy is missed.
writeFileSync(join(out, ".nojekyll"), "");
console.log("finish-build: index.html + .nojekyll written");
