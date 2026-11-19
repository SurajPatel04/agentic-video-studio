import {z} from 'zod';
import {LearningBoard, LearningCard, useLearningLayout, valueText} from '../components/LearningBoard';
import {lectureColors} from '../components/LectureBoard';
import {PAPER} from '../iso/iso';
import {fraction} from './paperStage';

const grade = ['training','validation','test'] as const;
const row = z.object({features:z.array(z.string().min(1).max(24)).min(1).max(4),
  label:z.string().min(1).max(25), split:z.enum(grade), at:fraction}).strict();
const dataset = z.object({
  title:z.string().max(78).default('Split the examples before training'),
  features:z.array(z.string().min(1).max(22)).min(1).max(4).default(['Floor area']),
  label:z.string().max(26).default('Known price'),
  rows:z.array(row).min(3).max(8).default([
    {features:['1,000 ft²'],label:'$200,000',split:'training',at:0},
    {features:['1,500 ft²'],label:'$275,000',split:'training',at:0.13},
    {features:['1,700 ft²'],label:'$302,000',split:'validation',at:0.26},
    {features:['1,800 ft²'],label:'$320,000',split:'test',at:0.39},
  ]),
  split:z.object({at:fraction}).strict().default({at:0.51}),
  leakage:z.object({at:fraction, text:z.string().min(1).max(134)}).strict().optional(),
}).strict().superRefine((p,ctx) => {
  if (p.rows.some(r => r.features.length !== p.features.length)) ctx.addIssue({
    code:'custom',path:['rows'],message:'Supply one value for every feature in each row.',
  });
  if (p.leakage && (p.leakage.at <= p.split.at || !p.rows.some(r => r.split === 'test'))) ctx.addIssue({
    code:'custom',path:['leakage'],message:'Show leakage after splitting data that includes a test row.',
  });
});

function DatasetScene(input:z.input<typeof dataset>) {
  const p=dataset.parse(input), t=useLearningLayout();
  const shown=t.progress(p.split.at,0.35);
  const leaking=p.leakage && t.progress(p.leakage.at,0.35);
  const cell={padding:`${8*t.u}px ${11*t.u}px`,textAlign:'left' as const,borderBottom:`1px solid ${PAPER.track}`};
  return <LearningBoard title={p.title} subtitle="Features are the inputs. The label is the known answer.">
    <LearningCard>
      <table style={{width:'100%',tableLayout:'fixed',borderCollapse:'collapse',fontSize:(p.features.length>2?19:23)*t.u}}>
        <thead><tr style={{background:lectureColors[0].fill}}>
          {[...p.features,p.label,'Split'].map((v,i)=><th key={i} style={cell}>{v}</th>)}
        </tr></thead>
        <tbody>{p.rows.map((r,i)=><tr key={i} style={{opacity:t.progress(r.at,0.36),background:leaking && r.split==='test'?lectureColors[4].fill:undefined}}>
          {[...r.features,r.label].map((v,j)=><td key={j} style={cell}>{v}</td>)}
          <td style={{...cell,opacity:shown,color:lectureColors[grade.indexOf(r.split)].ink,fontWeight:750}}>{r.split}</td>
        </tr>)}</tbody>
      </table>
    </LearningCard>
    <div style={{opacity:shown,fontSize:21*t.u,fontWeight:670}}>Training fits the model. Validation guides choices. Test data measures performance on held-out examples.</div>
    {p.leakage?<LearningCard opacity={leaking || 0} title="Data leakage" tint={lectureColors[4].fill}>{p.leakage.text}</LearningCard>:null}
  </LearningBoard>;
}

const training = z.object({
  title:z.string().max(78).default('Use the error to improve the prediction'),
  units:z.string().max(95).optional(),
  mode:z.enum(['training','gradient']).default('training'),
  examples:z.array(z.object({x:z.number().min(-100).max(100),y:z.number().min(-10000).max(10000)}).strict()).min(1).max(6).default([{x:1,y:2},{x:2,y:4}]),
  initialWeight:z.number().min(-100).max(100).default(0.5),
  bias:z.number().min(-100).max(100).default(0),
  rate:z.number().positive().max(1).default(0.1),
  updates:z.array(z.object({at:fraction}).strict()).min(1).max(5).default([{at:0.36},{at:0.68}]),
}).strict().superRefine((p,ctx)=>{
  if (p.updates.some(({at},i)=>at <= (p.updates[i-1]?.at ?? 0))) ctx.addIssue({
    code:'custom',path:['updates'],message:'Order update times after the starting prediction.',
  });
  const scale=p.examples.reduce((sum,d)=>sum+d.x*d.x,0)/p.examples.length;
  if (scale>0 && p.rate*scale>=1) ctx.addIssue({
    code:'custom',path:['rate'],message:'Use scaled examples and a learning rate below 1 divided by the mean squared input.',
  });
});

function TrainingScene(input:z.input<typeof training>) {
  const p=training.parse(input),t=useLearningLayout();
  const loss=(w:number)=>p.examples.reduce((s,d)=>s+(w*d.x+p.bias-d.y)**2,0)/p.examples.length;
  const slope=(w:number)=>2*p.examples.reduce((s,d)=>s+d.x*(w*d.x+p.bias-d.y),0)/p.examples.length;
  const weights=[p.initialWeight];
  p.updates.forEach(()=>{const w=weights[weights.length-1]; weights.push(w-p.rate*slope(w));});
  const index=p.updates.filter(({at})=>t.cueFrame(at)<=t.frame).length;
  const w=weights[index],old=weights[index-1], v=valueText;
  const left=Math.min(...weights)-0.8,right=Math.max(...weights)+0.8;
  const points=Array.from({length:41},(_,i)=>left+(right-left)*i/40);
  const maximum=Math.max(0.001,...points.map(loss));
  const chart=(q:number)=>[40+(q-left)/(right-left)*670,235-200*loss(q)/maximum];
  return <LearningBoard title={p.title} subtitle={p.units ?? 'Prediction = weight × input + fixed bias'}>
    <div style={{display:'grid',gridTemplateColumns:t.portrait?'1fr':'1fr 1fr',gap:15*t.u}}>
      <LearningCard title={p.mode==='gradient'?'Loss by weight':'Predictions and known answers'}>
        {p.mode==='gradient'?<svg width="100%" viewBox="0 0 750 285" aria-label="Mean squared error by weight">
          <path d="M40 24 V235 H720" fill="none" stroke={PAPER.inkSoft} strokeWidth="2"/>
          <polyline points={points.map(q=>chart(q).join(',')).join(' ')} fill="none" stroke="#71569f" strokeWidth="4"/>
          {weights.slice(0,index+1).map((q,i)=><circle key={i} cx={chart(q)[0]} cy={chart(q)[1]} r={i===index?9:5} fill={i===index?'#a75126':'#71569f'}/>)}
          <text x="55" y="26" fill={PAPER.inkSoft} fontSize="20">Mean squared error</text>
          <text x="650" y="271" fill={PAPER.inkSoft} fontSize="20">Weight</text>
        </svg>:<div style={{display:'grid',gap:8*t.u}}>
          {p.examples.map((d,i)=><div key={i}>Input {v(d.x)} · Prediction <b>{v(w*d.x+p.bias)}</b> · Known {v(d.y)}</div>)}
        </div>}
      </LearningCard>
      <LearningCard title={index ? `Update ${index}` : 'Starting model'} tint={lectureColors[1].fill}>
        <p style={{margin:'0 0 12px'}}>Mean squared error <b>{v(loss(w))}</b></p>
        {old!==undefined?<div>
          Previous loss {v(loss(old))}<br/>Gradient {v(slope(old))}<br/>
          Weight {v(old)} − {v(p.rate)} × ({v(slope(old))}) = <b>{v(w)}</b>
        </div>:<div>Weight {v(w)} · Bias {v(p.bias)} · Learning rate {v(p.rate)}</div>}
      </LearningCard>
    </div>
  </LearningBoard>;
}

const result = z.object({actual:z.enum(['positive','negative']),prediction:z.enum(['positive','negative']),at:fraction}).strict();
const evaluation = z.object({
  title:z.string().max(78).default('Compare predictions with known labels'),
  results:z.array(result).max(18).default([
    {actual:'positive',prediction:'positive',at:0.17},{actual:'negative',prediction:'positive',at:0.36},
    {actual:'positive',prediction:'negative',at:0.54},{actual:'negative',prediction:'negative',at:0.72},
  ]),
  models:z.array(z.object({name:z.string().max(26),train:fraction,test:fraction,at:fraction}).strict()).max(4).default([]),
}).strict().superRefine((p,ctx)=>{
  if (!p.results.length && !p.models.length) ctx.addIssue({code:'custom',path:['results'],message:'Give predictions or model scores to evaluate.'});
});
function EvaluationScene(input:z.input<typeof evaluation>) {
  const p=evaluation.parse(input),t=useLearningLayout();
  const visible=p.results.filter(r=>t.frame>=t.cueFrame(r.at));
  const correct=visible.filter(r=>r.actual===r.prediction).length, latest=visible.at(-1);
  return <LearningBoard title={p.title}>
    <div style={{display:'grid',gap:16*t.u,gridTemplateColumns:!t.portrait && p.results.length&&p.models.length?'1fr 1fr':'1fr'}}>
      {p.results.length?<LearningCard title="Confusion matrix">
        <table style={{borderCollapse:'separate',borderSpacing:6*t.u,width:'100%',textAlign:'center'}}>
          <thead><tr><th>Actual ↓</th><th>Predicted +</th><th>Predicted −</th></tr></thead>
          <tbody>{(['positive','negative'] as const).map(a=><tr key={a}><th>{a}</th>{(['positive','negative'] as const).map(b=>
            <td key={b} style={{padding:8*t.u,background:(latest?.actual===a&&latest.prediction===b?lectureColors[2]:lectureColors[a===b?1:4]).fill}}>
              {visible.filter(r=>r.actual===a&&r.prediction===b).length}</td>)}</tr>)}</tbody>
        </table>
        <div style={{minHeight:65*t.u}}>{latest?<>Actual {latest.actual} · Predicted {latest.prediction}<br/>Accuracy {correct}/{visible.length} ({valueText(100*correct/visible.length)}%)</>:null}</div>
      </LearningCard>:null}
      {p.models.length?<LearningCard title="Training and held-out test performance">
        <div style={{display:'grid',gridTemplateColumns:'1.25fr 1fr 1fr',gap:9*t.u}}>
          <b>Model</b><b>Train</b><b>Test</b>
          {p.models.map(m=><div key={m.name} style={{display:'contents'}}>
            {[m.name,`${valueText(m.train*100)}%`,`${valueText(m.test*100)}%`].map((v,i)=><span key={i}
              style={{opacity:t.progress(m.at,0.36),padding:6*t.u,background:lectureColors[i===2?1:0].fill}}>{v}</span>)}
          </div>)}
        </div>
      </LearningCard>:null}
    </div>
  </LearningBoard>;
}

export const mlFoundations={
  DatasetScene:{component:DatasetScene,schema:dataset,description:'Reveal features, labels, training, validation and test rows. Optional leakage warning is timed separately.',tags:['machine learning','dataset','split','features','labels','data leakage']},
  ModelTrainingScene:{component:TrainingScene,schema:training,description:'Compute real predictions, mean squared error and gradient updates for a single adjustable weight and fixed bias. Set mode gradient for a loss curve. Schedule update times in updates; keep examples small and scaled.',tags:['machine learning','model training','regression','gradient descent','loss','house price','parameter']},
  ModelEvaluationScene:{component:EvaluationScene,schema:evaluation,description:'Accumulate a binary confusion matrix and accuracy from timed examples. Optional model scores compare training and test accuracy for underfitting and overfitting.',tags:['model evaluation','confusion matrix','accuracy','overfitting','underfitting']},
};
