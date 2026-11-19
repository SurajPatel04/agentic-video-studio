import {z} from 'zod';
import {useLearningLayout} from '../components/LearningBoard';
import {fraction} from './paperStage';
import {Graphic, Label, Tile, Arrow, ink, tone} from './CourseGraphic';

const title=z.string().min(1).max(75);
const brief=z.string().min(1).max(48);
const models={
  SMCR:[['Source','School office'],['Message','School opens at ten'],['Channel','Hearing the announcement'],['Receiver','Students']],
  Lasswell:[['Who?','School office'],['Says what?','School opens at ten'],['Which channel?','Radio'],['To whom?','Families'],['With what effect?','Families arrive later']],
};
const communication=z.object({title:title.optional(),model:z.enum(['SMCR','Lasswell']).default('SMCR'),
  stages:z.array(z.object({example:brief,at:fraction}).strict()).min(4).max(5).optional()}).strict().superRefine((p,ctx)=>{
    if(p.stages&&p.stages.length!==models[p.model].length)ctx.addIssue({code:'custom',path:['stages'],message:'Provide one example for each stage of the selected model.'});
  });
function Communication(input:z.input<typeof communication>) {
  const p=communication.parse(input),t=useLearningLayout(),rows=models[p.model],width=870/rows.length;
  return <Graphic title={p.title??`${p.model} communication model`} note={p.model==='SMCR'?'Trace how a source communicates a message through a channel to a receiver.':'Follow the message through to its effect on the audience.'}>
    {rows.map(([label,example],i)=>{const x=15+width*i,step=p.stages?.[i],k=t.progress(step?.at??i*.15,.35);return <g key={label} opacity={k}>
      <Label x={x+width/2} y={95} text={label} size={19}/><Tile x={x+10} y={125} w={width-28} h={95} text={step?.example??example} i={i}/>
      {i>0&&<Arrow x={x-16} end={x+7} y={171} p={k}/>}</g>;})}
  </Graphic>;
}
const ticker=z.object({title:title.default('Follow a developing story'),station:brief.default('Campus desk'),
  updates:z.array(z.object({time:z.string().min(1).max(12),headline:z.string().min(1).max(85),at:fraction}).strict()).min(1).max(6)
    .default([{time:'09:00',headline:'Library opening delayed for inspection',at:0},{time:'10:15',headline:'Inspection complete · doors open at eleven',at:.48}])}).strict();
function Ticker(input:z.input<typeof ticker>) {
  const p=ticker.parse(input),t=useLearningLayout(),current=p.updates.filter(v=>t.frame>=t.cueFrame(v.at)).at(-1);
  const k=current?t.progress(current.at,.42):0;
  return <Graphic title={p.title}>
    <rect x="35" y="25" width="830" height="295" rx="14" fill="#24324a"/>
    <text x="62" y="75" fill="white" fontSize="25">{p.station}</text>
    <path d="M360 195h180m-165 0v-70l75-40 75 40v70m-110-60v60m35-60v60m35-60v60" fill="none" stroke="#adc0cd" strokeWidth="5"/>
    <rect x="35" y="230" width="830" height="72" fill="#f4eee2"/><rect x="35" y="230" width="155" height="72" fill="#9a3336"/>
    <text x="112" y="275" textAnchor="middle" fill="white" fontSize="21">BREAKING</text>
    {current&&<g opacity={k} transform={`translate(${12*(1-k)} 0)`}><foreignObject x="206" y="235" width="640" height="64"><div style={{fontSize:21,lineHeight:1.17,color:ink}}><strong>{current.time}</strong>　{current.headline}</div></foreignObject></g>}
  </Graphic>;
}
function Person({x,y,scale=1,i=0}:{x:number;y:number;scale?:number;i?:number}) {
  return <g transform={`translate(${x} ${y}) scale(${scale})`} stroke={ink} strokeWidth="2">
    <path d="M-24 77l-5 75h19l12-59 9 59h20l-6-75" fill="#58667c"/>
    <path d="M-26 10q26-18 52 0l18 52-13 5-12-32 5 51h-49l6-51-13 34-13-7z" fill={tone(i).fill}/>
    <circle cy="-14" r="20" fill="#dea77d"/><path d="M-20-15q-4-31 20-25 21 0 20 24-12-2-20-12-8 10-20 13" fill={ink}/>
  </g>;
}
const camera=z.object({title:title.default('How shot size changes what you see'),grid:z.boolean().default(true),
  shots:z.array(z.object({size:z.enum(['wide','medium','close-up']),side:z.enum(['left','right']),at:fraction}).strict()).min(1).max(6)
    .default([{size:'wide',side:'left',at:0},{size:'medium',side:'left',at:.33},{size:'close-up',side:'left',at:.66}])}).strict();
function Camera(input:z.input<typeof camera>) {
  const p=camera.parse(input),t=useLearningLayout(),shot=p.shots.filter(v=>t.frame>=t.cueFrame(v.at)).at(-1);
  const scales={'wide':.85,medium:2,'close-up':4.2};
  return <Graphic title={p.title} note={shot?`${shot.size} shot · subject on the ${shot.side} third`:undefined}>
    <svg x="189" y="20" width="522" height="300" viewBox="0 0 522 300" overflow="hidden">
      <rect width="522" height="300" fill="#e3eee9"/><path d="M0 170l95-83 93 79 132-99 202 107v126H0" fill="#a9c5bb"/>
      {shot&&<Person x={shot.side==='left'?174:348} y={100+14*scales[shot.size]} scale={scales[shot.size]}/>}
      {p.grid&&<path d="M174 0v300M348 0v300M0 100h522M0 200h522" stroke="#fff" strokeWidth="2" strokeDasharray="6 4"/>}
    </svg>
  </Graphic>;
}
const dialogue=z.object({title:title.default('Ask where the evidence came from'),left:brief.default('Editor'),right:brief.default('Reporter'),
  turns:z.array(z.object({speaker:z.enum(['left','right']),line:z.string().min(1).max(105),at:fraction}).strict()).min(1).max(10)
    .default([{speaker:'left',line:'Who saw the meeting take place?',at:0},{speaker:'right',line:'I interviewed two people who attended.',at:.48}])}).strict();
function Character(input:z.input<typeof dialogue>) {
  const p=dialogue.parse(input),t=useLearningLayout(),turn=p.turns.filter(v=>t.frame>=t.cueFrame(v.at)).at(-1);
  return <Graphic title={p.title}>
    {['left','right'].map((side,i)=><g key={side} opacity={turn?.speaker===side?1:.62}><Person x={210+i*480} y={166} scale={.88} i={i}/><Label x={210+i*480} y={332} text={i?p.right:p.left}/></g>)}
    {turn&&<g opacity={t.progress(turn.at,.25)}><path d={turn.speaker==='left'?'M215 89l12 33 32-33':'M640 89l34 33 10-33'} fill={tone(turn.speaker==='left'?0:1).fill} stroke={ink}/>
      <Tile x={100} y={15} w={700} h={83} text={turn.line} i={turn.speaker==='left'?0:1}/></g>}
  </Graphic>;
}
const point=z.tuple([z.number().min(0).max(1),z.number().min(0).max(1)]);
const whiteboard=z.object({title:title.default('Sketch a feedback loop'),strokes:z.array(z.object({
  points:z.array(point).min(2).max(64),label:brief.optional(),at:fraction}).strict()).min(1).max(20)
    .default([{points:[[.18,.35],[.78,.35],[.74,.30],[.78,.35],[.74,.4]],label:'Send a message',at:0},
      {points:[[.78,.68],[.18,.68],[.22,.63],[.18,.68],[.22,.73]],label:'Return feedback',at:.48}])}).strict();
function Whiteboard(input:z.input<typeof whiteboard>) {
  const p=whiteboard.parse(input),t=useLearningLayout();
  return <Graphic title={p.title}>{p.strokes.map((s,i)=>{
    const xy=s.points.map(([x,y])=>[65+770*x,55+260*y]),k=t.progress(s.at,.8);
    return <g key={i} opacity={Math.min(1,k*5)}><polyline points={xy.map(v=>v.join(',')).join(' ')} pathLength={1} strokeDasharray="1" strokeDashoffset={1-k} fill="none" stroke={tone(i).ink} strokeWidth="5" strokeLinecap="round" strokeLinejoin="round"/>
      {s.label&&<Label x={Math.max(210,Math.min(690,xy[0][0]))} y={xy[0][1]-14} text={s.label} size={18}/>}</g>;
  })}</Graphic>;
}
export const mediaLessons={
  CommunicationModelScene:{component:Communication,schema:communication,description:'Walk through Berlo SMCR or Lasswell using a running example for every stage.',tags:['berlo','smcr','lasswell','communication model','media']},
  BreakingNewsScene:{component:Ticker,schema:ticker,description:'A broadcast lower-third ticker replaces the developing headline at each timed update.',tags:['breaking news','ticker','headline','broadcast']},
  CameraFramingScene:{component:Camera,schema:camera,description:'Compare wide, medium and close-up framing of one subject with a rule-of-thirds grid.',tags:['camera shots','framing','rule of thirds']},
  CharacterScene:{component:Character,schema:dialogue,description:'Two named characters take timed turns speaking through a graphic speech bubble.',tags:['avatar','character','dialogue','role play']},
  WhiteboardScene:{component:Whiteboard,schema:whiteboard,description:'Draw custom marker strokes one by one. Supply normalized [x,y] points and optional labels.',tags:['hand drawn','sketch','whiteboard','diagram']},
};
