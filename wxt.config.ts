import { defineConfig } from "wxt";
import { svelte, vitePreprocess } from "@sveltejs/vite-plugin-svelte";

export default defineConfig({
  manifestVersion: 3,
  manifest: {
    name: "Sweep",
    description: "Focus on what matters. Sweep the rest.",
    version: "1.0.0",
    author: "jakmaz",
    homepage_url: "https://github.com/jakmaz/sweep",
    permissions: ["tabs", "storage", "alarms"],
    action: {
      default_icon: {
        "16": "/icon.svg",
        "32": "/icon.svg",
        "48": "/icon.svg",
      },
    },
    icons: {
      "48": "/icon.svg",
      "96": "/icon.svg",
      "128": "/icon.svg",
    },
  },
  vite: () => ({
    resolve: {
      conditions: ["browser", "svelte"],
    },
    plugins: [
      svelte({
        preprocess: vitePreprocess(),
      }),
    ],
  }),
});
