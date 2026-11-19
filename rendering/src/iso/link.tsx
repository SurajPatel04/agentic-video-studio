/**
 * Curved, moving link: the curve draws itself, then chevrons and packets (dots with a fading trail,
 * or little people) run along it toward the target, and the arrowhead pulses when one arrives.
 */
import {KeyRound, Coins} from 'lucide-react';
import type {FC} from 'react';
import {PAPER, poly, type Pt} from './iso';
import {along, curve, pathTo, type Curve} from './curve';
import {IsoPerson} from './shapes';
import {IsoArt} from './objects';
import {LinkMediaMotion, LinkNoise, type LinkMedia} from './MediaFlow';

const PACKET_COLORS = ['#9fc4ec', '#f4c178', '#c9b6ec', '#9ed3a8', '#f2a37d', '#f3b9c6'];

const head = (tip: Pt, angle: number, size: number): Pt[] => [
  tip,
  {x: tip.x - size * Math.cos(angle - 0.42), y: tip.y - size * Math.sin(angle - 0.42)},
  {x: tip.x - size * 0.55 * Math.cos(angle), y: tip.y - size * 0.55 * Math.sin(angle)},
  {x: tip.x - size * Math.cos(angle + 0.42), y: tip.y - size * Math.sin(angle + 0.42)},
];

type LaneProps = {
  k: Curve; progress: number; phase: number; u: number; sw: number; T: number;
  flow: 'dots' | 'people' | 'car' | 'key' | 'coin' | 'wave' | 'none'; clean?: boolean; drop?: boolean; dashed?: boolean; seed?: number; speed?: number;
  media?: LinkMedia; noise?: boolean; fps?: number;
};

export const IsoLink: FC<LaneProps & {bidirectional?: boolean; activeLane?: 'request' | 'reply'}> = ({bidirectional, activeLane, ...props}) => {
  if (!bidirectional) return <Lane {...props} />;
  const {k, u} = props;
  const angle = Math.atan2(k.b.y - k.a.y, k.b.x - k.a.x);
  const gap = Math.min(16 * u, k.length * 0.08);
  const offset = (p: Pt, side: number) => ({x: p.x - side * gap * Math.sin(angle), y: p.y + side * gap * Math.cos(angle)});
  // For timed exchanges keep the request on the upper track as a record of the trip.
  const requestSide = activeLane ? (k.b.x >= k.a.x ? -1 : 1) : 1;
  const completed = activeLane === 'reply';
  return <>
    <Lane {...props} progress={completed ? 1 : props.progress} phase={completed ? 0 : props.phase}
      flow={completed ? 'none' : props.flow}
      k={curve(offset(k.a, requestSide), offset(k.c, 2 * requestSide), offset(k.b, requestSide))} />
    {activeLane !== 'request' && <Lane {...props} media={undefined} returning dashed
      k={curve(offset(k.b, -requestSide), offset(k.c, -2 * requestSide), offset(k.a, -requestSide))} />}
  </>;
};

const Lane: FC<LaneProps & {returning?: boolean}> = ({returning, k, progress, phase, u, sw, T, flow, clean, drop, dashed = false, seed = 0, speed = 1, media, noise, fps = 30}) => {
  if (progress <= 0) return null;
  const drawn = progress >= 1;
  // one trip takes ~1.6 s whatever the length, so long and short links feel equally lively
  const period = 48 / speed;
  const runners = drawn && !media && flow !== 'none' && flow !== 'wave' ? (flow === 'car' ? [0] : (k.length < 300 * u ? [0] : [0, 1, 2])).map((j) => ((phase / period + j / 3) % 1 + 1) % 1) : [];
  const arrival = runners.reduce((m, s) => Math.max(m, s > 0.9 ? (s - 0.9) / 0.1 : 0), 0);
  const end = along(k, progress);
  const headSize = Math.min(24 * u, k.length * 0.32) * Math.min(1, progress * 3) * (1 + 0.3 * Math.sin(arrival * Math.PI));
  const tint = returning ? '#95cbb4' : '#b3a3d9';
  const shaft = pathTo(k, progress);
  const dash = dashed ? {strokeDasharray: `${sw * 3} ${sw * 3}`, strokeDashoffset: flow === 'none' && !returning ? 0 : -phase * u} : {};
  const fadeEnds = (s: number) => Math.min(1, s * 7, (1 - s) * 7);

  return (
    <g>
      {/* soft shadow line makes the curve read as lying on the paper */}
      <path d={pathTo(k, progress)} fill="none" stroke={PAPER.shadow} strokeWidth={sw * 3.2} strokeLinecap="round" transform={`translate(${3 * u} ${5 * u})`} />
      <g fill="none" strokeLinecap="round" {...dash}>
        <path d={shaft} stroke={PAPER.ink} strokeWidth={sw * 2.3} />
        <path d={shaft} stroke={tint} strokeWidth={sw * 1.35} />
      </g>
      {/* packets with a fading trail */}
      {runners.map((s, j) => {
        if (flow === 'key' || flow === 'coin' || ((clean || drop) && flow === 'dots')) {
          const fall = drop ? Math.max(0,(s-0.55)/0.45) : 0;
          const {p} = along(k,drop ? Math.min(s,0.55) : s);
          const blend = Math.max(0,Math.min(1,(s-0.32)/0.36));
          const color = clean ? `rgb(${150-65*blend},${150+20*blend},${150-45*blend})` : PACKET_COLORS[(j+seed)%PACKET_COLORS.length];
          const Icon = flow === 'key' ? KeyRound : Coins;
          return <g key={j} transform={`translate(${p.x} ${p.y+fall*fall*75*u}) scale(${u})`} opacity={fadeEnds(s)*(1-fall)}>
            {flow === 'dots' ? <circle r={9} fill={color} stroke={PAPER.ink} strokeWidth={2}/> :
              <Icon x={-16} y={-16} width={32} height={32} color={PAPER.ink} fill={flow==='key'?'#c9b6ec':'#e9bd62'}/>}
          </g>;
        }
        const color = returning ? '#95cbb4' : PACKET_COLORS[(j + seed) % PACKET_COLORS.length];
        const op = fadeEnds(s);
        if (flow === 'car') {
          const {p, angle} = along(k, s * 0.94);
          const tile = Math.max(12 * u, Math.min(T * 0.3, 22 * u));
          return <g key={j} opacity={op} transform={`translate(${p.x} ${p.y}) rotate(${angle * 180 / Math.PI - 30})`}>
            <IsoArt kind="car" id={`link-car-${seed}`} g={{x: -1.4, y: -0.75, z: 0, w: 2.8, d: 1.5, h: 1.5}} zz={0} color={color} T={tile} o={{x:0,y:0}} sw={sw * 0.7} />
          </g>;
        }
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
      <polygon points={poly(head(end.p, end.angle, headSize))} fill={tint} stroke={PAPER.ink} strokeWidth={sw * 0.75} strokeLinejoin="round" />
      {drawn && media && <LinkMediaMotion k={k} u={u} media={media}/>}
      {drawn && noise && <LinkNoise k={k} u={u} seconds={Math.max(0,phase/fps)}/>}
    </g>
  );
};
