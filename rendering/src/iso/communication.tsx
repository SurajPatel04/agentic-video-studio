/** Communication-model illustrations, with deterministic scene-time motion. */
import type {FC, ReactNode} from 'react';
import type {ArtProps, Geo} from './objects';
import {IsoBox} from './shapes';
import {C30, S30, PAPER, project, shade} from './iso';

export const COMMUNICATION_KINDS = {
  envelope: {size:[2.4,.35,1.6],color:'cream'},
  sender: {size:[2.2,1.5,2.4],color:'sky'},
  receiver: {size:[2.2,1.5,2.4],color:'mint'},
  encoder: {size:[2.6,1.4,1.6],color:'lavender'},
  decoder: {size:[2.6,1.4,1.6],color:'peach'},
  feedback: {size:[2.4,.5,2.2],color:'teal'},
  noise: {size:[2.6,.5,1.8],color:'coral'},
} as const;
export type CommunicationKind = keyof typeof COMMUNICATION_KINDS;

const front = (g:Geo,z:number,p:ArtProps) => {
  const c=project(g.x,g.y+g.d,z+g.h,p.T,p.o);
  return `matrix(${C30*p.T} ${S30*p.T} 0 ${p.T} ${c.x} ${c.y})`;
};
const EnvelopeGlyph: FC<{w:number;h:number;stroke:number;fill?:string}> = ({w,h,stroke,fill=PAPER.card}) => <g stroke={PAPER.ink} strokeWidth={stroke} strokeLinejoin="round">
  <rect width={w} height={h} rx={Math.min(w,h)*.06} fill={fill}/>
  <path d={`M0 ${h} L${w*.4} ${h*.48} M${w} ${h} L${w*.6} ${h*.48}`} fill="none" opacity={.6}/>
  <path d={`M0 0 L${w*.5} ${h*.58} L${w} 0`} fill="none"/>
</g>;
const Panel: FC<ArtProps & {children:ReactNode}> = (p) => <g>
  <IsoBox id={p.id} x={p.g.x} y={p.g.y} z={p.zz} w={p.g.w} d={p.g.d} h={p.g.h} color={p.color} T={p.T} o={p.o} sw={p.sw} radius={p.T*.05}/>
  <g transform={front(p.g,p.zz,p)}>{p.children}</g>
</g>;
const Station: FC<ArtProps & {receive:boolean}> = (p) => {
  const {g,zz,T,o,sw,id,color,receive,time=0}=p;
  const deck={...g,h:g.h*.22}, screen={...g,x:g.x+g.w*.08,y:g.y+g.d*.22,w:g.w*.84,d:g.d*.25,h:g.h*.48};
  const screenZ=zz+deck.h, lw=sw/T;
  const mast=project(g.x+g.w*.85,g.y+g.d*.25,screenZ+screen.h,T,o);
  const tip={x:mast.x,y:mast.y-g.h*T*.2};
  return <g>
    <path d={`M${mast.x} ${mast.y} V${tip.y}`} stroke={PAPER.ink} strokeWidth={sw*1.2}/>
    <circle cx={tip.x} cy={tip.y} r={sw*1.5} fill={PAPER.ink}/>
    {[0,1,2].map(i=>{const r=T*(.12+i*.1),phase=(time*.8+(receive?(2-i):i)/3)%1;return <path key={i} d={`M${tip.x+r*.65} ${tip.y-r*.7} Q${tip.x+r*1.3} ${tip.y} ${tip.x+r*.65} ${tip.y+r*.7}`} fill="none" stroke={shade(color,-.4)} strokeWidth={sw*.8} opacity={.25+.75*phase}/>;})}
    <Panel {...p} g={deck}><rect x={g.w*.12} y={deck.h*.3} width={g.w*.45} height={deck.h*.3} rx={.03} fill="#384258"/>{[.75,.85].map(x=><circle key={x} cx={g.w*x} cy={deck.h*.45} r={.045} fill="#8bd6a3"/>)}</Panel>
    <Panel {...p} id={`${id}-screen`} g={screen} zz={screenZ} color={shade(color,.1)}>
      <rect x={screen.w*.07} y={screen.h*.1} width={screen.w*.86} height={screen.h*.8} rx={.06} fill="#303b50"/>
      <g transform={`translate(${screen.w*.16} ${screen.h*.25})`}><EnvelopeGlyph w={screen.w*.33} h={screen.h*.42} stroke={lw*.5} fill={receive?'#b9e2c7':'#b8d6f3'}/></g>
      <path d={receive?`M${screen.w*.85} ${screen.h*.47} H${screen.w*.59} l.1 -.09 m-.1 .09 l.1 .09`:`M${screen.w*.59} ${screen.h*.47} H${screen.w*.85} l-.1 -.09 m.1 .09 l-.1 .09`} fill="none" stroke="#f4da93" strokeWidth={lw} strokeLinecap="round" strokeLinejoin="round"/>
    </Panel>
  </g>;
};
const Codec: FC<ArtProps & {decode:boolean}> = (p) => {
  const {g,T,sw,decode}=p, lw=sw/T;
  const text=(x:number)=><text x={x} y={g.h*.54} fontFamily={PAPER.sans} fontSize={g.h*.25} fontWeight={700} fill={PAPER.card}>Aa</text>;
  const signal=(x:number)=><path d={`M${x} ${g.h*.48} h.07 v-.2 h.12 v.34 h.12 v-.34 h.12 v.2 h.07`} fill="none" stroke="#b9e2c7" strokeWidth={lw*.8}/>;
  return <Panel {...p}>
    <rect x={g.w*.06} y={g.h*.13} width={g.w*.88} height={g.h*.6} rx={.08} fill="#303b50"/>
    {decode?signal(g.w*.13):text(g.w*.12)}
    <path d={`M${g.w*.44} ${g.h*.45} H${g.w*.6} l-.1 -.08 m.1 .08 l-.1 .08`} fill="none" stroke="#f4da93" strokeWidth={lw*.8}/>
    {decode?text(g.w*.68):signal(g.w*.68)}
    <text x={g.w*.5} y={g.h*.91} textAnchor="middle" fontFamily={PAPER.font} fontSize={g.h*.105} fontWeight={700} fill={PAPER.ink}>{decode?'DECODE':'ENCODE'}</text>
  </Panel>;
};
const Feedback: FC<ArtProps> = (p) => {
  const {g,T,sw,time=0}=p, lw=sw/T;
  return <Panel {...p}>
    <g transform={`translate(${g.w/2} ${g.h/2}) scale(${g.w*.38} ${g.h*.38})`} fill="none" strokeWidth={lw*2} strokeLinecap="round" strokeLinejoin="round">
      <path d="M-.84 .2 A.86 .86 0 0 1 .64 -.58 L.92 -.3 M.92 -.3 L.4 -.32 M.92 -.3 L.86 -.84" stroke="#376f87"/>
      <path d="M.84 -.2 A.86 .86 0 0 1 -.64 .58 L-.92 .3 M-.92 .3 L-.4 .32 M-.92 .3 L-.86 .84" stroke="#397c61"/>
      <circle cx={Math.cos(time*1.4)*.84} cy={Math.sin(time*1.4)*.84} r={.08} fill="#f4da93" stroke={PAPER.ink} strokeWidth={lw}/>
      <path d="M-.31 -.21 H.3 V.18 H-.05 L-.22 .32 V.18 H-.31 Z" fill={PAPER.card} stroke={PAPER.ink} strokeWidth={lw}/>
    </g>
  </Panel>;
};
const Noise: FC<ArtProps> = (p) => {
  const {g,T,sw,time=0}=p, lw=sw/T;
  const points=Array.from({length:25},(_,i)=>{const x=g.w*(.08+i*.84/24),y=g.h*(.57+Math.sin(i*2.1+time*4)*(i>6&&i<19?.16:.035));return `${x},${y}`;}).join(' ');
  return <Panel {...p}>
    <rect x={g.w*.05} y={g.h*.12} width={g.w*.9} height={g.h*.76} rx={.07} fill="#303b50"/>
    <path d={`M${g.w*.1} ${g.h*.57} H${g.w*.9}`} stroke="#fffaf1" strokeWidth={lw*.5} opacity={.3} strokeDasharray={`${lw*2} ${lw*2}`}/>
    <polyline points={points} fill="none" stroke="#f4a596" strokeWidth={lw} strokeLinejoin="round"/>
    <path d={`M${g.w*.54} ${g.h*.17} l${-g.w*.12} ${g.h*.21} h${g.w*.1} l${-g.w*.04} ${g.h*.15} l${g.w*.16} ${-g.h*.24} h${-g.w*.1} Z`} fill="#f4da93"/>
  </Panel>;
};
export const CommunicationArt: FC<ArtProps & {kind:CommunicationKind}> = (p) => {
  switch(p.kind){
    case 'envelope': return <Panel {...p}><g transform={`translate(${p.g.w*.04} ${p.g.h*.06})`}><EnvelopeGlyph w={p.g.w*.92} h={p.g.h*.88} stroke={p.sw/p.T*.7} fill={shade(p.color,.2)}/></g></Panel>;
    case 'sender':case 'receiver':return <Station {...p} receive={p.kind==='receiver'}/>;
    case 'encoder':case 'decoder':return <Codec {...p} decode={p.kind==='decoder'}/>;
    case 'feedback':return <Feedback {...p}/>;
    case 'noise':return <Noise {...p}/>;
  }
};
