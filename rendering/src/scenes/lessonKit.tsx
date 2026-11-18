import type {ReactNode} from 'react';
import {useCurrentFrame} from 'remotion';
import {z} from 'zod';
import {useSceneLength} from '../theme';
import {PAPER} from '../iso/iso';
import {PaperStage, useStageBox} from './paperStage';

export const title = z.string().trim().min(1).max(70).optional();
export const integer = z.number().int().min(-99).max(99);
export const fmt = (n:number) => String(Number(n.toFixed(3)));
export const ink = PAPER.ink, accent = '#7554a1', green = '#397357';
export function lesson<S extends z.ZodType<{title?:string}>>(schema:S, heading:string, tags:string[], description:string,
  draw:(props:z.output<S>,progress:number)=>ReactNode) {
  function Component(input:z.input<S>) {
    const props = schema.parse(input);
    const f = useCurrentFrame(), duration = useSceneLength();
    const box = useStageBox(1200,600,true);
    const progress = Math.max(0,Math.min(1,(f/Math.max(1,duration-1)-0.06)/0.84));
    return <PaperStage title={props.title ?? heading}><svg viewBox="0 0 1200 600"
      style={{position:'absolute',left:box.x,top:box.y,width:1200*box.s,height:600*box.s}} fill={ink} fontFamily={PAPER.sans}>
      <rect x={2} y={2} width={1196} height={596} rx={26} stroke={PAPER.track} strokeWidth={3} fill={PAPER.card}/>
      {draw(props,progress)}
    </svg></PaperStage>;
  }
  return {component:Component,schema,tags,description};
}
export function label(x:number,y:number,text:string,size=32,color=ink,anchor:'start'|'middle'|'end'='middle') {
  return <text x={x} y={y} textAnchor={anchor} fill={color} fontSize={size} fontWeight={650}>{text}</text>;
}
export const indexAt = (p:number,n:number) => Math.min(n-1,Math.floor(p*n));
export function grid(rows:(string|number)[][],active:number,header:boolean) {
  const h = Math.min(72,410/rows.length), w = Math.min(215,1060/rows[0].length);
  return rows.map((row,i)=>row.map((value,j)=>{
    const index=i*row.length+j, selected=index===active;
    return <g key={index} transform={`translate(${600-row.length*w/2+j*w},${48+i*h})`}>
      <rect width={w-3} height={h-3} rx={6} fill={selected?'#e4d6f5':header&&i===0?'#eae5db':'#f8f5ed'}/>
      {label(w/2,h*.64,String(value),Math.min(29,h*.52))}
    </g>;
  }));
}
export function arrow(x:number,y:number,dx:number,dy:number,color:string) {
  const angle=Math.atan2(dy,dx)*180/Math.PI;
  return <g transform={`translate(${x} ${y}) rotate(${angle})`} stroke={color} fill={color}>
    <line x2={Math.hypot(dx,dy)} strokeWidth={6}/>
    {Math.hypot(dx,dy)>8 && <path transform={`translate(${Math.hypot(dx,dy)} 0)`} d="M0 0 l-15 -8 v16 Z"/>}
  </g>;
}
