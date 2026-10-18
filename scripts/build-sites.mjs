import { spawnSync } from 'node:child_process';
import { cp, mkdir, readFile, rm } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
// npm.cmd cannot be spawned directly on Windows without a shell. Reuse npm's JS entry point.
const npmEntry = process.env.npm_execpath;
const result = spawnSync(npmEntry ? process.execPath : 'npm', [...(npmEntry ? [npmEntry] : []), '--prefix', 'sites', 'run', 'build'], {cwd: root, stdio: 'inherit'});
if (result.error) throw result.error;
if (result.status !== 0) process.exit(result.status ?? 1);
const manifest = JSON.parse(await readFile(new URL('../.openai/hosting.json', import.meta.url), 'utf8'));
if (manifest.static) throw new Error('Worker deployment must omit static configuration');
// Only replace generated deployment directories; dist/*.mjs and game data are source.
for (const name of ['server', 'client', '.openai']) {
  const target = new URL(`../dist/${name}/`, import.meta.url);
  await rm(target, {recursive:true, force:true});
  await mkdir(target, {recursive:true});
  await cp(new URL(`../sites/dist/${name}/`, import.meta.url), target, {recursive:true});
}
console.log('Sites Worker artifact staged in dist/server and dist/client; game source preserved.');
