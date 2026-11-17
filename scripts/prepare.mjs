import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {getDocument} from 'pdfjs-dist/legacy/build/pdf.mjs';
import {chunkPages} from '../dist/retrieval.mjs';
import {loadModels,embed,MODEL_IDS} from './models.mjs';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const sources=[{id:'ai-rmf',title:'AI Risk Management Framework 1.0',file:'ai-rmf.pdf',url:'https://nvlpubs.nist.gov/nistpubs/ai/nist.ai.100-1.pdf',published:'January 2023',citation:'NIST AI 100-1 · 2023'},{id:'genai-profile',title:'Generative AI Profile',file:'genai-profile.pdf',url:'https://nvlpubs.nist.gov/nistpubs/ai/NIST.AI.600-1.pdf',published:'July 2024',citation:'NIST AI 600-1 · 2024'}];
const docs=[],chunks=[];
for(const source of sources){
  const filename=path.join(root,'data',source.file);let bytes;
  try{bytes=await fs.readFile(filename);}catch{const response=await fetch(source.url);if(!response.ok)throw new Error('Source download failed: '+response.status);bytes=Buffer.from(await response.arrayBuffer());await fs.writeFile(filename,bytes);}
  const pdf=await getDocument({data:new Uint8Array(bytes),useSystemFonts:true,isEvalSupported:false}).promise;
  const pages=[];
  for(let n=1;n<=pdf.numPages;n++){const page=await pdf.getPage(n);const text=await page.getTextContent();pages.push({number:n,text:text.items.map(item=>item.str+(item.hasEOL?'\n':' ')).join('')});}
  const doc={...source,sha256:crypto.createHash('sha256').update(bytes).digest('hex'),pageCount:pdf.numPages,pages};docs.push(doc);chunks.push(...chunkPages(doc));await pdf.destroy();console.log(source.id,pages.length,'PDF pages');
}
const {encoder}=await loadModels();
for(let i=0;i<chunks.length;i++){chunks[i].vector=(await embed(encoder,chunks[i].text)).map(x=>Math.round(x*1e6)/1e6);if(i%40===0)console.log('Embedded',i,'/',chunks.length);}
const corpus={version:1,chunking:{words:160,overlap:30},models:MODEL_IDS,docs,chunks};
await fs.writeFile(path.join(root,'dist/corpus.json'),JSON.stringify(corpus));
await fs.writeFile(path.join(root,'data/source-manifest.json'),JSON.stringify({sources:docs.map(({pages,...d})=>d),chunkCount:chunks.length,models:MODEL_IDS},null,2));
console.log('Prepared',chunks.length,'page-bound chunks from',docs.length,'publications.');
await encoder.dispose();
