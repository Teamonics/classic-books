import { browser } from "$app/environment";
import type { Manifest } from "./types";

const DATA = "cb-data-v1";

export function offlineSupported(): boolean {
  return browser && "caches" in window && "serviceWorker" in navigator;
}

export function workUrls(manifest: Manifest): string[] {
  const base = `/data/works/${manifest.slug}`;
  const urls = Object.values(manifest.chunkFiles).map((f) => `${base}/chunks/${f}`);
  if (manifest.search) urls.push(`${base}/${manifest.search}`);
  return urls;
}

// Cache every chunk + the search index for a work so it reads fully offline.
export async function downloadWork(
  manifest: Manifest,
  onProgress?: (done: number, total: number) => void,
): Promise<void> {
  const cache = await caches.open(DATA);
  const urls = workUrls(manifest);
  let done = 0;
  const BATCH = 8;
  for (let i = 0; i < urls.length; i += BATCH) {
    await Promise.all(
      urls.slice(i, i + BATCH).map(async (u) => {
        if (!(await cache.match(u))) {
          const res = await fetch(u);
          if (!res.ok) throw new Error(`${res.status} for ${u}`);
          await cache.put(u, res);
        }
        done++;
        onProgress?.(done, urls.length);
      }),
    );
  }
}

export async function isWorkDownloaded(manifest: Manifest): Promise<boolean> {
  if (!offlineSupported()) return false;
  const cache = await caches.open(DATA);
  const urls = workUrls(manifest);
  const results = await Promise.all(urls.map((u) => cache.match(u)));
  return results.every(Boolean);
}

export async function removeWorkDownload(manifest: Manifest): Promise<void> {
  const cache = await caches.open(DATA);
  await Promise.all(workUrls(manifest).map((u) => cache.delete(u)));
}
