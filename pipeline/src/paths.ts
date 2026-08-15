import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import type { Manifest } from "./model.ts";

// Curated reading paths are hand-authored editorial JSON in paths/.
// The build validates every step against the built manifests, so a path can
// never point at a work or ref that does not exist.

export interface PathStep {
  work: string;
  ref: string;
  label: string;
  blurb: string;
}

export interface ReadingPath {
  slug: string;
  title: string;
  blurb: string;
  steps: PathStep[];
}

export interface BuiltPathStep extends PathStep {
  workTitle: string;
  author: string;
  authorName: string;
  chunkTitle: string;
  words: number;
}

export interface BuiltPath extends Omit<ReadingPath, "steps"> {
  steps: BuiltPathStep[];
  works: number;
  words: number;
}

export function buildPaths(pathsDir: string, manifests: Map<string, Manifest>): BuiltPath[] {
  const files = readdirSync(pathsDir).filter((f) => f.endsWith(".json")).sort();
  const built: BuiltPath[] = [];
  const errors: string[] = [];

  for (const file of files) {
    const path = JSON.parse(readFileSync(join(pathsDir, file), "utf-8")) as ReadingPath;
    if (!path.slug || !path.title || !path.steps?.length) {
      errors.push(`${file}: missing slug, title, or steps`);
      continue;
    }
    const steps: BuiltPathStep[] = [];
    for (const [i, step] of path.steps.entries()) {
      const manifest = manifests.get(step.work);
      if (!manifest) {
        errors.push(`${file} step ${i + 1}: unknown work "${step.work}"`);
        continue;
      }
      const toc = manifest.toc.find((t) => t.ref === step.ref);
      if (!toc) {
        errors.push(`${file} step ${i + 1}: ${step.work} has no ref "${step.ref}"`);
        continue;
      }
      if (!step.label || !step.blurb) {
        errors.push(`${file} step ${i + 1}: missing label or blurb`);
        continue;
      }
      steps.push({
        ...step,
        workTitle: manifest.title,
        author: manifest.author,
        authorName: manifest.authorName,
        chunkTitle: toc.title,
        words: toc.words,
      });
    }
    built.push({
      slug: path.slug,
      title: path.title,
      blurb: path.blurb,
      steps,
      works: new Set(steps.map((s) => s.work)).size,
      words: steps.reduce((n, s) => n + s.words, 0),
    });
  }

  if (errors.length) {
    throw new Error(`reading paths invalid:\n  ${errors.join("\n  ")}`);
  }
  return built;
}
