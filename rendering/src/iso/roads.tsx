import type {FC} from 'react';
import type {ArtProps} from './objects';
import {IsoBox} from './shapes';
import {C30, S30, PAPER, project, shade} from './iso';

export const ROAD_KINDS = {
  road: {size: [10, 2.6, 0.12], color: 'slate'},
  singlelane: {size: [8, 1.6, 0.12], color: 'slate'},
  twolane: {size: [8, 3, 0.12], color: 'slate'},
  fourlane: {size: [9, 4.6, 0.12], color: 'slate'},
  highway: {size: [10, 5.4, 0.18], color: 'slate'},
} as const;
export type RoadKind = keyof typeof ROAD_KINDS;
export const isRoadKind = (kind: string): kind is RoadKind => Object.prototype.hasOwnProperty.call(ROAD_KINDS, kind);

/** Road tiles run along +x. Lane widths and markings scale with the footprint. */
export const RoadArt: FC<ArtProps & {kind?: RoadKind}> = ({id,g,zz,T,o,sw,color,kind='road'}) => {
  const top=project(g.x,g.y,zz+g.h,T,o);
  const divided=kind==='highway', multi=divided||kind==='fourlane', single=kind==='singlelane';
  const edge=g.d*.08, mid=g.d/2, median=divided?g.d*.1:0;
  const laneWidth=(g.d-2*edge-median)/(single?1:multi?4:2);
  const centers=single?[mid]:multi?[edge+laneWidth/2,edge+laneWidth*1.5,mid+median/2+laneWidth/2,mid+median/2+laneWidth*1.5]:[edge+laneWidth/2,mid+laneWidth/2];
  const stroke=sw/T, dash=g.w*.065;
  const line=(y:number,fill:string,dashed=false)=> <line x1={g.w*.015} x2={g.w*.985} y1={y} y2={y} stroke={fill} strokeWidth={stroke*.85} strokeDasharray={dashed?`${dash} ${dash*.7}`:undefined}/>;
  return <g data-road-kind={kind}>
    <IsoBox id={id} x={g.x} y={g.y} z={zz} w={g.w} d={g.d} h={g.h} color={shade(color,-.58)} T={T} o={o} sw={sw} radius={T*.035}/>
    <g transform={`matrix(${C30*T} ${S30*T} ${-C30*T} ${S30*T} ${top.x} ${top.y})`}>
      <rect width={g.w} height={edge*.65} fill="#8b8d87"/>
      <rect y={g.d-edge*.65} width={g.w} height={edge*.65} fill="#8b8d87"/>
      {line(edge,PAPER.card)}{line(g.d-edge,PAPER.card)}
      {!single&&!divided&&<g data-marking="center">{kind==='road'?line(mid,'#f4da93',true):<>{line(mid-g.d*.018,'#f4da93')}{line(mid+g.d*.018,'#f4da93')}</>}</g>}
      {multi&&<g data-marking="lane-dividers">{line(edge+laneWidth,PAPER.card,true)}{line(mid+median/2+laneWidth,PAPER.card,true)}</g>}
      {divided&&<g>{line(mid-median*.7,'#f4da93')}{line(mid+median*.7,'#f4da93')}</g>}
      {kind!=='road'&&centers.map((y,i)=>{
        const reverse=!single&&i<centers.length/2, x=g.w*(reverse?.36:.64), length=Math.min(g.w*.11,laneWidth*.9), head=laneWidth*.2;
        return <g key={i} data-marking="direction" transform={`translate(${x} ${y}) rotate(${reverse?180:0})`} fill="none" stroke={PAPER.card} strokeWidth={stroke} strokeLinejoin="round" strokeLinecap="round"><path d={`M${-length} 0 H${length} M${length-head} ${-head} L${length} 0 L${length-head} ${head}`}/></g>;
      })}
    </g>
    {divided&&<IsoBox id={`${id}-median`} x={g.x} y={g.y+mid-median/2} z={zz+g.h} w={g.w} d={median} h={g.h*.65} color="#b6b9a5" T={T} o={o} sw={sw*.6} radius={T*.025}/>}
  </g>;
};
