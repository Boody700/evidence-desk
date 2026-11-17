import {pipeline,env} from '@huggingface/transformers';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
env.cacheDir=path.join(root,'.cache/models');
env.allowLocalModels=false;
export const MODEL_IDS={embedding:'Xenova/all-MiniLM-L6-v2',qa:'Xenova/distilbert-base-cased-distilled-squad',embeddingRevision:'751bff37182d3f1213fa05d7196b954e230abad9',qaRevision:'bdbb0a5e9c617c3c7ea9f3cbaf2be3ad871bcd7d'};
export async function loadModels({qa=false}={}){
  console.log('Loading quantized sentence encoder...',MODEL_IDS.embedding);
  const encoder=await pipeline('feature-extraction',MODEL_IDS.embedding,{dtype:'q8',device:'cpu',revision:MODEL_IDS.embeddingRevision});
  let reader=null;
  if(qa){console.log('Loading extractive QA model...',MODEL_IDS.qa);reader=await pipeline('question-answering',MODEL_IDS.qa,{dtype:'q8',device:'cpu',revision:MODEL_IDS.qaRevision});}
  return {encoder,reader};
}
export async function embed(encoder,text){const result=await encoder(text,{pooling:'mean',normalize:true});return Array.from(result.data);}
