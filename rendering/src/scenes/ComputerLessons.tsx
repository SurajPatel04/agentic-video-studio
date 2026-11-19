import {z} from 'zod';
import {useLearningLayout} from '../components/LearningBoard';
import {fraction} from './paperStage';
import {Arrow, Graphic, Label, Tile, ink, tone} from './CourseGraphic';

const title=z.string().min(1).max(75);
const protocols={
  HTTP:{actors:['Browser','Web server'],messages:['GET /watches/42','200 OK · watch record']},
  DNS:{actors:['Client','DNS resolver'],messages:['A query · example.test','A answer · 192.0.2.8']},
  TCP:{actors:['Client','Server'],messages:['SYN','SYN + ACK','ACK']},
};
const sequence=z.object({title:title.optional(),protocol:z.enum(['HTTP','DNS','TCP']).default('TCP'),
  steps:z.array(z.object({message:z.string().min(1).max(48),reverse:z.boolean(),at:fraction}).strict()).min(1).max(5).optional()}).strict();
function Sequence(input:z.input<typeof sequence>) {
  const p=sequence.parse(input), t=useLearningLayout(), model=protocols[p.protocol];
  const steps=p.steps??model.messages.map((message,i)=>({message,reverse:i%2===1,at:.08+i*.25}));
  return <Graphic title={p.title??`${p.protocol} message sequence`} note="Read from top to bottom. Each arrow points to the receiver.">
    {model.actors.map((a,i)=><g key={a}><Tile x={75+i*540} y={12} w={210} h={46} text={a} i={i}/><path d={`M${180+i*540} 58v275`} stroke={ink} strokeDasharray="5 5"/></g>)}
    {steps.map((s,i)=>{const y=99+i*54,k=t.progress(s.at,.35);return <g key={i} opacity={k}><Label x={450} y={y-6} text={s.message}/><Arrow x={s.reverse?720:180} end={s.reverse?180:720} y={y+3} p={k}/></g>;})}
  </Graphic>;
}
const logic=z.object({title:title.optional(),gate:z.enum(['AND','OR','XOR','NOT','NAND','NOR','XNOR']).default('AND'),
  states:z.array(z.object({a:z.boolean(),b:z.boolean(),at:fraction}).strict()).min(1).max(8).default([
    {a:false,b:false,at:0},{a:true,b:false,at:.3},{a:true,b:true,at:.65}])}).strict();
function Logic(input:z.input<typeof logic>) {
  const p=logic.parse(input),t=useLearningLayout(),s=p.states.filter(v=>t.frame>=t.cueFrame(v.at)).at(-1);
  const output=(a:boolean,b:boolean)=>({AND:a&&b,OR:a||b,XOR:a!==b,NOT:!a,NAND:!(a&&b),NOR:!(a||b),XNOR:a===b})[p.gate];
  const unary=p.gate==='NOT';
  return <Graphic title={p.title??`Inside a ${p.gate} gate`} note="Each truth-table row gives the output for one input combination.">
    {(unary?['A']:['A','B']).map((name,i)=><g key={name}><Tile x={22} y={65+i*125} w={100} h={50} text={name+' = '+(s?Number(i?s.b:s.a):'…')} i={i}/>
      <path d={`M122 ${90+i*125} H175 V${130+i*40} H223`} fill="none" stroke={ink} strokeWidth="3"/></g>)}
    <Tile x={223} y={105} w={125} h={90} text={p.gate}/><Arrow x={348} y={150} end={400}/><Tile x={405} y={124} w={88} h={52} text={s?String(Number(output(s.a,s.b))):'…'} i={2}/>
    <Label x={695} y={55} text={unary?'A     Output':'A       B       Output'}/>
    {(unary?[0,1]:[0,1,2,3]).map((n,i)=>{const a=unary?!!n:n>=2,b=!!(n%2);return <g key={n}><rect x="552" y={75+i*55} width="286" height="48" rx="6" fill={s&&a===s.a&&(unary||b===s.b)?tone(1).fill:'#f5f3ed'}/>
      {[Number(a),...(unary?[]:[Number(b)]),Number(output(a,b))].map((v,j)=><Label key={j} x={unary?625+j*140:595+j*98} y={106+i*55} text={String(v)}/>)}</g>;})}
  </Graphic>;
}
const binary=z.object({title:title.optional(),value:z.number().int().min(0).max(255).default(42),at:fraction.default(.48)}).strict();
function Binary(input:z.input<typeof binary>) {
  const p=binary.parse(input),t=useLearningLayout(),bits=p.value.toString(2).padStart(8,'0');
  return <Graphic title={p.title??`Write ${p.value} in binary and hexadecimal`} note="Each group of four binary digits maps to one hexadecimal digit.">
    {bits.split('').map((b,i)=><g key={i}><Label x={84+i*103} y={78} text={String(2**(7-i))}/><Tile x={40+i*103} y={101} w={88} h={72} text={b} i={i<4?0:1}/></g>)}
    {[0,1].map(i=><g key={i} opacity={t.progress(p.at,.4)}><path d={`M${45+i*412} 188v15h392v-15`} fill="none" stroke={ink}/><Label x={241+i*412} y={253} text={parseInt(bits.slice(i*4,i*4+4),2).toString(16).toUpperCase()} size={34}/></g>)}
  </Graphic>;
}
const cpu=z.object({title:title.optional(),accumulator:z.number().int().min(-999).max(999).default(4),operand:z.number().int().min(-999).max(999).default(3),
  operation:z.enum(['ADD','SUB']).default('ADD'),decode:z.object({at:fraction}).default({at:.32}),execute:z.object({at:fraction}).default({at:.64})}).strict();
function Cpu(input:z.input<typeof cpu>) {
  const p=cpu.parse(input),t=useLearningLayout(),done=t.frame>=t.cueFrame(p.execute.at),instruction=p.operation+' '+p.operand;
  return <Graphic title={p.title??'Trace one CPU instruction'} note={done?'Execute updates the accumulator.':t.frame>=t.cueFrame(p.decode.at)?'Decode identifies the operation and its operand.':'Fetch copies the instruction from memory into the CPU.'}>
    {['Fetch','Decode','Execute'].map((stage,i)=><g key={stage} opacity={i?t.progress(i===1?p.decode.at:p.execute.at,.35):1}><Label x={150+i*300} y={90} text={stage}/>
      <Tile x={32+i*300} y={112} w={236} h={90} text={[instruction,p.operation==='ADD'?'Add immediate':'Subtract immediate',`${p.accumulator} ${p.operation==='ADD'?'+':'−'} (${p.operand})`][i]} i={i}/>
      {i>0&&<Arrow x={272+(i-1)*300} end={329+(i-1)*300} y={155}/>}</g>)}
    <Label x={450} y={283} text={'Accumulator = '+(done?p.accumulator+(p.operation==='ADD'?p.operand:-p.operand):p.accumulator)}/>
  </Graphic>;
}
const schedule=z.object({title:title.optional(),policy:z.enum(['FCFS','SJF']).default('FCFS'),jobs:z.array(z.object({
  name:z.string().min(1).max(12),burst:z.number().int().min(1).max(30),at:fraction.optional()}).strict()).min(2).max(6).default([{name:'A',burst:4},{name:'B',burst:2},{name:'C',burst:3}])}).strict();
function Schedule(input:z.input<typeof schedule>) {
  const p=schedule.parse(input),t=useLearningLayout(),jobs=[...p.jobs];
  if(p.policy==='SJF') jobs.sort((a,b)=>a.burst-b.burst);
  const total=jobs.reduce((n,j)=>n+j.burst,0);
  let start=0;
  return <Graphic title={p.title??`${p.policy} CPU scheduling`} note="All jobs arrive at time zero. Each runs to completion.">
    <Label x={450} y={72} text={p.jobs.map(j=>j.name+' ('+j.burst+')').join('    ·    ')}/>
    {jobs.map((j,i)=>{const from=start;start+=j.burst;const x=40+820*from/total,w=820*j.burst/total;return <g key={i} opacity={t.progress(j.at??(.08+.64*from/total),.3)}>
      <rect x={x} y={132} width={w} height="60" fill={tone(i).fill} stroke={ink}/><Label x={x+w/2} y={169} text={String(i+1)} size={Math.min(22,w*.9)}/>
      <Label x={112+(i%3)*285} y={250+Math.floor(i/3)*38} text={`${i+1}. ${j.name} · ${from}–${start}`}/></g>;})}
  </Graphic>;
}
const paging=z.object({title:title.optional(),address:z.number().int().min(0).max(4095).default(42),pageSize:z.enum(['16','32','64','128']).default('16'),
  frame:z.number().int().min(0).max(255).nullable().default(7),lookup:z.object({at:fraction}).default({at:.3}),result:z.object({at:fraction}).default({at:.62})}).strict();
function Paging(input:z.input<typeof paging>) {
  const p=paging.parse(input),t=useLearningLayout(),size=Number(p.pageSize),page=Math.floor(p.address/size),offset=p.address%size;
  return <Graphic title={p.title??'Translate a virtual address'} note={`Page size = ${size} bytes. The offset stays the same during translation.`}>
    {[['Virtual address',String(p.address),`Page ${page} + offset ${offset}`],['Page table',`Page ${page}`,p.frame===null?'Nonresident':`Frame ${p.frame}`],['Result',p.frame===null?'Page fault':String(p.frame*size+offset),p.frame===null?'OS handles fault':`${p.frame} × ${size} + ${offset}`]].map(([label,v,detail],i)=><g key={label} opacity={i?t.progress(i===1?p.lookup.at:p.result.at,.35):1}><Label x={150+300*i} y={82} text={label}/><Tile x={45+300*i} y={115} w={210} h={78} text={v} i={i}/><Label x={150+300*i} y={242} text={detail}/>{i>0&&<Arrow x={260+300*(i-1)} end={340+300*(i-1)} y={150}/>}</g>)}
  </Graphic>;
}
export const computerLessons={
  SequenceScene:{component:Sequence,schema:sequence,description:'Two lifelines and ordered message arrows for HTTP, DNS or TCP. Override steps with narrated messages.',tags:['sequence diagram','http','dns','tcp','handshake']},
  LogicGateScene:{component:Logic,schema:logic,description:'Change input signals and evaluate a gate beside its matching truth table.',tags:['logic gate','boolean','truth table']},
  BinaryHexScene:{component:Binary,schema:binary,description:'Convert an unsigned byte using binary place values and hexadecimal nibbles.',tags:['binary','hexadecimal','base conversion']},
  CpuCycleScene:{component:Cpu,schema:cpu,description:'Trace fetch, decode and execute for an immediate add or subtract instruction.',tags:['cpu','instruction','fetch decode execute','accumulator']},
  SchedulingScene:{component:Schedule,schema:schedule,description:'Compute a proportional Gantt chart for nonpreemptive FCFS or shortest-job-first scheduling with simultaneous arrivals.',tags:['gantt','scheduling','fcfs','sjf']},
  PagingScene:{component:Paging,schema:paging,description:'Split a byte address, look up the page frame and compute the physical address or show a page fault.',tags:['memory','paging','virtual memory','address translation']},
};
