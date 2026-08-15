import { browser } from "$app/environment";
import { workDir } from "./data";
import type { Manifest } from "./types";

const DATA = "cb-data-v1";

export function offlineSupported(): boolean {
  return browser && "caches" in window && "serviceWorker" in navigator;
}

// Ask the browser to exempt this origin from routine eviction. Chrome grants
// it silently on engagement, Firefox prompts, Safari clears site data after
// about a week without a visit unless granted — which is exactly the case
// this app cares about: books downloaded for a journey should still be there
// when the journey happens.
export async function requestPersistence(): Promise<boolean> {
  if (!browser || !navigator.storage?.persist) return false;
  if (await navigator.storage.persisted()) return true;
  try {
    return await navigator.storage.persist();
  } catch {
    return false;
  }
}

export async function isPersisted(): Promise<boolean> {
  if (!browser || !navigator.storage?.persisted) return false;
  return navigator.storage.persisted();
}

export function chunkUrls(manifest: Manifest): string[] {
  const base = workDir(manifest);
  return Object.values(manifest.chunkFiles).map((f) => `${base}/chunks/${f}`);
}

export function searchUrls(manifest: Manifest): string[] {
  const base = workDir(manifest);
  return (manifest.search ?? []).map((f) => `${base}/${f}`);
}

// The search index is roughly a quarter of a work's bytes and is only needed
// to search while offline, so it is a separate choice.
export function workUrls(manifest: Manifest, opts: { search?: boolean } = {}): string[] {
  return opts.search ? [...chunkUrls(manifest), ...searchUrls(manifest)] : chunkUrls(manifest);
}

export async function downloadWork(
  manifest: Manifest,
  opts: { search?: boolean; onProgress?: (done: number, total: number) => void } = {},
): Promise<void> {
  const cache = await caches.open(DATA);
  const urls = workUrls(manifest, { search: opts.search });
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
        opts.onProgress?.(done, urls.length);
      }),
    );
  }
}

export interface DownloadState {
  text: boolean;
  search: boolean;
}

export async function workDownloadState(manifest: Manifest): Promise<DownloadState> {
  if (!offlineSupported()) return { text: false, search: false };
  const cache = await caches.open(DATA);
  const has = async (urls: string[]) =>
    urls.length > 0 && (await Promise.all(urls.map((u) => cache.match(u)))).every(Boolean);
  return { text: await has(chunkUrls(manifest)), search: await has(searchUrls(manifest)) };
}

export async function removeWorkDownload(manifest: Manifest): Promise<void> {
  const cache = await caches.open(DATA);
  await Promise.all(workUrls(manifest, { search: true }).map((u) => cache.delete(u)));
}

export function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${Math.round(n / 1024)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}
