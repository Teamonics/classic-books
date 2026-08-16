/// <reference types="@sveltejs/kit" />
/// <reference lib="webworker" />

import { base, build, files, version } from "$service-worker";

const sw = self as unknown as ServiceWorkerGlobalScope;

const SHELL = `cb-shell-${version}`;
const DATA = "cb-data-v1";

// App shell: generated assets + static files, excluding the text corpus
// (cached on demand or via explicit per-work download).
const shellAssets = [...build, ...files.filter((f) => !f.startsWith(`${base}/data/`))];

const isHashedData = (url: URL) =>
  url.pathname.startsWith(`${base}/data/`) && /\.[0-9a-f]{12}\.json$/.test(url.pathname);
const isMutableData = (url: URL) =>
  url.pathname === `${base}/data/catalog.json` ||
  url.pathname === `${base}/data/sources.json` ||
  url.pathname === `${base}/data/passages.json`;

sw.addEventListener("install", (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(SHELL);
      await cache.addAll(shellAssets);
      // the SPA fallback document, used for every navigation when offline
      try {
        const res = await fetch(`${base}/`);
        if (res.ok) await cache.put(`${base}/`, res);
      } catch {
        /* offline install */
      }
      await sw.skipWaiting();
    })(),
  );
});

sw.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      for (const key of await caches.keys()) {
        if (key.startsWith("cb-shell-") && key !== SHELL) await caches.delete(key);
      }
      await sw.clients.claim();
    })(),
  );
});

sw.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin !== location.origin) return;

  // Navigations: network first, cached shell document when offline.
  if (req.mode === "navigate") {
    event.respondWith(
      (async () => {
        try {
          return await fetch(req);
        } catch {
          const cached = await caches.match(`${base}/`);
          return cached ?? Response.error();
        }
      })(),
    );
    return;
  }

  // Immutable content: cache-first, populate on first fetch.
  if (isHashedData(url) || url.pathname.startsWith(`${base}/_app/immutable/`)) {
    event.respondWith(
      (async () => {
        const cacheName = isHashedData(url) ? DATA : SHELL;
        const cached = await caches.match(req);
        if (cached) return cached;
        const res = await fetch(req);
        if (res.ok) {
          const cache = await caches.open(cacheName);
          void cache.put(req, res.clone());
        }
        return res;
      })(),
    );
    return;
  }

  // Mutable pointers: network first, cache fallback.
  if (isMutableData(url) || shellAssets.includes(url.pathname)) {
    event.respondWith(
      (async () => {
        try {
          const res = await fetch(req);
          if (res.ok) {
            const cache = await caches.open(isMutableData(url) ? DATA : SHELL);
            void cache.put(req, res.clone());
          }
          return res;
        } catch {
          const cached = await caches.match(req);
          return cached ?? Response.error();
        }
      })(),
    );
  }
});
