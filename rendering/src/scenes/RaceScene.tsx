import type {FC} from 'react';
import {z} from 'zod';
import {PAPER} from '../iso/iso';
import {MONO, clamp01} from './paperStage';
import {ActivityStage, Panel, useActivityProgress} from './activityStage';

const laneSchema = z.object({label: z.string().min(1).max(28), seconds: z.number().positive().max(3600), color: z.string().default('#8a6fd1')}).strict();
export const raceSceneSchema = z.object({
  eyebrow: z.string().max(40).default('SIDE BY SIDE / SAME TASK'),
  title: z.string().max(70).default('The same request. A faster finish.'),
  lanes: z.tuple([laneSchema, laneSchema]).default([{label: 'No cache', seconds: 8, color: '#e48b48'}, {label: 'Cache', seconds: 2, color: '#47966a'}]),
}).strict();
export const description = 'Two simultaneous split-screen lanes with moving progress bars and stopwatches. Supply exactly two lanes {label, seconds, color?}; lower seconds wins and receives a checkmark. Equal times show a tie. Both start together, finish according to their relative durations, and hold results before the scene ends. Useful for cache versus no cache, algorithms, or before/after speed comparisons.';
export const tags = ['race', 'split screen', 'comparison', 'cache', 'stopwatch', 'performance', 'speed', 'benchmark', 'before after'];
export const RaceScene: FC<z.input<typeof raceSceneSchema>> = (input) => {
  const p = raceSceneSchema.parse(input), t = useActivityProgress();
  const max = Math.max(...p.lanes.map(l => l.seconds)), min = Math.min(...p.lanes.map(l => l.seconds));
  const elapsed = clamp01((t - 0.08) / 0.74) * max;
  return <ActivityStage title={p.title} eyebrow={p.eyebrow}>
    {p.lanes.map((lane, i) => {
      const x = i * 830, progress = clamp01(elapsed / lane.seconds), done = elapsed >= lane.seconds;
      const winner = done && lane.seconds === min, tie = min === max;
      return <g key={i}>
        <Panel x={x} w={770} h={570}/>
        <text x={x + 42} y={66} fontSize={32} fontWeight={800}>{lane.label}</text>
        <text x={x + 42} y={104} fontSize={20} fill={PAPER.inkSoft}>Completion time · {lane.seconds}s</text>
        <circle cx={x + 385} cy={265} r={112} fill="none" stroke={PAPER.track} strokeWidth={12}/>
        <circle cx={x + 385} cy={265} r={112} fill="none" stroke={lane.color} strokeWidth={12} strokeDasharray={`${progress * 704} 704`} transform={`rotate(-90 ${x + 385} 265)`} strokeLinecap="round"/>
        <path d={`M${x + 385},265 l${Math.sin(progress * Math.PI * 2) * 72},${-Math.cos(progress * Math.PI * 2) * 72}`} stroke={lane.color} strokeWidth={7} strokeLinecap="round"/>
        <circle cx={x + 385} cy={265} r={8} fill={lane.color}/>
        <text x={x + 385} y={426} textAnchor="middle" fontSize={48} fontFamily={MONO} fontWeight={800}>{Math.min(elapsed, lane.seconds).toFixed(2)}s</text>
        <rect x={x + 42} y={466} width={686} height={14} rx={7} fill={PAPER.track}/>
        <rect x={x + 42} y={466} width={686 * progress} height={14} rx={7} fill={lane.color}/>
        <text x={x + 385} y={532} textAnchor="middle" fontSize={26} fontWeight={800} fill={winner ? '#34794e' : PAPER.inkSoft}>{winner ? (tie ? '✓ Tied finish' : '✓ Winner') : done ? 'Complete' : t < 0.08 ? 'Ready' : 'Running…'}</text>
      </g>;
    })}
    <text x={800} y={635} textAnchor="middle" fontSize={23} fill={PAPER.inkSoft}>{elapsed >= min ? min === max ? 'Both sides finish together' : `${p.lanes.find(l => l.seconds === min)!.label} finishes ${(max / min).toFixed(1)}× faster` : 'Both sides start at the same time'}</text>
  </ActivityStage>;
};
