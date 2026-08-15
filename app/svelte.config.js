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
  },
};

export default config;
