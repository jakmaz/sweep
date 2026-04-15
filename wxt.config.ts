import { defineConfig } from "wxt";
import { svelte, vitePreprocess } from "@sveltejs/vite-plugin-svelte";

export default defineConfig({
  manifestVersion: 3,
  id: "sweep@jakmaz",
  version: "1.0.0",
  manifest: {
    name: "Sweep",
    description: "Focus on what matters. Sweep the rest.",
    version: "1.0.0",
    author: "jakmaz",
    homepage_url: "https://github.com/jakmaz/sweep",
    permissions: ["tabs", "storage", "alarms"],
    browser_specific_settings: {
      gecko: {
        id: "sweep@jakmaz",
      },
    },
    data_collection_permissions: {
      feedback: false,
    },
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
      "256": "/icon.svg",
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
