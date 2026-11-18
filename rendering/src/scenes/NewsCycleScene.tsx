import type {FC} from 'react';
import {useCurrentFrame} from 'remotion';
import {z} from 'zod';
import {useSceneLength} from '../theme';
import {JournalismStage,IsoProp,Island,Caption,Label,Crowd,reveal} from './journalismStage';
export const newsCycleSceneSchema=z.object({title:z.string().max(70).default('How an event becomes news'),event:z.string().max(42).default('A public park opens'),output:z.enum(['print','broadcast']).default('print'),stories:z.array(z.object({label:z.string().max(30),selected:z.boolean()}).strict()).min(2).max(4).default([{label:'Park opening',selected:true},{label:'Unverified rumour',selected:false},{label:'Transport update',selected:true}])}).strict();
export const description='An event reaches a reporter with a microphone, an editor’s desk and gatekeeping funnel. Story cards enter the funnel; selected stories pass to print or broadcast, others are held for checking, then the audience reacts. Props: event, output (print/broadcast), stories [{label, selected}].';
export const tags=['news','journalism','news cycle','gatekeeping','reporter','editor','audience'];
export const NewsCycleScene:FC<z.input<typeof newsCycleSceneSchema>>=(input)=>{
 const p=newsCycleSceneSchema.parse(input),f=useCurrentFrame(),t=f/Math.max(1,useSceneLength()-1),active=Math.min(4,Math.floor(t*5.5));
 const xs=[150,455,770,1080,1400],ys=[320,360,400,440,480];
 const labels=['The event','Reporting','Editorial desk',p.output==='print'?'In print':'On television','The audience'];
 return <JournalismStage title={p.title} eyebrow="JOURNALISM / THE NEWS JOURNEY">
  {xs.slice(0,-1).map((cx,i)=><g key={i} opacity={reveal(t,.08+i*.12)}><path d={`M${cx+90} ${ys[i]-30} Q${cx+150} ${ys[i]-45} ${xs[i+1]-85} ${ys[i+1]-35}`} stroke="#c6b6a0" strokeWidth="3" fill="none" strokeDasharray="7 8"/>{active>i?<circle cx={cx+100+((f%40)/40)*105} cy={ys[i]-30+((f%40)/40)*20} r="5" fill="#d68c4e"/>:null}</g>)}
  {xs.map((cx,i)=><g key={i} opacity={reveal(t,i*.10)} transform={`translate(0 ${28*(1-reveal(t,i*.10))})`}>
   <Island x={cx} y={ys[i]-94} w={115} d={115} color={active===i?'#f0d4a1':'#e5ddcf'} id={`stage-${i}`}/>
   {i===0?<IsoProp kind="tree" x={cx} y={ys[i]-15} w={155} h={205} id="event-tree"/>:i===4?<Crowd x={cx-48} y={ys[i]-60} react={active===4}/>:<IsoProp kind={i===1?'reporter':i===2?'editor':p.output==='print'?'newspaperbundle':'tv'} x={cx} y={ys[i]-22} w={i===2?240:205} h={230} id={`news-object-${i}`} lift={active===i?8:0}/>}
   <Label x={cx} y={ys[i]+64} text={labels[i]} detail={i===0?p.event:undefined}/>
  </g>)}
  {/* Physical funnel: stories enter a wide mouth and selected cards leave the narrow gate. */}
  <g opacity={reveal(t,.38)} transform="translate(705 487)"><path d="M0 0 L70 26 L140 0 L140 18 L91 83 L91 113 L58 101 L58 72 L0 18Z" fill="#d6b5e4" stroke="#3d3548" strokeWidth="2"/><path d="M0 0 L70 -26 L140 0 L70 26Z" fill="#eee0f4" stroke="#3d3548" strokeWidth="2"/><path d="M70 26 V78 L91 83" fill="none" stroke="#8b7399" strokeWidth="2"/></g>
  {p.stories.map((story,i)=>{const q=reveal(t,.43+i*.045,.18);const cx=630+q*(story.selected?400:-140),cy=486+i*40+(story.selected?q*40:q*70);return <g key={i} opacity={q>0?1:0} transform={`translate(${cx} ${cy})`}><path d="M0 6 L160 6 L160 43 L0 43Z" fill={story.selected&&q===1?'#a8cab1':'#c6b8a2'}/><rect width="160" height="37" rx="5" fill={q===1?(story.selected?'#dcebdd':'#f2d8cf'):'#fffaf1'} stroke="#988774"/><foreignObject x="8" y="5" width="145" height="32"><div style={{fontSize:14,fontWeight:700,lineHeight:1.15}}>{story.label}</div></foreignObject></g>;})}
  <Caption progress={t} step={`0${active+1} / NEWS CYCLE`} text={['An event gives the reporter a story to investigate.','Gather facts, speak to sources, record the details.','Editors verify stories and decide what goes through.','Selected stories are printed or broadcast.','People read, discuss and respond to the news.'][active]}/>
 </JournalismStage>;
};
