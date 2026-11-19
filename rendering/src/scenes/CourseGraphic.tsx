import type {ReactNode} from 'react';
import {LearningBoard, useLearningLayout} from '../components/LearningBoard';
import {lectureColors} from '../components/LectureBoard';

export const ink = '#29314a';
export const tone = (i: number) => lectureColors[i % lectureColors.length];
export function Graphic({title, note, children}: {title:string; note?:string; children:ReactNode}) {
  const {u} = useLearningLayout();
  return <LearningBoard title={title}>
    <svg viewBox="0 0 900 350" style={{width:'100%',maxHeight:520*u,color:ink,background:'#fffdf7',borderRadius:16*u}}>
      {children}
    </svg>
    {note && <div style={{fontSize:27*u,fontWeight:600}}>{note}</div>}
  </LearningBoard>;
}
export function Label({x,y,text,size=21}: {x:number;y:number;text:string;size?:number}) {
  return <text x={x} y={y} textAnchor="middle" fill={ink} fontSize={size} fontWeight="650">{text}</text>;
}
export function Tile({x,y,w,h,text,i=0}: {x:number;y:number;w:number;h:number;text:string;i?:number}) {
  return <g><rect x={x} y={y} width={w} height={h} rx="10" fill={tone(i).fill} stroke={tone(i).ink}/>
    <foreignObject x={x+5} y={y+2} width={w-10} height={h-4}><div style={{height:'100%',display:'grid',placeItems:'center',textAlign:'center',fontSize:20,lineHeight:1.12,fontWeight:650,color:ink,overflowWrap:'anywhere'}}>{text}</div></foreignObject></g>;
}
export function Arrow({x,y,end,p=1}: {x:number;y:number;end:number;p?:number}) {
  const tip=x+(end-x)*p, dir=Math.sign(end-x);
  return <g opacity={p}><path d={`M${x} ${y} H${tip} m${-10*dir} -6 l${10*dir} 6 l${-10*dir} 6`} fill="none" stroke={ink} strokeWidth="3"/></g>;
}
