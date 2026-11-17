/**
 * Shared annotations (positions in % of the frame, sizes in 1080p px):
 *
 *   <Callout at={{x: 60, y: 40}} label="This is the **router**" />   dot + leader line + label
 *   <Mark kind="check" at={{x: 50, y: 50}} />                          self-drawing ✓ / ✗
 *   <Badge at={{x: 30, y: 30}} text={1} />                             numbered step badge
 */
import type {FC} from 'react';
import {interpolate, spring, useCurrentFrame, useVideoConfig} from 'remotion';
import {z} from 'zod';
import {Sfx, SfxContext} from '../audio';
import {AnimatedText} from '../motion/AnimatedText';
import {progress} from '../motion/timing';
import {useTheme, useUnit} from '../theme';
import {pointSchema} from './flow';

const frame = z.number().int().nonnegative();
const GREEN = '#22c55e';
const RED = '#ef4444';

/* ---------------------------------------------------------------------- Callout */

export const calloutSchema = z
  .object({
    at: pointSchema, // the thing being pointed at
    label: z.string().min(1).max(80), // supports **bold** ==highlight== markup
    // label position in % from `at`; default picks the side with room (left half → label right, top → label below)
    offset: z.object({x: z.number().min(-60).max(60), y: z.number().min(-60).max(60)}).strict().optional(),
    startAt: frame.default(0),
    color: z.string().optional(),
    dot: z.boolean().default(true),
    size: z.number().min(16).max(80).default(32), // font size
    hideAt: frame.optional(),
  })
  .strict();
export type CalloutProps = z.input<typeof calloutSchema>;

export const Callout: FC<CalloutProps> = (input) => {
  const p = calloutSchema.parse(input);
  const f = useCurrentFrame();
  const {fps, width: W, height: H} = useVideoConfig();
  const theme = useTheme();
  const u = useUnit();
  if (f < p.startAt) return null;
  const color = p.color ?? theme.accent;
  const x1 = (p.at.x / 100) * W;
  const y1 = (p.at.y / 100) * H;
  const offset = p.offset ?? {x: p.at.x > 60 ? -8 : 8, y: p.at.y < 35 ? 12 : -12};
  const x2 = ((p.at.x + offset.x) / 100) * W;
  const y2 = ((p.at.y + offset.y) / 100) * H;
  const line = progress(f, p.startAt + 4, 14);
  const box = spring({frame: f - p.startAt - 14, fps, config: {damping: 14}});
  const out = p.hideAt !== undefined ? 1 - progress(f, p.hideAt, 10) : 1;
  const ring = ((f - p.startAt) / fps) % 1;
  const right = offset.x >= 0;
  return (
    <div style={{position: 'absolute', inset: 0, pointerEvents: 'none', opacity: out}}>
      <svg width={W} height={H} style={{position: 'absolute', inset: 0, overflow: 'visible'}}>
        {p.dot ? (
          <>
            <circle cx={x1} cy={y1} r={(10 + 22 * ring) * u} fill="none" stroke={color} strokeWidth={3 * u} opacity={1 - ring} />
            <circle cx={x1} cy={y1} r={10 * u * Math.min(1, (f - p.startAt) / 6)} fill={color} />
          </>
        ) : null}
        <line x1={x1} y1={y1} x2={x1 + (x2 - x1) * line} y2={y1 + (y2 - y1) * line} stroke={color} strokeWidth={4 * u} strokeLinecap="round" />
      </svg>
      <div style={{position: 'absolute', left: x2, top: y2, transform: `translate(${right ? 0 : -100}%, -50%) scale(${box})`,
        transformOrigin: right ? 'left center' : 'right center', opacity: box, padding: `${10 * u}px ${18 * u}px`, borderRadius: 14 * u,
        background: 'rgba(2,6,23,0.85)', border: `${3 * u}px solid ${color}`, color: theme.text, fontSize: p.size * u, fontWeight: 600,
        whiteSpace: 'nowrap', boxShadow: `0 ${8 * u}px ${30 * u}px rgba(0,0,0,0.35)`}}>
        <AnimatedText text={p.label} mode="none" as="span" markColor={color} />
      </div>
      <Sfx sound="pop" at={p.startAt + 14} volume={0.5} />
    </div>
  );
};

/* -------------------------------------------------------------- Mark (✓ / ✗) */

export const markSchema = z
  .object({
    at: pointSchema,
    size: z.number().min(24).max(400).default(110),
    startAt: frame.default(0),
    color: z.string().optional(), // default green (check) / red (cross)
    filled: z.boolean().default(true), // round filled background
    hideAt: frame.optional(),
  })
  .strict();
export type MarkProps = z.input<typeof markSchema> & {kind: 'check' | 'cross'};

/** Check mark or cross that pops in and draws its stroke. */
export const Mark: FC<MarkProps> = ({kind, ...input}) => {
  const p = markSchema.parse(input);
  const f = useCurrentFrame();
  const {fps, width: W, height: H} = useVideoConfig();
  const u = useUnit();
  if (f < p.startAt) return null;
  const color = p.color ?? (kind === 'check' ? GREEN : RED);
  const pop = spring({frame: f - p.startAt, fps, config: {damping: 11}});
  const s1 = progress(f, p.startAt + 6, 10);
  const s2 = progress(f, p.startAt + 12, 8);
  const out = p.hideAt !== undefined ? 1 - progress(f, p.hideAt, 10) : 1;
  const px = p.size * u;
  const stroke = p.filled ? '#ffffff' : color;
  return (
    <>
    <Sfx sound={kind === 'check' ? 'ding' : 'error'} at={p.startAt + 6} volume={0.7} />
    <svg width={px} height={px} viewBox="0 0 24 24" style={{position: 'absolute', left: (p.at.x / 100) * W - px / 2, top: (p.at.y / 100) * H - px / 2,
      transform: `scale(${pop})`, opacity: out, overflow: 'visible', filter: `drop-shadow(0 0 ${12 * u}px ${color})`}}>
      <circle cx={12} cy={12} r={11} fill={p.filled ? color : 'none'} stroke={color} strokeWidth={p.filled ? 0 : 1.6} />
      {kind === 'check' ? (
        <path d="M6.6 12.4 L10.3 16 L17.6 8.4" fill="none" stroke={stroke} strokeWidth={2.6} strokeLinecap="round" strokeLinejoin="round"
          pathLength={1} strokeDasharray={1} strokeDashoffset={1 - s1} />
      ) : (
        <>
          <path d="M8 8 L16 16" fill="none" stroke={stroke} strokeWidth={2.6} strokeLinecap="round" pathLength={1} strokeDasharray={1} strokeDashoffset={1 - s1} />
          <path d="M16 8 L8 16" fill="none" stroke={stroke} strokeWidth={2.6} strokeLinecap="round" pathLength={1} strokeDasharray={1} strokeDashoffset={1 - s2} />
        </>
      )}
    </svg>
    </>
  );
};

/* ----------------------------------------------------------------------- Badge */

export const badgeSchema = z
  .object({
    at: pointSchema,
    text: z.union([z.number(), z.string().max(4)]),
    size: z.number().min(24).max(300).default(72),
    startAt: frame.default(0),
    color: z.string().optional(),
    textColor: z.string().default('#ffffff'),
    hideAt: frame.optional(),
  })
  .strict();
export type BadgeProps = z.input<typeof badgeSchema>;

/** Round number badge ("step 1") that pops in with a little overshoot. */
export const Badge: FC<BadgeProps> = (input) => {
  const p = badgeSchema.parse(input);
  const f = useCurrentFrame();
  const {fps, width: W, height: H} = useVideoConfig();
  const theme = useTheme();
  const u = useUnit();
  if (f < p.startAt) return null;
  const color = p.color ?? theme.accent;
  const pop = spring({frame: f - p.startAt, fps, config: {damping: 9}});
  const out = p.hideAt !== undefined ? 1 - progress(f, p.hideAt, 10) : 1;
  const px = p.size * u;
  return (
    <div style={{position: 'absolute', left: (p.at.x / 100) * W - px / 2, top: (p.at.y / 100) * H - px / 2, width: px, height: px,
      borderRadius: '50%', background: color, color: p.textColor, display: 'flex', alignItems: 'center', justifyContent: 'center',
      fontSize: px * 0.5, fontWeight: 800, opacity: out, transform: `scale(${pop}) rotate(${interpolate(pop, [0, 1], [-25, 0])}deg)`,
      boxShadow: `0 0 0 ${5 * u}px color-mix(in srgb, ${color} 30%, transparent), 0 ${8 * u}px ${24 * u}px rgba(0,0,0,0.35)`}}>
      {p.text}
      <Sfx sound="pop" at={p.startAt} volume={0.6} />
    </div>
  );
};

/* ---------------------------------------------------------------- HighlightBox */

export const highlightBoxSchema = z
  .object({
    at: pointSchema, // centre of the box
    width: z.number().min(1).max(100).default(20), // % of the frame
    height: z.number().min(1).max(100).default(20),
    radius: z.number().min(0).max(200).default(24), // corner radius px
    spotlight: z.boolean().default(false), // dim everything outside the box
    label: z.string().max(40).optional(), // small tag above the box (markup ok)
    color: z.string().optional(),
    startAt: frame.default(0),
    hideAt: frame.optional(),
  })
  .strict();
export type HighlightBoxProps = z.input<typeof highlightBoxSchema>;

/** Rounded box that draws around anything (not just text), optionally spotlighting it. */
export const HighlightBox: FC<HighlightBoxProps> = (input) => {
  const p = highlightBoxSchema.parse(input);
  const f = useCurrentFrame();
  const {width: W, height: H} = useVideoConfig();
  const u = useUnit();
  if (f < p.startAt) return null;
  const color = p.color ?? '#facc15';
  const draw = progress(f, p.startAt, 18);
  const out = p.hideAt !== undefined ? 1 - progress(f, p.hideAt, 10) : 1;
  const w = (p.width / 100) * W;
  const h = (p.height / 100) * H;
  const x = (p.at.x / 100) * W - w / 2;
  const y = (p.at.y / 100) * H - h / 2;
  const r = Math.min(p.radius * u, w / 2, h / 2);
  const breathe = 0.5 + 0.5 * Math.sin((f - p.startAt) / 8);
  return (
    <div style={{position: 'absolute', inset: 0, pointerEvents: 'none', opacity: out}}>
      <svg width={W} height={H} style={{position: 'absolute', inset: 0, overflow: 'visible'}}>
        {p.spotlight ? (
          <path fillRule="evenodd" fill="rgba(2,6,23,0.65)" opacity={draw}
            d={`M0 0 H${W} V${H} H0 Z M${x + r} ${y} H${x + w - r} A${r} ${r} 0 0 1 ${x + w} ${y + r} V${y + h - r} A${r} ${r} 0 0 1 ${x + w - r} ${y + h} H${x + r} A${r} ${r} 0 0 1 ${x} ${y + h - r} V${y + r} A${r} ${r} 0 0 1 ${x + r} ${y} Z`} />
        ) : null}
        <rect x={x} y={y} width={w} height={h} rx={r} fill="none" stroke={color} strokeWidth={6 * u} pathLength={1} strokeDasharray={1} strokeDashoffset={1 - draw}
          style={{filter: `drop-shadow(0 0 ${(8 + 10 * breathe * draw) * u}px ${color})`}} />
      </svg>
      {p.label ? (
        <div style={{position: 'absolute', left: x, top: y, transform: 'translateY(-115%)', opacity: progress(f, p.startAt + 12, 8), padding: `${6 * u}px ${16 * u}px`,
          borderRadius: 10 * u, background: color, color: '#0b1220', fontSize: 28 * u, fontWeight: 800, whiteSpace: 'nowrap'}}>
          <AnimatedText text={p.label} mode="none" as="span" markColor="#0b1220" />
        </div>
      ) : null}
    </div>
  );
};

/* --------------------------------------------------------------------- Tooltip */

export const tooltipSchema = z
  .object({
    at: pointSchema, // the point the tooltip's arrow touches
    text: z.string().min(1).max(80), // markup ok
    side: z.enum(['auto', 'top', 'bottom', 'left', 'right']).default('auto'),
    startAt: frame.default(0),
    hideAt: frame.optional(),
    color: z.string().optional(), // background
  })
  .strict();
export type TooltipProps = z.input<typeof tooltipSchema>;

/** Small dark bubble with an arrow, like a UI tooltip. "auto" picks the side with room. */
export const Tooltip: FC<TooltipProps> = (input) => {
  const p = tooltipSchema.parse(input);
  const f = useCurrentFrame();
  const {fps, width: W, height: H} = useVideoConfig();
  const theme = useTheme();
  const u = useUnit();
  if (f < p.startAt) return null;
  const side = p.side !== 'auto' ? p.side : p.at.y < 22 ? 'bottom' : p.at.x > 85 ? 'left' : p.at.x < 15 ? 'right' : 'top';
  const pop = spring({frame: f - p.startAt, fps, config: {damping: 15}});
  const out = p.hideAt !== undefined ? 1 - progress(f, p.hideAt, 8) : 1;
  const bg = p.color ?? '#0f172a';
  const gap = 16 * u;
  const tr = {top: `translate(-50%, calc(-100% - ${gap}px))`, bottom: `translate(-50%, ${gap}px)`, left: `translate(calc(-100% - ${gap}px), -50%)`, right: `translate(${gap}px, -50%)`}[side];
  const arrow = {
    top: {left: '50%', bottom: -10 * u, transform: 'translateX(-50%) rotate(45deg)'},
    bottom: {left: '50%', top: -10 * u, transform: 'translateX(-50%) rotate(45deg)'},
    left: {top: '50%', right: -10 * u, transform: 'translateY(-50%) rotate(45deg)'},
    right: {top: '50%', left: -10 * u, transform: 'translateY(-50%) rotate(45deg)'},
  }[side];
  return (
    <div style={{position: 'absolute', left: (p.at.x / 100) * W, top: (p.at.y / 100) * H, transform: tr, opacity: pop * out}}>
      <div style={{position: 'relative', padding: `${12 * u}px ${20 * u}px`, borderRadius: 12 * u, background: bg, color: theme.text, fontSize: 28 * u, fontWeight: 500,
        whiteSpace: 'nowrap', border: `${2 * u}px solid rgba(148,163,184,0.3)`, boxShadow: `0 ${10 * u}px ${30 * u}px rgba(0,0,0,0.4)`, transform: `scale(${0.85 + 0.15 * pop})`}}>
        <span style={{position: 'absolute', width: 20 * u, height: 20 * u, background: bg, ...arrow}} />
        <span style={{position: 'relative'}}><AnimatedText text={p.text} mode="none" as="span" /></span>
      </div>
    </div>
  );
};

/* -------------------------------------------------------------------- ZoomLens */

export const zoomLensSchema = z
  .object({
    at: pointSchema, // what to magnify
    lensAt: pointSchema.optional(), // where the lens sits (default: on top of `at`)
    radius: z.number().min(40).max(500).default(170), // px
    zoom: z.number().min(1.2).max(8).default(2.5),
    startAt: frame.default(0),
    hideAt: frame.optional(),
    color: z.string().optional(),
  })
  .strict();
export type ZoomLensProps = z.input<typeof zoomLensSchema>;

/**
 * Magnifying glass over the scene. Needs the scene itself (`scene`) to draw it magnified;
 * the overlay system passes it automatically.
 */
export const ZoomLens: FC<ZoomLensProps & {scene?: React.ReactNode}> = ({scene, ...input}) => {
  const p = zoomLensSchema.parse(input);
  const f = useCurrentFrame();
  const {fps, width: W, height: H} = useVideoConfig();
  const theme = useTheme();
  const u = useUnit();
  if (f < p.startAt || !scene) return null;
  const color = p.color ?? theme.accent;
  const grow = spring({frame: f - p.startAt, fps, config: {damping: 15}});
  const out = p.hideAt !== undefined ? 1 - progress(f, p.hideAt, 10) : 1;
  const k = 1 + (p.zoom - 1) * grow;
  const R = p.radius * u * (0.3 + 0.7 * grow);
  const tx = (p.at.x / 100) * W;
  const ty = (p.at.y / 100) * H;
  const lens = p.lensAt ?? p.at;
  const lx = (lens.x / 100) * W;
  const ly = (lens.y / 100) * H;
  const apart = Math.hypot(lx - tx, ly - ty) > 4;
  return (
    <div style={{position: 'absolute', inset: 0, pointerEvents: 'none', opacity: out}}>
      {apart ? (
        <svg width={W} height={H} style={{position: 'absolute', inset: 0}}>
          <circle cx={tx} cy={ty} r={R / k} fill="none" stroke={color} strokeWidth={4 * u} strokeDasharray={`${10 * u} ${8 * u}`} />
          <line x1={tx} y1={ty} x2={lx} y2={ly} stroke={color} strokeWidth={3 * u} strokeDasharray={`${10 * u} ${8 * u}`} opacity={0.7} />
        </svg>
      ) : null}
      <div style={{position: 'absolute', left: lx - R, top: ly - R, width: R * 2, height: R * 2, borderRadius: '50%', overflow: 'hidden',
        border: `${8 * u}px solid ${color}`, boxShadow: `0 0 0 ${3 * u}px rgba(255,255,255,0.6), 0 ${20 * u}px ${50 * u}px rgba(0,0,0,0.55), inset 0 0 ${30 * u}px rgba(0,0,0,0.4)`, background: theme.background}}>
        <div style={{position: 'absolute', width: W, height: H, left: R - tx * k, top: R - ty * k, transform: `scale(${k})`, transformOrigin: '0 0'}}>
          <SfxContext.Provider value={{enabled: false, volume: 0}}>{scene}</SfxContext.Provider>
        </div>
      </div>
      {/* handle */}
      <div style={{position: 'absolute', left: lx + R * 0.68, top: ly + R * 0.68, width: R * 0.22, height: R * 0.75, borderRadius: R * 0.1, background: '#334155',
        transform: 'rotate(-45deg)', transformOrigin: 'top center', border: `${3 * u}px solid ${color}`}} />
    </div>
  );
};
