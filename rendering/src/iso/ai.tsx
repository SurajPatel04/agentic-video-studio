/** AI and emerging-media objects: labels, AI voice, altered images, recommendations and verified content. */
import type {FC, ReactNode} from 'react';
import type {ArtProps, Geo} from './objects';
import {IsoBox, IsoShadow} from './shapes';
import {C30, S30, PAPER, project, shade} from './iso';

export const AI_KINDS = {
  aigeneratedlabel: {size: [2.3, .6, 2.1], color: 'lavender'},
  aivoice: {size: [2.6, 1.4, 2.4], color: 'lavender'},
  alteredimage: {size: [3.5, .7, 2.2], color: 'sky'},
  recommendation: {size: [2.9, .65, 2.2], color: 'mint'},
  verified: {size: [2.5, .65, 2.2], color: 'mint'},
} as const;
export type AiKind = keyof typeof AI_KINDS;

const line = (T: number, sw: number, k = 1) => (sw * k) / T;
const front = (g: Geo, z: number, p: ArtProps) => {
  const c = project(g.x, g.y + g.d, z + g.h, p.T, p.o);
  return `matrix(${C30 * p.T} ${S30 * p.T} 0 ${p.T} ${c.x} ${c.y})`;
};
const ink = (T: number, sw: number, k = 0.6) => ({stroke: PAPER.ink, strokeWidth: line(T, sw, k), strokeLinejoin: 'round' as const, strokeLinecap: 'round' as const});

/** A card on two short legs: the review-panel shape used by most AI-media objects. */
const Stand: FC<ArtProps & {children: ReactNode; board: Geo; legColor?: string}> = (p) => {
  const {g, zz, T, o, sw, color, board, children, legColor} = p;
  const legH = board.z - zz;
  return <g>
    <IsoShadow x={g.x + 0.12} y={g.y + g.d * 0.2} w={g.w - 0.24} d={g.d * 0.6} opacity={0.45} T={T} o={o} sw={sw} />
    {[0.28, board.w - 0.46].map((x) => (
      <IsoBox key={x} id={`${p.id}-leg${x}`} x={board.x + x} y={board.y + 0.08} z={zz} w={0.18} d={0.18} h={legH} color={legColor ?? shade(color, -0.28)} T={T} o={o} sw={sw * 0.75} radius={1} />
    ))}
    <IsoBox id={`${p.id}-board`} {...board} color={color} T={T} o={o} sw={sw} radius={T * 0.07} />
    <g transform={front(board, board.z, p)}>{children}</g>
  </g>;
};

/** A sparkle mark: three tapered diamonds, used to signal "AI" without a robot. */
const Sparkle: FC<{x: number; y: number; s: number; fill: string; stroke?: string}> = ({x, y, s, fill, stroke}) => (
  <g transform={`translate(${x} ${y})`} fill={fill} stroke={stroke} strokeWidth={stroke ? line(100, 2, 0.35) : undefined}>
    <path d={`M0 ${-s} L${s * 0.26} ${-s * 0.24} L${s} 0 L${s * 0.26} ${s * 0.24} L0 ${s} L${-s * 0.26} ${s * 0.24} L${-s} 0 L${-s * 0.26} ${-s * 0.24} Z`} />
    <path d={`M${s * 0.8} ${-s * 0.9} L${s * 0.9} ${-s * 0.62} L${s * 1.18} ${-s * 0.52} L${s * 0.9} ${-s * 0.42} L${s * 0.8} ${-s * 0.14} L${s * 0.7} ${-s * 0.42} L${s * 0.42} ${-s * 0.52} L${s * 0.7} ${-s * 0.62} Z`} opacity={0.75} />
  </g>
);

/** AI-generated-content label: a post card with an AI badge and a "generated" caption. */
const AiGeneratedLabel: FC<ArtProps> = (p) => {
  const {g, zz, T, sw, color} = p;
  const legH = g.h * 0.16;
  const board: Geo = {x: g.x, y: g.y + g.d / 2 - 0.16, z: zz + legH, w: g.w, d: 0.32, h: g.h - legH};
  const w = board.w, h = board.h;
  const badgeW = Math.min(0.95, w * 0.48), badgeH = 0.32;
  const inkStyle = ink(T, sw, 0.5);
  return <Stand {...p} board={board} legColor={shade(color, -0.3)}>
    <rect x={0.06} y={0.06} width={w - 0.12} height={h - 0.12} rx={0.07} fill={PAPER.card} {...inkStyle} strokeWidth={line(T, sw, 0.7)} />
    {/* generated image */}
    <rect x={0.16} y={0.18} width={w - 0.32} height={h * 0.52} rx={0.04} fill="#cfe4f5" {...inkStyle} />
    <circle cx={w * 0.72} cy={0.42} r={0.1} fill="#f4da93" {...inkStyle} />
    <path d={`M0.16 ${h * 0.62} L${w * 0.36} ${h * 0.36} L${w * 0.55} ${h * 0.56} L${w * 0.68} ${h * 0.42} L${w - 0.16} ${h * 0.68} V${0.18 + h * 0.52 - 0.02} H0.16 Z`} fill="#9ed3a8" {...inkStyle} strokeWidth={line(T, sw, 0.45)} />
    <path d={`M0.16 ${h * 0.52} L${w * 0.43} ${h * 0.32} L${w * 0.62} ${h * 0.5} L${w * 0.76} ${h * 0.38} L${w - 0.16} ${h * 0.56} V${0.18 + h * 0.52 - 0.02} H0.16 Z`} fill="#7fb7a0" opacity={0.75} />
    {/* AI badge overlapping the image corner */}
    <g transform={`translate(${w - badgeW - 0.13} ${0.1})`}>
      <rect width={badgeW} height={badgeH} rx={badgeH * 0.4} fill={shade(color, 0.2)} {...inkStyle} />
      <text x={badgeW * 0.34} y={badgeH * 0.68} textAnchor="middle" fontFamily={PAPER.sans} fontWeight={800} fontSize={badgeH * 0.62} fill={PAPER.ink}>AI</text>
      <Sparkle x={badgeW * 0.76} y={badgeH * 0.46} s={badgeH * 0.2} fill={PAPER.ink} />
    </g>
    {/* caption lines and a "generated" ribbon */}
    <rect x={0.18} y={h * 0.8} width={w * 0.44} height={0.08} rx={0.04} fill={PAPER.ink} opacity={0.82} />
    <rect x={0.18} y={h * 0.9} width={w * 0.7} height={0.06} rx={0.03} fill={PAPER.ink} opacity={0.35} />
    <rect x={w - 0.18 - w * 0.34} y={h * 0.91} width={w * 0.34} height={0.12} rx={0.06} fill={shade(color, -0.08)} opacity={0.9} />
    <text x={w - 0.18 - w * 0.17} y={h * 0.91 + 0.095} textAnchor="middle" fontFamily={PAPER.sans} fontWeight={700} fontSize={0.075} fill={PAPER.card}>AI-GENERATED</text>
  </Stand>;
};

/** Synthetic voice: a studio microphone beside a small waveform screen with an AI chip. */
/** AI voice: a friendly robot talking. Its mouth is a moving waveform, the antenna glows, the eyes blink,
 *  and a speech bubble beside it shows an AI sparkle and the spoken waveform. Animates with time. */
const AiVoice: FC<ArtProps> = (p) => {
  const {g, zz, T, o, sw, color} = p;
  const t = p.time ?? 0;
  const dark = shade(color, -0.32), light = shade(color, 0.3);
  const talk = (i: number, speed = 9) => 0.35 + 0.65 * Math.abs(Math.sin(t * speed + i * 1.37) * Math.cos(t * 3.1 + i * 0.6));
  // robot parts (grid units)
  const body: Geo = {x: g.x + 0.32, y: g.y + 0.38, z: zz, w: 0.95, d: 0.66, h: 0.66};
  const neck: Geo = {x: g.x + 0.66, y: g.y + 0.58, z: zz + 0.66, w: 0.28, d: 0.26, h: 0.14};
  const head: Geo = {x: g.x + 0.14, y: g.y + 0.24, z: zz + 0.8, w: 1.3, d: 0.92, h: 0.98};
  const hw = head.w, hh = head.h;
  const blink = t % 3.4 < 0.13 ? 0.15 : 1;
  const top = project(head.x + hw / 2, head.y + head.d / 2, head.z + head.h + 0.3, T, o);
  const glow = 0.55 + 0.45 * Math.abs(Math.sin(t * 4));
  // speech bubble, standing in the same front plane
  const bub: Geo = {x: g.x + 1.6, y: g.y + 0.45, z: zz + 1.05, w: 1.15, d: 0.01, h: 0.95};
  const bw = bub.w, bh = 0.7;
  const bars = 9;
  return <g>
    <IsoShadow x={g.x + 0.12} y={g.y + 0.2} w={1.45} d={g.d * 0.75} opacity={0.5} T={T} o={o} sw={sw} />
    {/* body with a chest light */}
    <IsoBox id={`${p.id}-body`} {...body} color={shade(color, -0.06)} T={T} o={o} sw={sw} radius={T * 0.08} />
    <g transform={front(body, body.z, p)}>
      <rect x={0.2} y={0.16} width={body.w - 0.4} height={0.3} rx={0.06} fill={light} {...ink(T, sw, 0.45)} />
      <circle cx={0.36} cy={0.31} r={0.07} fill="#f4da93" opacity={glow} {...ink(T, sw, 0.35)} />
      {[0, 1, 2].map((i) => <rect key={i} x={0.5 + i * 0.09} y={0.25} width={0.05} height={0.12} rx={0.02} fill={dark} />)}
    </g>
    <IsoBox id={`${p.id}-neck`} {...neck} color={dark} T={T} o={o} sw={sw * 0.8} radius={1} />
    {/* head */}
    <IsoBox id={`${p.id}-head`} {...head} color={color} T={T} o={o} sw={sw} radius={T * 0.14} />
    <g transform={front(head, head.z, p)}>
      <rect x={0.1} y={0.12} width={hw - 0.2} height={hh - 0.24} rx={0.16} fill={PAPER.card} {...ink(T, sw, 0.6)} />
      {[0.4, hw - 0.4].map((cx) => <g key={cx}>
        <ellipse cx={cx} cy={0.38} rx={0.1} ry={0.12 * blink} fill={PAPER.ink} />
        {blink === 1 ? <circle cx={cx + 0.035} cy={0.335} r={0.03} fill={PAPER.card} /> : null}
      </g>)}
      {[0.24, hw - 0.24].map((cx) => <ellipse key={cx} cx={cx} cy={0.55} rx={0.07} ry={0.04} fill="#f4a596" opacity={0.7} />)}
      {/* the talking mouth */}
      <rect x={0.32} y={0.56} width={hw - 0.64} height={0.2} rx={0.1} fill={dark} {...ink(T, sw, 0.45)} />
      {Array.from({length: 7}, (_, i) => {
        const mw = hw - 0.64, bwid = mw / 7, bhh = 0.15 * talk(i);
        return <rect key={i} x={0.32 + i * bwid + bwid * 0.25} y={0.66 - bhh / 2} width={bwid * 0.5} height={bhh} rx={bwid * 0.25} fill="#9ed3a8" />;
      })}
    </g>
    {/* ear on the right side */}
    <IsoBox id={`${p.id}-ear`} x={head.x + hw} y={head.y + 0.3} z={head.z + 0.32} w={0.1} d={0.32} h={0.32} color={dark} T={T} o={o} sw={sw * 0.8} radius={T * 0.05} />
    {/* antenna */}
    <IsoBox id={`${p.id}-ant`} x={head.x + hw / 2 - 0.035} y={head.y + head.d / 2 - 0.035} z={head.z + head.h} w={0.07} d={0.07} h={0.24} color={dark} T={T} o={o} sw={sw * 0.7} radius={1} />
    <circle cx={top.x} cy={top.y} r={0.17 * T} fill="#f4da93" opacity={0.35 * glow} />
    <circle cx={top.x} cy={top.y} r={0.09 * T} fill="#f4da93" stroke={PAPER.ink} strokeWidth={sw * 0.8} />
    {/* speech bubble */}
    <g transform={front(bub, bub.z, p)}>
      <path d={`M0.08 0 H${bw - 0.08} Q${bw} 0 ${bw} 0.08 V${bh - 0.08} Q${bw} ${bh} ${bw - 0.08} ${bh} H0.36 L0.06 ${bh + 0.22} L0.16 ${bh} H0.08 Q0 ${bh} 0 ${bh - 0.08} V0.08 Q0 0 0.08 0 Z`} fill={PAPER.card} {...ink(T, sw, 0.7)} />
      <Sparkle x={0.17} y={0.17} s={0.07} fill="#f4da93" stroke={PAPER.ink} />
      <text x={0.3} y={0.215} fontFamily={PAPER.sans} fontWeight={800} fontSize={0.12} fill={PAPER.ink}>Hello!</text>
      {Array.from({length: bars}, (_, i) => {
        const bwid = (bw - 0.2) / bars, bhh = 0.28 * talk(i + 3, 7);
        return <rect key={i} x={0.1 + i * bwid + bwid * 0.2} y={0.47 - bhh / 2} width={bwid * 0.6} height={bhh} rx={bwid * 0.3} fill={i % 2 ? dark : shade(color, -0.12)} />;
      })}
    </g>
  </g>;
};

/** A simple photo inside the comparison frame: landscape, sun and a small figure. */
const Photo: FC<{x: number; y: number; w: number; h: number; altered: boolean; T: number; sw: number}> = ({x, y, w, h, altered, T, sw}) => {
  const l = (k = 0.4) => ink(T, sw, k);
  const sky = altered ? '#d9c8ee' : '#cfe4f5';
  const hill = altered ? '#b58fc9' : '#9ed3a8';
  return <g>
    <rect x={x} y={y} width={w} height={h} rx={0.04} fill={sky} {...l()} />
    {/* sun(s) */}
    <circle cx={x + w * 0.72} cy={y + h * 0.2} r={0.078} fill={altered ? '#f4a596' : '#f4da93'} {...l(0.35)} />
    {altered ? <circle cx={x + w * 0.5} cy={y + h * 0.18} r={0.062} fill="#f4a596" {...l(0.35)} /> : null}
    {/* hills and ground */}
    <path d={`M${x} ${y + h * 0.72} L${x + w * 0.33} ${y + h * 0.4} L${x + w * 0.54} ${y + h * 0.63} L${x + w * 0.7} ${y + h * 0.47} L${x + w} ${y + h * 0.7} V${y + h} H${x} Z`} fill={hill} {...l(0.35)} />
    <rect x={x} y={y + h * 0.82} width={w} height={h * 0.18} fill={altered ? '#b58fc9' : '#7fb7a0'} opacity={0.55} />
    {/* tree */}
    <path d={`M${x + w * 0.2} ${y + h * 0.8} V${y + h * 0.62}`} stroke={PAPER.ink} strokeWidth={line(T, sw, 0.6)} />
    <circle cx={x + w * 0.2} cy={y + h * 0.56} r={0.06} fill={altered ? '#f4a596' : '#6fa982'} {...l(0.35)} />
    {/* figure */}
    <circle cx={x + w * 0.56} cy={y + h * 0.62} r={0.045} fill={PAPER.card} {...l(0.4)} />
    <path d={`M${x + w * 0.56} ${y + h * 0.67} V${y + h * 0.78}`} stroke={PAPER.card} strokeWidth={line(T, sw, 1.5)} strokeLinecap="round" />
    <path d={`M${x + w * 0.54} ${y + h * 0.71} L${x + w * 0.51} ${y + h * 0.75} M${x + w * 0.58} ${y + h * 0.71} L${x + w * 0.61} ${y + h * 0.75}`} stroke={PAPER.card} strokeWidth={line(T, sw, 1.1)} strokeLinecap="round" />
    {altered ? <>
      {/* a duplicated figure and a glitch slice make the edit obvious */}
      <circle cx={x + w * 0.78} cy={y + h * 0.66} r={0.045} fill="#f4a596" {...l(0.4)} />
      <path d={`M${x + w * 0.78} ${y + h * 0.71} V${y + h * 0.82}`} stroke="#f4a596" strokeWidth={line(T, sw, 1.5)} strokeLinecap="round" />
      <rect x={x + w * 0.08} y={y + h * 0.36} width={w * 0.55} height={0.055} fill="#f4a596" opacity={0.8} />
      <rect x={x + w * 0.42} y={y + h * 0.53} width={w * 0.5} height={0.035} fill="#fffaf1" opacity={0.7} />
    </> : null}
    <rect x={x} y={y} width={w} height={h} rx={0.04} fill="none" stroke={altered ? PAPER.bad : PAPER.ink} strokeWidth={line(T, sw, altered ? 0.9 : 0.5)} strokeDasharray={altered ? `${line(T, sw, 2.2)} ${line(T, sw, 1.4)}` : undefined} />
  </g>;
};

/** Altered-image comparison: before/after photos with a slider and an obvious edit. */
const AlteredImage: FC<ArtProps> = (p) => {
  const {g, zz, T, sw, color} = p;
  const legH = g.h * 0.12;
  const board: Geo = {x: g.x, y: g.y + g.d / 2 - 0.14, z: zz + legH, w: g.w, d: 0.28, h: g.h - legH};
  const w = board.w, h = board.h;
  const gap = 0.24, frameX = 0.14, frameY = 0.16, frameW = (w - frameX * 2 - gap) / 2, frameH = h - 0.52;
  return <Stand {...p} board={board} legColor={shade(color, -0.3)}>
    <rect x={0.06} y={0.06} width={w - 0.12} height={h - 0.12} rx={0.07} fill={PAPER.card} {...ink(T, sw, 0.7)} />
    <Photo x={frameX} y={frameY} w={frameW} h={frameH} altered={false} T={T} sw={sw} />
    <Photo x={frameX + frameW + gap} y={frameY} w={frameW} h={frameH} altered T={T} sw={sw} />
    {/* comparison slider in the gap */}
    <line x1={w / 2} y1={frameY} x2={w / 2} y2={frameY + frameH} stroke={PAPER.card} strokeWidth={line(T, sw, 1.6)} strokeLinecap="round" />
    <line x1={w / 2} y1={frameY} x2={w / 2} y2={frameY + frameH} stroke={PAPER.ink} strokeWidth={line(T, sw, 0.45)} strokeDasharray={`${line(T, sw, 1.1)} ${line(T, sw, 0.8)}`} />
    <circle cx={w / 2} cy={frameY + frameH / 2} r={0.1} fill={shade(color, 0.18)} stroke={PAPER.ink} strokeWidth={line(T, sw, 0.55)} />
    <path d={`M${w / 2 - 0.045} ${frameY + frameH / 2} l-0.015 0.035 M${w / 2 - 0.045} ${frameY + frameH / 2} l-0.015 -0.035`} stroke={PAPER.ink} strokeWidth={line(T, sw, 0.45)} fill="none" />
    <path d={`M${w / 2 + 0.045} ${frameY + frameH / 2} l0.015 0.035 M${w / 2 + 0.045} ${frameY + frameH / 2} l0.015 -0.035`} stroke={PAPER.ink} strokeWidth={line(T, sw, 0.45)} fill="none" />
    <text x={frameX + frameW / 2} y={h - 0.13} textAnchor="middle" fontFamily={PAPER.sans} fontWeight={800} fontSize={0.11} fill={PAPER.ink}>ORIGINAL</text>
    <text x={frameX + frameW + gap + frameW / 2} y={h - 0.13} textAnchor="middle" fontFamily={PAPER.sans} fontWeight={800} fontSize={0.11} fill={PAPER.bad}>ALTERED</text>
  </Stand>;
};

/** Recommendation system: a "for you" feed with one boosted card and an AI chip. */
const Recommendation: FC<ArtProps> = (p) => {
  const {g, zz, T, sw, color} = p;
  const legH = g.h * 0.1;
  const board: Geo = {x: g.x, y: g.y + g.d / 2 - 0.14, z: zz + legH, w: g.w, d: 0.28, h: g.h - legH};
  const w = board.w, h = board.h;
  const palette = ['#f4a596', '#b8d6f3', '#f4da93'];
  // what you watched/liked -> the AI engine -> a ranked feed with match scores
  const chipY = [0.98, 1.2, 1.42];
  const engine = {x: 1.04, y: 1.16, r: 0.15};
  const cardX = 1.36, cardW = w - cardX - 0.14, cardH = 0.37;
  const cardY = [0.52, 0.99, 1.46].map((y) => Math.min(y, h - 0.12 - cardH));
  const match = [0.96, 0.74, 0.48];
  const flow = {stroke: shade(color, -0.35), strokeWidth: line(T, sw, 0.5), fill: 'none', strokeLinecap: 'round' as const};
  return <Stand {...p} board={board} legColor={shade(color, -0.3)}>
    <rect x={0.05} y={0.05} width={w - 0.1} height={h - 0.1} rx={0.07} fill={PAPER.card} {...ink(T, sw, 0.8)} />
    {/* header */}
    <rect x={0.12} y={0.12} width={w - 0.24} height={0.26} rx={0.05} fill={shade(color, 0.12)} {...ink(T, sw, 0.4)} />
    <text x={0.24} y={0.295} fontFamily={PAPER.sans} fontWeight={800} fontSize={0.13} fill={PAPER.ink} letterSpacing={0.01}>FOR YOU</text>
    <rect x={w - 0.62} y={0.165} width={0.4} height={0.17} rx={0.085} fill={PAPER.ink} />
    <Sparkle x={w - 0.52} y={0.25} s={0.05} fill="#f4da93" />
    <text x={w - 0.36} y={0.288} textAnchor="middle" fontFamily={PAPER.sans} fontWeight={800} fontSize={0.1} fill={PAPER.card}>AI</text>
    {/* you + your history */}
    <circle cx={0.44} cy={0.66} r={0.14} fill="#cdc3ee" {...ink(T, sw, 0.5)} />
    <circle cx={0.44} cy={0.62} r={0.05} fill={PAPER.card} {...ink(T, sw, 0.35)} />
    <path d="M0.355 0.75 Q0.44 0.66 0.525 0.75" fill={PAPER.card} {...ink(T, sw, 0.35)} />
    <text x={0.44} y={0.9} textAnchor="middle" fontFamily={PAPER.sans} fontWeight={700} fontSize={0.075} fill={PAPER.inkSoft}>your history</text>
    {chipY.map((y, i) => <g key={i}>
      <rect x={0.16} y={y} width={0.58} height={0.15} rx={0.075} fill={palette[i]} {...ink(T, sw, 0.4)} />
      <path d={`M${0.245} ${y + 0.105} l-0.035 -0.035 a0.02 0.02 0 0 1 0.035 -0.02 a0.02 0.02 0 0 1 0.035 0.02 Z`} fill={PAPER.ink} />
      <rect x={0.31} y={y + 0.06} width={0.34 - i * 0.06} height={0.035} rx={0.017} fill={PAPER.ink} opacity={0.55} />
      <path d={`M0.74 ${y + 0.075} C0.84 ${y + 0.075} 0.8 ${engine.y} ${engine.x - engine.r} ${engine.y}`} {...flow} strokeDasharray={`${line(T, sw, 1)} ${line(T, sw, 0.9)}`} />
    </g>)}
    {/* the engine */}
    <circle cx={engine.x} cy={engine.y} r={engine.r + 0.04} fill={shade('#f4da93', 0.5)} opacity={0.9} />
    <circle cx={engine.x} cy={engine.y} r={engine.r} fill="#f4da93" {...ink(T, sw, 0.6)} />
    <Sparkle x={engine.x} y={engine.y} s={0.085} fill={PAPER.ink} />
    {/* ranked feed */}
    {cardY.map((y, i) => {
      const top = i === 0;
      return <g key={i}>
        <path d={`M${engine.x + engine.r} ${engine.y} C${cardX - 0.08} ${engine.y} ${cardX - 0.16} ${y + cardH / 2} ${cardX - 0.075} ${y + cardH / 2}`} {...flow} strokeWidth={line(T, sw, top ? 0.9 : 0.45)} stroke={top ? '#3f9a57' : flow.stroke} />
        <rect x={cardX} y={y} width={cardW} height={cardH} rx={0.06} fill={top ? '#fdf1cf' : '#fffdf8'} stroke={PAPER.ink} strokeWidth={line(T, sw, top ? 0.75 : 0.4)} />
        <rect x={cardX + 0.11} y={y + 0.07} width={0.4} height={cardH - 0.14} rx={0.04} fill={palette[i]} {...ink(T, sw, 0.35)} />
        <path d={`M${cardX + 0.275} ${y + 0.13} L${cardX + 0.37} ${y + cardH / 2} L${cardX + 0.275} ${y + cardH - 0.13} Z`} fill={PAPER.card} {...ink(T, sw, 0.3)} />
        <rect x={cardX + 0.55} y={y + 0.1} width={cardW * (0.42 - i * 0.05)} height={0.055} rx={0.027} fill={PAPER.ink} opacity={0.75} />
        <rect x={cardX + 0.55} y={y + 0.245} width={cardW * 0.42} height={0.06} rx={0.03} fill={PAPER.track} />
        <rect x={cardX + 0.55} y={y + 0.245} width={cardW * 0.42 * match[i]} height={0.06} rx={0.03} fill={top ? '#3f9a57' : '#8fb8a0'} />
        <text x={cardX + 0.6 + cardW * 0.42} y={y + 0.3} fontFamily={PAPER.sans} fontWeight={800} fontSize={0.085} fill={top ? '#2f7a3d' : PAPER.inkSoft}>{Math.round(match[i] * 100)}%</text>
        <circle cx={cardX} cy={y + cardH / 2} r={0.075} fill={top ? '#f4da93' : PAPER.card} {...ink(T, sw, 0.45)} />
        <text x={cardX} y={y + cardH / 2 + 0.03} textAnchor="middle" fontFamily={PAPER.sans} fontWeight={800} fontSize={0.085} fill={PAPER.ink}>{i + 1}</text>
      </g>;
    })}
  </Stand>;
};

/** Verified content: a photo with a green check seal and a checklist (source, date, place) that all pass. */
const Verified: FC<ArtProps> = (p) => {
  const {g, zz, T, sw, color} = p;
  const legH = g.h * 0.1;
  const board: Geo = {x: g.x, y: g.y + g.d / 2 - 0.14, z: zz + legH, w: g.w, d: 0.28, h: g.h - legH};
  const w = board.w, h = board.h;
  const green = '#3f9a57';
  const photo = {x: 0.16, y: 0.5, w: w * 0.4, h: h * 0.38};
  const checks = ['Source', 'Date', 'Place'];
  const listX = photo.x + photo.w + 0.14, rowH = photo.h / 3;
  const Check: FC<{cx: number; cy: number; r: number}> = ({cx, cy, r}) => <g>
    <circle cx={cx} cy={cy} r={r} fill={green} stroke={PAPER.ink} strokeWidth={line(T, sw, 0.45)} />
    <path d={`M${cx - r * 0.45} ${cy} L${cx - r * 0.1} ${cy + r * 0.35} L${cx + r * 0.5} ${cy - r * 0.35}`} fill="none" stroke={PAPER.card} strokeWidth={line(T, sw, 0.8)} strokeLinecap="round" strokeLinejoin="round" />
  </g>;
  return <Stand {...p} board={board} legColor={shade(color, -0.3)}>
    <rect x={0.06} y={0.06} width={w - 0.12} height={h - 0.12} rx={0.07} fill={PAPER.card} {...ink(T, sw, 0.7)} />
    {/* header: shield + VERIFIED */}
    <rect x={0.14} y={0.14} width={w - 0.28} height={0.26} rx={0.06} fill={shade(color, 0.12)} {...ink(T, sw, 0.45)} />
    <g transform={`translate(0.3 0.27) scale(0.16)`}>
      <path d="M0 -0.6 L0.48 -0.42 V0.02 Q0.48 0.42 0 0.6 Q-0.48 0.42 -0.48 0.02 V-0.42 Z" fill={green} stroke={PAPER.ink} strokeWidth={line(T, sw, 0.5) / 0.16} strokeLinejoin="round" />
      <path d="M-0.22 0 L-0.05 0.17 L0.25 -0.18" fill="none" stroke={PAPER.card} strokeWidth={line(T, sw, 0.9) / 0.16} strokeLinecap="round" strokeLinejoin="round" />
    </g>
    <text x={0.46} y={0.315} fontFamily={PAPER.sans} fontWeight={800} fontSize={0.13} fill={PAPER.ink} letterSpacing={0.02}>VERIFIED</text>
    {/* the checked photo */}
    <Photo x={photo.x} y={photo.y} w={photo.w} h={photo.h} altered={false} T={T} sw={sw} />
    <Check cx={photo.x + photo.w - 0.04} cy={photo.y + photo.h - 0.04} r={0.12} />
    {/* checklist */}
    {checks.map((c, i) => {
      const cy = photo.y + rowH * (i + 0.5);
      return <g key={c}>
        <Check cx={listX + 0.08} cy={cy} r={0.07} />
        <text x={listX + 0.2} y={cy + 0.035} fontFamily={PAPER.sans} fontWeight={800} fontSize={0.095} fill={PAPER.ink}>{c}</text>
        <rect x={listX + 0.2} y={cy + 0.07} width={(w - listX - 0.4) * (0.75 - i * 0.12)} height={0.03} rx={0.015} fill={PAPER.ink} opacity={0.25} />
      </g>;
    })}
    {/* result bar */}
    <rect x={0.16} y={h - 0.36} width={w - 0.32} height={0.2} rx={0.1} fill="#dff3e2" stroke={PAPER.ink} strokeWidth={line(T, sw, 0.45)} />
    <rect x={0.2} y={h - 0.31} width={(w - 0.4) * 0.62} height={0.1} rx={0.05} fill={green} />
    <text x={w - 0.22} y={h - 0.225} textAnchor="end" fontFamily={PAPER.sans} fontWeight={800} fontSize={0.09} fill="#2f7a3d">3/3 checks</text>
  </Stand>;
};

export const AIArt: FC<ArtProps & {kind: AiKind}> = (p) => {
  switch (p.kind) {
    case 'aigeneratedlabel': return <AiGeneratedLabel {...p} />;
    case 'aivoice': return <AiVoice {...p} />;
    case 'alteredimage': return <AlteredImage {...p} />;
    case 'recommendation': return <Recommendation {...p} />;
    case 'verified': return <Verified {...p} />;
  }
};
