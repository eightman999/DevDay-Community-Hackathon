import { readdir, readFile, stat } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
const root = fileURLToPath(new URL('../',import.meta.url));
const files = [];
async function walk(dir) { for (const entry of await readdir(dir,{withFileTypes:true})) { const p=path.join(dir,entry.name); if(entry.isDirectory()) { if(!['vendor','node_modules','.git'].includes(entry.name)) await walk(p); } else files.push(p); } }
await walk(path.join(root,'dist'));
await walk(path.join(root,'scripts'));
let failed=false;
for(const file of files.filter(f=>/\.(m?js)$/.test(f))) {
  const result=spawnSync(process.execPath,['--check',file],{encoding:'utf8'});
  if(result.status!==0){ console.error(result.stderr);failed=true; }
  const code=await readFile(file,'utf8');
  for(const match of code.matchAll(/(?:from\s*|import\s*)['"](\.[^'"]+)['"]/g)){
    const target=path.resolve(path.dirname(file),match[1]);
    try {await stat(target);} catch { console.error('Missing import:',path.relative(root,file),match[1]);failed=true; }
  }
}
const html=await readFile(path.join(root,'dist/index.html'),'utf8');
for(const match of html.matchAll(/(?:src|href)="(\.\/[^"]+)"/g)) {
  if(match[1]==='./')continue;
  try {await stat(path.resolve(root,'dist',match[1]));} catch {console.error('Missing HTML asset:',match[1]);failed=true;}
}
if(failed)process.exit(1);
console.log(`Syntax and local asset checks passed (${files.length} files).`);
