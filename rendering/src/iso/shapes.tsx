/**
 * Isometric SVG shapes in the paper style: rounded box, cylinder, person, arrow, status pill, note.
 * Pure drawing: every value (position, size, progress) comes from the caller, so all motion is
 * frame-driven in IsoScene.
 */
import type {FC, ReactNode} from 'react';
import {Settings, type LucideIcon} from 'lucide-react';
import {faces, PAPER, poly, project, roundedPath, statusColor, type Pt, C30, S30} from './iso';

type Space = {T: number; o: Pt; sw: number}; // tile size, origin, stroke width

const toward = (a: Pt, b: Pt, d: number): Pt => {
  const l = Math.hypot(b.x - a.x, b.y - a.y) || 1;
  return {x: a.x + ((b.x - a.x) / l) * d, y: a.y + ((b.y - a.y) / l) * d};
};

/** Ground shadow of a footprint (soft, offset a little to the right). */
export const IsoShadow: FC<Space & {x: number; y: number; w: number; d: number; opacity: number}> = ({x, y, w, d, opacity, T, o}) => {
  const p = (a: number, b: number) => project(a + 0.12, b + 0.12, 0, T, o);
  const pts = [p(x, y), p(x + w, y), p(x + w, y + d), p(x, y + d)];
  return <path d={roundedPath(pts, T * 0.3)} fill={PAPER.shadow} opacity={opacity} />;
};

/** Rounded isometric box. `id` must be unique in the SVG (used for the clip path). */
export const IsoBox: FC<Space & {id: string; x: number; y: number; z: number; w: number; d: number; h: number; color: string; radius?: number}> = ({
  id, x, y, z, w, d, h, color, T, o, sw, radius,
}) => {
  const p = (a: number, b: number, c: number) => project(a, b, c, T, o);
  const top = [p(x, y, z + h), p(x + w, y, z + h), p(x + w, y + d, z + h), p(x, y + d, z + h)];
  const left = [p(x, y + d, z + h), p(x + w, y + d, z + h), p(x + w, y + d, z), p(x, y + d, z)];
  const right = [p(x + w, y, z + h), p(x + w, y + d, z + h), p(x + w, y + d, z), p(x + w, y, z)];
  const sil = [p(x, y, z + h), p(x + w, y, z + h), p(x + w, y, z), p(x + w, y + d, z), p(x, y + d, z), p(x, y + d, z + h)];
  const r = radius ?? Math.min(T * 0.32, h * T * 0.4);
  const f = faces(color);
  const front = p(x + w, y + d, z + h);
  // top face's front edges, stopped short of the rounded silhouette corners
  const e1 = toward(p(x, y + d, z + h), front, r * 0.9), e2 = toward(p(x + w, y, z + h), front, r * 0.9);
  const sheen = `sheen-${id}`;
  return (
    <g>
      <defs>
        <clipPath id={`clip-${id}`}><path d={roundedPath(sil, r)} /></clipPath>
        <linearGradient id={sheen} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#ffffff" stopOpacity="0.22" />
          <stop offset="1" stopColor="#ffffff" stopOpacity="0" />
        </linearGradient>
      </defs>
      <g clipPath={`url(#clip-${id})`}>
        <polygon points={poly(top)} fill={f.top} />
        <polygon points={poly(left)} fill={f.left} />
        <polygon points={poly(right)} fill={f.right} />
        <polygon points={poly(left)} fill={`url(#${sheen})`} />
        <polygon points={poly(right)} fill={`url(#${sheen})`} />
      </g>
      <polyline points={poly([e1, front, e2])} fill="none" stroke={PAPER.ink} strokeWidth={sw * 0.8} strokeLinejoin="round" strokeLinecap="round" />
      <path d={roundedPath(sil, r)} fill="none" stroke={PAPER.ink} strokeWidth={sw} strokeLinejoin="round" />
    </g>
  );
};

/** Isometric cylinder (database / storage), centred at grid (cx, cy). */
export const IsoCylinder: FC<Space & {cx: number; cy: number; z: number; r: number; h: number; color: string; bands?: number}> = ({
  cx, cy, z, r, h, color, T, o, sw, bands = 2,
}) => {
  const c0 = project(cx, cy, z, T, o), c1 = project(cx, cy, z + h, T, o);
  const rx = Math.SQRT2 * r * C30 * T, ry = Math.SQRT2 * r * S30 * T;
  const f = faces(color);
  const side = `M${c1.x - rx},${c1.y} L${c0.x - rx},${c0.y} A${rx},${ry} 0 0 0 ${c0.x + rx},${c0.y} L${c1.x + rx},${c1.y} Z`;
  const arcs = Array.from({length: bands}, (_, i) => {
    const yy = c0.y + ((c1.y - c0.y) * (i + 1)) / (bands + 1);
    return `M${c0.x - rx},${yy} A${rx},${ry} 0 0 0 ${c0.x + rx},${yy}`;
  });
  return (
    <g>
      <path d={side} fill={f.left} stroke={PAPER.ink} strokeWidth={sw} strokeLinejoin="round" />
      <path d={`M${c0.x},${c1.y} L${c0.x + rx},${c1.y} L${c0.x + rx},${c0.y} A${rx},${ry} 0 0 1 ${c0.x},${c0.y + ry} Z`} fill={f.right} opacity={0.55} />
      {arcs.map((d, i) => <path key={i} d={d} fill="none" stroke={PAPER.ink} strokeWidth={sw * 0.6} opacity={0.75} />)}
      <ellipse cx={c1.x} cy={c1.y} rx={rx} ry={ry} fill={f.top} stroke={PAPER.ink} strokeWidth={sw} />
    </g>
  );
};

/** A little person (pill body + round head), feet at `at`. */
export const IsoPerson: FC<{at: Pt; size: number; color: string; sw: number; scale?: number; opacity?: number}> = ({
  at, size: s, color, sw, scale = 1, opacity = 1,
}) => {
  const bh = s * 1.3;
  return (
    <g transform={`translate(${at.x} ${at.y}) scale(${scale})`} opacity={opacity}>
      <ellipse cx={0} cy={0} rx={s * 0.55} ry={s * 0.2} fill={PAPER.shadow} />
      <rect x={-s / 2} y={-bh} width={s} height={bh} rx={s / 2} fill={color} stroke={PAPER.ink} strokeWidth={sw * 0.75} />
      <circle cx={0} cy={-bh - s * 0.48} r={s * 0.42} fill="#fffaf2" stroke={PAPER.ink} strokeWidth={sw * 0.75} />
    </g>
  );
};

/** Arrow from a to b that draws itself (progress 0..1). Returns nothing until it starts. */
export const IsoArrow: FC<{a: Pt; b: Pt; progress: number; sw: number; color?: string; head?: number; dashed?: boolean}> = ({
  a, b, progress, sw, color = PAPER.ink, head = 16, dashed = false,
}) => {
  if (progress <= 0) return null;
  const end = {x: a.x + (b.x - a.x) * progress, y: a.y + (b.y - a.y) * progress};
  const ang = Math.atan2(b.y - a.y, b.x - a.x);
  const hs = head * Math.min(1, progress * 3);
  const tip = end, l = {x: tip.x - hs * Math.cos(ang - 0.45), y: tip.y - hs * Math.sin(ang - 0.45)},
    r = {x: tip.x - hs * Math.cos(ang + 0.45), y: tip.y - hs * Math.sin(ang + 0.45)};
  const base = toward(tip, a, hs * 0.75);
  return (
    <g>
      <line x1={a.x} y1={a.y} x2={base.x} y2={base.y} stroke={color} strokeWidth={sw} strokeLinecap="round" strokeDasharray={dashed ? `${sw * 3} ${sw * 2.5}` : undefined} />
      <polygon points={poly([tip, l, r])} fill={color} stroke={color} strokeWidth={sw * 0.6} strokeLinejoin="round" />
    </g>
  );
};

/** "⚙ ▬▬▬ 59%" status pill, bottom-centre at `at`. */
export const StatusPill: FC<{at: Pt; value: number; u: number; scale: number; icon?: LucideIcon}> = ({at, value, u, scale, icon: Icon = Settings}) => {
  if (scale <= 0.01) return null;
  const w = 178 * u, h = 48 * u, sw = 2.6 * u;
  const tw = 64 * u, th = 14 * u;
  const v = Math.max(0, Math.min(100, value));
  return (
    <g transform={`translate(${at.x} ${at.y - h / 2}) scale(${scale})`}>
      <rect x={-w / 2 + 3 * u} y={-h / 2 + 4 * u} width={w} height={h} rx={h / 2} fill={PAPER.shadow} />
      <rect x={-w / 2} y={-h / 2} width={w} height={h} rx={h / 2} fill={PAPER.card} stroke={PAPER.ink} strokeWidth={sw} />
      <Icon x={-w / 2 + 14 * u} y={-12 * u} width={24 * u} height={24 * u} color={PAPER.ink} strokeWidth={2.4} />
      <rect x={-w / 2 + 48 * u} y={-th / 2} width={tw} height={th} rx={th / 2} fill={PAPER.track} />
      <rect x={-w / 2 + 48 * u} y={-th / 2} width={Math.max(th, (tw * v) / 100)} height={th} rx={th / 2} fill={statusColor(v)} />
      <text x={w / 2 - 16 * u} y={8 * u} textAnchor="end" fontFamily={PAPER.font} fontWeight={700} fontSize={22 * u} fill={PAPER.ink}>
        {Math.round(v)}%
      </text>
    </g>
  );
};

const wrap = (text: string, max: number) => {
  const lines: string[] = [];
  let cur = '';
  for (const word of text.split(/\s+/)) {
    if ((cur + ' ' + word).trim().length > max && cur) {
      lines.push(cur);
      cur = word;
    } else cur = (cur + ' ' + word).trim();
  }
  if (cur) lines.push(cur);
  return lines.slice(0, 3);
};

export const noteSize = (text: string, u: number) => {
  const lines = wrap(text, 26);
  const fs = 26 * u, lh = fs * 1.25;
  return {lines, fs, lh, w: Math.max(...lines.map((l) => l.length)) * fs * 0.56 + 44 * u, h: lines.length * lh + 30 * u};
};

/** Speech bubble pointing at `at`: above it (pointer down), or to its right / left (pointer sideways). */
export const Note: FC<{at: Pt; text: string; u: number; scale: number; side?: 'above' | 'right' | 'left'; accent?: string}> = ({
  at, text, u, scale, side = 'above', accent = '#f6d28b',
}) => {
  if (scale <= 0.01) return null;
  const {lines, fs, lh, w, h} = noteSize(text, u);
  const sw = 2.6 * u, gap = 16 * u;
  // bubble's top-left corner relative to `at`, and the pointer triangle
  const box = side === 'above' ? {x: -w / 2, y: -h - gap} : side === 'right' ? {x: gap, y: -h / 2} : {x: -w - gap, y: -h / 2};
  const tri = side === 'above'
    ? [{x: -12 * u, y: -gap - 1}, {x: 12 * u, y: -gap - 1}, {x: 0, y: -1}]
    : side === 'right'
      ? [{x: gap + 1, y: -12 * u}, {x: gap + 1, y: 12 * u}, {x: 1, y: 0}]
      : [{x: -gap - 1, y: -12 * u}, {x: -gap - 1, y: 12 * u}, {x: -1, y: 0}];
  const cover = side === 'above' ? {x: -13 * u, y: -gap - 4 * u, w: 26 * u, h: 5 * u}
    : side === 'right' ? {x: gap - 1 * u, y: -13 * u, w: 5 * u, h: 26 * u} : {x: -gap - 4 * u, y: -13 * u, w: 5 * u, h: 26 * u};
  return (
    <g transform={`translate(${at.x} ${at.y}) scale(${scale})`}>
      <rect x={box.x + 4 * u} y={box.y + 5 * u} width={w} height={h} rx={16 * u} fill={PAPER.shadow} />
      <rect x={box.x} y={box.y} width={w} height={h} rx={16 * u} fill={PAPER.card} stroke={PAPER.ink} strokeWidth={sw} />
      <rect x={box.x + 9 * u} y={box.y + 12 * u} width={8 * u} height={h - 24 * u} rx={4 * u} fill={accent} />
      <polygon points={poly(tri)} fill={PAPER.card} stroke={PAPER.ink} strokeWidth={sw} strokeLinejoin="round" />
      <rect x={cover.x} y={cover.y} width={cover.w} height={cover.h} fill={PAPER.card} />
      {lines.map((l, i) => (
        <text key={i} x={box.x + w / 2 + 6 * u} y={box.y + 22 * u + fs * 0.8 + i * lh} textAnchor="middle" fontFamily={PAPER.sans} fontWeight={600} fontSize={fs} fill={PAPER.ink}>{l}</text>
      ))}
    </g>
  );
};

/** Small rounded label (link labels, crowd labels). */
export const Tag: FC<{at: Pt; text: string; u: number; opacity?: number; children?: ReactNode}> = ({at, text, u, opacity = 1}) => {
  const fs = 20 * u, w = text.length * fs * 0.62 + 26 * u, h = 36 * u;
  return (
    <g transform={`translate(${at.x} ${at.y})`} opacity={opacity}>
      <rect x={-w / 2} y={-h / 2} width={w} height={h} rx={h / 2} fill={PAPER.card} stroke={PAPER.ink} strokeWidth={2.2 * u} />
      <text x={0} y={fs * 0.36} textAnchor="middle" fontFamily={PAPER.font} fontWeight={700} fontSize={fs} fill={PAPER.ink}>{text}</text>
    </g>
  );
};
