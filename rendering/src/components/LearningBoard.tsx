import type {PropsWithChildren} from 'react';
import {useVideoConfig} from 'remotion';
import {LectureBoard, useLectureTiming} from './LectureBoard';
import {PAPER} from '../iso/iso';
import {useUnit} from '../theme';

export const valueText = (value: number) =>
  new Intl.NumberFormat('en-US', {maximumFractionDigits: 3}).format(Math.abs(value) < 0.0005 ? 0 : value);

export function useLearningLayout() {
  const {width, height} = useVideoConfig();
  return {u: useUnit(), portrait: width < height, ...useLectureTiming()};
}

export function LearningBoard({title, subtitle, children}: PropsWithChildren<{title: string; subtitle?: string}>) {
  const u = useUnit();
  return <LectureBoard title={title} subtitle={subtitle}>
    <div style={{width:'100%', maxWidth:1510*u, display:'grid', alignContent:'center', gap:16*u, minWidth:0}}>
      {children}
    </div>
  </LectureBoard>;
}

export function LearningCard({title, children, tint = PAPER.card, opacity = 1}: PropsWithChildren<{
  title?: string; tint?: string; opacity?: number;
}>) {
  const u = useUnit();
  return <section style={{minWidth:0, minHeight:0, padding:`${16*u}px ${21*u}px`, background:tint, opacity,
    border:`1px solid ${PAPER.track}`, borderRadius:13*u, fontSize:25*u, lineHeight:1.23, overflowWrap:'anywhere'}}>
    {title ? <div style={{fontSize:21*u,fontWeight:800,marginBottom:9*u}}>{title}</div> : null}
    {children}
  </section>;
}
