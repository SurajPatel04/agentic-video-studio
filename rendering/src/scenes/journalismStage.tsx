import type {FC, ReactNode} from 'react';
import {useCurrentFrame} from 'remotion';
import {KINDS} from './IsoScene';
import {IsoArt, type ArtKind} from '../iso/objects';
import {IsoBox, IsoPerson} from '../iso/shapes';
import {C30, ISO_COLORS, PAPER} from '../iso/iso';
import {PaperStage, useStageBox, clamp01, ease} from './paperStage';

/** Shared world space: the exact shaded assets, outlines and floor of the tech scenes. */
export const JournalismStage: FC<{title:string; eyebrow:string; children:ReactNode}> = ({title,eyebrow,children}) => {
  const {x,y,s}=useStageBox(1600,760,true);
  return <PaperStage title={title} eyebrow={eyebrow}><svg width={1600*s} height={760*s} viewBox="0 0 1600 760" style={{position:'absolute',left:x,top:y,overflow:'visible',fontFamily:PAPER.sans,color:PAPER.ink}}>{children}</svg></PaperStage>;
};
export const IsoProp:FC<{kind:keyof typeof KINDS; x:number; y:number; w:number; h:number; id:string; opacity?:number; lift?:number; color?:string}> = ({kind,x,y,w,h,id,opacity=1,lift=0,color}) => {
  const f=useCurrentFrame(), k=KINDS[kind], [gw,gd,gh]=k.size;
  const T=Math.min(w/((gw+gd)*C30),h/((gw+gd)*.5+gh));
  const o={x:x-(gw-gd)*C30*T/2,y:y-(gw+gd)*.5*T-lift};
  return <g opacity={opacity}><ellipse cx={x} cy={y-2} rx={w*.37} ry={w*.085} fill={PAPER.shadow}/><IsoArt kind={kind as ArtKind} id={id} g={{x:0,y:0,z:0,w:gw,d:gd,h:gh}} zz={0} T={T} o={o} sw={2.2} color={color??ISO_COLORS[k.color]} time={f/30} highlight={lift>0?0.5:0}/></g>;
};
export const Island:FC<{x:number;y:number;w:number;d:number;color?:string;id:string}>=({x,y,w,d,color='#e7ddcd',id})=><IsoBox id={id} x={0} y={0} z={0} w={w} d={d} h={12} color={color} T={1} o={{x,y}} sw={2} radius={5}/>;
export const Caption:FC<{step:string;text:string;progress:number}>=({step,text,progress})=><g>
  <path d="M90 700 H1510" stroke="#d4c9bb" strokeWidth="2"/>
  <path d={`M90 700 H${90+1420*clamp01(progress)}`} stroke="#d8874c" strokeWidth="3"/>
  <text x="90" y="744" fontSize="19" fontWeight="800" letterSpacing="3" fill="#987058">{step}</text>
  <text x="365" y="744" fontSize="24" fontWeight="600" fill={PAPER.ink}>{text}</text>
</g>;
export const Label:FC<{x:number;y:number;text:string;detail?:string}>=({x,y,text,detail})=><g><text x={x} y={y} textAnchor="middle" fontSize="24" fontWeight="750" fill={PAPER.ink}>{text}</text>{detail?<text x={x} y={y+28} textAnchor="middle" fontSize="17" fill={PAPER.inkSoft}>{detail}</text>:null}</g>;
export const Crowd:FC<{x:number;y:number;react?:boolean}>=({x,y,react})=>{
 const f=useCurrentFrame();return <g>{[0,1,2,3,4,5,6,7].map(i=><IsoPerson key={i} at={{x:x+(i%4)*33-(i<4?20:0),y:y+Math.floor(i/4)*38-(react?Math.sin(f/7+i)*4:0)}} size={22} color={['#b8d6f3','#cdc3ee','#f4da93','#b9e2c7'][i%4]} sw={2}/>)}{react?<g><rect x={x+38} y={y-118} width="100" height="43" rx="14" fill={PAPER.card} stroke={PAPER.ink} strokeWidth="2"/><text x={x+88} y={y-90} textAnchor="middle" fontSize="22">Wow!</text></g>:null}</g>;
};
export const reveal=(t:number,at:number,d=.08)=>ease(clamp01((t-at)/d));

/** A thick monitor with an angled screen; content stays on the front face. */
export const BroadcastMonitor:FC<{x:number;y:number;w:number;active:boolean;close:boolean;channel:string;headline:string;id:string}>=({x,y,w,active,close,channel,headline,id})=>{
 const h=w*.64,dy=w*.14;
 return <g transform={`translate(${x} ${y})`}>
  <path d={`M0 0 L18 -12 L${w+18} ${dy-12} L${w} ${dy}Z`} fill="#9aa0ae" stroke={PAPER.ink} strokeWidth="2"/>
  <path d={`M${w} ${dy} L${w+18} ${dy-12} V${dy+h-12} L${w} ${dy+h}Z`} fill="#555a68" stroke={PAPER.ink} strokeWidth="2"/>
  <path d={`M${w*.48} ${h+w*.07} V${h+w*.07+40} l-40 22 75 10 35 -20 -46 -9 V${h+w*.07}`} fill="#7e8594" stroke={PAPER.ink} strokeWidth="2"/>
  <g transform="matrix(1 .14 0 1 0 0)"><rect width={w} height={h} rx="8" fill="#424855" stroke={PAPER.ink} strokeWidth="3"/>
   <svg x="10" y="10" width={w-20} height={h-20} viewBox="0 0 320 200">
    <rect width="320" height="200" fill={active?'#c5d9e0':'#343c49'}/>
    {active?<><path d="M0 130 L320 80 V200 H0Z" fill="#a6c5d0"/><AnchorSet x={160} y={close?242:169} scale={close?1.15:.69} id={`${id}-anchor`}/><rect x="8" y="8" width="100" height="24" rx="3" fill="#fffaf1"/><text x="14" y="25" fontSize="12" fontWeight="800">{channel}</text><rect x="254" y="8" width="58" height="24" fill="#d45b50"/><text x="283" y="25" textAnchor="middle" fill="white" fontSize="12" fontWeight="800">LIVE</text><rect y="170" width="320" height="30" fill="#f1d18e"/><foreignObject x="10" y="177" width="300" height="23"><div style={{fontSize:12,fontWeight:700,whiteSpace:'nowrap',overflow:'hidden'}}>{headline}</div></foreignObject></>:<text x="160" y="108" textAnchor="middle" fill="#bdc9d2" fontSize="20" letterSpacing="3">STANDBY</text>}
   </svg>
  </g>
 </g>;
};

export const AnchorSet:FC<{x:number;y:number;scale?:number;id:string}>=({x,y,scale=1,id})=><g transform={`translate(${x} ${y}) scale(${scale})`}>
 <IsoPerson at={{x:0,y:-152}} size={38} color="#8d94ba" sw={2.2}/>
 <IsoBox id={`${id}-desk`} x={0} y={0} z={0} w={180} d={100} h={65} T={1} o={{x:-35,y:-140}} sw={2.2} radius={9} color="#d8b983"/>
 <path d="M-45 -126 L-9 -105 L-29 -94 L-65 -115Z" fill="#fffaf1" stroke="#7c6e60" strokeWidth="1.5"/>
 <path d="M32 -95 V-121 M32 -121 L43 -126" stroke="#484650" strokeWidth="4" strokeLinecap="round"/>
</g>;
