import adapter from "@sveltejs/adapter-static";
import { vitePreprocess } from "@sveltejs/vite-plugin-svelte";

/** @type {import('@sveltejs/kit').Config} */
const config = {
  preprocess: vitePreprocess(),
  kit: {
    adapter: adapter({
      // SPA fallback: deep canonical-ref URLs resolve client-side.
      // Cloudflare Pages/Netlify serve this for unknown paths.
      fallback: "index.html",
    }),
    alias: {
      // Query-side analysis imports the indexer's own code so the two can
      // never disagree.
      $search: "../pipeline/src/search",
    },
    paths: {
      // Absolute asset URLs: the SPA fallback document is served for nested
      // routes (by hosts and by the service worker), where relative paths
      // would resolve against the deep path and 404.
      relative: false,
    },
  },
};

export default config;
