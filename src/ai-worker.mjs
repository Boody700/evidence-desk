import {pipeline,env} from '@huggingface/transformers';
import {makeIndex,retrieve,extractAnswer,acceptAnswer} from '../dist/retrieval.mjs';
import {WASM_CDN_BASE} from './runtime-config.mjs';
env.allowLocalModels=false;
env.backends.onnx.wasm.numThreads=1;
env.backends.onnx.wasm.wasmPaths=WASM_CDN_BASE;
let chunks=[],index=null,encoderPromise=null,readerPromise=null,config=null;
const send=(id,type,data={})=>self.postMessage({id,type,...data});
function progress(id,label){return p=>{if(p.status==='progress')send(id,'progress',{detail:`${label}: ${p.file||'model weights'}`,progress:p.progress||0});else if(p.status==='initiate')send(id,'progress',{detail:`Loading ${label}. First use downloads public model files.`,progress:null});};}
async function encoder(id){if(!encoderPromise)encoderPromise=pipeline('feature-extraction',config.embedding,{dtype:'q8',device:'wasm',revision:config.embeddingRevision||'main',progress_callback:progress(id,'sentence encoder')}).catch(error=>{encoderPromise=null;throw error;});return encoderPromise;}
async function reader(id){if(!readerPromise)readerPromise=pipeline('question-answering',config.qa,{dtype:'q8',device:'wasm',revision:config.qaRevision||'main',progress_callback:progress(id,'answer reader')}).catch(error=>{readerPromise=null;throw error;});return readerPromise;}
async function vector(pipe,text){const tensor=await pipe(text,{pooling:'mean',normalize:true});return Array.from(tensor.data);}
self.onmessage=async event=>{const {id,type,...data}=event.data;
  try{
    if(type==='init'){chunks=data.chunks;config=data.models;index=makeIndex(chunks);send(id,'ready');return;}
    if(type==='remove'){chunks=chunks.filter(c=>c.docId!==data.docId);index=makeIndex(chunks);send(id,'removed');return;}
    if(type==='index'){
      if(!data.withEmbeddings){chunks.push(...data.chunks);index=makeIndex(chunks);send(id,'indexed',{chunks:data.chunks});return;}
      const pipe=await encoder(id),fresh=[];
      for(let i=0;i<data.chunks.length;i++){fresh.push({...data.chunks[i],vector:await vector(pipe,data.chunks[i].text)});if(i%3===0)send(id,'progress',{detail:`Indexing passage ${i+1} of ${data.chunks.length}`,progress:100*(i+1)/data.chunks.length});}
      chunks.push(...fresh);index=makeIndex(chunks);send(id,'indexed',{chunks:fresh});return;
    }
    if(type==='ask'){
      let query=null,qa=null;
      if(data.mode==='ai'){send(id,'progress',{detail:'Preparing the on-device models…',progress:null});const both=await Promise.all([encoder(id),reader(id)]);const missing=chunks.filter(c=>!c.vector&&(!data.docIds||data.docIds.includes(c.docId)));for(let i=0;i<missing.length;i++){send(id,'progress',{detail:`Preparing document embedding ${i+1} of ${missing.length}`,progress:100*(i+1)/missing.length});missing[i].vector=await vector(both[0],missing[i].text);}query=await vector(both[0],data.question);qa=both[1];}
      send(id,'progress',{detail:'Finding supporting pages…',progress:null});
      const evidence=retrieve(index,data.question,query,{mode:data.mode==='ai'?(data.policy.retrievalMode||'lexical'):'lexical',limit:5,docIds:data.docIds}).filter(c=>data.mode==='ai'||c.lexical>0);
      let candidate=null;
      if(qa&&evidence.length){send(id,'progress',{detail:'Extracting an answer from the strongest passages…',progress:null});candidate=await extractAnswer(data.question,evidence,qa);}
      send(id,'answer',{candidate,accepted:data.mode==='ai'&&acceptAnswer(candidate,data.policy),evidence:evidence.map(({vector,...c})=>c),mode:data.mode});return;
    }
    throw new Error('Unknown worker action');
  }catch(error){send(id,'error',{message:error.message||'The local model could not complete the request.'});}
};
