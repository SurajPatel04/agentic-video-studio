import type {FC} from 'react';
import {z} from 'zod';
import {PAPER} from '../iso/iso';
import {MONO, clamp01} from './paperStage';
import {ActivityStage, Panel, useActivityProgress} from './activityStage';

export const liveDashboardSceneSchema = z.object({
  eyebrow: z.string().max(40).default('LIVE / SERVICE HEALTH'),
  title: z.string().max(70).default('A failure you can see in the numbers'),
  server: z.string().min(1).max(28).default('API server'),
  baselineMs: z.number().positive().max(10000).default(80),
  peakMs: z.number().positive().max(60000).default(650),
  requestsPerSecond: z.number().positive().max(1000000).default(1200),
  failureAt: z.number().min(0.1).max(0.6).default(0.32),
  recoveryAt: z.number().min(0.2).max(0.8).default(0.66),
}).strict().superRefine((p, ctx) => {
  if (p.recoveryAt <= p.failureAt + 0.08) ctx.addIssue({code: 'custom', path: ['recoveryAt'], message: 'Recovery must follow failure by more than 0.08 of the scene.'});
  if (p.peakMs <= p.baselineMs) ctx.addIssue({code: 'custom', path: ['peakMs'], message: 'Peak latency must exceed baseline latency.'});
});
export const description = 'Animated monitoring dashboard with continuously moving latency and throughput graphs, live KPI values and server status. The server fails at failureAt and recovers at recoveryAt (fractions of scene duration); latency rises and falls while throughput drops and returns. Customize server, baselineMs, peakMs and requestsPerSecond. Illustrative simulated metrics, not a live data connection.';
export const tags = ['live dashboard', 'dashboard', 'monitoring', 'latency', 'server', 'failure', 'recovery', 'observability', 'throughput', 'real time'];
export const LiveDashboardScene: FC<z.input<typeof liveDashboardSceneSchema>> = (input) => {
  const p = liveDashboardSceneSchema.parse(input), t = useActivityProgress();
  const impact = (at: number) => at < p.failureAt ? 0 : at < p.recoveryAt ? clamp01((at - p.failureAt) / 0.08) : 1 - clamp01((at - p.recoveryAt) / 0.12);
  const latency = (at: number) => p.baselineMs * (1 + 0.035 * Math.sin(at * 180)) + (p.peakMs - p.baselineMs) * impact(at);
  const throughput = (at: number) => p.requestsPerSecond * (1 - 0.72 * impact(at)) * (1 + 0.015 * Math.sin(at * 150));
  const down = t >= p.failureAt && t < p.recoveryAt, settling = t >= p.recoveryAt && t < p.recoveryAt + 0.12;
  const status = down ? 'SERVER OFFLINE' : settling ? 'RECOVERING' : 'HEALTHY';
  const color = down ? '#c65d50' : settling ? '#c28a32' : '#47966a';
  const charts = [{label: 'LATENCY', unit: 'ms', value: latency(t), fn: latency, max: p.peakMs * 1.12, color: '#8a6fd1'}, {label: 'THROUGHPUT', unit: 'req/s', value: throughput(t), fn: throughput, max: p.requestsPerSecond * 1.15, color: '#47966a'}];
  return <ActivityStage title={p.title} eyebrow={p.eyebrow}>
    <Panel x={0} w={1600} h={94}/>
    <circle cx={38} cy={47} r={10} fill={color}/><text x={62} y={56} fontSize={26} fontWeight={800}>{p.server}</text>
    <text x={1558} y={55} textAnchor="end" fontSize={23} fill={color} fontWeight={800}>{status}</text>
    {charts.map((c, i) => {
      const x = i * 820, y = 137, w = 780, top = 300, bottom = 515;
      const points = Array.from({length: 101}, (_, j) => {
        const at = t - 0.4 + j / 100 * 0.4;
        return at < 0 ? null : [x + 45 + j / 100 * 690, bottom - c.fn(at) / c.max * (bottom - top)];
      }).filter((pt): pt is number[] => pt !== null);
      const d = points.map(([px, py], j) => `${j ? 'L' : 'M'}${px},${py}`).join(' ');
      return <g key={c.label}>
        <Panel x={x} y={y} w={w} h={444}/>
        <text x={x + 35} y={186} fontSize={20} letterSpacing={2} fill={PAPER.inkSoft}>{c.label}</text>
        <text x={x + 35} y={254} fontSize={52} fontFamily={MONO} fontWeight={800}>{Math.round(c.value).toLocaleString('en-US')}<tspan fontSize={23}> {c.unit}</tspan></text>
        {[0, 0.5, 1].map(f => <line key={f} x1={x + 45} x2={x + 735} y1={top + f * (bottom - top)} y2={top + f * (bottom - top)} stroke={PAPER.track} strokeDasharray="5 7"/>)}
        <text x={x + 45} y={289} fontSize={16} fill={PAPER.inkSoft}>{Math.round(c.max)} {c.unit}</text>
        <path d={d} fill="none" stroke={c.color} strokeWidth={5} strokeLinejoin="round"/>
        <circle cx={points.at(-1)![0]} cy={points.at(-1)![1]} r={7} fill={c.color}/>
        <text x={x + 45} y={551} fontSize={18} fill={PAPER.inkSoft}>0 · rolling window</text><text x={x + 735} y={551} textAnchor="end" fontSize={18} fill={PAPER.inkSoft}>now</text>
      </g>;
    })}
    <text x={800} y={635} textAnchor="middle" fontSize={24} fill={color}>{down ? 'Server failure → latency spikes, throughput drops' : settling ? 'Server restored → metrics return to normal' : t >= p.recoveryAt ? 'Recovered · normal service resumes' : 'Normal service · waiting for the failure event'}</text>
  </ActivityStage>;
};
