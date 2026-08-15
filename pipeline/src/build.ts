import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import type { Chunk, Manifest, WorkConfig, WorkIR } from "./model.ts";
import { works } from "./works.config.ts";
import { contentHash, stableJson, wordCount } from "./util.ts";
import { validateWork } from "./validate.ts";
import { buildIndexes, validateIndexes } from "./search/index.ts";
import { adapt as adaptDante } from "./adapters/se-divine-comedy.ts";
import { adapt as adaptIliad } from "./adapters/pg-the-iliad.ts";
import { adapt as adaptFrogs } from "./adapters/pg-the-frogs.ts";
import { adapt as adaptSeProse } from "./adapters/se-prose.ts";
import { adapt as adaptSeDrama } from "./adapters/se-drama.ts";
import { adapt as adaptSePlato } from "./adapters/se-plato.ts";

const ROOT = resolve(import.meta.dirname, "..", "..");
const BUILD = join(ROOT, "build");

const adapters: Record<string, (rawDir: string, opts: { skipFiles?: string[]; sourceFile?: string }) => WorkIR> = {
  "se-divine-comedy": adaptDante,
  "pg-the-iliad": adaptIliad,
  "pg-the-frogs": adaptFrogs,
  "se-prose": adaptSeProse,
  "se-drama": adaptSeDrama,
  "se-plato": adaptSePlato,
};

// Golden facts checked on every build; extend per work as they are ingested.
const goldens: Record<string, (ir: WorkIR) => string[]> = {
  "the-iliad": (ir) => {
    const errs: string[] = [];
    if (ir.divisions.length !== 24) errs.push(`iliad: ${ir.divisions.length} books != 24`);
    return errs;
  },
  "the-divine-comedy": (ir) => {
    const errs: string[] = [];
    const cantos = ir.divisions.filter((d) => /\.\d+$/.test(d.ref));
    if (cantos.length !== 100) errs.push(`comedy: ${cantos.length} cantos != 100`);
    const inf1 = ir.divisions.find((d) => d.ref === "inferno.1");
    if (!inf1) errs.push("comedy: missing inferno.1");
    else {
      let lines = 0;
      for (const b of inf1.blocks) if (b.type === "verse") lines += b.lines.length;
      if (lines !== 136) errs.push(`comedy: inferno.1 has ${lines} lines != 136`);
    }
    return errs;
  },
  "the-frogs": (ir) => {
    const errs: string[] = [];
    const speakers = new Set<string>();
    const play = ir.divisions[0];
    if (!play) return ["frogs: no division"];
    for (const b of play.blocks) if (b.type === "speech") speakers.add(b.speaker);
    for (const need of ["Dionysus", "Xanthias", "Aeschylus", "Euripides", "Charon"]) {
      if (!speakers.has(need)) errs.push(`frogs: missing speaker ${need}`);
    }
    return errs;
  },
};

function buildWork(cfg: WorkConfig): { manifest: Manifest; sources: unknown } {
  const adapter = adapters[cfg.adapter];
  if (!adapter) throw new Error(`no adapter: ${cfg.adapter}`);
  const ir = adapter(join(ROOT, cfg.rawDir), { skipFiles: cfg.skipFiles, sourceFile: cfg.sourceFile });

  if (cfg.expectDivisions !== undefined && ir.divisions.length !== cfg.expectDivisions) {
    throw new Error(
      `${cfg.slug}: ${ir.divisions.length} divisions, expected ${cfg.expectDivisions} — refs: ${ir.divisions.map((d) => d.ref).join(", ").slice(0, 300)}`,
    );
  }
  const goldenErrors = goldens[cfg.slug]?.(ir) ?? [];
  if (goldenErrors.length) throw new Error(`golden check failed:\n  ${goldenErrors.join("\n  ")}`);

  const chunks: Chunk[] = ir.divisions.map((d, i) => ({
    schema: 1 as const,
    ref: d.ref,
    work: cfg.slug,
    title: d.title,
    prev: i === 0 ? null : ir.divisions[i - 1]!.ref,
    next: i === ir.divisions.length - 1 ? null : ir.divisions[i + 1]!.ref,
    blocks: d.blocks,
    ...(d.notes?.length ? { notes: d.notes } : {}),
  }));

  const workDir = join(BUILD, "works", cfg.slug);
  rmSync(workDir, { recursive: true, force: true });
  mkdirSync(join(workDir, "chunks"), { recursive: true });

  const chunkFiles: Record<string, string> = {};
  for (const c of chunks) {
    const json = stableJson(c);
    const name = `${c.ref}.${contentHash(json)}.json`;
    chunkFiles[c.ref] = name;
    writeFileSync(join(workDir, "chunks", name), json);
  }

  const indexes = buildIndexes(cfg.slug, ir.divisions);
  const indexErrors = validateIndexes(indexes, ir.divisions);
  if (indexErrors.length) throw new Error(`search index invalid for ${cfg.slug}:\n  ${indexErrors.slice(0, 10).join("\n  ")}`);
  const indexNames = indexes.map((index, i) => {
    const json = stableJson(index);
    const name = `search-${i}.${contentHash(json)}.json`;
    writeFileSync(join(workDir, name), json);
    return name;
  });

  const manifest: Manifest = {
    schema: 1,
    slug: cfg.slug,
    author: cfg.author,
    authorName: cfg.authorName,
    title: cfg.title,
    composedYear: cfg.composedYear,
    era: cfg.era,
    translator: cfg.translator,
    refScheme: cfg.refScheme,
    toc: ir.divisions.map((d) => ({ ref: d.ref, title: d.title, words: wordCount(d.blocks) })),
    chunkFiles,
    search: indexNames,
  };

  const errors = validateWork(manifest, chunks);
  if (errors.length) {
    throw new Error(`validation failed for ${cfg.slug}:\n  ${errors.slice(0, 20).join("\n  ")}${errors.length > 20 ? `\n  …and ${errors.length - 20} more` : ""}`);
  }

  const manifestJson = stableJson(manifest);
  const manifestName = `manifest.${contentHash(manifestJson)}.json`;
  writeFileSync(join(workDir, manifestName), manifestJson);

  const snapshot = JSON.parse(readFileSync(join(ROOT, cfg.rawDir, "SNAPSHOT.json"), "utf-8"));
  return {
    manifest: { ...manifest, chunkFiles: { ...chunkFiles } },
    sources: {
      slug: cfg.slug,
      title: cfg.title,
      translator: cfg.translator,
      manifestFile: manifestName,
      ...snapshot,
    },
  };
}

function main() {
  const catalog: unknown[] = [];
  const sources: unknown[] = [];
  const sorted = [...works].sort((a, b) => a.composedYear - b.composedYear);
  for (const cfg of sorted) {
    process.stdout.write(`building ${cfg.slug}… `);
    const { manifest, sources: src } = buildWork(cfg);
    const manifestJson = stableJson(manifest);
    catalog.push({
      slug: cfg.slug,
      author: cfg.author,
      authorName: cfg.authorName,
      title: cfg.title,
      composedYear: cfg.composedYear,
      era: cfg.era,
      translator: cfg.translator,
      manifestFile: `manifest.${contentHash(manifestJson)}.json`,
      chunks: manifest.toc.length,
      words: manifest.toc.reduce((n, t) => n + t.words, 0),
    });
    sources.push(src);
    console.log(`ok (${manifest.toc.length} chunks)`);
  }
  writeFileSync(join(BUILD, "catalog.json"), JSON.stringify(catalog, null, 2));
  writeFileSync(join(BUILD, "sources.json"), JSON.stringify(sources, null, 2));
  console.log("build complete");
}

main();
