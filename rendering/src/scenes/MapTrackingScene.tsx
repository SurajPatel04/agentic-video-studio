import type {FC} from 'react';
import {z} from 'zod';
import {PAPER} from '../iso/iso';
import {MONO, clamp01} from './paperStage';
import {ActivityStage, Panel, useActivityProgress} from './activityStage';

export const mapTrackingSceneSchema = z.object({
  eyebrow: z.string().max(40).default('DELIVERY / TRACKING'),
  title: z.string().max(70).default('Follow the delivery, all the way home'),
  origin: z.string().min(1).max(24).default('Dispatch hub'),
  destination: z.string().min(1).max(24).default('Your doorstep'),
  courier: z.string().min(1).max(24).default('Delivery partner'),
  etaSeconds: z.number().int().positive().max(86400).default(180),
  route: z.array(z.tuple([z.number().min(0).max(1), z.number().min(0).max(1)])).min(2).max(20).default([[0.08, 0.8], [0.3, 0.8], [0.3, 0.5], [0.64, 0.5], [0.64, 0.2], [0.92, 0.2]]),
}).strict().superRefine((p, ctx) => {
  if (!p.route.some((pt, i) => i > 0 && Math.hypot(pt[0] - p.route[i - 1][0], pt[1] - p.route[i - 1][1]) > 0)) ctx.addIssue({code: 'custom', path: ['route'], message: 'Route must contain at least two different positions.'});
});
export const description = 'A delivery dot travels along a street-map route, leaving a colored trail as the arrival countdown decreases to zero. Shows origin, destination, courier, progress and delivered confirmation. route is 2–20 normalized [x,y] points (0..1); movement follows segment distance at constant speed. etaSeconds is the illustrative trip time compressed to fit the scene. Schematic map, no external map assets required.';
export const tags = ['map tracking', 'delivery', 'tracking', 'route', 'logistics', 'arrival', 'countdown', 'eta', 'courier', 'gps'];
export const MapTrackingScene: FC<z.input<typeof mapTrackingSceneSchema>> = (input) => {
  const p = mapTrackingSceneSchema.parse(input), t = useActivityProgress();
  const progress = clamp01((t - 0.08) / 0.76), arrived = progress >= 1;
  const pts = p.route.map(([x, y]) => [60 + x * 990, 100 + y * 420]);
  const lengths = pts.slice(1).map((pt, i) => Math.hypot(pt[0] - pts[i][0], pt[1] - pts[i][1]));
  const total = lengths.reduce((a, b) => a + b, 0), distance = progress * total;
  let remain = distance, segment = 0;
  while (segment < lengths.length - 1 && remain >= lengths[segment]) {remain -= lengths[segment]; segment++;}
  const f = lengths[segment] === 0 ? 0 : remain / lengths[segment];
  const pos = pts[segment].map((v, axis) => v + (pts[segment + 1][axis] - v) * f);
  const route = pts.map(pt => pt.join(',')).join(' '), end = pts[pts.length - 1];
  const seconds = Math.ceil(p.etaSeconds * (1 - progress));
  return <ActivityStage title={p.title} eyebrow={p.eyebrow}>
    <Panel x={0} w={1120} h={590} fill="#eaece2"/>
    {Array.from({length: 7}, (_, i) => Array.from({length: 4}, (_, j) => <rect key={`${i}-${j}`} x={25 + i * 157} y={25 + j * 140} width={125} height={105} rx={14} fill={(i + j) % 4 === 0 ? '#d4dfc8' : '#e0dcd1'}/>))}
    <polyline points={route} fill="none" stroke={PAPER.card} strokeWidth={32} strokeLinejoin="round" strokeLinecap="round"/>
    <polyline points={route} fill="none" stroke="#c5bfd4" strokeWidth={12} strokeLinejoin="round" strokeLinecap="round"/>
    <polyline points={route} fill="none" stroke="#8a6fd1" strokeWidth={12} strokeLinejoin="round" strokeLinecap="round" strokeDasharray={`${distance} ${total + 1}`}/>
    <circle cx={pts[0][0]} cy={pts[0][1]} r={12} fill={PAPER.card} stroke="#8a6fd1" strokeWidth={5}/>
    <circle cx={end[0]} cy={end[1]} r={20} fill={arrived ? '#47966a' : PAPER.card} stroke={PAPER.ink} strokeWidth={3}/>
    <text x={end[0]} y={end[1] + 7} textAnchor="middle" fontSize={22} fill={arrived ? '#fff' : PAPER.ink}>{arrived ? '✓' : '⌂'}</text>
    <circle cx={pos[0]} cy={pos[1]} r={30 + 5 * Math.sin(t * 90)} fill="#8a6fd1" opacity={arrived ? 0 : 0.16}/>
    <circle cx={pos[0]} cy={pos[1]} r={15} opacity={arrived ? 0 : 1} fill="#8a6fd1" stroke="#fffdf8" strokeWidth={5}/>
    <Panel x={1160} w={440} h={590}/>
    <text x={1196} y={56} fontSize={19} letterSpacing={2} fill={PAPER.inkSoft}>ARRIVAL COUNTDOWN</text>
    <text x={1196} y={144} fontSize={68} fontFamily={MONO} fontWeight={800}>{Math.floor(seconds / 60).toString().padStart(2, '0')}:{(seconds % 60).toString().padStart(2, '0')}</text>
    <text x={1196} y={192} fontSize={28} fill={arrived ? '#47966a' : '#8a6fd1'} fontWeight={800}>{arrived ? '✓ Delivered' : t < 0.08 ? 'Preparing to depart' : 'On the way'}</text>
    <line x1={1196} x2={1564} y1={228} y2={228} stroke={PAPER.track} strokeWidth={2}/>
    <text x={1196} y={275} fontSize={18} fill={PAPER.inkSoft}>FROM</text><text x={1196} y={310} fontSize={25} fontWeight={700}>{p.origin}</text>
    <text x={1196} y={360} fontSize={18} fill={PAPER.inkSoft}>TO</text><text x={1196} y={395} fontSize={25} fontWeight={700}>{p.destination}</text>
    <text x={1196} y={451} fontSize={22} fill={PAPER.inkSoft}>{p.courier}</text>
    <rect x={1196} y={486} width={368} height={12} rx={6} fill={PAPER.track}/><rect x={1196} y={486} width={368 * progress} height={12} rx={6} fill="#8a6fd1"/>
    <text x={1196} y={545} fontSize={22} fontFamily={MONO}>{Math.floor(progress * 100)}% of route</text>
    <text x={560} y={635} textAnchor="middle" fontSize={22} fill={PAPER.inkSoft}>Schematic route · trip time compressed for illustration</text>
  </ActivityStage>;
};
