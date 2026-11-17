/**
 * Brand: an animated logo intro before the first scene, then the logo stays in a corner.
 *
 * JSON (top level of the composition):
 *   "brand": false                      -> no intro, no corner logo
 *   "brand": {"intro": false}           -> corner logo only (used for chapters 2..n of long videos)
 *   "brand": {"watermark": false}       -> intro only
 *   "brand": {"introSeconds": 4, "corner": "top-left", "size": 90, "opacity": 0.8, ...}
 * Left out: both on, with the LandNextRole logo (public/brand/).
 *
 * The intro ends with the icon flying into the corner, exactly where the corner logo stays,
 * while the first scene fades in under it (HANDOFF frames of overlap).
 */
import type {FC} from 'react';
import {AbsoluteFill, Easing, Img, interpolate, spring, staticFile, useCurrentFrame, useVideoConfig} from 'remotion';
import {z} from 'zod';
import {Sfx} from './audio';

const CORNERS = ['top-right', 'top-left', 'bottom-right', 'bottom-left'] as const;

export const brandObjectSchema = z.strictObject({
  intro: z.boolean().default(true),
  introSeconds: z.number().min(1.5).max(8).default(3),
  watermark: z.boolean().default(true),
  corner: z.enum(CORNERS).default('top-right'),
  size: z.number().min(24).max(240).default(76), // corner logo width in px at 1920 wide
  margin: z.number().min(0).max(200).default(34),
  opacity: z.number().min(0.1).max(1).default(0.95),
  icon: z.string().default('brand/lnr-icon.png'), // file in public/ or https URL
  wordmark: z.string().default('brand/lnr-wordmark.png'), // "" = icon only
  wordmarkAspect: z.number().positive().default(1700 / 220), // width / height of the wordmark image
  iconAspect: z.number().positive().default(1100 / 1080),
  background: z.string().default('#fbf8f3'),
  color: z.string().default('#ff5500'),
  sound: z.boolean().default(true),
});
/** What the JSON may hold under "brand" when it is an object (true / false are allowed too). */
export const brandSchema = brandObjectSchema.partial();
export type Brand = z.output<typeof brandObjectSchema>;

/** Resolved brand settings, or null when brand is off. */
export const resolveBrand = (raw: unknown): Brand | null => {
  if (raw === false) return null;
  const r = brandObjectSchema.safeParse(raw === undefined || raw === true ? {} : raw);
  if (!r.success) throw new Error(`brand: ${r.error.message}`);
  return r.data.intro || r.data.watermark ? r.data : null;
};

const HANDOFF = 12; // frames the intro's last part overlaps the first scene

/** Intro length and where the scenes start, in frames. */
export const brandTiming = (raw: unknown, fps: number) => {
  const b = resolveBrand(raw);
  const intro = b?.intro ? Math.round(b.introSeconds * fps) : 0;
  return {intro, offset: intro ? intro - HANDOFF : 0};
};

const src = (s: string) => (/^https?:\/\//.test(s) ? s : staticFile(s.replace(/^\//, '')));

/** Centre of the corner logo (px) and its width. */
const cornerBox = (b: Brand, width: number, height: number) => {
  const k = width / 1920;
  const w = b.size * k, h = w / b.iconAspect, m = b.margin * k;
  const right = b.corner.endsWith('right'), bottom = b.corner.startsWith('bottom');
  return {w, h, cx: right ? width - m - w / 2 : m + w / 2, cy: bottom ? height - m - h / 2 : m + h / 2};
};

const IconImg: FC<{b: Brand; w: number; shine?: number}> = ({b, w, shine}) => {
  const h = w / b.iconAspect;
  return (
    <div style={{position: 'relative', width: w, height: h}}>
      <Img src={src(b.icon)} style={{width: w, height: h, display: 'block'}} />
      {shine !== undefined && shine > 0 && shine < 1 ? (
        // a light sweep clipped to the icon's own shape
        <div style={{
          position: 'absolute', inset: 0,
          WebkitMaskImage: `url(${src(b.icon)})`, WebkitMaskSize: '100% 100%',
          maskImage: `url(${src(b.icon)})`, maskSize: '100% 100%',
          background: `linear-gradient(115deg, transparent ${shine * 160 - 50}%, rgba(255,255,255,0.55) ${shine * 160 - 35}%, transparent ${shine * 160 - 20}%)`,
        }} />
      ) : null}
    </div>
  );
};

export const BrandIntro: FC<{brand: Brand; frames: number}> = ({brand: b, frames}) => {
  const f = useCurrentFrame();
  const {fps, width, height} = useVideoConfig();
  const k = width / 1920;
  const fly = frames - HANDOFF - 6; // the icon starts flying to the corner here
  const hold = Math.max(40, fly);

  const pop = spring({frame: f, fps, config: {damping: 11, stiffness: 140, mass: 0.8}});
  const iconW = 250 * k;
  const hasWord = b.wordmark !== '';
  const wordH = 118 * k, wordW = wordH * b.wordmarkAspect, gap = 46 * k;
  const groupW = hasWord ? iconW + gap + wordW : iconW;

  // icon starts centred, then moves left to make room for the wordmark
  const open = spring({frame: f - 20, fps, config: {damping: 16, stiffness: 90}});
  const restX = width / 2 - groupW / 2 + iconW / 2;
  let x = interpolate(open, [0, 1], [width / 2, hasWord ? restX : width / 2]);
  let y = height / 2;
  let w = iconW * interpolate(pop, [0, 1], [0.2, 1]);
  let iconOpacity = Math.min(1, f / 4);
  const rotate = interpolate(pop, [0, 1], [-35, 0]);

  // fly into the corner (or just fade out when there is no corner logo)
  const t = interpolate(f, [fly, frames], [0, 1], {extrapolateLeft: 'clamp', extrapolateRight: 'clamp', easing: Easing.inOut(Easing.cubic)});
  if (b.watermark) {
    const c = cornerBox(b, width, height);
    x = interpolate(t, [0, 1], [x, c.cx]);
    y = interpolate(t, [0, 1], [y, c.cy]) - Math.sin(t * Math.PI) * 60 * k; // a small arc
    w = interpolate(t, [0, 1], [w, c.w]);
    iconOpacity *= interpolate(t, [0, 1], [1, b.opacity]);
  } else {
    iconOpacity *= 1 - t;
  }
  const h = w / b.iconAspect;

  const reveal = interpolate(f, [26, 50], [0, 1], {extrapolateLeft: 'clamp', extrapolateRight: 'clamp', easing: Easing.out(Easing.cubic)});
  const wordOut = interpolate(f, [fly - 8, fly + 6], [1, 0], {extrapolateLeft: 'clamp', extrapolateRight: 'clamp'});
  const bg = interpolate(f, [fly, frames], [1, 0], {extrapolateLeft: 'clamp', extrapolateRight: 'clamp'});
  const shine = interpolate(f, [44, hold - 6], [0, 1], {extrapolateLeft: 'clamp', extrapolateRight: 'clamp'});

  // two rings ripple out from the icon as it lands
  const rings = [6, 14].map((start) => interpolate(f, [start, start + 34], [0, 1], {extrapolateLeft: 'clamp', extrapolateRight: 'clamp'}));
  const glow = interpolate(f, [0, 20, fly], [0, 1, 0.7], {extrapolateRight: 'clamp'}) * bg;

  return (
    <AbsoluteFill style={{pointerEvents: 'none'}}>
      <AbsoluteFill style={{background: b.background, opacity: bg}} />
      <AbsoluteFill style={{opacity: glow, background: `radial-gradient(circle at 50% 50%, ${b.color}26 0%, ${b.color}0d 28%, transparent 55%)`}} />
      {rings.map((r, i) => r > 0 && r < 1 ? (
        <div key={i} style={{
          position: 'absolute', left: width / 2, top: height / 2, width: iconW * (0.9 + r * 1.6), height: iconW * (0.9 + r * 1.6),
          transform: 'translate(-50%, -50%)', borderRadius: '30%', border: `${(5 - i * 2) * k}px solid ${b.color}`, opacity: (1 - r) * 0.45 * bg,
        }} />
      ) : null)}
      {hasWord ? (
        <div style={{
          position: 'absolute', left: restX + iconW / 2 + gap, top: height / 2 - wordH / 2, width: wordW, height: wordH,
          clipPath: `inset(0 ${(1 - reveal) * 100}% 0 0)`, opacity: wordOut,
          transform: `translateX(${(1 - reveal) * -40 * k + (1 - wordOut) * -30 * k}px)`,
        }}>
          <Img src={src(b.wordmark)} style={{width: wordW, height: wordH, display: 'block'}} />
        </div>
      ) : null}
      <div style={{
        position: 'absolute', left: x - w / 2, top: y - h / 2, opacity: iconOpacity,
        transform: `rotate(${rotate}deg)`,
        filter: `drop-shadow(0 ${10 * k * (1 - t) + 3 * k}px ${22 * k * (1 - t) + 6 * k}px rgba(120,50,0,${0.28 - 0.12 * t}))`,
      }}>
        <IconImg b={b} w={w} shine={shine} />
      </div>
      {b.sound ? <>
        <Sfx sound="logo" at={0} volume={0.8} />
        {hasWord ? <Sfx sound="swipe" at={22} volume={0.3} /> : null}
        <Sfx sound="whoosh" at={fly - 2} volume={0.4} />
      </> : null}
    </AbsoluteFill>
  );
};

/** The logo resting in its corner for the rest of the video. */
export const BrandWatermark: FC<{brand: Brand; fadeIn: boolean}> = ({brand: b, fadeIn}) => {
  const f = useCurrentFrame();
  const {width, height} = useVideoConfig();
  const c = cornerBox(b, width, height);
  const k = width / 1920;
  const op = fadeIn ? interpolate(f, [0, 12], [0, 1], {extrapolateRight: 'clamp'}) : 1;
  return (
    <AbsoluteFill style={{pointerEvents: 'none'}}>
      <div style={{
        position: 'absolute', left: c.cx - c.w / 2, top: c.cy - c.h / 2, opacity: b.opacity * op,
        filter: `drop-shadow(0 ${3 * k}px ${6 * k}px rgba(0,0,0,0.22))`,
      }}>
        <IconImg b={b} w={c.w} />
      </div>
    </AbsoluteFill>
  );
};
