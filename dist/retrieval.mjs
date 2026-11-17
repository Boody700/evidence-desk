export const STOP=new Set('a an and are as at be been being but by can could did do does for from had has have how i if in into is it its may more most no not of on or our should than that the their them there these they this those through to under was we were what when where which who why will with would you your'.split(' '));
export function tokens(text){return (String(text).normalize('NFKC').toLowerCase().match(/[\p{L}\p{N}]+/gu)||[]).filter(t=>!STOP.has(t)&&t.length>1);}
export function cleanText(text){return String(text).normalize('NFKC').replace(/([a-zA-Z])-\s*\n\s*([a-z])/g,'$1$2').replace(/\u0000/g,'').replace(/[\uFFFD]/g,'"').replace(/\s+/g,' ').trim();}
export function chunkPages(doc,{size=160,overlap=30}={}){
  if(size<=overlap||overlap<0)throw new Error('Invalid chunk settings');
  const chunks=[];
  for(const page of doc.pages){const text=cleanText(page.text),words=text.split(/\s+/);if(words.length<12)continue;
    for(let start=0;start<words.length;start+=size-overlap){const part=words.slice(start,start+size).join(' ');if(tokens(part).length<8)continue;chunks.push({id:`${doc.id}:p${page.number}:w${start}`,docId:doc.id,page:page.number,title:doc.title,text:part,startWord:start});if(start+size>=words.length)break;}
  }return chunks;
}
export function makeIndex(chunks){
  const terms=chunks.map(c=>tokens(c.text)),frequencies=terms.map(row=>{const m=new Map();for(const t of row)m.set(t,(m.get(t)||0)+1);return m;}),df=new Map();
  for(const m of frequencies)for(const t of m.keys())df.set(t,(df.get(t)||0)+1);
  return {chunks,terms,frequencies,df,averageLength:terms.reduce((n,r)=>n+r.length,0)/Math.max(1,terms.length)};
}
export function bm25(index,question){
  const query=[...new Set(tokens(question))],N=index.chunks.length;
  return index.chunks.map((_,i)=>query.reduce((score,t)=>{const tf=index.frequencies[i].get(t)||0;if(!tf)return score;const count=index.df.get(t)||0,idf=Math.log(1+(N-count+.5)/(count+.5));return score+idf*tf*2.2/(tf+1.2*(.25+.75*index.terms[i].length/index.averageLength));},0));
}
export function dot(a,b){if(a.length!==b.length)throw new Error('Embedding dimensions differ');let s=0;for(let i=0;i<a.length;i++)s+=a[i]*b[i];return s;}
export function alignSpan(decoded,context){
  // Tokenizer decoding may insert spaces around punctuation. Map the decoded
  // token sequence back to an exact source substring rather than dropping it
  // or presenting reconstructed text as a verbatim quotation.
  const pattern=/[\p{L}\p{N}]+/gu,answer=[...String(decoded).normalize('NFKC').matchAll(pattern)].map(m=>m[0].toLowerCase());
  if(!answer.length)return null;
  const source=[...context.matchAll(pattern)];
  for(let i=0;i<=source.length-answer.length;i++)if(answer.every((t,j)=>source[i+j][0].normalize('NFKC').toLowerCase()===t))return context.slice(source[i].index,source[i+answer.length-1].index+source[i+answer.length-1][0].length);
  return null;
}
export function retrieve(index,question,queryVector=null,{mode='hybrid',limit=5,docIds=null}={}){
  const lexical=bm25(index,question),eligible=index.chunks.map((c,i)=>i).filter(i=>!docIds||docIds.includes(index.chunks[i].docId));
  const semantics=index.chunks.map(c=>queryVector&&c.vector?dot(c.vector,queryVector):0);
  const lexRank=eligible.slice().sort((a,b)=>lexical[b]-lexical[a]||a-b),semRank=eligible.slice().sort((a,b)=>semantics[b]-semantics[a]||a-b);
  const lr=new Map(lexRank.map((v,i)=>[v,i+1])),sr=new Map(semRank.map((v,i)=>[v,i+1]));
  const ranked=eligible.map(i=>({...index.chunks[i],lexical:lexical[i],semantic:semantics[i],score:mode==='lexical'?lexical[i]:mode==='semantic'?semantics[i]:(lexical[i]>0?1/(60+lr.get(i)):0)+(queryVector?1/(60+sr.get(i)):0)})).sort((a,b)=>b.score-a.score||a.id.localeCompare(b.id));
  // At most one excerpt per physical page in the visible evidence list.
  const seen=new Set(),out=[];for(const c of ranked){const key=c.docId+':'+c.page;if(seen.has(key))continue;seen.add(key);out.push(c);if(out.length===limit)break;}return out;
}
export async function extractAnswer(question,evidence,qa){
  const candidates=[];
  // The retrieval decision selects the context; uncalibrated QA scores must not
  // promote a less relevant page simply because its reader score is higher.
  for(const c of evidence.slice(0,1)){const result=await qa(question,c.text);const r=Array.isArray(result)?result[0]:result,aligned=r&&typeof r.answer==='string'?alignSpan(r.answer,c.text):null;if(aligned)candidates.push({answer:aligned,extractionScore:r.score,semantic:c.semantic,chunkId:c.id,docId:c.docId,page:c.page,rankScore:r.score*Math.max(0,c.semantic)});}
  return candidates.sort((a,b)=>b.rankScore-a.rankScore)[0]||null;
}
export function acceptAnswer(candidate,policy){return !!candidate&&candidate.semantic>=policy.minSemantic&&candidate.extractionScore>=policy.minExtraction&&candidate.answer.trim().length>1;}
export function normalizeAnswer(s){return String(s).normalize('NFKC').toLowerCase().replace(/[^\p{L}\p{N}\s]/gu,' ').replace(/\b(a|an|the)\b/g,' ').replace(/\s+/g,' ').trim();}
export function answerF1(prediction,gold){const a=normalizeAnswer(prediction).split(' ').filter(Boolean),b=normalizeAnswer(gold).split(' ').filter(Boolean);if(!a.length||!b.length)return Number(!a.length&&!b.length);const freq=new Map();for(const x of b)freq.set(x,(freq.get(x)||0)+1);let hit=0;for(const x of a)if(freq.get(x)>0){hit++;freq.set(x,freq.get(x)-1);}return hit?2*hit/(a.length+b.length):0;}
