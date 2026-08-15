import { getCatalog } from "./catalog";
import type { CatalogEntry, Chunk, Manifest } from "./types";

const manifestCache = new Map<string, Promise<Manifest>>();
const chunkCache = new Map<string, Promise<Chunk>>();


async function getJson<T>(url: string): Promise<T> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${res.status} fetching ${url}`);
  return res.json();
}

export async function getWork(slug: string): Promise<{ entry: CatalogEntry; manifest: Manifest }> {
  const catalog = await getCatalog();
  const entry = catalog.works.find((w: CatalogEntry) => w.slug === slug);
  if (!entry) throw new Error(`unknown work: ${slug}`);
  if (!manifestCache.has(slug)) {
    manifestCache.set(slug, getJson<Manifest>(`/data/works/${slug}/${entry.manifestFile}`));
  }
  return { entry, manifest: await manifestCache.get(slug)! };
}

export function getChunk(manifest: Manifest, ref: string): Promise<Chunk> {
  const file = manifest.chunkFiles[ref];
  if (!file) throw new Error(`unknown chunk ref: ${manifest.slug}/${ref}`);
  const key = `${manifest.slug}/${file}`;
  if (!chunkCache.has(key)) {
    chunkCache.set(key, getJson<Chunk>(`/data/works/${manifest.slug}/chunks/${file}`));
  }
  return chunkCache.get(key)!;
}

export function prefetchChunk(manifest: Manifest, ref: string | null) {
  if (ref && manifest.chunkFiles[ref]) void getChunk(manifest, ref).catch(() => {});
}

// Resolve a possibly-finer-grained ref to its chunk ref plus an anchor.
// "inferno.1:61" -> chunk inferno.1, line 61; "3.12" -> chunk 3, para 12.
export function resolveRef(
  manifest: Manifest,
  ref: string,
): { chunkRef: string; line?: number; para?: number } | null {
  if (manifest.chunkFiles[ref]) return { chunkRef: ref };
  const colon = ref.match(/^(.+):(\d+)$/);
  if (colon && manifest.chunkFiles[colon[1]!]) {
    return { chunkRef: colon[1]!, line: Number(colon[2]) };
  }
  const dot = ref.match(/^(.+)\.(\d+)$/);
  if (dot && manifest.chunkFiles[dot[1]!]) {
    return { chunkRef: dot[1]!, para: Number(dot[2]) };
  }
  return null;
}
