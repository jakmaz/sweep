import { compile } from 'svelte/compiler';
import { readFile, writeFile, unlink } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';

const popup = new URL('../entrypoints/popup/App.svelte', import.meta.url);
const temporaryScript = new URL('../entrypoints/popup/.popup-typecheck.ts', import.meta.url);
const source = await readFile(popup, 'utf8');
const result = compile(source, { filename: popup.pathname, generate: false });
if (result.warnings.length) {
  for (const warning of result.warnings) console.error(`${warning.code}: ${warning.message}`);
  process.exitCode = 1;
} else {
  const script = source.match(/<script lang="ts">([\s\S]*?)<\/script>/)?.[1];
  if (!script) throw new Error('Popup script was not found.');
  try {
    await writeFile(temporaryScript, script);
    const check = spawnSync('bunx', ['--no-install', 'tsc', '--noEmit'], { stdio: 'inherit' });
    process.exitCode = check.status ?? 1;
  } finally {
    await unlink(temporaryScript);
  }
}
