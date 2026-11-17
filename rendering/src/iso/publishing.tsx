import type {FC,ReactNode} from 'react';
import {face,type ArtProps,type Geo} from './objects';
import {IsoBox} from './shapes';
import {PAPER,shade} from './iso';
export type PublishingKind='printingpress'|'newspaperbundle'|'magazine'|'printingplates'|'newsstand'|'deliverystack';
export const PublishingArt:FC<ArtProps & {kind:PublishingKind}>=(p)=>{
 const {g,zz,T,o,sw,id,color,kind}=p;
 const box=(key:string,x:number,y:number,z:number,w:number,d:number,h:number,c:string,top?:ReactNode,front?:ReactNode)=>{
  const b:Geo={x:g.x+x*g.w,y:g.y+y*g.d,z:zz+z*g.h,w:w*g.w,d:d*g.d,h:h*g.h};
  return <g key={key}><IsoBox id={`${id}-${key}`} {...b} color={c} T={T} o={o} sw={sw*.8} radius={T*.025}/>{top&&<g transform={face('top',b,b.z,p)}>{top}</g>}{front&&<g transform={face('front',b,b.z,p)}>{front}</g>}</g>;
 };
 const print=(w:number,d:number,mag=false)=><>
  <rect x={w*.06} y={d*.06} width={w*.88} height={d*.18} fill={mag?'#34485b':PAPER.ink}/>
  <text x={w*.5} y={d*.19} textAnchor="middle" fontFamily={PAPER.sans} fontSize={d*.12} fontWeight={800} fill={PAPER.card}>{mag?'STORIES':'DAILY NEWS'}</text>
  <rect x={w*.07} y={d*.31} width={w*.4} height={d*.36} fill={mag?'#c5dbd1':'#a5b7c6'}/>
  <path d={`M${w*.07} ${d*.67} L${w*.2} ${d*.42} L${w*.3} ${d*.55} L${w*.4} ${d*.39} L${w*.47} ${d*.67}Z`} fill="#65867f"/>
  {[0,1,2,3,4].map(i=><path key={i} d={`M${w*.54} ${d*(.34+i*.075)} H${w*.92}`} stroke={PAPER.ink} strokeWidth={sw/T*.35}/>)}
  {[.76,.84,.92].map(y=><path key={y} d={`M${w*.07} ${d*y} H${w*.92}`} stroke={PAPER.ink} strokeWidth={sw/T*.3}/>)}
 </>;
 const bundle=(key:string,x:number,y:number,z:number,w:number,d:number,h:number)=>box(key,x,y,z,w,d,h,'#f5efdf',<>{print(g.w*w,g.d*d)}<rect x={g.w*w*.47} width={g.w*w*.055} height={g.d*d} fill="#b5976c"/></>,<>{[.2,.4,.6,.8].map(v=><path key={v} d={`M0 ${g.h*h*v} H${g.w*w}`} stroke="#a39b8c" strokeWidth={sw/T*.3}/>)}<rect x={g.w*w*.47} width={g.w*w*.055} height={g.h*h} fill="#b5976c"/></>);
 if(kind==='newspaperbundle')return <g>{bundle('papers',0,0,0,1,1,1)}</g>;
 if(kind==='magazine')return <g>{box('pages',.02,.02,0,.96,.96,.7,PAPER.card)}{box('cover',0,0,.7,1,1,.15,color,print(g.w,g.d,true))}</g>;
 if(kind==='printingplates')return <g>{[0,1,2].map(i=>box(`plate${i}`,i*.04,i*.04,i*.25,.9,.9,.08,['#8c9da8','#a8bac6','#c5d1d6'][i],<><rect x={g.w*.06} y={g.d*.06} width={g.w*.78} height={g.d*.78} fill="none" stroke="#647a88" strokeWidth={sw/T*.5}/><g opacity={.65}>{print(g.w*.9,g.d*.9)}</g>{[.08,.82].map(x=><circle key={x} cx={g.w*x} cy={g.d*.035} r={.035} fill={PAPER.ink}/>)}</>))}</g>;
 if(kind==='deliverystack')return <g>{[0,.42,.84].map((y,i)=>box(`pallet${i}`,0,y,0,1,.15,.12,'#b18d64'))}{bundle('lower',.05,.05,.12,.9,.9,.34)}{bundle('upper',.13,.12,.46,.74,.74,.36)}{box('label',.5,.22,.82,.3,.27,.02,PAPER.card,<><path d={`M.04 .05 H${g.w*.26} M.04 .12 H${g.w*.2}`} stroke={PAPER.ink} strokeWidth={sw/T*.5}/></>)}</g>;
 if(kind==='newsstand')return <g>
  {box('cabinet',0,0,0,1,1,.28,color)}
  {box('back',0,0,.28,1,.12,.55,shade(color,-.1))}
  {[0,1].map(row=><g key={row}>{box(`shelf${row}`,0,.2+row*.3,.56-row*.22,1,.45,.04,'#a58566')}{[0,1,2,3].map(i=>box(`issue${row}${i}`,.04+i*.24,.22+row*.3,.6-row*.22,.19,.05,.25,['#d78778','#8aafbd','#b4c895','#e3c57f'][(i+row)%4],undefined,<><rect x={g.w*.015} y={g.h*.025} width={g.w*.16} height={g.h*.05} fill={PAPER.card}/><rect x={g.w*.02} y={g.h*.1} width={g.w*.15} height={g.h*.1} fill="#526b77"/></>))}</g>)}
  {[0,.94].map((x,i)=>box(`post${i}`,x,.05,.28,.06,.07,.65,'#96775b'))}
  {box('roof',-.04,-.04,.93,1.08,1.08,.07,'#cc776b',undefined,<text x={g.w*.54} y={g.h*.055} textAnchor="middle" fontFamily={PAPER.sans} fontSize={g.h*.045} fontWeight={800} fill={PAPER.card}>NEWS & MAGAZINES</text>)}
 </g>;
 return <g>
  {box('base',0,0,0,1,1,.12,'#7b8593')}
  {box('housing',.1,.06,.12,.78,.55,.7,color)}
  {box('feed',.1,.1,.82,.7,.45,.05,'#e2e7e9',print(g.w*.7,g.d*.45))}
  {box('output',.15,.62,.24,.68,.36,.05,'#75808e')}
  {box('sheet',.2,.55,.3,.58,.44,.015,PAPER.card,print(g.w*.58,g.d*.44))}
  <g transform={face('front',{...g,x:g.x+g.w*.1,y:g.y+g.d*.06,w:g.w*.78,d:g.d*.55,h:g.h*.7},zz+g.h*.12,p)}>
   <rect x={g.w*.06} y={g.h*.12} width={g.w*.66} height={g.h*.35} rx={.06} fill="#354252"/>
   {[.23,.55].map(x=><g key={x}><circle cx={g.w*x} cy={g.h*.29} r={g.h*.12} fill="#9caab5" stroke={PAPER.ink} strokeWidth={sw/T}/><circle cx={g.w*x} cy={g.h*.29} r={g.h*.035} fill="#354252"/></g>)}
   <rect x={g.w*.08} y={g.h*.53} width={g.w*.2} height={g.h*.07} fill="#b9e2c7"/>
   <circle cx={g.w*.64} cy={g.h*.56} r={.045} fill="#e5604f"/>
  </g>
 </g>;
};
