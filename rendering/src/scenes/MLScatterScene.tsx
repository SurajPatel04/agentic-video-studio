import {z} from 'zod';
import {LearningBoard, LearningCard, useLearningLayout, valueText} from '../components/LearningBoard';
import {lectureColors} from '../components/LectureBoard';
import {PAPER} from '../iso/iso';
import {fraction} from './paperStage';

const coord=z.number().min(-1).max(1);
const position=z.tuple([coord,coord]);
const point=z.object({label:z.string().min(1).max(24),xy:position,group:z.union([z.literal(0),z.literal(1)]).optional(),
  at:fraction.default(0)}).strict();
const cluster=z.object({centers:z.array(position).min(2).max(4),steps:z.array(z.object({at:fraction}).strict()).min(2).max(8)}).strict();
const classification=z.object({boundary:z.object({x:coord,at:fraction}).strict(), example:point}).strict();
const similarity=z.object({query:point,at:fraction}).strict();

export const mlScatterSceneSchema=z.object({
  title:z.string().max(78).default('Classify a new example'),
  mode:z.enum(['classification','clustering','embedding']).default('classification'),
  points:z.array(point).min(2).max(14).default([
    {label:'A',xy:[-0.6,0.33],group:0,at:0},{label:'B',xy:[-0.44,-0.41],group:0,at:0.12},
    {label:'C',xy:[0.30,0.53],group:1,at:0.18},{label:'D',xy:[0.65,-0.35],group:1,at:0.24},
  ]),
  classification:classification.optional(),
  cluster:cluster.optional(),
  similarity:similarity.optional(),
}).strict().superRefine((p,ctx)=>{
  const error=(path:string,message:string)=>ctx.addIssue({code:'custom',path:[path],message});
  if(p.mode==='clustering' && (!p.cluster || p.cluster.steps.some((s,i)=>s.at<Math.max(...p.points.map(d=>d.at)) ||
    (i>0&&s.at<=p.cluster!.steps[i-1].at)))) error('cluster','Supply seed centers and ordered assign/move steps after all points appear.');
  if(p.mode==='embedding' && (!p.similarity || p.similarity.query.at>p.similarity.at ||
    Math.hypot(...p.similarity.query.xy)===0 || p.points.some(d=>Math.hypot(...d.xy)===0 || d.at>p.similarity!.at)))
    error('similarity','Show nonzero example vectors and the query before computing cosine similarity.');
  if(p.mode==='classification' && p.classification && p.classification.example.at<p.classification.boundary.at)
    error('classification','Reveal the boundary before classifying the new point.');
});
export const description='Classification shows labeled points, a threshold and a new prediction. Clustering computes timed k-means assignment and centroid updates. Embedding mode uses illustrative 2D vectors, computes cosine similarity and highlights the nearest match.';
export const tags=['classification','classifier','decision boundary','clustering','k-means','centroid','embeddings','cosine similarity','nearest neighbors','machine learning'];

const squared=(a:[number,number],b:[number,number])=>(a[0]-b[0])**2+(a[1]-b[1])**2;
type LabelBox={x:number;y:number;w:number;h:number};
const collides=(a:LabelBox,b:LabelBox)=>
  Math.abs(a.x-b.x)<(a.w+b.w)/2+5 && Math.abs(a.y-b.y)<(a.h+b.h)/2+5;
function assignments(points:z.output<typeof point>[], centers:[number,number][]) {
  return points.map(d=>centers.reduce((best,c,i)=>squared(d.xy,c)<squared(d.xy,centers[best])?i:best,0));
}
function cosine(a:[number,number],b:[number,number]) {
  return (a[0]*b[0]+a[1]*b[1])/(Math.hypot(...a)*Math.hypot(...b));
}

export function MLScatterScene(input:z.input<typeof mlScatterSceneSchema>) {
  const p=mlScatterSceneSchema.parse(input),t=useLearningLayout();
  const classify=p.mode==='classification'?(p.classification ?? {boundary:{x:0,at:0.43},
    example:{label:'New point',xy:[0.22,-0.05] as [number,number],at:0.68}}):undefined;
  const similar=p.mode==='embedding'?p.similarity:undefined;
  const cluster=p.mode==='clustering'?p.cluster:undefined;
  let centers=cluster?.centers ?? [], groups:number[]=[];
  const reached=cluster?.steps.filter(s=>t.cueFrame(s.at)<=t.frame).length ?? 0;
  for(let i=0;i<reached;i++){
    if(i%2===0) groups=assignments(p.points,centers);
    else centers=centers.map((c,j)=>{
      const members=p.points.filter((_,k)=>groups[k]===j);
      return members.length?[members.reduce((s,d)=>s+d.xy[0],0)/members.length,members.reduce((s,d)=>s+d.xy[1],0)/members.length]:c;
    });
  }
  const query=classify?.example ?? similar?.query;
  const prediction=classify?Number(classify.example.xy[0]>=classify.boundary.x):undefined;
  const ranks=similar&&t.frame>=t.cueFrame(similar.at)?p.points.map(d=>({d,score:cosine(d.xy,similar.query.xy)})).sort((a,b)=>b.score-a.score):[];
  const xy=(d:[number,number])=>({x:550+d[0]*(similar?175:420),y:420-(d[1]+1)*175});
  // Keep a label in the same position throughout the scene, including before nearby points appear.
  const labeled=query?[...p.points,query]:p.points;
  const occupied:LabelBox[]=labeled.map(d=>({...xy(d.xy),w:35,h:35}));
  const labels=labeled.map(d=>{
    const c=xy(d.xy),w=d.label.length*11+10;
    const candidates=[{x:c.x,y:c.y-33},{x:c.x,y:c.y+33},
      {x:c.x+w/2+25,y:c.y},{x:c.x-w/2-25,y:c.y},
      {x:c.x,y:c.y-59},{x:c.x,y:c.y+59}];
    const box=candidates.map(pt=>({...pt,w,h:24})).find(pt=>
      pt.x-w/2>(similar?260:72) && pt.x+w/2<(similar?840:1028) && pt.y>47 && pt.y<424 && occupied.every(other=>!collides(pt,other)));
    if(box) occupied.push(box);
    return box;
  });
  const boundary=classify?xy([classify.boundary.x,0]).x:0;
  return <LearningBoard title={p.title} subtitle={similar?'Illustrative 2D vectors. Similarity uses the angle between vectors.':undefined}>
    <LearningCard><svg role="img" aria-label="Example scatter plot" width="100%" viewBox={similar ? "250 0 600 460" : "0 0 1100 460"} style={{maxHeight:470*t.u}}>
      <rect x="70" y="32" width="960" height="403" fill={PAPER.card} stroke={PAPER.track}/>
      <path d="M70 245 H1030 M550 32 V435" stroke={PAPER.track}/>
      {similar ? <g>
        <line x1="550" y1="245" x2={xy(similar.query.xy).x} y2={xy(similar.query.xy).y}
          stroke="#a75126" strokeWidth="3" opacity={t.progress(similar.query.at,0.4)}/>
        {ranks.slice(0,2).map(({d},i)=><line key={i} x1="550" y1="245"
          x2={xy(d.xy).x} y2={xy(d.xy).y} stroke={i===0?'#3c785c':'#857693'} strokeWidth={i===0?4:2}
          pathLength={1} strokeDasharray={1} strokeDashoffset={1-t.progress(similar.at,0.48)}/>)}
      </g> : null}
      {classify?<g opacity={t.progress(classify.boundary.at,0.4)}>
        <rect x="70" y="32" width={boundary-70} height="403" fill={lectureColors[0].fill} opacity=".45"/>
        <rect x={boundary} y="32" width={1030-boundary} height="403" fill={lectureColors[1].fill} opacity=".45"/>
        <path d={`M${boundary} 32 V435`} stroke={PAPER.inkSoft} strokeWidth="3" strokeDasharray="8 6"/>
        <text x={boundary+8} y="55" fill={PAPER.ink} fontSize="19">Threshold</text>
      </g>:null}
      {centers.map((c,i)=><text key={i} {...xy(c)} textAnchor="middle" dominantBaseline="central" fontSize="39"
        fontWeight="800" fill={lectureColors[i].ink}>×</text>)}
      {p.points.map((d,i)=>{
        const c=xy(d.xy),tone=lectureColors[(cluster?groups[i] ?? 3:d.group ?? 3)%lectureColors.length];
        return <g key={i} opacity={t.progress(d.at,0.4)}><circle cx={c.x} cy={c.y} r={ranks[0]?.d===d?16:10}
          fill={tone.ink} stroke={ranks[0]?.d===d?'#e18e47':PAPER.card} strokeWidth="3"/>
          {labels[i]?<text x={labels[i]?.x} y={labels[i]?.y} dominantBaseline="central"
            textAnchor="middle" fill={PAPER.ink} fontSize="19" fontWeight="700">{d.label}</text>:null}</g>;
      })}
      {query?<g opacity={t.progress(query.at,0.4)}><circle cx={xy(query.xy).x} cy={xy(query.xy).y} r="13"
        fill={prediction===undefined?'#a75126':lectureColors[prediction].ink} stroke="white" strokeWidth="3"/>
        {labels[p.points.length]?<text x={labels[p.points.length]?.x} y={labels[p.points.length]?.y}
          dominantBaseline="central" textAnchor="middle" fill={PAPER.ink} fontSize="20" fontWeight="750">{query.label}</text>:null}
      </g>:null}
    </svg></LearningCard>
    <LearningCard>
      {cluster?(reached===0?'Start with unlabeled points and seed centers.':reached%2?
        'Assign each point to its nearest center.':'Move each center to the mean of its assigned points.'):
      ranks.length?<div>Closest by cosine similarity (angle from the origin): {ranks.slice(0,3).map(r=>`${r.d.label} (${valueText(r.score)})`).join(' · ')}</div>:
      classify&&t.frame>=t.cueFrame(classify.example.at)?`The new point is classified as class ${prediction===0?'A':'B'}.`:
      classify?'Class A is to the left of the threshold. Class B starts at the threshold.':'Compare how closely other vectors point in the same direction as the query.'}
    </LearningCard>
  </LearningBoard>;
}
