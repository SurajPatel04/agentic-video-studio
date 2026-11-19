import {z} from 'zod';
import {LearningBoard, LearningCard, useLearningLayout, valueText} from '../components/LearningBoard';
import {lectureColors} from '../components/LectureBoard';
import {PAPER} from '../iso/iso';
import {fraction,MONO} from './paperStage';

const word=z.string().min(1).max(24);
const token=z.object({text:word,id:z.number().int().nonnegative(),at:fraction}).strict();
const tokenization=z.object({
  title:z.string().max(78).default('Break a sentence into tokens'),
  tokens:z.array(token).min(1).max(18).default([
    {text:'The',id:12,at:0.15},{text:' cat',id:73,at:0.3},{text:' naps',id:118,at:0.48},{text:'.',id:9,at:0.68},
  ]),
  tokenizer:z.string().max(70).default('Illustrative tokenizer and token IDs'),
}).strict();

function TokenizationScene(input:z.input<typeof tokenization>) {
  const p=tokenization.parse(input),t=useLearningLayout();
  const active=p.tokens.filter(token=>t.frame>=t.cueFrame(token.at)).at(-1);
  return <LearningBoard title={p.title} subtitle={p.tokenizer}>
    <LearningCard title="Original sentence">
      <div style={{fontSize:37*t.u,whiteSpace:'pre-wrap'}}>
        {p.tokens.map((piece,i)=><span key={i} style={{
          borderBottom:`2px solid ${active===piece?lectureColors[i%5].ink:'transparent'}`,
          background:active===piece?lectureColors[i%5].fill:undefined,
        }}>{piece.text}</span>)}
      </div>
    </LearningCard>
    <LearningCard title="Text pieces → token IDs">
      <div style={{display:'flex',gap:10*t.u,flexWrap:'wrap'}}>
        {p.tokens.map((piece,i)=>{
          const progress=t.progress(piece.at,0.42);
          const tone=lectureColors[i%5];
          return <div key={i} style={{minWidth:73*t.u,maxWidth:'100%',opacity:progress,textAlign:'center',fontFamily:MONO}}>
            <div style={{background:tone.fill,color:tone.ink,padding:`${6*t.u}px ${9*t.u}px`,borderRadius:7*t.u,fontSize:22*t.u}}>
              {piece.text.replaceAll(' ','·')}
            </div>
            <svg width="20" height="29" viewBox="0 0 20 29" style={{width:20*t.u,height:29*t.u,display:'block',margin:'0 auto'}} aria-hidden>
              <path d="M10 2 V22 M5 17 L10 23 L15 17" fill="none" stroke={tone.ink} strokeWidth="2" strokeLinecap="round"
                pathLength={1} strokeDasharray={1} strokeDashoffset={1-progress}/>
            </svg>
            <div style={{color:tone.ink,border:`1px solid ${tone.ink}`,borderRadius:6*t.u,fontSize:19*t.u,padding:4*t.u}}>ID {piece.id}</div>
          </div>;
        })}
      </div>
    </LearningCard>
    {p.tokens.some(v=>v.text.includes(' '))?<div style={{fontSize:20*t.u}}>A middle dot marks a space inside a token.</div>:null}
  </LearningBoard>;
}
const choice=z.object({text:word,prob:fraction}).strict();
const turn=z.object({at:fraction,selected:z.number().int().nonnegative(),selection:z.object({at:fraction}).strict(),
  choices:z.array(choice).min(2).max(6)}).strict();
const generation=z.object({
  title:z.string().max(78).default('Generate text one token at a time'),
  prefix:z.string().min(1).max(110).default('The cat'),
  turns:z.array(turn).min(1).max(6).default([
    {at:0.14,selection:{at:0.33},selected:0,choices:[{text:' sat',prob:0.62},{text:' slept',prob:0.28},{text:' ran',prob:0.1}]},
    {at:0.52,selection:{at:0.74},selected:0,choices:[{text:' down',prob:0.58},{text:' quietly',prob:0.29},{text:'.',prob:0.13}]},
  ]),
}).strict().superRefine((p,ctx)=>p.turns.forEach((turn,i)=>{
  if(turn.selected>=turn.choices.length || turn.choices[turn.selected].prob===0 ||
    Math.abs(turn.choices.reduce((sum,c)=>sum+c.prob,0)-1)>0.001 || turn.selection.at<=turn.at ||
    (i>0&&turn.at<=p.turns[i-1].selection.at)) ctx.addIssue({
      code:'custom',path:['turns',i],message:'Give probabilities summing to 1, a valid selected token, and ordered candidate and selection times.',
    });
}));
function GenerationScene(input:z.input<typeof generation>) {
  const p=generation.parse(input),t=useLearningLayout();
  const active=p.turns.filter(v=>t.frame>=t.cueFrame(v.at)).at(-1);
  const selected=p.turns.filter(v=>t.frame>=t.cueFrame(v.selection.at));
  return <LearningBoard title={p.title} subtitle="Illustrative next-token probabilities">
    <LearningCard title="Text so far"><div style={{fontSize:35*t.u,whiteSpace:'pre-wrap'}}>
      {p.prefix}{selected.map((v,i)=><span key={i} style={{background:v===active?lectureColors[1].fill:undefined,
        opacity:t.progress(v.selection.at,0.4)}}>{v.choices[v.selected].text}</span>)}
    </div></LearningCard>
    <LearningCard title="Possible next tokens">
      <div style={{minHeight:245*t.u}}>
        {active?.choices.map((v,i)=><div key={i} style={{display:'grid',gridTemplateColumns:'minmax(86px,1fr) 3fr 65px',
          alignItems:'center',gap:12*t.u,marginBottom:9*t.u,opacity:t.progress(active.at,0.35)}}>
          <b style={{whiteSpace:'pre-wrap'}}>{v.text}</b>
          <div style={{height:15*t.u,background:PAPER.track,borderRadius:5*t.u}}>
            <div style={{width:`${v.prob*100}%`,height:'100%',background:selected.includes(active)&&i===active.selected?'#3e8566':'#967bb6',borderRadius:5*t.u}}/>
          </div><span>{valueText(v.prob*100)}%</span>
        </div>)}
      </div>
    </LearningCard>
  </LearningBoard>;
}

const score=z.number().min(-15).max(15);
const attention=z.object({
  title:z.string().max(78).default('Follow information through an attention head'),
  tokens:z.array(z.object({text:word,key:score,value:score}).strict()).min(2).max(8).default([
    {text:'The',key:0.2,value:1},{text:'cat',key:1.4,value:4},{text:'slept',key:0.5,value:2},{text:'.',key:-0.4,value:0},
  ]),
  queryIndex:z.number().int().nonnegative().default(2),query:score.default(2),
  attention:z.object({at:fraction}).strict().default({at:0.25}),
  block:z.object({at:fraction,stages:z.array(z.object({at:fraction}).strict()).length(4).optional()}).strict().default({at:0.68}),
}).strict().superRefine((p,ctx)=>{
  if(p.queryIndex>=p.tokens.length || p.block.at<=p.attention.at ||
    p.block.stages?.some((stage,i)=>i===0 ? stage.at<p.block.at : stage.at<=p.block.stages![i-1].at)) ctx.addIssue({
    code:'custom',path:['queryIndex'],message:'Select an existing query token and reveal the block after attention.',
  });
});
function AttentionScene(input:z.input<typeof attention>) {
  const p=attention.parse(input),t=useLearningLayout();
  const valid=p.tokens.slice(0,p.queryIndex+1), scores=valid.map(v=>v.key*p.query);
  const exp=scores.map(v=>Math.exp(v-Math.max(...scores))), sum=exp.reduce((x,y)=>x+y,0);
  const weights=exp.map(v=>v/sum), out=weights.reduce((total,w,i)=>total+w*valid[i].value,0);
  const reveal=t.progress(p.attention.at,0.4);
  const axisWidth=1100, gap=axisWidth/p.tokens.length;
  const queryX=(p.queryIndex+0.5)*gap;
  const names=['Attention output','Add input + normalize','Feed-forward','Add + normalize'];
  const blockTimes=p.block.stages?.map(s=>s.at) ?? names.map((_,i)=>p.block.at+(1-p.block.at)*i/5);
  return <LearningBoard title={p.title} subtitle="Illustrative causal attention with scalar queries, keys, and values">
    <LearningCard title={`Query token: “${p.tokens[p.queryIndex].text}” · Query value ${valueText(p.query)}`}>
      <svg width="100%" viewBox={`0 0 ${axisWidth} 100`} aria-label="Attention paths from available tokens to the selected query">
        <rect x={queryX-Math.min(52,gap*0.4)} y="4" width={Math.min(104,gap*0.8)} height="30" rx="6" fill="#e5ddf1" stroke="#5e417e"/>
        <text x={queryX} y="24" textAnchor="middle" fill="#5e417e" fontSize="17" fontWeight="750">Query</text>
        {weights.map((weight,i)=>{
          const x=(i+0.5)*gap;
          return <path key={i} d={`M${x} 97 C${x} 62 ${queryX} 70 ${queryX} 38`}
            stroke={i===p.queryIndex?'#765893':'#3e8566'} strokeWidth={2+weight*10} fill="none" opacity={reveal}
            pathLength={1} strokeDasharray={1} strokeDashoffset={1-reveal}/>;
        })}
      </svg>
      <div style={{display:'grid',gridTemplateColumns:`repeat(${p.tokens.length},minmax(0,1fr))`,gap:5*t.u}}>
        {p.tokens.map((piece,i)=><div key={i} style={{borderRadius:7*t.u,
          background:i>p.queryIndex?PAPER.track:lectureColors[i===p.queryIndex?0:1].fill,
          padding:`${6*t.u}px ${3*t.u}px`,textAlign:'center',minWidth:0,overflowWrap:'anywhere',
          fontSize:(p.tokens.length>5?17:22)*t.u}}>
          <b>{piece.text}</b>
          <div style={{opacity:reveal,fontSize:(p.tokens.length>5?13:17)*t.u}}>
            {i>p.queryIndex?'Masked':<><div>Weight {valueText(100*weights[i])}%</div><div>Value {valueText(piece.value)}</div></>}
          </div>
        </div>)}
      </div>
      <div style={{marginTop:10*t.u,opacity:reveal,fontSize:20*t.u}}>The link width reflects attention weight. The weighted value sum is <b>{valueText(out)}</b>.</div>
    </LearningCard>
    <LearningCard title="Through the transformer block" opacity={t.progress(p.block.at,0.4)}>
      <div style={{display:'grid',gridTemplateColumns:t.portrait?'1fr 1fr':'repeat(4,minmax(0,1fr))',gap:11*t.u}}>
        {names.map((name,i)=><div key={name} style={{display:'flex',alignItems:'center',gap:7*t.u,
          opacity:t.progress(blockTimes[i],0.36),fontSize:18*t.u,color:lectureColors[i].ink}}>
          {i>0?<span aria-hidden>→</span>:null}
          <strong style={{flex:1,background:lectureColors[i].fill,borderRadius:7*t.u,
            padding:`${6*t.u}px ${7*t.u}px`}}>{i+1}. {name}</strong>
        </div>)}
      </div>
      <div style={{marginTop:6*t.u,fontSize:17*t.u,color:PAPER.inkSoft}}>One post-normalization block layout.</div>
    </LearningCard>
  </LearningBoard>;
}

export const llmMechanics={
  TokenizationScene:{component:TokenizationScene,schema:tokenization,description:'Keep the source sentence intact. Highlight each token span and draw its link to the corresponding ID. Label toy tokenizers as illustrative. Preserve spaces in each token.',tags:['llm','tokenization','token ids','tokenizer','language model']},
  TextGenerationScene:{component:GenerationScene,schema:generation,description:'Show next-token probabilities, reveal the selected token and append it to the same text. Use turn.at and turn.selection.at cues and illustrative probabilities.',tags:['llm','generation','next token','sampling','probabilities','inference']},
  AttentionScene:{component:AttentionScene,schema:attention,description:'Compute simplified causal attention from scalar queries, keys and values, Draw weighted links from available tokens to the selected query, then reveal the transformer block stages.',tags:['llm','attention','transformer','causal mask','softmax','self attention']},
};
