import {build} from 'esbuild';
import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
await fs.mkdir(path.join(root,'dist/vendor'),{recursive:true});
for(const file of ['pdf.mjs','pdf.worker.mjs'])await fs.copyFile(path.join(root,'node_modules/pdfjs-dist/build',file),path.join(root,'dist/vendor',file));
// One runtime exceeds the static host's 25 MiB/file limit. Use the exact
// lockfile-installed runtime's public CDN; no document content is sent there.
const ort=JSON.parse(await fs.readFile(path.join(root,'node_modules/onnxruntime-web/package.json'),'utf8'));
const base=`https://cdn.jsdelivr.net/npm/onnxruntime-web@${ort.version}/dist/`;
await fs.writeFile(path.join(root,'src/runtime-config.mjs'),`export const WASM_CDN_BASE=${JSON.stringify(base)};\n`);
await fs.writeFile(path.join(root,'data/runtime-manifest.json'),JSON.stringify({package:'onnxruntime-web',version:ort.version,base,reason:'Pinned public runtime CDN avoids the static host 25 MiB/file limit. Documents and queries remain local.'},null,2));
for(const file of await fs.readdir(path.join(root,'dist/vendor'))){if(file.startsWith('ort-wasm-'))await fs.rm(path.join(root,'dist/vendor',file));}
await build({entryPoints:[path.join(root,'src/ai-worker.mjs')],outfile:path.join(root,'dist/ai-worker.js'),bundle:true,format:'esm',platform:'browser',minify:true,target:['es2022'],conditions:['browser'],logLevel:'info'});
console.log('Browser worker and PDF parser prepared. Pinned WASM runtime:',base);
