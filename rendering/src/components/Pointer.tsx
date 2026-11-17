import type {FC} from 'react';
import {Easing, interpolate, useCurrentFrame, useVideoConfig} from 'remotion';
import {z} from 'zod';
import {useUnit} from '../theme';
import {Sfx} from '../audio';

const frame = z.number().int().nonnegative();

/** JSON shape for a pointer: where it goes (x/y in % of the frame) and when it clicks. */
export const pointerSchema = z
  .object({
    path: z.array(z.object({x: z.number().min(0).max(100), y: z.number().min(0).max(100), at: frame}).strict()).min(1),
    clicks: z.array(frame).default([]),
    variant: z.enum(['arrow', 'hand', 'text']).default('arrow'),
    size: z.number().min(16).max(120).default(46),
    appearAt: frame.optional(),
    hideAt: frame.optional(),
    clickColor: z.string().optional(),
    sound: z.boolean().default(true), // click sound on each click
  })
  .strict();
export type PointerProps = z.input<typeof pointerSchema>;

const ease = Easing.bezier(0.45, 0, 0.2, 1);

/** Position at `f` along keyframes, eased between each pair. */
const positionAt = (path: {x: number; y: number; at: number}[], f: number) => {
  const keys = [...path].sort((a, b) => a.at - b.at);
  if (f <= keys[0].at) return keys[0];
  for (let i = 0; i < keys.length - 1; i++) {
    const a = keys[i];
    const b = keys[i + 1];
    if (f <= b.at) {
      const k = ease(interpolate(f, [a.at, b.at], [0, 1]));
      return {x: a.x + (b.x - a.x) * k, y: a.y + (b.y - a.y) * k};
    }
  }
  return keys[keys.length - 1];
};

/* Cursor shapes, drawn like an OS cursor: white fill, dark outline. Tip at (0,0). */
const Arrow: FC<{s: number}> = ({s}) => (
  <svg width={s} height={s * 1.45} viewBox="0 0 22 32" style={{overflow: 'visible'}}>
    <path d="M1 1 L1 25.5 L7.2 19.6 L11.6 29.6 L15.6 27.9 L11.3 18.2 L19.8 18.2 Z" fill="#ffffff" stroke="#0b0d10" strokeWidth={1.6} strokeLinejoin="round" />
  </svg>
);
const Hand: FC<{s: number}> = ({s}) => (
  <svg width={s * 1.15} height={s * 1.35} viewBox="0 0 26 30" style={{overflow: 'visible', marginLeft: -s * 0.33}}>
    <path
      d="M9 1.5c1.3 0 2.3 1 2.3 2.3v8.1l1.2-.3c1.2-.3 2.3.4 2.6 1.5l.1.4.6-.1c1.2-.2 2.3.5 2.6 1.6l.1.4.4-.1c1.3-.2 2.5.7 2.6 2v4.7c0 3.9-2.6 7.1-6.3 7.1h-3.3c-2 0-3.8-1-4.9-2.6L3 19.4c-.7-1-.5-2.4.5-3.1 1-.7 2.3-.5 3 .4l.2.3V3.8c0-1.3 1-2.3 2.3-2.3z"
      fill="#ffffff" stroke="#0b0d10" strokeWidth={1.5} strokeLinejoin="round"
    />
  </svg>
);
const TextBeam: FC<{s: number}> = ({s}) => (
  <svg width={s * 0.5} height={s} viewBox="0 0 10 24" style={{overflow: 'visible', marginLeft: -s * 0.25, marginTop: -s * 0.5}}>
    <path d="M2 1h2.5c.8 0 1.5.6 1.5 1.5 0-.9.7-1.5 1.5-1.5H10M2 23h2.5c.8 0 1.5-.6 1.5-1.5 0 .9.7 1.5 1.5 1.5H10M6 2.5v19" stroke="#ffffff" strokeWidth={3.4} fill="none" />
    <path d="M2 1h2.5c.8 0 1.5.6 1.5 1.5 0-.9.7-1.5 1.5-1.5H10M2 23h2.5c.8 0 1.5-.6 1.5-1.5 0 .9.7 1.5 1.5 1.5H10M6 2.5v19" stroke="#0b0d10" strokeWidth={1.4} fill="none" />
  </svg>
);

/** Realistic mouse pointer that glides along a path and clicks (press + ripple). Place inside an AbsoluteFill. */
export const Pointer: FC<PointerProps> = (input) => {
  const p = pointerSchema.parse(input);
  const f = useCurrentFrame();
  const {width, height} = useVideoConfig();
  const u = useUnit();
  const start = p.appearAt ?? p.path[0].at;
  if (f < start - 8 || (p.hideAt !== undefined && f > p.hideAt + 8)) return null;

  const pos = positionAt(p.path, f);
  const fadeIn = interpolate(f, [start - 8, start], [0, 1], {extrapolateLeft: 'clamp', extrapolateRight: 'clamp'});
  const fadeOut = p.hideAt === undefined ? 1 : interpolate(f, [p.hideAt, p.hideAt + 8], [1, 0], {extrapolateLeft: 'clamp', extrapolateRight: 'clamp'});
  const recent = p.clicks.filter((c) => f >= c && f < c + 20);
  const sinceClick = recent.length ? f - Math.max(...recent) : 99;
  const press = sinceClick < 8 ? 1 - 0.18 * Math.sin((sinceClick / 8) * Math.PI) : 1;
  const s = p.size * u;
  const x = (pos.x / 100) * width;
  const y = (pos.y / 100) * height;

  return (
    <div style={{position: 'absolute', inset: 0, pointerEvents: 'none', opacity: fadeIn * fadeOut}}>
      {recent.map((c) => {
        const k = (f - c) / 20;
        return (
          <div key={c} style={{
            position: 'absolute', left: x, top: y, width: 90 * u * k, height: 90 * u * k, marginLeft: -45 * u * k, marginTop: -45 * u * k,
            borderRadius: '50%', border: `${4 * u}px solid ${p.clickColor ?? 'rgba(255,255,255,0.9)'}`, opacity: 1 - k,
          }} />
        );
      })}
      <div style={{
        position: 'absolute', left: x, top: y, transform: `scale(${press})`, transformOrigin: '0 0',
        filter: `drop-shadow(0 ${4 * u}px ${6 * u}px rgba(0,0,0,0.45))`,
      }}>
        {p.variant === 'hand' ? <Hand s={s} /> : p.variant === 'text' ? <TextBeam s={s} /> : <Arrow s={s} />}
      </div>
      {p.sound ? p.clicks.map((c) => <Sfx key={`s${c}`} sound="click" at={c} />) : null}
    </div>
  );
};
