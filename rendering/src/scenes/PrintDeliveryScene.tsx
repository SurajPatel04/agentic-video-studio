import type {FC} from 'react';
import {useCurrentFrame} from 'remotion';
import {z} from 'zod';
import {useSceneLength} from '../theme';
import {clamp01} from './paperStage';
import {JournalismStage,IsoProp,Caption,Label,reveal} from './journalismStage';
export const printDeliverySceneSchema=z.object({title:z.string().max(70).default('From the printing press to your doorstep'),masthead:z.string().max(20).default('DAILY NEWS'),homes:z.array(z.string().max(20)).min(2).max(4).default(['Oak Street','Park Avenue','Hill Road'])}).strict();
export const description='A newspaper press rolls, printed papers move along a conveyor and stack up, a delivery van loads and drives a road route, then papers arc onto each home’s doorstep. Props: title, masthead, homes (2–4 labels).';
export const tags=['news','journalism','printing','press','newspaper','delivery','van','distribution'];
export const PrintDeliveryScene:FC<z.input<typeof printDeliverySceneSchema>>=(input)=>{
 const p=printDeliverySceneSchema.parse(input),f=useCurrentFrame(),t=f/Math.max(1,useSceneLength()-1),travel=clamp01((t-.37)/.48);
 const route=(q:number)=>({x:440+q*990,y:475+q*170});const van=route(travel);
 const step=t<.18?0:t<.37?1:t<.88?2:3;
 return <JournalismStage title={p.title} eyebrow="JOURNALISM / THE MORNING EDITION">
  {/* A raised road with shaded sides and markings in the same world plane. */}
  <path d="M330 447 L1480 644 L1550 601 L400 404Z" fill="#868b95" stroke="#514f5b" strokeWidth="2"/>
  <path d="M330 447 L1480 644 V659 L330 462Z" fill="#676c77" stroke="#514f5b" strokeWidth="2"/>
  <path d="M1480 644 L1550 601 V616 L1480 659Z" fill="#585d69"/>
  <path d="M373 431 L1510 625" stroke="#f3e6c5" strokeWidth="3" strokeDasharray="24 20"/>
  <IsoProp kind="factory" x={165} y={306} w={235} h={210} id="press-building" color="#d3c9e0"/>
  <IsoProp kind="printingpress" x={245} y={415} w={310} h={250} id="printing-machine"/>
  <Label x={180} y={90} text="The print room" detail={p.masthead}/>
  {t<.37?[0,1,2].map(i=>{const q=(f/65+i/3)%1;return <IsoProp key={i} kind="newspaper" x={310+q*160} y={390+q*35} w={75} h={45} id={`press-sheet-${i}`} opacity={reveal(t,.03)}/>;}):null}
  <IsoProp kind="deliverystack" x={445} y={427} w={145} h={140} id="delivery-stack" opacity={reveal(t,.12)*(1-reveal(t,.36))}/>
  {p.homes.map((home,i)=>{const q=(i+.55)/p.homes.length,pt=route(q),arrival=.37+q*.48,drop=reveal(t,arrival,.07);return <g key={i}>
   <path d={`M${pt.x-42} ${pt.y-50} L${pt.x+7} ${pt.y-80} L${pt.x+7} ${pt.y-155} L${pt.x-42} ${pt.y-126}Z`} fill="#e1d2b7"/>
   <IsoProp kind="house" x={pt.x} y={pt.y-128} w={205} h={204} id={`home-${i}`} color={['#d5c5e4','#b8d4c4','#ead29f','#bcd1e7'][i]}/>
   <Label x={pt.x} y={pt.y-355} text={home}/>
   <IsoProp kind="tree" x={pt.x+106} y={pt.y-136} w={75} h={110} id={`home-tree-${i}`}/>
   {drop>0?<IsoProp kind="newspaper" x={pt.x-35+35*drop} y={pt.y-28-90*drop-85*Math.sin(drop*Math.PI)} w={64} h={42} id={`delivered-${i}`}/>:null}
  </g>;})}
  <IsoProp kind="truck" x={van.x} y={van.y} w={260} h={210} id="news-van" color="#a8c9dd"/>
  <g opacity={reveal(t,.39)}><path d={`M${van.x-140} ${van.y-44} l-40 -7 M${van.x-150} ${van.y-26} l-25 -4`} stroke="#c3ac8d" strokeWidth="3" strokeLinecap="round"/></g>
  <Caption progress={t} step={`0${step+1} / DISTRIBUTION`} text={['The presses roll and the first copies come off the line.','Fold, bundle and load the morning edition.','The delivery van follows its neighbourhood route.','A fresh newspaper lands at each doorstep.'][step]}/>
 </JournalismStage>;
};
