import adapter from "@sveltejs/adapter-static";
import { vitePreprocess } from "@sveltejs/vite-plugin-svelte";

// BASE_PATH lets the same build serve from a domain root (Cloudflare Pages,
// Netlify, a user/org GitHub Pages site) or from a subdirectory
// (a GitHub project page: BASE_PATH=/classic-books).
const base = process.env.BASE_PATH ?? "";

/** @type {import('@sveltejs/kit').Config} */
const config = {
  preprocess: vitePreprocess(),
  kit: {
    adapter: adapter({
      // GitHub Pages has no rewrite rules: it serves 404.html for any path it
      // does not recognise, which is exactly where the SPA shell belongs so
      // that deep canonical refs like /plato/republic/7 boot the reader.
      // The build copies this to index.html as well.
      fallback: "404.html",
    }),
    alias: {
      // Query-side analysis imports the indexer's own code so the two can
      // never disagree.
      $search: "../pipeline/src/search",
    },
    paths: {
      base,
      // Absolute asset URLs: the fallback document is served for nested
      // routes, where relative paths would resolve against the deep path.
      relative: false,
    },
  },
};

export default config;
