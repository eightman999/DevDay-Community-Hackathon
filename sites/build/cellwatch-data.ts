import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import type {Plugin} from 'vite';

// CSV stays canonical in ../dist; Workers have no deployment filesystem.
export function cellwatchData(): Plugin {
  const read = (name: string) => readFileSync(new URL(`../../dist/data/${name}`, import.meta.url), 'utf8');
  const catalogPath = fileURLToPath(new URL('../../dist/catalog.mjs', import.meta.url));
  const threatsPath = fileURLToPath(new URL('../../dist/threats.mjs', import.meta.url));
  return {
    name: 'cellwatch-csv', enforce: 'pre',
    transform(code, id) {
      if (id.split('?')[0] === catalogPath) {
        const replacement = `async function readCatalogFile(name) { return ${JSON.stringify({'vulnerabilities.csv':read('vulnerabilities.csv'),'incidents.csv':read('incidents.csv')})}[name]; }`;
        return code.replace(/async function readCatalogFile\(name\) \{[\s\S]*?\n\}/, replacement);
      }
      if (id.split('?')[0] === threatsPath) {
        return code.replace(/async function readThreats\(\) \{[\s\S]*?\n\}/, `async function readThreats() { return ${JSON.stringify(read('attack-patterns.csv'))}; }`);
      }
    },
  };
}
