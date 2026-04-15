import { defineConfig } from 'wxt';
import { svelte, vitePreprocess } from '@sveltejs/vite-plugin-svelte';

export default defineConfig({
  manifestVersion: 3,
  runner: {
    binaries: {
      firefox: '/Applications/Zen.app/Contents/MacOS/zen',
    },
  },
  manifest: {
    name: 'Sweep',
    description: 'Browser tab garbage collector. Keep your memory lean.',
    permissions: ['tabs', 'storage', 'alarms'],
    action: {}
  },
  vite: () => ({
    resolve: {
      conditions: ['browser', 'svelte'],
    },
    plugins: [
      svelte({
        preprocess: vitePreprocess(),
      }),
    ],
  }),
});
