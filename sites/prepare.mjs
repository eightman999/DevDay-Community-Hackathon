import {cp, mkdir, readdir, rm} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
const here = path.dirname(fileURLToPath(import.meta.url));
const source = path.resolve(here, '../dist');
const target = path.join(here, 'public');
await rm(target, {recursive: true, force: true});
await mkdir(target, {recursive: true});
for (const name of await readdir(source)) {
  if (['server', 'client', '.openai'].includes(name)) continue;
  await cp(path.join(source, name), path.join(target, name), {recursive: true});
}
