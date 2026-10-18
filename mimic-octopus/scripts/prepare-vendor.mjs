import { existsSync, mkdirSync, copyFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const source = `${root}node_modules/three/`;
const destination = `${root}dist/vendor/`;
const files = [
  ['build/three.module.min.js', 'three.module.js'],
  ['build/three.core.min.js', 'three.core.min.js'],
  ['LICENSE', 'THREE-LICENSE.txt'],
];
if (existsSync(`${source}package.json`)) {
  mkdirSync(destination, { recursive: true });
  for (const [from, to] of files) copyFileSync(`${source}${from}`, `${destination}${to}`);
  console.log('Three.js renderer assets are ready.');
} else if (!files.every(([, to]) => existsSync(`${destination}${to}`))) {
  console.error('描画ライブラリを準備するため、まず npm install を実行してください。');
  process.exitCode = 1;
}
