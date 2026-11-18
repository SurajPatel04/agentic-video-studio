/**
 * More shared 2D effects (positions in % of the frame or a named anchor, sizes in 1080p px):
 *
 *   <FieldLines at="center" kind="magnet" />        bar magnet with flowing field lines (also positive / negative / dipole charges)
 *   <SoundWave from="left" to="right" />            moving sine wave (sound / signal)
 *   <ProgressBar at="bottom" to={100} label="Uploading" />
 *   <Lock at="center" text="hello world" />         padlock closes, text scrambles into ciphertext
 */
import {PAPER} from '../iso/iso';
import type {CSSProperties, FC} from 'react';
import {interpolate, spring, useCurrentFrame, useVideoConfig} from 'remotion';
import {z} from 'zod';
import {Sfx} from '../audio';
import {progress} from '../motion/timing';
import {useTheme, useUnit} from '../theme';
import {ANCHORS, pointSchema, type Pt} from './flow';

const frame = z.number().int().nonnegative();

/** Place an element at a point: centred, but edge-aligned near the frame edges so it never runs off. */
export const placeAt = (at: Pt, W: number, H: number): CSSProperties => {
  const ax = at.x <= 15 ? 0 : at.x >= 85 ? -100 : -50;
  const ay = at.y <= 15 ? 0 : at.y >= 85 ? -100 : -50;
  return {position: 'absolute', left: (at.x / 100) * W, top: (at.y / 100) * H, transform: `translate(${ax}%, ${ay}%)`};
};

/* ------------------------------------------------------------------ FieldLines */

export const fieldSchema = z
  .object({
    at: pointSchema.default({x: 50, y: 50}),
    kind: z.enum(['magnet', 'dipole', 'positive', 'negative']).default('magnet'),
    size: z.number().min(80).max(900).default(360), // distance between the poles (or line length for one charge)
    lines: z.number().int().min(2).max(10).default(5), // per side
    color: z.string().optional(),
    speed: z.number().min(0).max(5).default(1), // how fast the field "flows"
    showSource: z.boolean().default(true), // draw the magnet / charges
    startAt: frame.default(0),
  })
  .strict();
export type FieldProps = z.input<typeof fieldSchema>;

/** Magnetic / electric field lines that draw in, then flow (dashes move along the field direction). */
export const FieldLines: FC<FieldProps> = (input) => {
  const p = fieldSchema.parse(input);
  const f = useCurrentFrame();
  const {fps, width: W, height: H} = useVideoConfig();
  const theme = useTheme();
  const u = useUnit();
  if (f < p.startAt) return null;
  const cx = (p.at.x / 100) * W;
  const cy = (p.at.y / 100) * H;
  const a = (p.size * u) / 2;
  const color = p.color ?? theme.accent;
  const draw = progress(f, p.startAt, 24);
  const flow = ((f - p.startAt) / fps) * p.speed * 60 * u;
  const paths: string[] = [];
  if (p.kind === 'magnet' || p.kind === 'dipole') {
    for (let k = 1; k <= p.lines; k++) {
      const h = (k / p.lines) * a * 1.5;
      for (const s of [-1, 1]) {
        paths.push(`M ${cx - a} ${cy} C ${cx - a - h * 0.7} ${cy + s * h * 1.25}, ${cx + a + h * 0.7} ${cy + s * h * 1.25}, ${cx + a} ${cy}`);
      }
    }
    paths.push(`M ${cx - a - a * 0.9} ${cy} L ${cx - a} ${cy}`, `M ${cx + a} ${cy} L ${cx + a + a * 0.9} ${cy}`);
  } else {
    const n = p.lines * 2;
    for (let i = 0; i < n; i++) {
      const ang = (i / n) * Math.PI * 2;
      const r0 = 46 * u;
      const r1 = a * 1.6;
      const [x0, y0, x1, y1] = [cx + Math.cos(ang) * r0, cy + Math.sin(ang) * r0, cx + Math.cos(ang) * r1, cy + Math.sin(ang) * r1];
      paths.push(p.kind === 'negative' ? `M ${x1} ${y1} L ${x0} ${y0}` : `M ${x0} ${y0} L ${x1} ${y1}`);
    }
  }
  const sourceIn = spring({frame: f - p.startAt, fps, config: {damping: 14}});
  const charge = (x: number, sign: '+' | '−', c: string) => (
    <g transform={`translate(${x} ${cy}) scale(${sourceIn})`}>
      <circle r={40 * u} fill={c} style={{filter: `drop-shadow(0 0 ${14 * u}px ${c})`}} />
      <text dy="0.35em" textAnchor="middle" fill="#fff" style={{font: `800 ${50 * u}px Inter, sans-serif`}}>{sign}</text>
    </g>
  );
  return (
    <svg width={W} height={H} style={{position: 'absolute', inset: 0, overflow: 'visible', pointerEvents: 'none'}}>
      {paths.map((d, i) => (
        <g key={i} opacity={draw}>
          <path d={d} fill="none" stroke={color} strokeOpacity={0.35} strokeWidth={3 * u} />
          <path d={d} fill="none" stroke={color} strokeWidth={4 * u} strokeLinecap="round" strokeDasharray={`${14 * u} ${26 * u}`}
            strokeDashoffset={-flow} style={{filter: `drop-shadow(0 0 ${6 * u}px ${color})`}} />
        </g>
      ))}
      {p.showSource && p.kind === 'magnet' ? (
        <g transform={`translate(${cx} ${cy}) scale(${sourceIn})`}>
          <rect x={-a * 0.85} y={-34 * u} width={a * 0.85} height={68 * u} rx={8 * u} fill="#ef4444" />
          <rect x={0} y={-34 * u} width={a * 0.85} height={68 * u} rx={8 * u} fill="#3b82f6" />
          <text x={-a * 0.42} dy="0.35em" textAnchor="middle" fill="#fff" style={{font: `800 ${44 * u}px Inter, sans-serif`}}>N</text>
          <text x={a * 0.42} dy="0.35em" textAnchor="middle" fill="#fff" style={{font: `800 ${44 * u}px Inter, sans-serif`}}>S</text>
        </g>
      ) : null}
      {p.showSource && p.kind === 'dipole' ? <>{charge(cx - a, '+', '#ef4444')}{charge(cx + a, '−', '#3b82f6')}</> : null}
      {p.showSource && p.kind === 'positive' ? charge(cx, '+', '#ef4444') : null}
      {p.showSource && p.kind === 'negative' ? charge(cx, '−', '#3b82f6') : null}
    </svg>
  );
};

/* ------------------------------------------------------------------- SoundWave */

export const soundSchema = z
  .object({
    from: pointSchema.default({...ANCHORS['left']}),
    to: pointSchema.default({...ANCHORS['right']}),
    amplitude: z.number().min(4).max(300).default(60), // px
    wavelength: z.number().min(20).max(800).default(140), // px
    speed: z.number().min(0).max(6).default(1.2), // waves per second
    fade: z.boolean().default(true), // quieter toward the end
    color: z.string().optional(),
    width: z.number().min(1).max(20).default(6),
    startAt: frame.default(0),
    stopAt: frame.optional(),
  })
  .strict();
export type SoundProps = z.input<typeof soundSchema>;

/** A travelling sine wave between two points (sound, radio, any signal). */
export const SoundWave: FC<SoundProps> = (input) => {
  const p = soundSchema.parse(input);
  const f = useCurrentFrame();
  const {fps, width: W, height: H} = useVideoConfig();
  const theme = useTheme();
  const u = useUnit();
  if (f < p.startAt) return null;
  const x0 = (p.from.x / 100) * W;
  const y0 = (p.from.y / 100) * H;
  const x1 = (p.to.x / 100) * W;
  const y1 = (p.to.y / 100) * H;
  const len = Math.hypot(x1 - x0, y1 - y0);
  const ang = Math.atan2(y1 - y0, x1 - x0);
  const reveal = progress(f, p.startAt, 20);
  const t = ((Math.min(f, p.stopAt ?? Infinity) - p.startAt) / fps) * p.speed;
  const steps = 160;
  const pts: string[] = [];
  for (let i = 0; i <= steps; i++) {
    const s = (i / steps) * len * reveal;
    const env = p.fade ? 1 - (0.75 * s) / len : 1;
    const y = Math.sin((s / (p.wavelength * u)) * Math.PI * 2 - t * Math.PI * 2) * p.amplitude * u * env;
    pts.push(`${s.toFixed(1)},${y.toFixed(1)}`);
  }
  const color = p.color ?? theme.accent;
  return (
    <svg width={W} height={H} style={{position: 'absolute', inset: 0, overflow: 'visible', pointerEvents: 'none'}}>
      <polyline transform={`translate(${x0} ${y0}) rotate(${(ang * 180) / Math.PI})`} points={pts.join(' ')} fill="none" stroke={color}
        strokeWidth={p.width * u} strokeLinecap="round" strokeLinejoin="round" style={{filter: `drop-shadow(0 0 ${8 * u}px ${color})`}} />
    </svg>
  );
};

/* ----------------------------------------------------------------- ProgressBar */

export const progressSchema = z
  .object({
    at: pointSchema.default({...ANCHORS['bottom']}),
    width: z.number().min(120).max(1800).default(900),
    height: z.number().min(6).max(80).default(26),
    from: z.number().min(0).max(100).default(0),
    to: z.number().min(0).max(100).default(100),
    startAt: frame.default(0),
    duration: frame.default(75),
    label: z.string().max(40).optional(),
    doneLabel: z.string().max(40).optional(), // replaces the label at 100%
    showPercent: z.boolean().default(true),
    color: z.string().optional(),
  })
  .strict();
export type ProgressProps = z.input<typeof progressSchema>;

/** Progress / loading bar that fills from `from` to `to` %. */
export const ProgressBar: FC<ProgressProps> = (input) => {
  const p = progressSchema.parse(input);
  const f = useCurrentFrame();
  const {width: W, height: H} = useVideoConfig();
  const theme = useTheme();
  const u = useUnit();
  if (f < p.startAt) return null;
  const k = progress(f, p.startAt, Math.max(1, p.duration));
  const value = p.from + (p.to - p.from) * k;
  const done = value >= 100 && k >= 1;
  const color = p.color ?? (done ? '#22c55e' : theme.accent);
  const appear = interpolate(f - p.startAt, [0, 8], [0, 1], {extrapolateRight: 'clamp'});
  const shine = ((f / 30) % 1) * 140 - 20;
  return (
    <div style={{...placeAt(p.at, W, H), width: p.width * u, opacity: appear, display: 'flex', flexDirection: 'column', gap: 12 * u}}>
      {p.label || p.showPercent ? (
        <div style={{display: 'flex', justifyContent: 'space-between', fontSize: 30 * u, fontWeight: 600, color: theme.text}}>
          <span>{done && p.doneLabel ? p.doneLabel : p.label}</span>
          {p.showPercent ? <span style={{fontVariantNumeric: 'tabular-nums', color}}>{Math.round(value)}%</span> : null}
        </div>
      ) : null}
      <div style={{height: p.height * u, borderRadius: p.height * u, background: 'rgba(148,163,184,0.18)', overflow: 'hidden'}}>
        <div style={{width: `${value}%`, height: '100%', borderRadius: p.height * u, background: color, position: 'relative', overflow: 'hidden',
          boxShadow: `0 0 ${16 * u}px ${color}`}}>
          {!done ? <div style={{position: 'absolute', top: 0, bottom: 0, left: `${shine}%`, width: '20%', background: 'linear-gradient(90deg, transparent, rgba(255,255,255,0.45), transparent)'}} /> : null}
        </div>
      </div>
      {p.to >= 100 ? <Sfx sound="success" at={p.startAt + p.duration} volume={0.7} /> : null}
    </div>
  );
};

/* ------------------------------------------------------------- Lock / encrypt */

export const lockSchema = z
  .object({
    at: pointSchema.default({...ANCHORS['center']}),
    size: z.number().min(40).max(500).default(170),
    startAt: frame.default(0), // appears open
    lockAt: frame.optional(), // shackle closes (default startAt + 20)
    unlockAt: frame.optional(), // opens again and the text decrypts
    text: z.string().max(40).optional(), // plain text that scrambles into ciphertext when locked
    cipher: z.string().max(60).optional(), // the ciphertext to show (default: generated from the text)
    color: z.string().optional(),
  })
  .strict();
export type LockProps = z.input<typeof lockSchema>;

const CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz0123456789+/=#$%';
const hash = (s: string, i: number) => {
  let h = 2166136261 ^ i;
  for (const c of s) h = Math.imul(h ^ c.charCodeAt(0), 16777619);
  return Math.abs(h);
};
const makeCipher = (text: string) => Array.from({length: Math.max(8, Math.round(text.length * 1.3))}, (_, i) => CHARS[hash(text, i) % CHARS.length]).join('');

/** Padlock that snaps shut; optional text scrambles into ciphertext (and back on unlock). */
export const Lock: FC<LockProps> = (input) => {
  const p = lockSchema.parse(input);
  const f = useCurrentFrame();
  const {fps, width: W, height: H} = useVideoConfig();
  const theme = useTheme();
  const u = useUnit();
  if (f < p.startAt) return null;
  const lockAt = p.lockAt ?? p.startAt + 20;
  const closed = progress(f, lockAt, 8) - (p.unlockAt !== undefined ? progress(f, p.unlockAt, 8) : 0);
  const pop = spring({frame: f - p.startAt, fps, config: {damping: 12}});
  const snap = f >= lockAt && f < lockAt + 10 ? Math.sin(((f - lockAt) / 10) * Math.PI) : 0;
  const color = p.color ?? (closed > 0.5 ? '#22c55e' : theme.accent);
  const px = p.size * u;

  // Text: plain → scrambling → cipher (and back after unlockAt).
  let shown = p.text ?? '';
  let scrambled = false;
  if (p.text) {
    const cipher = p.cipher ?? makeCipher(p.text);
    const enc = progress(f, lockAt + 4, 24);
    const dec = p.unlockAt !== undefined ? progress(f, p.unlockAt + 4, 24) : 0;
    const k = enc - dec; // 0 = plain, 1 = cipher
    const target = k >= 0.999 ? cipher : k <= 0.001 ? p.text : null;
    if (target) shown = target;
    else {
      scrambled = true;
      const n = Math.round(p.text.length + (cipher.length - p.text.length) * k);
      shown = Array.from({length: n}, (_, i) => (i / n < k ? cipher[i] ?? CHARS[hash(p.text!, i + f) % CHARS.length] : CHARS[hash(p.text!, i * 7 + f) % CHARS.length])).join('');
    }
  }
  const isCipher = p.text ? shown !== p.text : false;

  return (
    <div style={{...placeAt(p.at, W, H), display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 20 * u, opacity: pop}}>
      <svg width={px} height={px * 1.15} viewBox="0 0 24 27.6" style={{overflow: 'visible', transform: `scale(${pop * (1 + 0.08 * snap)})`,
        filter: `drop-shadow(0 0 ${(10 + 20 * snap) * u}px ${color})`}}>
        <path d={`M7 ${12 - 4 * (1 - closed)} V${7.5 - 4 * (1 - closed)} a5 5 0 0 1 10 0 V${12 - 4 * (1 - closed) - (1 - closed) * 3}`} fill="none" stroke="#cbd5e1" strokeWidth={2.6} strokeLinecap="round" />
        <rect x={3} y={11} width={18} height={15} rx={3} fill={color} />
        <circle cx={12} cy={17.2} r={2} fill="#0b1220" />
        <rect x={11.1} y={17.8} width={1.8} height={4} rx={0.9} fill="#0b1220" />
      </svg>
      {p.text ? (
        <span style={{padding: `${12 * u}px ${24 * u}px`, borderRadius: 14 * u, background: PAPER.card, border: `${2 * u}px solid ${isCipher ? color : 'rgba(148,163,184,0.35)'}`,
          fontFamily: isCipher || scrambled ? 'ui-monospace, monospace' : undefined, fontSize: 36 * u, fontWeight: 600, color: isCipher ? color : theme.text, whiteSpace: 'nowrap'}}>
          {shown}
        </span>
      ) : null}
      <Sfx sound="lock" at={lockAt} />
      {p.unlockAt !== undefined ? <Sfx sound="lock" at={p.unlockAt} volume={0.8} /> : null}
    </div>
  );
};
