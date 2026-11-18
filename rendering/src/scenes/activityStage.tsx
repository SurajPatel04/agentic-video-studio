import type {FC, ReactNode} from 'react';
import {useCurrentFrame} from 'remotion';
import {useSceneLength} from '../theme';
import {PAPER} from '../iso/iso';
import {PaperStage, useStageBox, clamp01} from './paperStage';

export const activityProgress = (frame: number, length: number) => clamp01(frame / Math.max(1, length - 1));
export const useActivityProgress = () => activityProgress(useCurrentFrame(), useSceneLength());
export const ActivityStage: FC<{title: string; eyebrow: string; children: ReactNode}> = ({title, eyebrow, children}) => {
  const {x, y, s} = useStageBox(1600, 660, true);
  return <PaperStage title={title} eyebrow={eyebrow}><svg viewBox="0 0 1600 660" width={1600 * s} height={660 * s} style={{position: 'absolute', left: x, top: y, overflow: 'visible', fontFamily: PAPER.sans, fill: PAPER.ink}}>{children}</svg></PaperStage>;
};
export const Panel: FC<{x: number; y?: number; w: number; h: number; fill?: string}> = ({x, y = 0, w, h, fill = PAPER.card}) => <rect x={x} y={y} width={w} height={h} rx={24} fill={fill} stroke={PAPER.ink} strokeWidth={2.5}/>;
