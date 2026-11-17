/**
 * Shared 2D motion effects (SVG, frame-driven). Points are in % of the frame, sizes in 1080p px.
 *
 *   <FlowPath points={[{x: 20, y: 50}, {x: 80, y: 50}]} effect="packet" label="GET /" />
 *   <FlowPath points={...} effect="current" />     electrons along a copper wire
 *   <FlowPath points={...} effect="light" />       fibre light pulse with a glowing trail
 *   <FlowPath points={...} effect="bits" />        0 1 0 1 binary stream
 *   <SignalWaves at={{x: 30, y: 40}} toward={{x: 70, y: 40}} />   Wi-Fi / radio waves
 */
import {getLength, getPointAtLength} from '@remotion/paths';
import type {FC} from 'react';
import {useMemo} from 'react';
import {interpolate, useCurrentFrame, useVideoConfig} from 'remotion';
import {z} from 'zod';
import {progress} from '../motion/timing';
import {useTheme, useUnit} from '../theme';

const frame = z.number().int().nonnegative();
const pct = z.number().min(-20).max(120);

/** Named spots on the frame (inside a safe margin), so JSON can say "top-right" instead of numbers. */
export const ANCHORS = {
  'top-left': {x: 10, y: 12}, top: {x: 50, y: 12}, 'top-right': {x: 90, y: 12},
  left: {x: 10, y: 50}, center: {x: 50, y: 50}, right: {x: 90, y: 50},
  'bottom-left': {x: 10, y: 88}, bottom: {x: 50, y: 88}, 'bottom-right': {x: 90, y: 88},
} as const;
export type Anchor = keyof typeof ANCHORS;
export const anchorSchema = z.enum(Object.keys(ANCHORS) as [Anchor, ...Anchor[]]);

/** A point: {x, y} in % of the frame, or a named anchor like "top-right". */
export const pointSchema = z
  .union([z.object({x: pct, y: pct}).strict(), anchorSchema])
  .transform((p) => (typeof p === 'string' ? {...ANCHORS[p]} : p));
export type Pt = z.output<typeof pointSchema>;

/* ------------------------------------------------------------------ path helpers */

type P = {x: number; y: number};
const toward = (a: P, b: P, d: number): P => {
  const len = Math.hypot(b.x - a.x, b.y - a.y) || 1;
  const k = Math.min(d, len * 0.45) / len;
  return {x: a.x + (b.x - a.x) * k, y: a.y + (b.y - a.y) * k};
};

/** SVG path through px points; `bend` curves a 2-point path, `inset` trims both ends. */
export const buildPath = (pts: P[], bend: number, inset: number): string => {
  const q = [...pts];
  if (inset > 0) {
    q[0] = toward(q[0], q[1], inset);
    q[q.length - 1] = toward(q[q.length - 1], q[q.length - 2], inset);
  }
  if (q.length === 2 && bend !== 0) {
    const [a, b] = q;
    const mx = (a.x + b.x) / 2 - (b.y - a.y) * bend;
    const my = (a.y + b.y) / 2 + (b.x - a.x) * bend;
    return `M ${a.x} ${a.y} Q ${mx} ${my} ${b.x} ${b.y}`;
  }
  return `M ${q.map((p) => `${p.x} ${p.y}`).join(' L ')}`;
};

/* --------------------------------------------------------------------- FlowPath */

export const flowEffectTypes = ['packet', 'current', 'light', 'bits', 'none'] as const;
export type FlowEffect = (typeof flowEffectTypes)[number];

export const flowSchema = z
  .object({
    points: z.array(pointSchema).min(2).max(12), // % of the frame
    effect: z.enum(flowEffectTypes).default('packet'),
    startAt: frame.default(0),
    drawFor: frame.default(18), // frames to draw the wire first (0 = already there)
    trip: z.number().min(0.2).max(30).default(1.6), // seconds for one trip end to end
    count: z.number().int().min(1).max(40).optional(), // how many packets / electrons (default per effect)
    loop: z.boolean().default(true), // false = each item travels once
    reverse: z.boolean().default(false),
    bend: z.number().min(-1).max(1).default(0), // curve a 2-point path
    inset: z.number().min(0).max(500).default(0), // trim both ends (e.g. to stop at a device's edge)
    wire: z.boolean().default(true),
    color: z.string().optional(), // moving things
    wireColor: z.string().optional(),
    width: z.number().min(1).max(30).default(5),
    label: z.string().max(24).optional(), // text on the packet, or in the middle of the wire
    stopAt: frame.optional(), // frame the motion stops (wire stays)
  })
  .strict();
export type FlowProps = z.input<typeof flowSchema>;

const DEFAULT_COUNT: Record<FlowEffect, number> = {packet: 1, current: 14, light: 1, bits: 8, none: 0};

/** A wire / link that draws itself, then carries packets, current, light or bits along it. */
export const FlowPath: FC<FlowProps> = (input) => {
  const p = flowSchema.parse(input);
  const f = useCurrentFrame();
  const {fps, width: W, height: H} = useVideoConfig();
  const theme = useTheme();
  const u = useUnit();
  const key = JSON.stringify(p.points);
  const d = useMemo(() => {
    const px = p.points.map((q) => ({x: (q.x / 100) * W, y: (q.y / 100) * H}));
    return buildPath(p.reverse ? px.reverse() : px, p.bend, p.inset * u);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, p.reverse, p.bend, p.inset, u, W, H]);
  const len = useMemo(() => getLength(d), [d]);

  const local = f - p.startAt;
  if (local < 0) return null;
  const draw = p.drawFor ? progress(f, p.startAt, p.drawFor) : 1;
  const color = p.color ?? (p.effect === 'current' ? '#facc15' : p.effect === 'light' ? '#e0f2fe' : theme.accent);
  const wireColor =
    p.wireColor ??
    (p.effect === 'current' ? '#b87333' : p.effect === 'light' ? `color-mix(in srgb, ${theme.accent} 30%, transparent)` : `color-mix(in srgb, ${theme.accent} 40%, transparent)`);
  const running = draw >= 1 && (p.stopAt === undefined || f < p.stopAt);
  const trips = (local - p.drawFor) / fps / p.trip;
  const n = p.count ?? DEFAULT_COUNT[p.effect];

  // Position (0..1) of item i, or null when it is not on the wire.
  const at = (i: number): number | null => {
    if (p.loop) return (((trips + i / n) % 1) + 1) % 1;
    const k = trips - i * (p.effect === 'packet' ? 0.45 : 1 / n);
    return k >= 0 && k <= 1 ? k : null;
  };
  const point = (k: number) => getPointAtLength(d, Math.max(0, Math.min(len, k * len))) ?? {x: 0, y: 0};
  const glow = (r: number) => ({filter: `drop-shadow(0 0 ${r * u}px ${color})`});

  const items = running && p.effect !== 'none' ? Array.from({length: n}, (_, i) => [i, at(i)] as const).filter(([, k]) => k !== null) : [];
  const mid = point(0.5);

  return (
    <div style={{position: 'absolute', inset: 0, pointerEvents: 'none'}}>
      <svg width={W} height={H} style={{position: 'absolute', inset: 0, overflow: 'visible'}}>
        {p.wire ? (
          <path d={d} fill="none" stroke={wireColor} strokeWidth={p.width * u} strokeLinecap="round" strokeLinejoin="round"
            strokeDasharray={len} strokeDashoffset={len * (1 - draw)} />
        ) : null}
        {p.effect === 'current' && running ? (
          // moving dashes inside the wire: the "flow" of current
          <path d={d} fill="none" stroke={color} strokeOpacity={0.55} strokeWidth={p.width * 0.4 * u} strokeLinecap="round"
            strokeDasharray={`${10 * u} ${16 * u}`} strokeDashoffset={-(local / fps) * (len / p.trip)} />
        ) : null}
        {items.map(([i, k]) => {
          const pt = point(k!);
          switch (p.effect) {
            case 'current':
              return <circle key={i} cx={pt.x} cy={pt.y} r={p.width * 0.9 * u} fill={color} style={glow(8)} />;
            case 'light': {
              const trail = Math.min(len * 0.35, 220 * u);
              return (
                <g key={i} style={glow(14)}>
                  <path d={d} fill="none" stroke={theme.accent} strokeWidth={p.width * 1.3 * u} strokeLinecap="round"
                    strokeDasharray={`${trail} ${len + trail}`} strokeDashoffset={trail - k! * len} />
                  <circle cx={pt.x} cy={pt.y} r={p.width * 1.4 * u} fill={color} />
                </g>
              );
            }
            case 'bits':
              return (
                <text key={i} x={pt.x} y={pt.y} dy="0.35em" textAnchor="middle" fill={color} style={{...glow(6), font: `700 ${30 * u}px ui-monospace, monospace`}}>
                  {(i * 7 + 3) % 3 === 0 ? '0' : '1'}
                </text>
              );
            case 'packet':
            default: {
              const w = 52 * u;
              const h = 36 * u;
              const pop = interpolate(Math.min(k!, 1 - k!), [0, 0.06], [0.4, 1], {extrapolateRight: 'clamp'});
              return (
                <g key={i} transform={`translate(${pt.x} ${pt.y}) scale(${pop})`} style={glow(12)}>
                  <rect x={-w / 2} y={-h / 2} width={w} height={h} rx={7 * u} fill={color} />
                  <path d={`M ${-w / 2 + 5 * u} ${-h / 2 + 6 * u} L 0 ${3 * u} L ${w / 2 - 5 * u} ${-h / 2 + 6 * u}`} fill="none" stroke="#fff" strokeWidth={3 * u} strokeLinejoin="round" />
                  {p.label ? (
                    <text y={-h / 2 - 12 * u} textAnchor="middle" fill="#fff" style={{font: `700 ${24 * u}px Inter, sans-serif`}}>{p.label}</text>
                  ) : null}
                </g>
              );
            }
          }
        })}
      </svg>
      {p.label && p.effect !== 'packet' && draw >= 1 ? (
        <div style={{position: 'absolute', left: mid.x, top: mid.y, transform: 'translate(-50%, -150%)', padding: `${5 * u}px ${12 * u}px`,
          borderRadius: 10 * u, background: 'rgba(2,6,23,0.75)', color: '#fff', fontSize: 26 * u, fontWeight: 600, whiteSpace: 'nowrap'}}>
          {p.label}
        </div>
      ) : null}
    </div>
  );
};

/* ------------------------------------------------------------------ SignalWaves */

export const wavesSchema = z
  .object({
    at: pointSchema, // where the waves start (% of the frame)
    toward: pointSchema.optional(), // aim at a point: sets the angle and how far they reach
    angle: z.number().min(-360).max(360).default(-90), // degrees: 0 = right, -90 = up
    spread: z.number().min(10).max(360).default(90), // 360 = full rings
    reach: z.number().min(20).max(2500).default(260), // 1080p px
    inset: z.number().min(0).max(500).default(30), // start radius (and stop short of `toward`)
    count: z.number().int().min(1).max(8).default(3),
    speed: z.number().min(0.1).max(5).default(0.8), // waves per second
    width: z.number().min(1).max(30).default(7),
    maxHeight: z.number().min(20).max(2000).optional(), // cap each arc's height (px) so long links don't get huge arcs
    color: z.string().optional(),
    startAt: frame.default(0),
    stopAt: frame.optional(),
  })
  .strict();
export type WavesProps = z.input<typeof wavesSchema>;

/** Radio / Wi-Fi / sound waves: arcs (or rings) that spread out and fade. */
export const SignalWaves: FC<WavesProps> = (input) => {
  const p = wavesSchema.parse(input);
  const f = useCurrentFrame();
  const {fps, width: W, height: H} = useVideoConfig();
  const theme = useTheme();
  const u = useUnit();
  const local = f - p.startAt;
  if (local < 0 || (p.stopAt !== undefined && f >= p.stopAt + fps)) return null;
  const cx = (p.at.x / 100) * W;
  const cy = (p.at.y / 100) * H;
  let angle = (p.angle * Math.PI) / 180;
  let reach = p.reach * u;
  if (p.toward) {
    const tx = (p.toward.x / 100) * W;
    const ty = (p.toward.y / 100) * H;
    angle = Math.atan2(ty - cy, tx - cx);
    reach = Math.max(p.inset * u * 2, Math.hypot(tx - cx, ty - cy) - p.inset * u);
  }
  const inner = p.inset * u;
  const half = ((p.spread / 2) * Math.PI) / 180;
  const color = p.color ?? theme.accent;
  const fadeIn = progress(f, p.startAt, 10);
  return (
    <svg width={W} height={H} style={{position: 'absolute', inset: 0, overflow: 'visible', pointerEvents: 'none'}}>
      {Array.from({length: p.count}, (_, i) => {
        const raw = (local / fps) * p.speed + i / p.count;
        // after stopAt, let the last waves finish but start no new ones
        const bornAt = p.startAt + ((Math.floor(raw) - i / p.count) / p.speed) * fps; // frame this wave left the source
        if (p.stopAt !== undefined && bornAt > p.stopAt) return null;
        const k = raw % 1;
        const r = inner + (reach - inner) * k;
        const hh = p.maxHeight !== undefined && p.spread < 360 ? Math.min(half, Math.asin(Math.min(1, (p.maxHeight * u) / 2 / Math.max(r, 1)))) : half;
        const opacity = fadeIn * Math.min(1, k * 5) * (1 - k);
        const d =
          p.spread >= 360
            ? `M ${cx - r} ${cy} a ${r} ${r} 0 1 0 ${r * 2} 0 a ${r} ${r} 0 1 0 ${-r * 2} 0`
            : `M ${cx + r * Math.cos(angle - hh)} ${cy + r * Math.sin(angle - hh)} A ${r} ${r} 0 ${p.spread > 180 ? 1 : 0} 1 ${cx + r * Math.cos(angle + hh)} ${cy + r * Math.sin(angle + hh)}`;
        return <path key={i} d={d} fill="none" stroke={color} strokeWidth={p.width * u} strokeLinecap="round" opacity={opacity}
          style={{filter: `drop-shadow(0 0 ${8 * u}px ${color})`}} />;
      })}
    </svg>
  );
};
