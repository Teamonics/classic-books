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
  },
};

export default config;
