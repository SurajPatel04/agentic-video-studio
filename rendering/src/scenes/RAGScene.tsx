import type {CSSProperties, PropsWithChildren} from 'react';
import {z} from 'zod';
import {LearningBoard, LearningCard, useLearningLayout, valueText} from '../components/LearningBoard';
import {lectureColors} from '../components/LectureBoard';
import {PAPER} from '../iso/iso';
import {fraction, MONO} from './paperStage';

const component=z.number().min(-10).max(10);
const vector=z.tuple([component,component,component]);
const passage=z.object({id:z.string().min(1).max(12),title:z.string().min(1).max(32),
  text:z.string().min(1).max(105),vector}).strict();
const cue=z.object({at:fraction}).strict();

export const ragSceneSchema=z.object({
  title:z.string().max(76).default('From a question to a grounded answer'),
  tokens:z.array(z.object({text:z.string().min(1).max(23),id:z.number().int().nonnegative(),at:fraction}).strict()).min(2).max(9).default([
    {text:'When',id:12,at:0.12},{text:' does',id:37,at:0.145},{text:' the',id:8,at:0.17},
    {text:' library',id:65,at:0.195},{text:' close',id:81,at:0.22},{text:' on',id:9,at:0.245},
    {text:' Friday',id:29,at:0.27},{text:'?',id:4,at:0.295},
  ]),
  queryVector:vector.default([0.2,0.9,0.5]),
  passages:z.array(passage).min(2).max(3).default([
    {id:'1',title:'Friday hours',text:'Friday hours: 9 a.m. to 6 p.m.',vector:[0.2,0.8,0.5]},
    {id:'2',title:'Borrowing rules',text:'Books may be borrowed for three weeks.',vector:[0.8,0.13,-0.1]},
    {id:'3',title:'Weekend hours',text:'Saturday hours: 10 a.m. to 4 p.m.',vector:[0.4,0.3,0.7]},
  ]),
  answer:z.string().min(1).max(120).default('The library closes at 6 p.m. on Friday.'),
  evidenceFocus:z.string().min(1).max(45).optional(),
  embedding:cue.default({at:0.38}), search:cue.default({at:0.53}),
  context:cue.default({at:0.71}), generation:cue.default({at:0.85}),
}).strict().superRefine((p,ctx)=>{
  if(p.tokens.some((t,i)=>i>0&&t.at<p.tokens[i-1].at) || p.tokens.at(-1)!.at>=p.embedding.at ||
    p.embedding.at>=p.search.at || p.search.at>=p.context.at || p.context.at>=p.generation.at) ctx.addIssue({
      code:'custom',path:['embedding','at'],message:'Reveal tokens, embedding, search, context and answer in that order.',
    });
  if(new Set(p.passages.map(d=>d.id)).size!==p.passages.length ||
    [p.queryVector,...p.passages.map(d=>d.vector)].some(value=>Math.hypot(...value)===0)) ctx.addIssue({
      code:'custom',path:['passages'],message:'Use distinct evidence IDs and nonzero vectors for cosine similarity.',
    });
  else if(p.evidenceFocus && !rank(p.queryVector,p.passages)[0].text.includes(p.evidenceFocus)) ctx.addIssue({
    code:'custom',path:['evidenceFocus'],message:'Use exact text from the retrieved passage.',
  });
});

export const description='Animate retrieval-augmented generation on one board. Highlight query pieces as token chips and IDs appear, show an illustrative embedding of the whole query, compute cosine rankings against passage vectors, and use the top passage as cited context. Supply timed stages and optional exact evidenceFocus.';
export const tags=['rag','retrieval augmented generation','query tokenization','embedding','vector search','grounding','retrieved passage','citation','llm'];

type Vector=z.output<typeof vector>;
function rank(query:Vector, passages:z.output<typeof passage>[]) {
  return passages.map(item=>({...item,score:query.reduce((sum,n,i)=>sum+n*item.vector[i],0)/
    (Math.hypot(...query)*Math.hypot(...item.vector))})).sort((a,b)=>b.score-a.score);
}

function CiteText({text,focus}: {text:string;focus:string|undefined}) {
  const i=focus?text.indexOf(focus):-1;
  return i<0 || !focus ? <>{text}</> : <>{text.slice(0,i)}<mark style={{background:'#ffdf9a',color:PAPER.ink}}>{focus}</mark>{text.slice(i+focus.length)}</>;
}

function Entry({amount, children}:PropsWithChildren<{amount:number}>) {
  return <div style={{opacity:amount,transform:`translateY(${(1-amount)*7}px)`,minWidth:0}}>{children}</div>;
}

export function RAGScene(input:z.input<typeof ragSceneSchema>) {
  const p=ragSceneSchema.parse(input), t=useLearningLayout(), u=t.u;
  const question=p.tokens.map(v=>v.text).join('');
  const picked=rank(p.queryVector,p.passages), best=picked[0];
  const active=p.tokens.filter(token=>t.cueFrame(token.at)<=t.frame).at(-1);
  const tokenizing=t.frame<t.cueFrame(p.embedding.at);
  const stage=(at:number)=>t.progress(at,0.42);
  const answerWords=p.answer.split(/(?<=\s)/);
  const written=Math.ceil(answerWords.length*t.progress(p.generation.at,0.85));
  const small:CSSProperties={fontSize:19*u,color:PAPER.inkSoft,marginTop:6*u};
  return <LearningBoard title={p.title} subtitle="Illustrative tokenizer, embeddings and passages">
    <LearningCard title="1. Query and tokens">
      <div style={{whiteSpace:'pre-wrap',fontSize:29*u,fontWeight:650}}>
        {p.tokens.map((token,i)=><span key={i} style={{background:tokenizing&&active===token?lectureColors[2].fill:undefined}}>{token.text}</span>)}
      </div>
      <div style={{display:'flex',flexWrap:'wrap',gap:6*u,marginTop:8*u}}>
        {p.tokens.map((token,i)=><Entry key={i} amount={stage(token.at)}>
          <div style={{background:lectureColors[i%5].fill,borderRadius:6*u,padding:`${3*u}px ${8*u}px`,fontSize:17*u,fontFamily:MONO}}>
            {token.text.replaceAll(' ','·')} <b>#{token.id}</b>
          </div>
        </Entry>)}
      </div>
    </LearningCard>
    <div style={{display:'grid',gridTemplateColumns:t.portrait?'1fr':'0.85fr 1.35fr',gap:12*u}}>
      <Entry amount={stage(p.embedding.at)}><LearningCard title="2. Embed the whole query" tint={lectureColors[0].fill}>
        <div style={{fontFamily:MONO,fontSize:23*u}}>[{p.queryVector.map(valueText).join(', ')}]</div>
        <div style={small}>The embedding model represents the entire query as one vector.</div>
      </LearningCard></Entry>
      <Entry amount={stage(p.search.at)}><LearningCard title="3. Compare with passage vectors">
        {picked.map((item,i)=><div key={item.id} style={{display:'grid',gridTemplateColumns:'minmax(0,1.3fr) minmax(0,1fr) 60px',
          alignItems:'center',gap:7*u,padding:`${3*u}px ${7*u}px`,background:i===0?lectureColors[1].fill:undefined,fontSize:18*u}}>
          <strong>[{item.id}] {item.title}</strong>
          <span style={{fontFamily:MONO}}>[{item.vector.map(valueText).join(', ')}]</span>
          <b style={{textAlign:'right'}}>{valueText(item.score)}</b>
        </div>)}
        <div style={small}>Cosine similarity ranks the passages. The top match is retrieved.</div>
      </LearningCard></Entry>
    </div>
    <div style={{display:'grid',gridTemplateColumns:t.portrait?'1fr':'1.15fr 1fr',gap:12*u}}>
      <Entry amount={stage(p.context.at)}><LearningCard title="4. Supply the context">
        <div style={{fontSize:20*u}}>{question}</div>
        <div style={{fontSize:21*u,marginTop:7*u,color:lectureColors[1].ink}}>
          [{best.id}] <CiteText text={best.text} focus={p.evidenceFocus}/>
        </div>
      </LearningCard></Entry>
      <Entry amount={stage(p.generation.at)}><LearningCard title="5. Answer with a citation" tint={lectureColors[1].fill}>
        {answerWords.map((word,i)=><span key={i} style={{visibility:i<written?'visible':'hidden'}}>{word}</span>)}
        <strong style={{visibility:written===answerWords.length?'visible':'hidden'}}> [{best.id}]</strong>
      </LearningCard></Entry>
    </div>
  </LearningBoard>;
}
