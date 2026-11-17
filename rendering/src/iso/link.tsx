/**
 * Curved, moving link: the curve draws itself, then chevrons and packets (dots with a fading trail,
 * or little people) run along it toward the target, and the arrowhead pulses when one arrives.
 */
import type {FC} from 'react';
import {PAPER, poly, type Pt} from './iso';
import {along, pathTo, type Curve} from './curve';
import {IsoPerson} from './shapes';

const PACKET_COLORS = ['#9fc4ec', '#f4c178', '#c9b6ec', '#9ed3a8', '#f2a37d', '#f3b9c6'];

const head = (tip: Pt, angle: number, size: number): Pt[] => [
  tip,
  {x: tip.x - size * Math.cos(angle - 0.42), y: tip.y - size * Math.sin(angle - 0.42)},
  {x: tip.x - size * 0.55 * Math.cos(angle), y: tip.y - size * 0.55 * Math.sin(angle)},
  {x: tip.x - size * Math.cos(angle + 0.42), y: tip.y - size * Math.sin(angle + 0.42)},
];

export const IsoLink: FC<{
  k: Curve; progress: number; phase: number; u: number; sw: number; T: number;
  flow: 'dots' | 'people' | 'none'; dashed?: boolean; seed?: number; speed?: number;
}> = ({k, progress, phase, u, sw, T, flow, dashed = false, seed = 0, speed = 1}) => {
  if (progress <= 0) return null;
  const drawn = progress >= 1;
  // one trip takes ~1.6 s whatever the length, so long and short links feel equally lively
  const period = 48 / speed;
  const runners = drawn && flow !== 'none' ? [0, 1, 2].map((j) => ((phase / period + j / 3) % 1 + 1) % 1) : [];
  const arrival = runners.reduce((m, s) => Math.max(m, s > 0.9 ? (s - 0.9) / 0.1 : 0), 0);
  const end = along(k, progress);
  const headSize = 19 * u * Math.min(1, progress * 3) * (1 + 0.3 * Math.sin(arrival * Math.PI));
  const chevrons = drawn ? [0, 1, 2, 3].map((j) => ((phase / (period * 1.6) + j / 4) % 1 + 1) % 1) : [];
  const fadeEnds = (s: number) => Math.min(1, s * 7, (1 - s) * 7);

  return (
    <g>
      {/* soft shadow line makes the curve read as lying on the paper */}
      <path d={pathTo(k, progress)} fill="none" stroke={PAPER.shadow} strokeWidth={sw * 3.2} strokeLinecap="round" transform={`translate(${3 * u} ${5 * u})`} />
      <path d={pathTo(k, Math.max(0, progress - 0.02))} fill="none" stroke={PAPER.ink} strokeWidth={sw * 1.05} strokeLinecap="round"
        strokeDasharray={dashed ? `${sw * 3} ${sw * 2.6}` : undefined} strokeDashoffset={dashed ? -phase * u * 1.5 : undefined} />
      {/* chevrons running toward the target */}
      {chevrons.map((s, j) => {
        if (s > 0.86 || s < 0.06) return null;
        const {p, angle} = along(k, s);
        const c = 7 * u;
        const pts = [{x: p.x - c * Math.cos(angle - 0.8), y: p.y - c * Math.sin(angle - 0.8)}, p, {x: p.x - c * Math.cos(angle + 0.8), y: p.y - c * Math.sin(angle + 0.8)}];
        return <polyline key={`c${j}`} points={poly(pts)} fill="none" stroke={PAPER.ink} strokeWidth={sw * 0.9} strokeLinecap="round" strokeLinejoin="round" opacity={fadeEnds(s / 0.86)} />;
      })}
      {/* packets with a fading trail */}
      {runners.map((s, j) => {
        const color = PACKET_COLORS[(j + seed) % PACKET_COLORS.length];
        const op = fadeEnds(s);
        if (flow === 'people') {
          const {p} = along(k, s * 0.94);
          return <IsoPerson key={j} at={{x: p.x, y: p.y + 10 * u}} size={T * 0.2} color={color} sw={sw * 0.7} opacity={op} />;
        }
        return (
          <g key={j} opacity={op}>
            {[0.05, 0.028].map((back, m) => {
              const {p} = along(k, Math.max(0, s * 0.94 - back));
              return <circle key={m} cx={p.x} cy={p.y} r={(5 - m) * u} fill={color} opacity={0.3 + m * 0.25} />;
            })}
            {(() => {const {p} = along(k, s * 0.94); return <circle cx={p.x} cy={p.y} r={8.5 * u} fill={color} stroke={PAPER.ink} strokeWidth={2.2 * u} />;})()}
          </g>
        );
      })}
      <polygon points={poly(head(end.p, end.angle, headSize))} fill={PAPER.ink} stroke={PAPER.ink} strokeWidth={sw * 0.5} strokeLinejoin="round" />
    </g>
  );
};
