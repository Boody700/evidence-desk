import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import crypto from 'node:crypto';
import {makeIndex,retrieve,extractAnswer,acceptAnswer,answerF1,normalizeAnswer} from '../dist/retrieval.mjs';
import {loadModels,embed} from './models.mjs';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const corpus=JSON.parse(await fs.readFile(path.join(root,'dist/corpus.json'),'utf8'));
const legacy=JSON.parse(await fs.readFile(path.join(root,'data/benchmark.json'),'utf8')).map(q=>({...q,split:q.split==='test'?'diagnostic':q.split}));
const fresh=JSON.parse(await fs.readFile(path.join(root,'data/fresh-test.json'),'utf8'));
const benchmark=[...legacy,...fresh];
const {encoder,reader}=await loadModels({qa:true});
const index=makeIndex(corpus.chunks),results=[];
async function retrieveQuestion(q){
  const vector=await embed(encoder,q.question),modes={};
  for(const mode of ['lexical','semantic','hybrid']){
    const found=retrieve(index,q.question,vector,{mode,limit:5});
    const rank=q.answers.length?found.findIndex(c=>c.docId===q.docId&&q.pages.includes(c.page))+1:0;
    modes[mode]={hit1:rank===1,hit3:rank>0&&rank<=3,hit5:rank>0,mrr:rank>0?1/rank:0};
  }
  return {...q,modes,vector};
}
const dev=[];
for(const q of benchmark.filter(q=>q.split==='development'))dev.push(await retrieveQuestion(q));
const retrievalMode=['lexical','semantic','hybrid'].sort((a,b)=>dev.filter(q=>q.answers.length).reduce((n,q)=>n+q.modes[b].mrr-q.modes[a].mrr,0))[0];
console.log('Retrieval selected on development MRR:',retrievalMode);
async function answerQuestion(q){const evidence=retrieve(index,q.question,q.vector,{mode:retrievalMode,limit:5});const candidate=await extractAnswer(q.question,evidence,reader);const {vector,...rest}=q;return {...rest,candidate,evidence:evidence.map(({vector,...c})=>c)};}
for(let i=0;i<dev.length;i++)dev[i]=await answerQuestion(dev[i]);
function decisionMetrics(rows,policy){let tp=0,fp=0,tn=0,fn=0;for(const r of rows){const accept=acceptAnswer(r.candidate,policy),expected=r.answers.length>0;if(accept&&expected)tp++;else if(accept)fp++;else if(expected)fn++;else tn++;}return {tp,fp,tn,fn,balancedAccuracy:(tp/(tp+fn)+tn/(tn+fp))/2};}
const choices=[];
for(const minSemantic of [.2,.25,.3,.35,.4,.45,.5])for(const minExtraction of [.03,.06,.1,.2,.35]){const p={minSemantic,minExtraction,retrievalMode},m=decisionMetrics(dev,p);choices.push({policy:p,...m});}
choices.sort((a,b)=>b.balancedAccuracy-a.balancedAccuracy||a.fp-b.fp||b.policy.minSemantic-a.policy.minSemantic||b.policy.minExtraction-a.policy.minExtraction);
const policy=choices[0].policy;
results.push(...dev);
// Freeze retrieval and abstention policy before scoring either subsequent set.
for(const q of benchmark.filter(q=>q.split!=='development')){const result=await answerQuestion(await retrieveQuestion(q));results.push(result);console.log(q.id,'candidate:',JSON.stringify(result.candidate?.answer));}
const test=results.filter(q=>q.split==='test');
function summarize(rows){
  const answerable=rows.filter(q=>q.answers.length),accepted=rows.filter(q=>acceptAnswer(q.candidate,policy));
  const retrieval=Object.fromEntries(['lexical','semantic','hybrid'].map(mode=>[mode,Object.fromEntries(['hit1','hit3','hit5','mrr'].map(metric=>[metric,answerable.reduce((n,q)=>n+Number(q.modes[mode][metric]),0)/answerable.length]))]));
  const f1=answerable.reduce((n,q)=>n+(acceptAnswer(q.candidate,policy)?Math.max(...q.answers.map(a=>answerF1(q.candidate.answer,a))):0),0)/answerable.length;
  const exact=answerable.filter(q=>acceptAnswer(q.candidate,policy)&&q.answers.some(a=>normalizeAnswer(a)===normalizeAnswer(q.candidate.answer))).length/answerable.length;
  const citationCorrect=answerable.filter(q=>acceptAnswer(q.candidate,policy)&&q.candidate.docId===q.docId&&q.pages.includes(q.candidate.page)).length;
  const spanContainment=accepted.filter(q=>q.evidence.some(c=>c.id===q.candidate.chunkId&&c.text.includes(q.candidate.answer))).length/Math.max(1,accepted.length);
  return {questions:rows.length,answerable:answerable.length,unanswerable:rows.length-answerable.length,retrieval,answerability:decisionMetrics(rows,policy),answerF1:f1,answerExactMatch:exact,correctPageAnswers:citationCorrect,acceptedAnswers:accepted.length,spanContainment};
}
const report={policy,selection:'Retrieval strategy selected by development-only mean reciprocal rank. Abstention gates selected by development-only balanced answerability accuracy; ties prefer fewer unsupported answers, then stricter gates.',development:summarize(dev),diagnostic:summarize(results.filter(q=>q.split==='diagnostic')),test:summarize(test),results:results.map(q=>({...q,accepted:acceptAnswer(q.candidate,policy),f1:q.answers.length&&q.candidate?Math.max(...q.answers.map(a=>answerF1(q.candidate.answer,a))):null})),limitations:['Small hand-written diagnostic set, not a representative production benchmark.','Citation containment proves a span occurs in its source; it does not prove the answer is correct.','Model extraction scores are not calibrated correctness probabilities.','The initial test exposed design problems and is now labeled diagnostic. A fresh final test is scored after development-only policy selection.','Gold page annotations are not exhaustive: another source page may support the same fact.']};
const modelAssets=[];
async function collect(dir){for(const entry of await fs.readdir(dir,{withFileTypes:true})){const p=path.join(dir,entry.name);if(entry.isDirectory())await collect(p);else{const bytes=await fs.readFile(p);modelAssets.push({path:path.relative(path.join(root,'.cache/models'),p).replaceAll('\\','/'),bytes:bytes.length,sha256:crypto.createHash('sha256').update(bytes).digest('hex')});}}}
const pinned=JSON.parse(await fs.readFile(path.join(root,'data/model-revisions.json'),'utf8'));
for(const name of ['embedding','qa'])await collect(path.join(root,'.cache/models',pinned[name].id,pinned[name].revision));
report.modelAssets=modelAssets;
report.modelRevisions=pinned;
for(const name of ['embedding','qa']){const m=report.modelRevisions[name],asset=modelAssets.find(a=>a.path.includes(m.id+'/')&&a.path.endsWith('/onnx/model_quantized.onnx')&&a.sha256===m.onnx_sha256);if(!asset)throw new Error('Model weight checksum mismatch: '+name);}
report.limitations.push('Final-test results were rerun after fixing deterministic tokenizer-to-source span alignment; retrieval selection and gate choices were unchanged.');
await fs.writeFile(path.join(root,'dist/evaluation.json'),JSON.stringify(report));
await fs.writeFile(path.join(root,'data/policy.json'),JSON.stringify(policy,null,2));
await fs.writeFile(path.join(root,'reports/evaluation.json'),JSON.stringify(report,null,2));
console.log(JSON.stringify({policy,test:report.test},null,2));
await encoder.dispose();await reader.dispose();
