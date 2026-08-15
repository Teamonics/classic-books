import { sveltekit } from "@sveltejs/kit/vite";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [sveltekit()],
  server: {
    fs: {
      // static/data is a symlink to ../build (pipeline output)
      allow: [".."],
    },
  },
});
