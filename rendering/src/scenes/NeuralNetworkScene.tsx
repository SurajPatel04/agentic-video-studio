import {useId} from 'react';
import {z} from 'zod';
import {LearningBoard, LearningCard, useLearningLayout, valueText} from '../components/LearningBoard';
import {lectureColors} from '../components/LectureBoard';
import {PAPER} from '../iso/iso';
import {fraction} from './paperStage';

const number=z.number().min(-10).max(10);
const neuron=z.object({weights:z.array(number).min(1).max(5),bias:number.default(0)}).strict();
const layer=z.object({label:z.string().min(1).max(22),neurons:z.array(neuron).min(1).max(5),at:fraction}).strict();
const mode=z.enum(['forward','backward','update']);
const step=z.object({at:fraction,mode,layer:z.number().int().min(0),neuron:z.number().int().min(0),input:z.number().int().min(0).default(0)}).strict();

export const neuralNetworkSceneSchema=z.object({
  title:z.string().max(78).default('Follow one prediction through a neural network'),
  inputs:z.array(z.object({label:z.string().max(18),value:number}).strict()).min(1).max(5).default([
    {label:'Input 1',value:2},{label:'Input 2',value:1},
  ]),
  layers:z.array(layer).min(2).max(4).default([
    {label:'Hidden layer',at:0.22,neurons:[{weights:[0.5,1],bias:0},{weights:[1,-1],bias:0},{weights:[-1,1],bias:0}]},
    {label:'Output',at:0.48,neurons:[{weights:[0.5,0.5,0.5],bias:0}]},
  ]),
  target:number.optional(),
  rate:z.number().positive().max(1).default(0.1),
  steps:z.array(step).max(6).default([]),
}).strict().superRefine((p,ctx)=>{
  p.layers.forEach((l,i)=>{
    const size=i?p.layers[i-1].neurons.length:p.inputs.length;
    if (l.neurons.some(n=>n.weights.length!==size) || (i && l.at<p.layers[i-1].at)) ctx.addIssue({
      code:'custom',path:['layers',i],message:'Match weights to all previous activations and reveal layers in order.',
    });
  });
  if (p.layers.at(-1)?.neurons.length!==1) ctx.addIssue({
    code:'custom',path:['layers'],message:'Use one linear output for this worked example.',
  });
  p.steps.forEach((s,i)=>{
    const l=p.layers[s.layer],n=l?.neurons[s.neuron];
    if (!n || s.input>=n.weights.length || s.at<(l?.at ?? 0) || (i && s.at<=p.steps[i-1].at) ||
      (s.mode!=='forward' && (p.target===undefined || s.at<p.layers[p.layers.length-1].at))) ctx.addIssue({
      code:'custom',path:['steps',i],message:'Select a revealed neuron and valid input. Backward and update steps also need a target and completed forward pass.',
    });
  });
});

export const description='Reveal inputs, hidden ReLU layers and one linear output. Compute the actual weighted sums and activations. Cue a forward calculation or backpropagation of squared error, then update one selected weight and recompute the prediction.';
export const tags=['neural network','deep learning','neurons','activation','weights','bias','backpropagation','forward pass','artificial neural network','relu'];

function forward(inputs:number[], layers:z.output<typeof layer>[]) {
  const values=[inputs], sums:number[][]=[];
  layers.forEach((l,i)=>{
    const z=l.neurons.map(n=>n.weights.reduce((total,w,j)=>total+w*values[i][j],n.bias));
    sums.push(z);
    values.push(i===layers.length-1?z:z.map(x=>Math.max(0,x)));
  });
  return {values,sums};
}
function gradient(layers:z.output<typeof layer>[], network:ReturnType<typeof forward>, target:number, s:z.output<typeof step>) {
  let deltas=[2*(network.values.at(-1)![0]-target)];
  for(let i=layers.length-2;i>=s.layer;i--) {
    deltas=layers[i].neurons.map((_,j)=>network.sums[i][j]>0
      ? layers[i+1].neurons.reduce((total,n,k)=>total+n.weights[j]*deltas[k],0):0);
  }
  return deltas[s.neuron]*network.values[s.layer][s.input];
}

export function NeuralNetworkScene(input:z.input<typeof neuralNetworkSceneSchema>) {
  const p=neuralNetworkSceneSchema.parse(input),t=useLearningLayout(),v=valueText;
  const layers=p.layers.map(l=>({...l,neurons:l.neurons.map(n=>({...n,weights:[...n.weights]}))}));
  const inputs=p.inputs.map(n=>n.value);
  const arrowId=useId();
  let network=forward(inputs,layers);
  const steps=p.steps.filter(s=>t.frame>=t.cueFrame(s.at));
  const active=steps.at(-1);
  let change:{before:number;after:number;oldWeight:number;newWeight:number;gradient:number}|undefined;
  for(const s of steps) {
    if(s.mode!=='update') continue;
    const item=layers[s.layer].neurons[s.neuron];
    const before=network.values.at(-1)![0],oldWeight=item.weights[s.input];
    const g=gradient(layers,network,p.target!,s);
    item.weights[s.input]-=p.rate*g;
    network=forward(inputs,layers);
    change={before,after:network.values.at(-1)![0],oldWeight,newWeight:item.weights[s.input],gradient:g};
  }
  const counts=[p.inputs.length,...layers.map(l=>l.neurons.length)];
  const W=t.portrait?830:1350,H=425;
  const x=(i:number)=>135+(W-220)*i/(counts.length-1);
  const y=(i:number,j:number)=>212+(j-(counts[i]-1)/2)*65;
  const selected=active && layers[active.layer].neurons[active.neuron];
  const sum=active?network.sums[active.layer][active.neuron]:0;
  const result=network.values.at(-1)![0];
  return <LearningBoard title={p.title} subtitle="Each hidden neuron takes a weighted sum, adds a bias, then applies ReLU.">
    <LearningCard>
      <svg role="img" aria-label="Layered neural network" width="100%" viewBox={`0 0 ${W} ${H}`}>
        <defs><marker id={arrowId} viewBox="0 0 8 8" markerWidth="6" markerHeight="6" refX="7" refY="4" orient="auto"><path d="M0 0 L8 4 L0 8Z" fill="#985024"/></marker></defs>
        {layers.flatMap((l,i)=>l.neurons.flatMap((n,j)=>n.weights.map((_,k)=>{
          const strength=t.progress(l.at,0.4);
          const start={x:x(i)+26,y:y(i,k)},end={x:x(i+1)-26,y:y(i+1,j)};
          const focused=active?.layer===i&&active.neuron===j&&active.input===k;
          const reverse=focused&&active.mode==='backward';
          const a=reverse?end:start,b=reverse?start:end;
          return <line key={`${i}-${j}-${k}`} x1={a.x} y1={a.y} x2={a.x+(b.x-a.x)*strength}
            y2={a.y+(b.y-a.y)*strength} opacity={strength*(focused?1:0.44)}
            stroke={focused?'#985024':'#857693'} strokeWidth={focused?4:2} markerEnd={focused?`url(#${arrowId})`:undefined}/>;
        })))}
        {['Inputs',...layers.map(l=>l.label)].map((label,i)=><g key={i} opacity={i?t.progress(layers[i-1].at,0.4):1}>
          <text x={x(i)} y={32} textAnchor="middle" fill={PAPER.ink} fontWeight="750" fontSize="24">{label}</text>
          {network.values[i].map((value,j)=><g key={j}>
            <circle cx={x(i)} cy={y(i,j)} r={25} fill={lectureColors[i%lectureColors.length].fill}
              stroke={lectureColors[i%lectureColors.length].ink} strokeWidth={active?.layer===i-1&&active.neuron===j?4:2}/>
            <text x={x(i)} y={y(i,j)} textAnchor="middle" dominantBaseline="central" fill={PAPER.ink} fontSize={String(v(value)).length>4?13:19} fontWeight="750">{v(value)}</text>
            {!i?<text x={x(i)-34} y={y(i,j)+5} textAnchor="end" fill={PAPER.inkSoft} fontSize="15">{p.inputs[j].label}</text>:null}
          </g>)}
        </g>)}
      </svg>
    </LearningCard>
    <LearningCard title={active?.mode==='backward'?'Trace the gradient':active?.mode==='update'?'Update one weight':selected?'Inside the selected neuron':'Forward pass'}>
      {active?.mode==='update'&&change?<div>
        Gradient {v(change.gradient)} · Weight {v(change.oldWeight)} → {v(change.newWeight)}
        <br/>Prediction {v(change.before)} → {v(change.after)} · Known target {v(p.target!)}
      </div>:active?.mode==='backward'?<div>Squared error ({v(result)} − {v(p.target!)})² = {v((result-p.target!)**2)}
        <br/>Gradient of this weight = {v(gradient(layers,network,p.target!,active))}</div>:
        selected&&active?<div>
          {selected.weights.map((w,j)=>`${v(w)} × ${v(network.values[active.layer][j])}`).join(' + ')} + ({v(selected.bias)}) = {v(sum)}
          {active.layer<layers.length-1?<span> · ReLU({v(sum)}) = {v(Math.max(0,sum))}</span>:null}
        </div>:<div>{t.frame>=t.cueFrame(layers.at(-1)!.at)?`The output predicts ${v(result)}.`:'Follow the inputs to the next layer.'}</div>}
    </LearningCard>
  </LearningBoard>;
}
