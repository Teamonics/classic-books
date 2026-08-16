import { base } from "$app/paths";
import { getCatalog } from "./catalog";
import type { CatalogEntry, Chunk, Manifest } from "./types";

const manifestCache = new Map<string, Promise<Manifest>>();
const chunkCache = new Map<string, Promise<Chunk>>();


async function getJson<T>(url: string): Promise<T> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${res.status} fetching ${url}`);
  return res.json();
}

// Work data lives under /data/works/<author>/<slug>/ so two authors can
// share a title (Sophocles and Euripides both wrote an Electra).
export function workDir(m: { author: string; slug: string }): string {
  return `${base}/data/works/${m.author}/${m.slug}`;
}

export async function getWork(
  slug: string,
  author?: string,
): Promise<{ entry: CatalogEntry; manifest: Manifest }> {
  const catalog = await getCatalog();
  const entry = catalog.works.find(
    (w: CatalogEntry) => w.slug === slug && (author === undefined || w.author === author),
  );
  if (!entry) throw new Error(`unknown work: ${author ?? "?"}/${slug}`);
  const key = `${entry.author}/${entry.slug}`;
  if (!manifestCache.has(key)) {
    manifestCache.set(key, getJson<Manifest>(`${workDir(entry)}/${entry.manifestFile}`));
  }
  return { entry, manifest: await manifestCache.get(key)! };
}

export function getChunk(manifest: Manifest, ref: string): Promise<Chunk> {
  const file = manifest.chunkFiles[ref];
  if (!file) throw new Error(`unknown chunk ref: ${manifest.slug}/${ref}`);
  const key = `${manifest.author}/${manifest.slug}/${file}`;
  if (!chunkCache.has(key)) {
    chunkCache.set(key, getJson<Chunk>(`${workDir(manifest)}/chunks/${file}`));
  }
  return chunkCache.get(key)!;
}

export function prefetchChunk(manifest: Manifest, ref: string | null) {
  if (ref && manifest.chunkFiles[ref]) void getChunk(manifest, ref).catch(() => {});
}

// resolveRef lives in refs.ts, which stays free of SvelteKit imports so the
// reader's route logic can be tested in Node; re-exported here for callers.
export { resolveRef } from "./refs";
