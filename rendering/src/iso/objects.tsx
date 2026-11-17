/**
 * Isometric illustrations: each object kind drawn as what it is (server rack, monitor, phone,
 * router, padlock, ...) in the paper style, from the same box/cylinder primitives.
 *
 * Face drawing: `face(...)` gives an SVG transform that maps a flat 2D drawing (units = grid units,
 * x to the right, y down) onto one face of a box, so slots, screens and icons sit ON the surface.
 */
import type {FC, ReactNode} from 'react';
import {Cpu, icons, Plug, Split, Star, Zap, type LucideIcon} from 'lucide-react';
import {C30, faces, PAPER, poly, project, S30, shade, type Pt} from './iso';
import {IsoBox, IsoCylinder, IsoShadow} from './shapes';
import {GeneralArt, GENERAL_KINDS, type GeneralKind} from './general';
import {RoadArt, isRoadKind, type RoadKind} from './roads';
export {RoadArt as Road} from './roads';

export type Space = {T: number; o: Pt; sw: number};
export type Geo = {x: number; y: number; z: number; w: number; d: number; h: number};

/** Transform mapping 2D face coordinates (grid units) onto a face of box g at height zz. */
export const face = (side: 'front' | 'side' | 'top', g: Geo, zz: number, {T, o}: Space) => {
  if (side === 'front') { // the face looking down-left (y = y + d), origin at its top-left corner
    const p = project(g.x, g.y + g.d, zz + g.h, T, o);
    return `matrix(${C30 * T} ${S30 * T} 0 ${T} ${p.x} ${p.y})`;
  }
  if (side === 'side') { // the face looking down-right (x = x + w), origin at its top-left corner
    const p = project(g.x + g.w, g.y + g.d, zz + g.h, T, o);
    return `matrix(${C30 * T} ${-S30 * T} 0 ${T} ${p.x} ${p.y})`;
  }
  const p = project(g.x, g.y, zz + g.h, T, o); // top face, origin at the back corner
  return `matrix(${C30 * T} ${S30 * T} ${-C30 * T} ${S30 * T} ${p.x} ${p.y})`;
};

const SCREEN = '#2f3a55';
const LED = '#74e08a';

export type ArtProps = Space & {id: string; g: Geo; zz: number; color: string; icon?: string; time?: number; highlight?: number};

// common names the planner may use that Lucide calls differently
const ICON_ALIASES: Record<string, string> = {filter: 'funnel', 'bar-chart': 'chart-bar', chart: 'chart-bar', 'pie-chart': 'chart-pie',
  money: 'banknote', dollar: 'dollar-sign', chat: 'message-circle', message: 'message-circle', speech: 'message-circle',
  tv: 'tv', television: 'tv', news: 'newspaper', podcast: 'mic', video: 'video', person: 'user', team: 'users', idea: 'lightbulb'};

/** Lucide icon by name: "radio-tower", "RadioTower" or "radio tower". */
export const iconByName = (name: string | undefined): LucideIcon | undefined => {
  if (!name) return undefined;
  name = ICON_ALIASES[name.toLowerCase()] ?? name;
  const pascal = name.trim().split(/[-_\s]+/).map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join('');
  return (icons as Record<string, LucideIcon>)[pascal] ?? (icons as Record<string, LucideIcon>)[name];
};

/** Lucide icon lying on a face, centred at (cx, cy) in face units. */
const FaceIcon: FC<{icon: LucideIcon; cx: number; cy: number; size: number}> = ({icon: Icon, cx, cy, size}) => (
  <Icon x={cx - size / 2} y={cy - size / 2} width={size} height={size} color={PAPER.ink} strokeWidth={2.4} absoluteStrokeWidth={false} />
);

/** A box with optional drawings on its front / side / top faces. */
const Decorated: FC<ArtProps & {front?: ReactNode; side?: ReactNode; top?: ReactNode; radius?: number}> = (p) => {
  const {g, zz} = p;
  return (
    <g>
      <IsoBox id={p.id} x={g.x} y={g.y} z={zz} w={g.w} d={g.d} h={g.h} color={p.color} T={p.T} o={p.o} sw={p.sw} radius={p.radius} />
      {p.front ? <g transform={face('front', g, zz, p)}>{p.front}</g> : null}
      {p.side ? <g transform={face('side', g, zz, p)}>{p.side}</g> : null}
      {p.top ? <g transform={face('top', g, zz, p)}>{p.top}</g> : null}
    </g>
  );
};

const line = (T: number, sw: number, k = 1) => (sw * k) / T; // stroke width in face units

/* ------------------------------------------------------------------------------- kinds */

const ServerRack: FC<ArtProps> = (p) => {
  const {g, T, sw, color} = p;
  const rows = Math.max(2, Math.round(g.h / 0.55));
  const slotH = (g.h - 0.35) / rows;
  return (
    <Decorated {...p} radius={T * 0.18}
      front={<>{Array.from({length: rows}, (_, k) => (
        <g key={k}>
          <rect x={0.16} y={0.2 + k * slotH} width={g.w - 0.32} height={slotH * 0.68} rx={0.06} fill={shade(color, -0.35)} stroke={PAPER.ink} strokeWidth={line(T, sw, 0.6)} />
          <circle cx={g.w - 0.34} cy={0.2 + k * slotH + slotH * 0.34} r={0.065} fill={k % 3 === 2 ? '#f5c451' : LED} stroke={PAPER.ink} strokeWidth={line(T, sw, 0.4)} />
          {[0, 1, 2].map((v) => <line key={v} x1={0.32 + v * 0.14} x2={0.32 + v * 0.14} y1={0.2 + k * slotH + slotH * 0.16} y2={0.2 + k * slotH + slotH * 0.52} stroke={shade(color, 0.5)} strokeWidth={line(T, sw, 0.5)} strokeLinecap="round" />)}
        </g>
      ))}</>}
      side={<>{[0.3, 0.5, 0.7].map((v) => <line key={v} x1={g.d * 0.25} x2={g.d * 0.75} y1={g.h * v} y2={g.h * v} stroke={shade(color, -0.3)} strokeWidth={line(T, sw, 0.6)} strokeLinecap="round" />)}</>}
    />
  );
};

const FlatWithIcon: FC<Omit<ArtProps, 'icon'> & {glyph: LucideIcon; ports?: number}> = (p) => {
  const {g, T, sw, color, glyph, ports = 0} = p;
  return (
    <Decorated {...p}
      top={<FaceIcon icon={glyph} cx={g.w / 2} cy={g.d / 2} size={Math.min(g.w, g.d) * 0.62} />}
      front={ports ? <>{Array.from({length: ports}, (_, k) => (
        <rect key={k} x={0.25 + k * ((g.w - 0.5) / ports)} y={g.h * 0.3} width={(g.w - 0.5) / ports - 0.12} height={g.h * 0.38} rx={0.05} fill={shade(color, -0.4)} stroke={PAPER.ink} strokeWidth={line(T, sw, 0.5)} />
      ))}</> : undefined}
    />
  );
};

const Router: FC<ArtProps> = (p) => {
  const {g, zz, T, o, sw} = p;
  const ant = (u: number) => {
    const a = project(g.x + u, g.y + 0.15, zz + g.h, T, o), b = project(g.x + u, g.y + 0.15, zz + g.h + 0.95, T, o);
    return <g key={u}><line x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke={PAPER.ink} strokeWidth={sw * 1.6} strokeLinecap="round" /><circle cx={b.x} cy={b.y} r={sw * 1.5} fill={PAPER.ink} /></g>;
  };
  return (
    <g>
      {ant(0.3)}{ant(g.w - 0.3)}
      <Decorated {...p} front={<>{[0, 1, 2, 3].map((k) => <circle key={k} cx={0.4 + k * 0.32} cy={g.h * 0.5} r={0.07} fill={k === 3 ? '#f5c451' : LED} stroke={PAPER.ink} strokeWidth={line(T, sw, 0.4)} />)}</>} />
    </g>
  );
};

const screenLines = (w: number, h: number, T: number, sw: number, colors = ['#9fc4ec', '#f4c178', '#c9b6ec', '#9ed3a8']) => (
  <>
    <rect x={0.1} y={0.1} width={w - 0.2} height={h - 0.2} rx={0.08} fill={SCREEN} stroke={PAPER.ink} strokeWidth={line(T, sw, 0.6)} />
    {[0, 1, 2, 3].filter((k) => 0.3 + k * 0.22 < h - 0.25).map((k) => (
      <rect key={k} x={0.28 + (k % 2) * 0.18} y={0.3 + k * 0.22} width={(w - 0.7) * (k % 3 === 1 ? 0.55 : 0.8)} height={0.08} rx={0.04} fill={colors[k % colors.length]} />
    ))}
    <rect x={0.1} y={0.1} width={(w - 0.2) * 0.35} height={h - 0.2} rx={0.08} fill="#ffffff" opacity={0.06} />
  </>
);

const Padlock: FC<ArtProps> = (p) => {
  const {g, zz, T, o, sw, color} = p;
  const a = project(g.x + g.w * 0.22, g.y + g.d / 2, zz + g.h, T, o), b = project(g.x + g.w * 0.78, g.y + g.d / 2, zz + g.h, T, o);
  const r = Math.hypot(b.x - a.x, b.y - a.y) / 2;
  const arc = `M${a.x},${a.y} L${a.x},${a.y - r * 0.6} A${r},${r} 0 0 1 ${b.x},${b.y - r * 0.6} L${b.x},${b.y}`;
  return (
    <g>
      <path d={arc} fill="none" stroke={PAPER.ink} strokeWidth={sw * 4.2} strokeLinecap="round" />
      <path d={arc} fill="none" stroke={shade(color, -0.2)} strokeWidth={sw * 2.2} strokeLinecap="round" />
      <Decorated {...p} front={<>
        <circle cx={g.w / 2} cy={g.h * 0.42} r={0.12} fill={PAPER.ink} />
        <rect x={g.w / 2 - 0.05} y={g.h * 0.42} width={0.1} height={g.h * 0.28} rx={0.04} fill={PAPER.ink} />
      </>} />
    </g>
  );
};

const Queue: FC<ArtProps> = (p) => {
  const {g, zz, T, o, sw, color} = p;
  const n = Math.max(2, Math.floor(g.w / 0.8));
  return (
    <g>
      <IsoBox id={`${p.id}-tray`} x={g.x} y={g.y} z={zz} w={g.w} d={g.d} h={0.18} color={shade(color, -0.1)} T={T} o={o} sw={sw} radius={T * 0.15} />
      {Array.from({length: n}, (_, k) => (
        <IsoBox key={k} id={`${p.id}-m${k}`} x={g.x + 0.18 + k * ((g.w - 0.2) / n)} y={g.y + 0.2} z={zz + 0.18} w={(g.w - 0.2) / n - 0.18} d={g.d - 0.4} h={g.h - 0.18}
          color={k % 2 ? color : shade(color, 0.15)} T={T} o={o} sw={sw * 0.9} radius={T * 0.1} />
      ))}
    </g>
  );
};

const Chip: FC<ArtProps> = (p) => {
  const {g, T, sw} = p;
  const pins = (len: number) => Array.from({length: 4}, (_, k) => <rect key={k} x={len * (0.18 + k * 0.2)} y={0.05} width={len * 0.08} height={0.15} fill="#d9b45a" stroke={PAPER.ink} strokeWidth={line(T, sw, 0.35)} />);
  return (
    <Decorated {...p} radius={T * 0.1}
      top={<><rect x={g.w * 0.22} y={g.d * 0.22} width={g.w * 0.56} height={g.d * 0.56} rx={0.08} fill={shade(p.color, -0.25)} stroke={PAPER.ink} strokeWidth={line(T, sw, 0.6)} />
        <FaceIcon icon={Cpu} cx={g.w / 2} cy={g.d / 2} size={g.w * 0.38} /></>}
      front={<>{pins(g.w)}</>} side={<>{pins(g.d)}</>}
    />
  );
};

const MemoryStick: FC<ArtProps> = (p) => {
  const {g, T, sw} = p;
  const n = Math.max(3, Math.floor(g.w / 0.55));
  return (
    <Decorated {...p} radius={T * 0.06}
      front={<>
        {Array.from({length: n}, (_, k) => <rect key={k} x={0.15 + k * ((g.w - 0.3) / n)} y={0.15} width={(g.w - 0.3) / n - 0.1} height={g.h * 0.45} rx={0.04} fill={PAPER.ink} opacity={0.85} />)}
        <rect x={0.1} y={g.h - 0.16} width={g.w - 0.2} height={0.1} fill="#d9b45a" stroke={PAPER.ink} strokeWidth={line(T, sw, 0.35)} />
      </>} />
  );
};

const Cardboard: FC<ArtProps> = (p) => {
  const {g} = p;
  return <Decorated {...p} top={<rect x={g.w / 2 - 0.12} y={0} width={0.24} height={g.d} fill="#e9d3a6" opacity={0.9} />} front={<rect x={g.w / 2 - 0.12} y={0} width={0.24} height={g.h * 0.4} fill="#e9d3a6" opacity={0.9} />} />;
};

const Globe: FC<ArtProps> = ({g, zz, T, o, sw, color}) => {
  const c = project(g.x + g.w / 2, g.y + g.d / 2, zz + g.h * 0.55, T, o);
  const r = Math.min(g.w, g.d) * 0.62 * T;
  const f = faces(color);
  return (
    <g>
      <IsoShadow x={g.x} y={g.y} w={g.w} d={g.d} opacity={0.8} T={T} o={o} sw={sw} />
      <circle cx={c.x} cy={c.y} r={r} fill={f.left} stroke={PAPER.ink} strokeWidth={sw} />
      <ellipse cx={c.x} cy={c.y} rx={r} ry={r * 0.35} fill="none" stroke={PAPER.ink} strokeWidth={sw * 0.6} />
      <ellipse cx={c.x} cy={c.y} rx={r * 0.42} ry={r} fill="none" stroke={PAPER.ink} strokeWidth={sw * 0.6} />
      <line x1={c.x} y1={c.y - r} x2={c.x} y2={c.y + r} stroke={PAPER.ink} strokeWidth={sw * 0.6} />
      <path d={`M${c.x - r * 0.55},${c.y - r * 0.2} q${r * 0.2},${-r * 0.35} ${r * 0.45},${-r * 0.15} q${r * 0.1},${r * 0.25} ${-r * 0.1},${r * 0.45} z`} fill={shade(color, -0.35)} opacity={0.6} />
      <circle cx={c.x - r * 0.35} cy={c.y - r * 0.4} r={r * 0.22} fill="#ffffff" opacity={0.35} />
    </g>
  );
};

const Cloud: FC<ArtProps> = ({g, zz, T, o, sw, color}) => {
  const c = project(g.x + g.w / 2, g.y + g.d / 2, zz + g.h * 0.6, T, o);
  const s = Math.min(g.w, g.d) * 0.55 * T;
  const path = (dy: number) => `M${c.x - s * 1.1},${c.y + s * 0.35 + dy}
    a${s * 0.45},${s * 0.45} 0 0 1 ${s * 0.2},${-s * 0.75}
    a${s * 0.6},${s * 0.6} 0 0 1 ${s * 1.0},${-s * 0.35}
    a${s * 0.5},${s * 0.5} 0 0 1 ${s * 0.85},${s * 0.4}
    a${s * 0.4},${s * 0.4} 0 0 1 ${s * 0.15},${s * 0.7} Z`;
  const f = faces(color);
  return (
    <g>
      <IsoShadow x={g.x} y={g.y} w={g.w} d={g.d} opacity={0.6} T={T} o={o} sw={sw} />
      <path d={path(s * 0.28)} fill={f.right} stroke={PAPER.ink} strokeWidth={sw} strokeLinejoin="round" />
      <path d={path(0)} fill={f.top} stroke={PAPER.ink} strokeWidth={sw} strokeLinejoin="round" />
    </g>
  );
};

const DatabaseArt: FC<ArtProps> = ({g, zz, T, o, sw, color}) => {
  const r = Math.min(g.w, g.d) / 2, c = project(g.x + g.w / 2, g.y + g.d / 2, zz + g.h, T, o);
  return (
    <g>
      <IsoCylinder cx={g.x + g.w / 2} cy={g.y + g.d / 2} z={zz} r={r} h={g.h} color={color} T={T} o={o} sw={sw} bands={2} />
      {[0.28, 0.6].map((v) => {
        const q = project(g.x + g.w / 2 + r * 0.55, g.y + g.d / 2 + r * 0.55, zz + g.h * (1 - v) - 0.05, T, o);
        return <circle key={v} cx={q.x} cy={q.y} r={sw * 1.6} fill={LED} stroke={PAPER.ink} strokeWidth={sw * 0.5} />;
      })}
      <ellipse cx={c.x} cy={c.y} rx={Math.SQRT2 * r * C30 * T * 0.55} ry={Math.SQRT2 * r * S30 * T * 0.55} fill={shade(color, 0.55)} stroke={PAPER.ink} strokeWidth={sw * 0.5} opacity={0.8} />
    </g>
  );
};


/* ------------------------------------------------------------- everyday / media objects */

const INK_LINE = '#3a3f52';

/** Upright card with any icon on its face (app-icon look): the catch-all for ideas without a drawing. */
const Tile: FC<ArtProps> = (p) => {
  const {g, T, sw, color} = p;
  const card: Geo = {...g, y: g.y + g.d / 2 - 0.13, d: 0.26};
  const Icon = iconByName(p.icon) ?? Star;
  const m = Math.min(card.w, card.h);
  return <Decorated {...p} g={card} radius={T * 0.22} front={<>
    <rect x={0.14} y={0.14} width={card.w - 0.28} height={card.h - 0.28} rx={0.22} fill={shade(color, 0.35)} stroke={shade(color, -0.25)} strokeWidth={line(T, sw, 0.5)} />
    <FaceIcon icon={Icon} cx={card.w / 2} cy={card.h / 2} size={m * 0.66} />
  </>} />;
};

const Television: FC<ArtProps> = (p) => {
  const {g, zz, T, o, sw, color} = p;
  const legH = 0.3;
  const body: Geo = {x: g.x, y: g.y + g.d / 2 - 0.22, z: g.z, w: g.w, d: 0.44, h: g.h - legH - 0.35};
  const top = zz + legH + body.h;
  const ear = (dx: number) => {
    const a = project(g.x + g.w / 2, g.y + g.d / 2, top, T, o), b = project(g.x + g.w / 2 + dx, g.y + g.d / 2 - 0.2, top + 0.55, T, o);
    return <g key={dx}><line x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke={PAPER.ink} strokeWidth={sw * 1.3} strokeLinecap="round" /><circle cx={b.x} cy={b.y} r={sw * 1.4} fill={PAPER.ink} /></g>;
  };
  return (
    <g>
      {[0.25, g.w - 0.45].map((x) => <IsoBox key={x} id={`${p.id}-leg${x}`} x={g.x + x} y={body.y + 0.12} z={zz} w={0.2} d={0.2} h={legH} color={shade(color, -0.2)} T={T} o={o} sw={sw * 0.8} radius={1} />)}
      {ear(-0.5)}{ear(0.5)}
      <Decorated {...p} g={body} zz={zz + legH} radius={T * 0.12} front={<>
        <rect x={0.14} y={0.14} width={body.w - 0.62} height={body.h - 0.28} rx={0.12} fill={SCREEN} stroke={PAPER.ink} strokeWidth={line(T, sw, 0.6)} />
        {['#f4a596', '#f4da93', '#b9e2c7', '#b8d6f3', '#cdc3ee'].map((c, k) => <rect key={c} x={0.24 + k * ((body.w - 0.82) / 5)} y={0.26} width={(body.w - 0.82) / 5 - 0.04} height={(body.h - 0.52) * 0.55} fill={c} opacity={0.9} />)}
        <path d={`M${(body.w - 0.48) / 2 - 0.12},${body.h * 0.62} l0.28,0.16 l-0.28,0.16 z`} fill="#ffffff" />
        {[0, 1].map((k) => <circle key={k} cx={body.w - 0.24} cy={0.4 + k * 0.32} r={0.09} fill={shade(color, -0.3)} stroke={PAPER.ink} strokeWidth={line(T, sw, 0.4)} />)}
      </>} />
    </g>
  );
};

const RadioSet: FC<ArtProps> = (p) => {
  const {g, zz, T, o, sw, color} = p;
  const a = project(g.x + g.w - 0.25, g.y + 0.2, zz + g.h, T, o), b = project(g.x + g.w + 0.35, g.y + 0.2, zz + g.h + 1.0, T, o);
  const r = Math.min(g.h * 0.36, g.w * 0.22);
  return (
    <g>
      <line x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke={PAPER.ink} strokeWidth={sw * 1.4} strokeLinecap="round" />
      <circle cx={b.x} cy={b.y} r={sw * 1.4} fill={PAPER.ink} />
      <Decorated {...p} radius={T * 0.16} front={<>
        <circle cx={0.25 + r} cy={g.h / 2} r={r} fill={shade(color, -0.3)} stroke={PAPER.ink} strokeWidth={line(T, sw, 0.6)} />
        {Array.from({length: 5}, (_, i) => Array.from({length: 5}, (_, j) => {
          const x = 0.25 + r + (i - 2) * r * 0.36, y = g.h / 2 + (j - 2) * r * 0.36;
          return Math.hypot(x - 0.25 - r, y - g.h / 2) < r * 0.8 ? <circle key={`${i}${j}`} cx={x} cy={y} r={r * 0.07} fill={PAPER.ink} /> : null;
        }))}
        <rect x={0.5 + 2 * r} y={g.h * 0.25} width={g.w - 0.8 - 2 * r} height={g.h * 0.22} rx={0.05} fill={PAPER.card} stroke={PAPER.ink} strokeWidth={line(T, sw, 0.5)} />
        <line x1={0.5 + 2 * r + (g.w - 0.8 - 2 * r) * 0.6} x2={0.5 + 2 * r + (g.w - 0.8 - 2 * r) * 0.6} y1={g.h * 0.25} y2={g.h * 0.47} stroke="#e5604f" strokeWidth={line(T, sw, 0.8)} />
        {[0, 1].map((k) => <circle key={k} cx={0.7 + 2 * r + k * 0.4} cy={g.h * 0.7} r={0.11} fill={shade(color, -0.35)} stroke={PAPER.ink} strokeWidth={line(T, sw, 0.5)} />)}
      </>} />
    </g>
  );
};

const Newspaper: FC<ArtProps> = (p) => {
  const {g, zz, T, o, sw, color} = p;
  const sheet = g.h / 3;
  return (
    <g>
      {[0, 1].map((k) => <IsoBox key={k} id={`${p.id}-s${k}`} x={g.x + 0.08 * (2 - k)} y={g.y + 0.06 * k} z={zz + k * sheet} w={g.w - 0.08} d={g.d - 0.08} h={sheet} color={shade(color, -0.04 * (2 - k))} T={T} o={o} sw={sw * 0.8} radius={T * 0.04} />)}
      <Decorated {...p} g={{...g, h: sheet}} zz={zz + 2 * sheet} radius={T * 0.04} top={<>
        <rect x={0.15} y={0.12} width={g.w - 0.3} height={0.2} fill={PAPER.ink} />
        <rect x={0.15} y={0.42} width={(g.w - 0.3) * 0.48} height={g.d * 0.42} fill={shade('#b8d6f3', -0.1)} stroke={PAPER.ink} strokeWidth={line(T, sw, 0.4)} />
        {[0, 1, 2, 3, 4].filter((k) => 0.46 + k * 0.17 < g.d - 0.12).map((k) => <rect key={k} x={0.2 + (g.w - 0.3) * 0.52} y={0.46 + k * 0.17} width={(g.w - 0.3) * 0.42} height={0.07} fill={INK_LINE} opacity={0.6} />)}
        {[0, 1].filter((k) => 0.5 + g.d * 0.42 + k * 0.17 < g.d - 0.08).map((k) => <rect key={`b${k}`} x={0.15} y={0.5 + g.d * 0.42 + k * 0.17} width={(g.w - 0.3) * 0.45} height={0.07} fill={INK_LINE} opacity={0.6} />)}
      </>} />
    </g>
  );
};

const Tower: FC<ArtProps> = ({g, zz, T, o, sw, color}) => {
  const cx = g.x + g.w / 2, cy = g.y + g.d / 2, top = zz + g.h, half = 0.18;
  const base = [[g.x + 0.1, g.y + 0.1], [g.x + g.w - 0.1, g.y + 0.1], [g.x + g.w - 0.1, g.y + g.d - 0.1], [g.x + 0.1, g.y + g.d - 0.1]];
  const at = (k: number, t: number) => { // point on leg k at height fraction t
    const [bx, by] = base[k];
    const tx = cx + Math.sign(bx - cx) * half, ty = cy + Math.sign(by - cy) * half;
    return project(bx + (tx - bx) * t, by + (ty - by) * t, zz + g.h * 0.86 * t, T, o);
  };
  const legs = [0, 1, 2, 3].map((k) => ({k, back: k === 0}));
  const lv = [0, 0.25, 0.5, 0.75, 1];
  const ink = shade(color, -0.45);
  const tip = project(cx, cy, top, T, o), mast = project(cx, cy, zz + g.h * 0.86, T, o);
  return (
    <g>
      <IsoShadow x={g.x} y={g.y} w={g.w} d={g.d} opacity={0.7} T={T} o={o} sw={sw} />
      {legs.map(({k, back}) => {const a = at(k, 0), b = at(k, 1); return <line key={k} x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke={back ? ink : PAPER.ink} strokeWidth={sw * (back ? 1 : 1.5)} strokeLinecap="round" />;})}
      {lv.slice(0, -1).map((t, i) => [0, 1, 2, 3].map((k) => {
        const a = at(k, t), b = at((k + 1) % 4, lv[i + 1]), c = at((k + 1) % 4, t);
        const back = k === 3 || k === 0;
        return <g key={`${i}${k}`} opacity={back ? 0.45 : 1}><line x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke={PAPER.ink} strokeWidth={sw * 0.6} /><line x1={a.x} y1={a.y} x2={c.x} y2={c.y} stroke={PAPER.ink} strokeWidth={sw * 0.7} /></g>;
      }))}
      <line x1={mast.x} y1={mast.y} x2={tip.x} y2={tip.y} stroke={PAPER.ink} strokeWidth={sw * 1.6} strokeLinecap="round" />
      {[1, 2, 3].map((k) => {
        const r = k * T * 0.32;
        return <g key={k} fill="none" stroke={PAPER.ink} strokeWidth={sw * 0.9} strokeLinecap="round" opacity={1 - k * 0.22}>
          <path d={`M${tip.x - r * 0.7},${tip.y - r * 0.7} A${r},${r} 0 0 0 ${tip.x - r * 0.7},${tip.y + r * 0.7}`} />
          <path d={`M${tip.x + r * 0.7},${tip.y - r * 0.7} A${r},${r} 0 0 1 ${tip.x + r * 0.7},${tip.y + r * 0.7}`} />
        </g>;
      })}
      <circle cx={tip.x} cy={tip.y} r={sw * 2.6} fill="#e5604f" stroke={PAPER.ink} strokeWidth={sw * 0.6} />
    </g>
  );
};

const Satellite: FC<ArtProps> = (p) => {
  const {g, zz, T, o, sw, color} = p;
  const lift = 0.7, bw = Math.min(0.9, g.w * 0.3);
  const body: Geo = {x: g.x + g.w / 2 - bw / 2, y: g.y + g.d / 2 - bw / 2, z: g.z, w: bw, d: bw, h: Math.min(g.h, 0.9)};
  const panel = (x: number, w: number, key: string) => (
    <Decorated key={key} {...p} id={`${p.id}-${key}`} g={{x, y: body.y + 0.05, z: g.z, w, d: bw - 0.1, h: 0.08}} zz={zz + lift + body.h * 0.45} color="#7fa6d6" radius={T * 0.03}
      top={<>{Array.from({length: Math.max(2, Math.round(w / 0.3))}, (_, k) => <line key={k} x1={(k + 1) * (w / (Math.max(2, Math.round(w / 0.3)) + 1))} x2={(k + 1) * (w / (Math.max(2, Math.round(w / 0.3)) + 1))} y1={0} y2={bw - 0.1} stroke={PAPER.ink} strokeWidth={line(T, sw, 0.5)} />)}</>} />
  );
  const dishC = project(body.x + bw / 2, body.y + bw / 2, zz + lift + body.h + 0.2, T, o);
  return (
    <g>
      <IsoShadow x={g.x + 0.3} y={g.y} w={g.w - 0.6} d={g.d} opacity={0.45} T={T} o={o} sw={sw} />
      {panel(g.x, body.x - g.x - 0.08, 'pl')}
      <Decorated {...p} g={body} zz={zz + lift} radius={T * 0.08} front={<rect x={0.15} y={0.15} width={bw - 0.3} height={body.h - 0.3} rx={0.05} fill={shade(color, -0.25)} />} />
      {panel(body.x + bw + 0.08, g.x + g.w - body.x - bw - 0.08, 'pr')}
      <ellipse cx={dishC.x} cy={dishC.y} rx={T * 0.32} ry={T * 0.16} fill={PAPER.card} stroke={PAPER.ink} strokeWidth={sw} />
      <circle cx={dishC.x} cy={dishC.y - T * 0.05} r={sw * 1.4} fill={PAPER.ink} />
    </g>
  );
};

const Building: FC<ArtProps> = (p) => {
  const {g, T, sw, color} = p;
  const win = (w: number, h: number, door: boolean) => {
    const cols = Math.max(2, Math.round(w / 0.55)), rows = Math.max(2, Math.round((h - (door ? 0.7 : 0.3)) / 0.55));
    const cw = (w - 0.3) / cols, rh = (h - (door ? 0.8 : 0.35)) / rows;
    return <>
      {Array.from({length: rows}, (_, r) => Array.from({length: cols}, (_, c) => <rect key={`${r}-${c}`} x={0.15 + c * cw + cw * 0.18} y={0.2 + r * rh + rh * 0.15} width={cw * 0.64} height={rh * 0.62} rx={0.04} fill={(r + c) % 3 === 0 ? '#f6e3a6' : '#9fc4ec'} stroke={PAPER.ink} strokeWidth={line(T, sw, 0.4)} />))}
      {door ? <rect x={w / 2 - 0.22} y={h - 0.6} width={0.44} height={0.6} rx={0.05} fill={shade(color, -0.4)} stroke={PAPER.ink} strokeWidth={line(T, sw, 0.5)} /> : null}
    </>;
  };
  return <Decorated {...p} radius={T * 0.06} front={win(g.w, g.h, true)} side={win(g.d, g.h, false)} />;
};

const Book: FC<ArtProps> = (p) => {
  const {g, T, sw, color} = p;
  return <Decorated {...p} radius={T * 0.05}
    top={<>
      <rect x={0.2} y={0.2} width={g.w - 0.4} height={g.d - 0.4} rx={0.06} fill="none" stroke={shade(color, -0.3)} strokeWidth={line(T, sw, 0.6)} />
      <rect x={0.35} y={0.35} width={(g.w - 0.7) * 0.7} height={0.14} fill={PAPER.ink} opacity={0.8} />
      <rect x={0.35} y={0.6} width={(g.w - 0.7) * 0.45} height={0.09} fill={PAPER.ink} opacity={0.5} />
    </>}
    front={<><rect x={0.06} y={0.07} width={g.w - 0.12} height={g.h - 0.14} fill={PAPER.card} />
      {[0.3, 0.5, 0.7].map((v) => <line key={v} x1={0.06} x2={g.w - 0.06} y1={g.h * v} y2={g.h * v} stroke={shade(PAPER.card, -0.18)} strokeWidth={line(T, sw, 0.4)} />)}</>}
  />;
};

const Microphone: FC<ArtProps> = ({id, g, zz, T, o, sw, color}) => {
  const cx = g.x + g.w / 2, cy = g.y + g.d / 2, headR = Math.min(g.w, g.d) * 0.36, headH = Math.min(0.75, g.h * 0.32);
  return (
    <g>
      <IsoCylinder cx={cx} cy={cy} z={zz} r={Math.min(g.w, g.d) * 0.45} h={0.1} color={shade(color, -0.15)} T={T} o={o} sw={sw} bands={0} />
      <IsoBox id={`${id}-rod`} x={cx - 0.06} y={cy - 0.06} z={zz + 0.1} w={0.12} d={0.12} h={g.h - headH - 0.1} color={shade(color, -0.25)} T={T} o={o} sw={sw * 0.8} radius={1} />
      <IsoCylinder cx={cx} cy={cy} z={zz + g.h - headH} r={headR} h={headH} color="#4a5068" T={T} o={o} sw={sw} bands={3} />
    </g>
  );
};

const Camera: FC<ArtProps> = (p) => {
  const {g, T, sw, color} = p;
  const r = Math.min(g.h, g.w) * 0.3;
  return (
    <g>
      <Decorated {...p} radius={T * 0.14}
        front={<>
          <circle cx={g.w / 2} cy={g.h * 0.55} r={r * 1.18} fill={shade(color, -0.25)} stroke={PAPER.ink} strokeWidth={line(T, sw, 0.6)} />
          <circle cx={g.w / 2} cy={g.h * 0.55} r={r * 0.82} fill={SCREEN} stroke={PAPER.ink} strokeWidth={line(T, sw, 0.6)} />
          <circle cx={g.w / 2 - r * 0.3} cy={g.h * 0.55 - r * 0.3} r={r * 0.22} fill="#ffffff" opacity={0.5} />
          <rect x={0.18} y={0.16} width={0.32} height={0.18} rx={0.04} fill="#f6e3a6" stroke={PAPER.ink} strokeWidth={line(T, sw, 0.4)} />
        </>}
        top={<rect x={g.w - 0.55} y={g.d * 0.3} width={0.3} height={0.3} rx={0.08} fill="#e5604f" stroke={PAPER.ink} strokeWidth={line(T, sw, 0.5)} />}
      />
    </g>
  );
};

const Billboard: FC<ArtProps> = (p) => {
  const {g, zz, T, o, sw, color} = p;
  const legH = Math.min(1, g.h * 0.35);
  const board: Geo = {x: g.x, y: g.y + g.d / 2 - 0.1, z: g.z, w: g.w, d: 0.2, h: g.h - legH};
  return (
    <g>
      {[0.35, g.w - 0.55].map((x) => <IsoBox key={x} id={`${p.id}-leg${x}`} x={g.x + x} y={board.y + 0.02} z={zz} w={0.18} d={0.16} h={legH} color={shade(color, -0.3)} T={T} o={o} sw={sw * 0.8} radius={1} />)}
      <Decorated {...p} g={board} zz={zz + legH} radius={T * 0.05} front={<>
        <rect x={0.12} y={0.12} width={board.w - 0.24} height={board.h - 0.24} rx={0.06} fill={PAPER.card} stroke={PAPER.ink} strokeWidth={line(T, sw, 0.5)} />
        <rect x={0.3} y={0.3} width={(board.w - 0.6) * 0.55} height={0.2} fill={PAPER.ink} />
        <rect x={0.3} y={0.62} width={(board.w - 0.6) * 0.4} height={0.1} fill={INK_LINE} opacity={0.6} />
        <circle cx={board.w - 0.3 - Math.min(0.5, board.h * 0.28)} cy={board.h / 2} r={Math.min(0.5, board.h * 0.28)} fill="#f4a596" stroke={PAPER.ink} strokeWidth={line(T, sw, 0.5)} />
        <rect x={0.3} y={board.h - 0.5} width={0.7} height={0.22} rx={0.08} fill="#ff5500" />
      </>} />
    </g>
  );
};

/* --------------------------------------------------------------------------- medical objects */

/** Red cross used on hospitals, ambulances and medicine labels. Face coordinates (grid units). */
const redCross = (cx: number, cy: number, s: number, T: number, sw: number) => (
  <g>
    <rect x={cx - s * 0.17} y={cy - s * 0.5} width={s * 0.34} height={s} rx={s * 0.05} fill={PAPER.bad} stroke={PAPER.ink} strokeWidth={line(T, sw, 0.35)} />
    <rect x={cx - s * 0.5} y={cy - s * 0.17} width={s} height={s * 0.34} rx={s * 0.05} fill={PAPER.bad} stroke={PAPER.ink} strokeWidth={line(T, sw, 0.35)} />
  </g>
);

/** A thick rounded bar between two projected points (used for the microscope arm/eyepiece). */
const limb = (a: Pt, b: Pt, w: number, color: string, sw: number) => (
  <g>
    <line x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke={PAPER.ink} strokeWidth={w + sw * 1.5} strokeLinecap="round" />
    <line x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke={color} strokeWidth={w} strokeLinecap="round" />
  </g>
);

/** Hospital: a multi-storey building with a window grid, a door and a rooftop red-cross sign. */
const Hospital: FC<ArtProps> = (p) => {
  const {g, T, sw, color} = p;
  const win = (w: number, h: number, door: boolean) => {
    const cols = Math.max(2, Math.round(w / 0.5)), rows = Math.max(2, Math.round((h - (door ? 0.7 : 0.3)) / 0.55));
    const cw = (w - 0.3) / cols, rh = (h - (door ? 0.8 : 0.35)) / rows;
    return <>
      {Array.from({length: rows}, (_, r) => Array.from({length: cols}, (_, c) => (
        <rect key={`${r}-${c}`} x={0.15 + c * cw + cw * 0.18} y={0.2 + r * rh + rh * 0.15} width={cw * 0.64} height={rh * 0.62} rx={0.04}
          fill={(r + c) % 3 === 0 ? '#f6e3a6' : '#9fc4ec'} stroke={PAPER.ink} strokeWidth={line(T, sw, 0.4)} />
      )))}
      {door ? <rect x={w / 2 - 0.24} y={h - 0.62} width={0.48} height={0.62} rx={0.05} fill={shade(color, -0.4)} stroke={PAPER.ink} strokeWidth={line(T, sw, 0.5)} /> : null}
    </>;
  };
  const sign: Geo = {x: g.x + g.w * 0.28, y: g.y + g.d * 0.3, z: 0, w: g.w * 0.44, d: 0.2, h: 0.5};
  return (
    <g>
      <Decorated {...p} radius={T * 0.06} front={win(g.w, g.h, true)} side={win(g.d, g.h, false)} />
      <IsoBox id={`${p.id}-sign`} x={sign.x} y={sign.y} z={p.zz + g.h} w={sign.w} d={sign.d} h={sign.h} color="#fffaf1" T={T} o={p.o} sw={sw} radius={T * 0.05} />
      <g transform={face('front', sign, p.zz + g.h, p)}>{redCross(sign.w / 2, sign.h / 2, Math.min(0.4, sign.h * 0.7), T, sw)}</g>
    </g>
  );
};

/** Doctor: a standing figure in a white coat with scrubs, a stethoscope and a badge. */
const Doctor: FC<ArtProps> = ({g, zz, T, o, sw, color}) => {
  const c = project(g.x + g.w / 2, g.y + g.d / 2, zz, T, o);
  const h = g.h * T, bw = g.w * T * 0.7, hr = bw * 0.3;
  const coat = '#fdfbf6', skin = '#f6d3b6', hair = '#3a3550', steth = '#4a5068';
  return (
    <g transform={`translate(${c.x} ${c.y})`}>
      <ellipse cx={0} cy={0} rx={bw * 0.7} ry={sw * 2.4} fill={PAPER.shadow} />
      <rect x={-bw * 0.26} y={-h * 0.2} width={bw * 0.2} height={h * 0.2} rx={sw} fill={shade(color, -0.35)} stroke={PAPER.ink} strokeWidth={sw * 0.7} />
      <rect x={bw * 0.06} y={-h * 0.2} width={bw * 0.2} height={h * 0.2} rx={sw} fill={shade(color, -0.35)} stroke={PAPER.ink} strokeWidth={sw * 0.7} />
      <path d={`M${-bw * 0.38},${-h * 0.66} L${bw * 0.38},${-h * 0.66} L${bw * 0.5},${-h * 0.12} L${-bw * 0.5},${-h * 0.12} Z`} fill={coat} stroke={PAPER.ink} strokeWidth={sw * 0.85} strokeLinejoin="round" />
      <path d={`M${-bw * 0.2},${-h * 0.65} L0,${-h * 0.44} L${bw * 0.2},${-h * 0.65} Z`} fill={color} stroke={PAPER.ink} strokeWidth={sw * 0.5} />
      <line x1={0} y1={-h * 0.44} x2={0} y2={-h * 0.12} stroke={PAPER.ink} strokeWidth={sw * 0.5} opacity={0.5} />
      <rect x={-bw * 0.55} y={-h * 0.62} width={bw * 0.17} height={h * 0.42} rx={sw * 2} fill={coat} stroke={PAPER.ink} strokeWidth={sw * 0.7} />
      <rect x={bw * 0.38} y={-h * 0.62} width={bw * 0.17} height={h * 0.42} rx={sw * 2} fill={coat} stroke={PAPER.ink} strokeWidth={sw * 0.7} />
      <circle cx={0} cy={-h * 0.78} r={hr} fill={skin} stroke={PAPER.ink} strokeWidth={sw * 0.8} />
      <path d={`M${-hr},${-h * 0.8} A${hr},${hr} 0 0 1 ${hr},${-h * 0.8} L${hr * 0.7},${-h * 0.85} A${hr * 0.8},${hr * 0.8} 0 0 0 ${-hr * 0.7},${-h * 0.85} Z`} fill={hair} />
      <path d={`M${-hr * 0.62},${-h * 0.72} C${-hr * 0.62},${-h * 0.4} ${hr * 0.5},${-h * 0.34} ${bw * 0.1},${-h * 0.42}`} fill="none" stroke={steth} strokeWidth={sw * 1.1} strokeLinecap="round" />
      <circle cx={bw * 0.1} cy={-h * 0.42} r={sw * 2.2} fill={shade(color, -0.1)} stroke={steth} strokeWidth={sw * 0.7} />
      <rect x={-bw * 0.36} y={-h * 0.57} width={bw * 0.14} height={bw * 0.1} rx={sw} fill={PAPER.card} stroke={PAPER.ink} strokeWidth={sw * 0.4} />
    </g>
  );
};

/** Patient bed: metal frame on castors, mattress, pillow and a folded blanket. */
const PatientBed: FC<ArtProps> = ({id, g, zz, T, o, sw, color}) => {
  const P = (x: number, y: number, z: number) => project(x, y, z, T, o);
  const frameH = 0.16, matZ = zz + frameH + 0.2;
  const head: Geo = {x: g.x, y: g.y, z: zz, w: 0.16, d: g.d, h: Math.max(0.5, g.h * 0.8)};
  const foot: Geo = {x: g.x + g.w - 0.14, y: g.y, z: zz, w: 0.14, d: g.d, h: Math.max(0.32, g.h * 0.45)};
  const blanket = poly([
    P(g.x + g.w * 0.42, g.y + 0.08, matZ + 0.02), P(g.x + g.w - 0.1, g.y + 0.08, matZ + 0.02),
    P(g.x + g.w - 0.1, g.y + g.d - 0.08, matZ + 0.02), P(g.x + g.w * 0.42, g.y + g.d - 0.08, matZ + 0.02),
  ]);
  const wheels = [[g.x + 0.18, g.y + 0.18], [g.x + g.w - 0.18, g.y + 0.18], [g.x + g.w - 0.18, g.y + g.d - 0.18], [g.x + 0.18, g.y + g.d - 0.18]].map(([x, y]) => P(x, y, zz));
  return (
    <g>
      {wheels.map((w, i) => <circle key={i} cx={w.x} cy={w.y} r={sw * 2.6} fill="#4a5068" stroke={PAPER.ink} strokeWidth={sw * 0.5} />)}
      <IsoBox id={`${id}-frame`} x={g.x} y={g.y} z={zz} w={g.w} d={g.d} h={frameH} color={color} T={T} o={o} sw={sw} radius={T * 0.05} />
      <IsoBox id={`${id}-mat`} x={g.x + 0.08} y={g.y + 0.08} z={zz + frameH} w={g.w - 0.16} d={g.d - 0.16} h={0.2} color={shade(color, 0.6)} T={T} o={o} sw={sw * 0.8} radius={T * 0.08} />
      <polygon points={blanket} fill={shade('#b0dfda', 0.1)} stroke={PAPER.ink} strokeWidth={sw * 0.7} strokeLinejoin="round" />
      <IsoBox id={`${id}-pillow`} x={g.x + 0.24} y={g.y + 0.22} z={matZ} w={0.48} d={g.d - 0.44} h={0.1} color="#fffaf1" T={T} o={o} sw={sw * 0.7} radius={T * 0.06} />
      <IsoBox id={`${id}-head`} {...head} color={shade(color, -0.05)} T={T} o={o} sw={sw} radius={T * 0.03} />
      <IsoBox id={`${id}-foot`} {...foot} color={shade(color, -0.05)} T={T} o={o} sw={sw} radius={T * 0.03} />
    </g>
  );
};

/** Ambulance: white van with a red stripe, a side cross, a cab window, wheels and a light bar. */
const Ambulance: FC<ArtProps> = (p) => {
  const {id, g, zz, T, o, sw, color} = p;
  // drives toward +x (down-right on screen): windscreen on the cab's side face, livery on the long front face
  const lift = 0.2, bodyH = Math.min(g.h, 1.25) - lift, cabH = bodyH * 0.7;
  const body: Geo = {x: g.x, y: g.y, z: 0, w: g.w * 0.68, d: g.d, h: bodyH};
  const cab: Geo = {x: g.x + g.w * 0.68, y: g.y, z: 0, w: g.w * 0.32, d: g.d, h: cabH};
  const z0 = zz + lift;
  const wheels: Geo = {x: g.x, y: g.y, z: 0, w: g.w, d: g.d, h: lift}; // the strip under the body, for the visible wheels
  return (
    <g>
      <IsoBox id={`${id}-body`} x={body.x} y={body.y} z={z0} w={body.w} d={body.d} h={body.h} color="#fffaf1" T={T} o={o} sw={sw} radius={T * 0.08} />
      <g transform={face('front', body, z0, p)}>
        <rect x={0} y={body.h * 0.5} width={body.w} height={body.h * 0.14} fill={PAPER.bad} />
        {redCross(body.w * 0.55, body.h * 0.27, Math.min(0.5, body.h * 0.36), T, sw)}
        <rect x={0.14} y={body.h * 0.14} width={0.42} height={body.h * 0.26} rx={0.05} fill={SCREEN} stroke={PAPER.ink} strokeWidth={line(T, sw, 0.5)} />
      </g>
      <IsoBox id={`${id}-cab`} x={cab.x} y={cab.y} z={z0} w={cab.w} d={cab.d} h={cab.h} color="#fffaf1" T={T} o={o} sw={sw} radius={T * 0.08} />
      <g transform={face('front', cab, z0, p)}>
        <rect x={0.08} y={0.1} width={cab.w - 0.2} height={cab.h * 0.42} rx={0.05} fill={SCREEN} stroke={PAPER.ink} strokeWidth={line(T, sw, 0.5)} />
        <rect x={0} y={cab.h * 0.68} width={cab.w} height={cab.h * 0.14} fill={PAPER.bad} />
      </g>
      <g transform={face('side', cab, z0, p)}>
        <rect x={0.1} y={0.1} width={cab.d - 0.2} height={cab.h * 0.45} rx={0.06} fill={SCREEN} stroke={PAPER.ink} strokeWidth={line(T, sw, 0.5)} />
        {[0.18, cab.d - 0.18].map((x) => <circle key={x} cx={x} cy={cab.h * 0.75} r={0.07} fill="#f6e3a6" stroke={PAPER.ink} strokeWidth={line(T, sw, 0.4)} />)}
      </g>
      {/* light bar on the roof */}
      <g opacity={0.45 + 0.55 * Math.pow(Math.sin((p.time ?? 0) * Math.PI * 2 + 0), 2)}><IsoBox id={`${id}-bl1`} x={g.x + body.w * 0.55} y={g.y + g.d * 0.3} z={z0 + bodyH} w={0.26} d={g.d * 0.4} h={0.14} color="#e5604f" T={T} o={o} sw={sw * 0.7} radius={T * 0.03} /></g>
      <g opacity={0.45 + 0.55 * Math.pow(Math.sin((p.time ?? 0) * Math.PI * 2 + 1.5708), 2)}><IsoBox id={`${id}-bl2`} x={g.x + body.w * 0.55 + 0.26} y={g.y + g.d * 0.3} z={z0 + bodyH} w={0.26} d={g.d * 0.4} h={0.14} color="#7aa7e8" T={T} o={o} sw={sw * 0.7} radius={T * 0.03} /></g>
      {/* the two wheels on the side facing us (the far ones are hidden by the body) */}
      <g transform={face('front', wheels, zz, p)}>
        {[g.w * 0.2, g.w * 0.8].map((x) => <g key={x}>
          <circle cx={x} cy={lift - 0.27} r={0.27} fill="#3a3550" stroke={PAPER.ink} strokeWidth={line(T, sw, 0.8)} />
          <circle cx={x} cy={lift - 0.27} r={0.11} fill={shade(color, -0.1)} />
        </g>)}
      </g>
    </g>
  );
};

/** Pill bottle: amber cylinder with a ribbed white cap and a label. */
const PillBottle: FC<ArtProps> = ({g, zz, T, o, sw, color}) => {
  const cx = g.x + g.w / 2, cy = g.y + g.d / 2;
  const capH = Math.min(0.35, g.h * 0.22), bodyH = g.h - capH, r = Math.min(g.w, g.d) * 0.42;
  const c = project(cx, cy, zz + bodyH * 0.5, T, o), w = r * C30 * T * 1.35, h = bodyH * T * 0.42;
  return (
    <g>
      <IsoCylinder cx={cx} cy={cy} z={zz} r={r} h={bodyH} color={color} T={T} o={o} sw={sw} bands={0} />
      <IsoCylinder cx={cx} cy={cy} z={zz + bodyH} r={r * 1.12} h={capH} color={shade('#d2d5de', 0.2)} T={T} o={o} sw={sw} bands={3} />
      <g transform={`translate(${c.x} ${c.y})`}>
        <rect x={-w / 2} y={-h / 2} width={w} height={h} rx={sw * 2} fill={PAPER.card} stroke={PAPER.ink} strokeWidth={sw * 0.6} />
        <rect x={-w / 2 + sw * 2} y={-h * 0.32} width={w - sw * 4} height={h * 0.2} fill={PAPER.bad} opacity={0.85} />
        <line x1={-w * 0.3} x2={w * 0.3} y1={h * 0.08} y2={h * 0.08} stroke={PAPER.ink} strokeWidth={sw * 0.5} opacity={0.5} />
        <line x1={-w * 0.3} x2={w * 0.08} y1={h * 0.27} y2={h * 0.27} stroke={PAPER.ink} strokeWidth={sw * 0.5} opacity={0.5} />
      </g>
    </g>
  );
};

/** Syringe: graduated barrel, plunger and flange at the back, needle at the front. */
const Syringe: FC<ArtProps> = (p) => {
  const {id, g, zz, T, o, sw, color} = p;
  const y = g.y + g.d / 2, z = zz + g.h / 2;
  const barrel: Geo = {x: g.x + g.w * 0.18, y: y - 0.12, z: z - 0.12, w: g.w * 0.62, d: 0.24, h: 0.24};
  const plunger: Geo = {x: g.x, y: y - 0.05, z: z - 0.05, w: g.w * 0.18, d: 0.1, h: 0.1};
  const flange: Geo = {x: g.x, y: y - 0.22, z: z - 0.22, w: 0.1, d: 0.44, h: 0.44};
  const a = project(g.x + g.w * 0.8, y, z, T, o), b = project(g.x + g.w, y, z, T, o);
  return (
    <g>
      <line x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke={PAPER.ink} strokeWidth={sw * 1.2} strokeLinecap="round" />
      <IsoBox id={`${id}-barrel`} {...barrel} color={shade(color, 0.4)} T={T} o={o} sw={sw} radius={T * 0.03} />
      <IsoBox id={`${id}-plunger`} {...plunger} color={shade(color, -0.1)} T={T} o={o} sw={sw * 0.8} radius={T * 0.02} />
      <IsoBox id={`${id}-flange`} {...flange} color={shade(color, -0.1)} T={T} o={o} sw={sw * 0.8} radius={T * 0.02} />
      <g transform={face('front', barrel, barrel.z, p)}>
        {[0, 1, 2, 3, 4, 5].map((k) => {
          const x = 0.15 + k * ((barrel.w - 0.3) / 5);
          return <line key={k} x1={x} x2={x} y1={0.05} y2={k % 2 ? 0.1 : 0.17} stroke={PAPER.ink} strokeWidth={line(T, sw, 0.5)} />;
        })}
      </g>
    </g>
  );
};

/** Heart monitor: a screen on a stand with an ECG trace and a grid. */
const HeartMonitor: FC<ArtProps> = (p) => {
  const {id, g, zz, T, o, sw, color} = p;
  const legH = 0.25;
  const body: Geo = {x: g.x, y: g.y + g.d / 2 - 0.2, z: 0, w: g.w, d: 0.4, h: Math.max(0.6, g.h - legH - 0.35)};
  const pulse = (w: number, h: number) => {
    const pts = [[0.08, 0.55], [0.28, 0.55], [0.33, 0.5], [0.38, 0.72], [0.44, 0.2], [0.5, 0.8], [0.56, 0.55], [0.92, 0.55]]
      .map(([fx, fy]) => `${(0.08 + fx * (w - 0.16)).toFixed(2)},${(0.08 + fy * (h - 0.16)).toFixed(2)}`).join(' ');
    return <polyline points={pts} fill="none" stroke={LED} opacity={0.65 + 0.35 * Math.pow(Math.sin((p.time ?? 0) * Math.PI * 1.2), 8)} strokeWidth={line(T, sw, 0.9)} strokeLinejoin="round" strokeLinecap="round" />;
  };
  return (
    <g>
      <IsoBox id={`${id}-base`} x={g.x + g.w * 0.25} y={g.y + g.d * 0.3} z={zz} w={g.w * 0.5} d={g.d * 0.4} h={legH} color={shade(color, -0.1)} T={T} o={o} sw={sw * 0.9} radius={T * 0.1} />
      <IsoBox id={`${id}-neck`} x={g.x + g.w / 2 - 0.08} y={g.y + g.d / 2 - 0.08} z={zz + legH} w={0.16} d={0.16} h={0.18} color={shade(color, -0.2)} T={T} o={o} sw={sw * 0.8} radius={1} />
      <Decorated {...p} g={body} zz={zz + legH} radius={T * 0.09} front={<>
        <rect x={0.08} y={0.08} width={body.w - 0.16} height={body.h - 0.16} rx={0.06} fill={SCREEN} stroke={PAPER.ink} strokeWidth={line(T, sw, 0.6)} />
        {[0, 1, 2, 3].map((k) => <line key={k} x1={0.1 + k * ((body.w - 0.2) / 4)} x2={0.1 + k * ((body.w - 0.2) / 4)} y1={0.12} y2={body.h - 0.12} stroke="#ffffff" strokeWidth={line(T, sw, 0.25)} opacity={0.08} />)}
        {pulse(body.w, body.h)}
        <line x1={0.12 + ((p.time ?? 0) * 0.65 % 1) * (body.w - 0.24)} x2={0.12 + ((p.time ?? 0) * 0.65 % 1) * (body.w - 0.24)} y1={0.14} y2={body.h - 0.14} stroke={LED} opacity={0.3} strokeWidth={line(T, sw, 1.3)} />
        <circle cx={body.w - 0.2} cy={body.h - 0.18} r={0.07} fill={LED} stroke={PAPER.ink} strokeWidth={line(T, sw, 0.4)} />
      </>} />
    </g>
  );
};

/** Microscope: heavy base, angled arm, stage with a hole, objective lenses and an eyepiece. */
const Microscope: FC<ArtProps> = ({id, g, zz, T, o, sw, color}) => {
  const P = (x: number, y: number, z: number) => project(x, y, z, T, o);
  const cx = g.x + g.w / 2, cy = g.y + g.d / 2;
  const baseTop = zz + 0.18;
  const stageZ = baseTop + Math.max(0.4, g.h * 0.32);
  const armBase = P(cx, cy - 0.28, baseTop), armTop = P(cx, cy - 0.06, zz + g.h * 0.94);
  const eyeEnd = P(cx, cy + 0.32, zz + g.h * 0.7);
  const hole = P(cx, cy, stageZ + 0.08);
  const stage: Geo = {x: cx - Math.min(0.55, g.w * 0.34), y: cy - Math.min(0.45, g.d * 0.34), z: 0, w: Math.min(1.1, g.w * 0.68), d: Math.min(0.9, g.d * 0.68), h: 0.08};
  return (
    <g>
      <IsoBox id={`${id}-base`} x={g.x + 0.1} y={g.y + 0.1} z={zz} w={g.w - 0.2} d={g.d - 0.2} h={0.18} color={shade(color, -0.05)} T={T} o={o} sw={sw} radius={T * 0.09} />
      {limb(armBase, armTop, T * 0.16, shade(color, -0.2), sw)}
      {limb(armTop, eyeEnd, T * 0.14, shade(color, -0.1), sw)}
      <circle cx={eyeEnd.x} cy={eyeEnd.y} r={T * 0.1} fill="#3a3550" stroke={PAPER.ink} strokeWidth={sw * 0.6} />
      <IsoCylinder cx={cx} cy={cy} z={stageZ - 0.3} r={0.13} h={0.3} color={shade(color, -0.15)} T={T} o={o} sw={sw * 0.8} bands={0} />
      <IsoBox id={`${id}-stage`} {...stage} z={stageZ} color={shade(color, 0.1)} T={T} o={o} sw={sw} radius={T * 0.04} />
      <ellipse cx={hole.x} cy={hole.y} rx={0.13 * C30 * T} ry={0.13 * S30 * T} fill={shade(color, -0.5)} stroke={PAPER.ink} strokeWidth={sw * 0.5} />
      <circle cx={P(cx - 0.28, cy - 0.28, stageZ).x} cy={P(cx - 0.28, cy - 0.28, stageZ).y} r={T * 0.09} fill={shade(color, -0.3)} stroke={PAPER.ink} strokeWidth={sw * 0.5} />
    </g>
  );
};

/** Test tube rack: a low rack with holes holding several coloured sample tubes. */
const TestTubeRack: FC<ArtProps> = ({id, g, zz, T, o, sw, color}) => {
  const n = Math.max(3, Math.min(6, Math.round(g.w / 0.42)));
  const rackH = Math.max(0.2, g.h * 0.18), tubeH = g.h - rackH;
  const r = Math.min(0.15, (g.w - 0.3) / (n * 2.4)), cy = g.y + g.d / 2;
  const xs = Array.from({length: n}, (_, k) => g.x + 0.25 + k * ((g.w - 0.5) / (n - 1)));
  const liquids = ['#b9e2c7', '#f3b9c6', '#b8d6f3', '#f4da93', '#cdc3ee', '#b0dfda'];
  return (
    <g>
      <IsoBox id={`${id}-rack`} x={g.x} y={g.y} z={zz} w={g.w} d={g.d} h={rackH} color={shade(color, -0.1)} T={T} o={o} sw={sw} radius={T * 0.04} />
      {xs.map((x, k) => {
        const q = project(x, cy, zz + rackH, T, o);
        return <ellipse key={`h${k}`} cx={q.x} cy={q.y} rx={r * C30 * T * 1.4} ry={r * S30 * T * 1.4} fill={shade(color, -0.45)} stroke={PAPER.ink} strokeWidth={sw * 0.5} />;
      })}
      {xs.map((x, k) => <g key={`t${k}`}>
        <IsoCylinder cx={x} cy={cy} z={zz + rackH - 0.05} r={r} h={tubeH} color="#eef3f5" T={T} o={o} sw={sw * 0.7} bands={0} />
        <IsoCylinder cx={x} cy={cy} z={zz + rackH - 0.05} r={r * 0.8} h={tubeH * 0.45} color={liquids[k % liquids.length]} T={T} o={o} sw={sw * 0.4} bands={0} />
      </g>)}
    </g>
  );
};

/** DNA strand: a double helix drawn as two mirrored sine waves with coloured base-pair rungs. */
const Dna: FC<ArtProps> = ({g, zz, T, o, sw, color}) => {
  const c = project(g.x + g.w / 2, g.y + g.d / 2, zz + g.h / 2, T, o);
  const h = g.h * T, amp = g.w * T * 0.22;
  const strand = (phase: number) => Array.from({length: 41}, (_, i) => {
    const t = i / 40;
    return {x: c.x + Math.sin(t * Math.PI * 3.5 + phase) * amp, y: c.y + h / 2 - t * h};
  }).map((q, i) => `${i ? 'L' : 'M'}${q.x.toFixed(1)},${q.y.toFixed(1)}`).join(' ');
  const rungs = Array.from({length: 9}, (_, k) => {
    const t = (k + 0.5) / 9, y = c.y + h / 2 - t * h;
    const x1 = c.x + Math.sin(t * Math.PI * 3.5) * amp, x2 = c.x + Math.sin(t * Math.PI * 3.5 + Math.PI) * amp;
    return <line key={k} x1={x1} y1={y} x2={x2} y2={y} stroke={k % 2 ? shade(color, -0.3) : shade(color, 0.05)} strokeWidth={sw * 1.6} strokeLinecap="round" />;
  });
  return (
    <g>
      <path d={strand(0)} fill="none" stroke={shade(color, -0.25)} strokeWidth={sw * 2.4} strokeLinecap="round" />
      <path d={strand(Math.PI)} fill="none" stroke={shade(color, 0.18)} strokeWidth={sw * 2.4} strokeLinecap="round" />
      {rungs}
    </g>
  );
};

/* ---------------------------------------------------------------------------- school objects */

/** School: a classic schoolhouse - low and wide, red gable roof, bell cupola with a flag, entrance with steps. */
const School: FC<ArtProps> = (p) => {
  const {g, zz, T, o, sw, color} = p;
  const P = (x: number, y: number, z: number) => project(x, y, z, T, o);
  const ROOF = '#d9664f', TRIM = '#fffaf1';
  const stepD = 0.32;
  const wallH = g.h * 0.5, roofH = g.h * 0.26; // + cupola = the full height
  const walls: Geo = {x: g.x, y: g.y, z: 0, w: g.w, d: g.d - stepD, h: wallH};
  const top = zz + wallH, ridgeY = walls.y + walls.d / 2, ov = 0.14;
  const f = faces(color), r = faces(ROOF);
  const pane = (x: number, y: number, w: number, h: number, lit: boolean, key: string) => (
    <g key={key}>
      <rect x={x - 0.05} y={y - 0.05} width={w + 0.1} height={h + 0.1} rx={0.03} fill={TRIM} stroke={PAPER.ink} strokeWidth={line(T, sw, 0.4)} />
      <rect x={x} y={y} width={w} height={h} fill={lit ? '#f6e3a6' : '#9fc4ec'} />
      <line x1={x + w / 2} x2={x + w / 2} y1={y} y2={y + h} stroke={TRIM} strokeWidth={line(T, sw, 0.6)} />
      <line x1={x} x2={x + w} y1={y + h * 0.45} y2={y + h * 0.45} stroke={TRIM} strokeWidth={line(T, sw, 0.6)} />
    </g>
  );
  // front wall: two windows each side of a double door with a sign above it
  const n = Math.max(1, Math.floor((walls.w / 2 - 0.55) / 0.62)), ww = 0.42, wh = wallH * 0.38, wy = wallH * 0.3;
  const doorW = 0.6, doorH = wallH * 0.56, dx = walls.w / 2 - doorW / 2;
  const front = <>
    <rect x={0} y={wallH - 0.12} width={walls.w} height={0.12} fill={shade(color, -0.25)} />
    {Array.from({length: n}, (_, k) => pane(0.3 + k * 0.62, wy, ww, wh, k % 2 === 0, `l${k}`))}
    {Array.from({length: n}, (_, k) => pane(walls.w - 0.3 - ww - k * 0.62, wy, ww, wh, k % 2 === 1, `r${k}`))}
    <rect x={dx - 0.08} y={wallH - doorH - 0.08} width={doorW + 0.16} height={doorH + 0.08} rx={0.04} fill={TRIM} stroke={PAPER.ink} strokeWidth={line(T, sw, 0.4)} />
    <rect x={dx} y={wallH - doorH} width={doorW} height={doorH} fill={shade(ROOF, -0.25)} stroke={PAPER.ink} strokeWidth={line(T, sw, 0.5)} />
    <line x1={walls.w / 2} x2={walls.w / 2} y1={wallH - doorH} y2={wallH} stroke={PAPER.ink} strokeWidth={line(T, sw, 0.5)} />
    <rect x={walls.w / 2 - 0.5} y={wallH - doorH - 0.36} width={1} height={0.22} rx={0.04} fill={TRIM} stroke={PAPER.ink} strokeWidth={line(T, sw, 0.4)} />
    <rect x={walls.w / 2 - 0.36} y={wallH - doorH - 0.28} width={0.72} height={0.06} rx={0.03} fill={INK_LINE} />
  </>;
  const side = <>
    <rect x={0} y={wallH - 0.12} width={walls.d} height={0.12} fill={shade(color, -0.3)} />
    {pane(walls.d / 2 - 0.22, wy, 0.44, wh, true, 's')}
  </>;
  // gable roof: ridge along x; the front slope and the right gable end are visible
  const gable = [P(walls.x + walls.w, walls.y, top), P(walls.x + walls.w, walls.y + walls.d, top), P(walls.x + walls.w, ridgeY, top + roofH)];
  const slope = [P(walls.x - ov, ridgeY, top + roofH), P(walls.x + walls.w + ov, ridgeY, top + roofH),
    P(walls.x + walls.w + ov, walls.y + walls.d + ov, top - ov * 0.7), P(walls.x - ov, walls.y + walls.d + ov, top - ov * 0.7)];
  const backSlope = [P(walls.x - ov, ridgeY, top + roofH), P(walls.x + walls.w + ov, ridgeY, top + roofH),
    P(walls.x + walls.w + ov, walls.y - ov, top - ov * 0.7), P(walls.x - ov, walls.y - ov, top - ov * 0.7)];
  const eaveEdge = [P(walls.x + walls.w + ov, ridgeY, top + roofH), P(walls.x + walls.w + ov, walls.y + walls.d + ov, top - ov * 0.7)];
  // bell cupola on the ridge, with a pyramid cap and a flag
  const cw = 0.62, cx0 = walls.x + walls.w / 2 - cw / 2, cy0 = ridgeY - cw / 2;
  const cup: Geo = {x: cx0, y: cy0, z: 0, w: cw, d: cw, h: g.h * 0.22};
  const cupZ = top + roofH - 0.3, capZ = cupZ + cup.h, apex = P(cx0 + cw / 2, cy0 + cw / 2, capZ + g.h * 0.16);
  const c0 = P(cx0 - 0.07, cy0 + cw + 0.07, capZ), c1 = P(cx0 + cw + 0.07, cy0 + cw + 0.07, capZ), c2 = P(cx0 + cw + 0.07, cy0 - 0.07, capZ);
  const pole1 = {x: apex.x, y: apex.y - T * 0.7};
  const bcx = cw / 2, bcy = cup.h * 0.5;
  return (
    <g>
      <IsoShadow x={g.x} y={g.y} w={g.w} d={g.d} opacity={0.8} T={T} o={o} sw={sw} />
      {/* entrance steps */}
      <IsoBox id={`${p.id}-step1`} x={walls.x + dx - 0.2} y={walls.y + walls.d} z={zz} w={doorW + 0.4} d={stepD} h={0.1} color="#d2d5de" T={T} o={o} sw={sw * 0.8} radius={T * 0.02} />
      <IsoBox id={`${p.id}-step2`} x={walls.x + dx - 0.1} y={walls.y + walls.d} z={zz + 0.1} w={doorW + 0.2} d={stepD * 0.5} h={0.1} color="#e3e5ec" T={T} o={o} sw={sw * 0.8} radius={T * 0.02} />
      <Decorated {...p} g={walls} radius={T * 0.04} front={front} side={side} />
      <polygon points={poly(backSlope)} fill={r.right} stroke={PAPER.ink} strokeWidth={sw} strokeLinejoin="round" />
      <polygon points={poly(gable)} fill={f.right} stroke={PAPER.ink} strokeWidth={sw} strokeLinejoin="round" />
      <circle cx={(gable[0].x + gable[1].x + gable[2].x) / 3} cy={(gable[0].y + gable[1].y + gable[2].y) / 3 + T * 0.06} r={T * 0.13} fill={TRIM} stroke={PAPER.ink} strokeWidth={sw * 0.6} />
      <polygon points={poly(slope)} fill={r.top} stroke={PAPER.ink} strokeWidth={sw} strokeLinejoin="round" />
      {[0.25, 0.5, 0.75].map((t) => {
        const a = {x: slope[0].x + (slope[3].x - slope[0].x) * t, y: slope[0].y + (slope[3].y - slope[0].y) * t};
        const b = {x: slope[1].x + (slope[2].x - slope[1].x) * t, y: slope[1].y + (slope[2].y - slope[1].y) * t};
        return <line key={t} x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke={r.right} strokeWidth={sw * 0.7} />;
      })}
      <line x1={eaveEdge[0].x} y1={eaveEdge[0].y} x2={eaveEdge[1].x} y2={eaveEdge[1].y} stroke={PAPER.ink} strokeWidth={sw * 1.6} strokeLinecap="round" />
      <Decorated {...p} id={`${p.id}-cupola`} g={cup} zz={cupZ} color={TRIM} radius={T * 0.03}
        front={<>
          <path d={`M${bcx - 0.17},${cup.h - 0.06} L${bcx - 0.17},${bcy} A0.17,0.17 0 0 1 ${bcx + 0.17},${bcy} L${bcx + 0.17},${cup.h - 0.06} Z`} fill={shade(ROOF, -0.45)} />
          <path d={`M${bcx - 0.11},${bcy + 0.13} L${bcx - 0.08},${bcy - 0.03} Q${bcx},${bcy - 0.14} ${bcx + 0.08},${bcy - 0.03} L${bcx + 0.11},${bcy + 0.13} Z`} fill="#e3b75c" stroke={PAPER.ink} strokeWidth={line(T, sw, 0.35)} />
        </>} />
      <polygon points={poly([apex, c0, c1])} fill={r.left} stroke={PAPER.ink} strokeWidth={sw} strokeLinejoin="round" />
      <polygon points={poly([apex, c1, c2])} fill={r.right} stroke={PAPER.ink} strokeWidth={sw} strokeLinejoin="round" />
      <line x1={apex.x} y1={apex.y} x2={pole1.x} y2={pole1.y} stroke={PAPER.ink} strokeWidth={sw * 1.3} strokeLinecap="round" />
      <polygon points={poly([pole1, {x: pole1.x + T * 0.42, y: pole1.y + T * 0.1}, {x: pole1.x, y: pole1.y + T * 0.26}])} fill="#ff5500" stroke={PAPER.ink} strokeWidth={sw * 0.6} strokeLinejoin="round" />
    </g>
  );
};

/** Teacher: a whiteboard on legs with writing and a diagram, plus a teacher pointing at it. */
const Teacher: FC<ArtProps> = (p) => {
  const {g, zz, T, o, sw, color} = p;
  const P = (x: number, y: number, z: number) => project(x, y, z, T, o);
  const board: Geo = {x: g.x + 0.1, y: g.y + 0.12, z: 0, w: g.w * 0.9, d: 0.22, h: g.h * 0.92};
  const boardZ = zz + 0.35;
  const c = P(g.x + g.w * 0.88, g.y + g.d * 0.8, zz);
  const h = g.h * T * 0.78, bw = g.w * T * 0.2, hr = bw * 0.34;
  const target = P(g.x + g.w * 0.22, g.y + g.d * 0.3, boardZ + board.h * 0.6);
  const hand = {x: bw * 0.35, y: -h * 0.5};
  return (
    <g>
      {[board.x + 0.2, board.x + board.w - 0.34].map((x) => <IsoBox key={x} id={`${p.id}-leg${x}`} x={x} y={board.y + 0.04} z={zz} w={0.12} d={0.12} h={0.35} color={shade(color, -0.3)} T={T} o={o} sw={sw * 0.8} radius={1} />)}
      <Decorated {...p} g={board} zz={boardZ} radius={T * 0.05} front={<>
        <rect x={0.06} y={0.06} width={board.w - 0.12} height={board.h - 0.12} rx={0.04} fill={PAPER.card} stroke={PAPER.ink} strokeWidth={line(T, sw, 0.5)} />
        <rect x={0.2} y={0.18} width={(board.w - 0.4) * 0.46} height={0.09} rx={0.03} fill={INK_LINE} />
        {[0, 1, 2, 3].map((k) => <rect key={k} x={0.2} y={0.44 + k * 0.23} width={(board.w - 0.4) * (k % 2 ? 0.55 : 0.78)} height={0.06} rx={0.03} fill={INK_LINE} opacity={0.5} />)}
        <circle cx={board.w - 0.52} cy={board.h * 0.55} r={0.22} fill="none" stroke={PAPER.bad} strokeWidth={line(T, sw, 0.6)} />
        <line x1={board.w - 0.52} y1={board.h * 0.55 - 0.34} x2={board.w - 0.52} y2={board.h * 0.55 + 0.34} stroke={PAPER.bad} strokeWidth={line(T, sw, 0.5)} />
      </>} />
      <g transform={`translate(${c.x} ${c.y})`}>
        <ellipse cx={0} cy={0} rx={bw * 0.9} ry={sw * 2.4} fill={PAPER.shadow} />
        <rect x={-bw * 0.24} y={-h * 0.2} width={bw * 0.18} height={h * 0.2} rx={sw} fill={shade(color, -0.4)} stroke={PAPER.ink} strokeWidth={sw * 0.7} />
        <rect x={bw * 0.06} y={-h * 0.2} width={bw * 0.18} height={h * 0.2} rx={sw} fill={shade(color, -0.4)} stroke={PAPER.ink} strokeWidth={sw * 0.7} />
        <path d={`M${-bw * 0.36},${-h * 0.66} L${bw * 0.36},${-h * 0.66} L${bw * 0.44},${-h * 0.12} L${-bw * 0.44},${-h * 0.12} Z`} fill={color} stroke={PAPER.ink} strokeWidth={sw * 0.85} strokeLinejoin="round" />
        <path d={`M${-bw * 0.17},${-h * 0.65} L0,${-h * 0.45} L${bw * 0.17},${-h * 0.65} Z`} fill="#fffaf1" stroke={PAPER.ink} strokeWidth={sw * 0.5} />
        <circle cx={0} cy={-h * 0.78} r={hr} fill="#f6d3b6" stroke={PAPER.ink} strokeWidth={sw * 0.8} />
        <path d={`M${-hr},${-h * 0.8} A${hr},${hr} 0 0 1 ${hr},${-h * 0.8} L${hr * 0.7},${-h * 0.85} A${hr * 0.8},${hr * 0.8} 0 0 0 ${-hr * 0.7},${-h * 0.85} Z`} fill="#3a3550" />
        <line x1={bw * 0.2} y1={-h * 0.62} x2={hand.x} y2={hand.y} stroke={color} strokeWidth={sw * 2.6} strokeLinecap="round" />
        <line x1={hand.x} y1={hand.y} x2={target.x - c.x} y2={target.y - c.y} stroke={PAPER.ink} strokeWidth={sw * 1.1} strokeLinecap="round" />
      </g>
    </g>
  );
};

/** Student desk: a wooden desk with a book on top and a chair tucked behind. */
const Desk: FC<ArtProps> = ({id, g, zz, T, o, sw, color}) => {
  const topZ = zz + g.h * 0.52;
  const top: Geo = {x: g.x, y: g.y, z: topZ, w: g.w * 0.62, d: g.d, h: 0.09};
  const seat: Geo = {x: g.x + g.w * 0.68, y: g.y + g.d * 0.12, z: zz + 0.38, w: g.w * 0.26, d: g.d * 0.76, h: 0.08};
  const back: Geo = {x: g.x + g.w * 0.9, y: g.y + g.d * 0.12, z: zz + 0.38, w: 0.09, d: g.d * 0.76, h: g.h * 0.5};
  const book: Geo = {x: g.x + 0.32, y: g.y + 0.3, z: topZ + 0.09, w: 0.5, d: 0.42, h: 0.06};
  const deskLegs = [[g.x + 0.12, g.y + 0.12], [g.x + top.w - 0.24, g.y + 0.12], [g.x + top.w - 0.24, g.y + g.d - 0.24], [g.x + 0.12, g.y + g.d - 0.24]];
  const chairLegs = [[g.x + g.w * 0.7, g.y + g.d * 0.18], [g.x + g.w * 0.88, g.y + g.d * 0.18], [g.x + g.w * 0.7, g.y + g.d * 0.78], [g.x + g.w * 0.88, g.y + g.d * 0.78]];
  return (
    <g>
      {deskLegs.map(([x, y], k) => <IsoBox key={`d${k}`} id={`${id}-dl${k}`} x={x} y={y} z={zz} w={0.1} d={0.1} h={topZ - zz} color={shade(color, -0.3)} T={T} o={o} sw={sw * 0.7} radius={1} />)}
      <IsoBox id={`${id}-top`} {...top} color={shade('#f4da93', 0.05)} T={T} o={o} sw={sw} radius={T * 0.04} />
      <IsoBox id={`${id}-book`} {...book} color="#9fc4ec" T={T} o={o} sw={sw * 0.7} radius={T * 0.03} />
      {chairLegs.map(([x, y], k) => <IsoBox key={`c${k}`} id={`${id}-cl${k}`} x={x} y={y} z={zz} w={0.09} d={0.09} h={0.38} color={shade(color, -0.35)} T={T} o={o} sw={sw * 0.7} radius={1} />)}
      <IsoBox id={`${id}-seat`} {...seat} color={shade(color, -0.1)} T={T} o={o} sw={sw} radius={T * 0.06} />
      <IsoBox id={`${id}-back`} {...back} color={shade(color, -0.05)} T={T} o={o} sw={sw} radius={T * 0.05} />
    </g>
  );
};

/** Bookshelf: a wooden frame with three shelves of colourful books. */
const Bookshelf: FC<ArtProps> = ({id, g, zz, T, o, sw, color}) => {
  const levels = 3, lh = g.h / levels;
  const palette = ['#9fc4ec', '#f4c178', '#cdc3ee', '#b9e2c7', '#f4a596', '#b8d6f3', '#f4da93'];
  const n = Math.max(4, Math.round((g.w - 0.3) / 0.28));
  const bw = Math.min(0.22, (g.w - 0.36) / n - 0.04);
  return (
    <g>
      <IsoBox id={`${id}-l`} x={g.x} y={g.y} z={zz} w={0.12} d={g.d} h={g.h} color={shade(color, -0.08)} T={T} o={o} sw={sw} radius={T * 0.03} />
      <IsoBox id={`${id}-r`} x={g.x + g.w - 0.12} y={g.y} z={zz} w={0.12} d={g.d} h={g.h} color={shade(color, -0.08)} T={T} o={o} sw={sw} radius={T * 0.03} />
      {Array.from({length: levels + 1}, (_, k) => <IsoBox key={`s${k}`} id={`${id}-s${k}`} x={g.x} y={g.y} z={zz + k * lh} w={g.w} d={g.d} h={0.09} color={shade(color, 0.1)} T={T} o={o} sw={sw * 0.9} radius={T * 0.03} />)}
      {Array.from({length: levels}, (_, k) => Array.from({length: n}, (_, i) => (
        <IsoBox key={`b${k}-${i}`} id={`${id}-b${k}-${i}`} x={g.x + 0.18 + i * ((g.w - 0.36) / n)} y={g.y + 0.12} z={zz + k * lh + 0.09} w={bw} d={g.d - 0.24} h={lh * (0.62 + ((i * 7 + k * 3) % 5) * 0.06)}
          color={palette[(i + k * 2) % palette.length]} T={T} o={o} sw={sw * 0.6} radius={T * 0.02} />
      )))}
    </g>
  );
};

/** Graduation cap: a tilted mortarboard with a skull cap and a dangling tassel. */
const GradCap: FC<ArtProps> = ({id, g, zz, T, o, sw, color}) => {
  const P = (x: number, y: number, z: number) => project(x, y, z, T, o);
  const cx = g.x + g.w / 2, cy = g.y + g.d / 2, s = Math.min(g.w, g.d) * 0.92;
  const top = zz + g.h * 0.82, th = 0.1, capH = g.h * 0.48;
  const corners: [number, number][] = [[cx - s / 2, cy - s / 2], [cx + s / 2, cy - s / 2], [cx + s / 2, cy + s / 2], [cx - s / 2, cy + s / 2]];
  const f = faces(color);
  const t0 = P(cx + s * 0.28, cy - s * 0.28, top + 0.02), t1 = P(cx + s * 0.4, cy + s * 0.16, zz + capH * 0.7);
  return (
    <g>
      <IsoBox id={`${id}-cap`} x={cx - s * 0.3} y={cy - s * 0.3} z={zz} w={s * 0.6} d={s * 0.6} h={capH} color={shade(color, -0.12)} T={T} o={o} sw={sw} radius={T * 0.16} />
      <polygon points={poly([P(corners[3][0], corners[3][1], top), P(corners[2][0], corners[2][1], top), P(corners[2][0], corners[2][1], top - th), P(corners[3][0], corners[3][1], top - th)])} fill={f.left} stroke={PAPER.ink} strokeWidth={sw * 0.7} strokeLinejoin="round" />
      <polygon points={poly([P(corners[1][0], corners[1][1], top), P(corners[2][0], corners[2][1], top), P(corners[2][0], corners[2][1], top - th), P(corners[1][0], corners[1][1], top - th)])} fill={f.right} stroke={PAPER.ink} strokeWidth={sw * 0.7} strokeLinejoin="round" />
      <polygon points={poly(corners.map(([x, y]) => P(x, y, top)))} fill={f.top} stroke={PAPER.ink} strokeWidth={sw} strokeLinejoin="round" />
      <line x1={t0.x} y1={t0.y} x2={t1.x} y2={t1.y} stroke={PAPER.ink} strokeWidth={sw * 1.2} strokeLinecap="round" />
      <circle cx={t1.x} cy={t1.y} r={T * 0.09} fill="#d9b45a" stroke={PAPER.ink} strokeWidth={sw * 0.6} />
      <line x1={t1.x} y1={t1.y + T * 0.07} x2={t1.x - T * 0.04} y2={t1.y + T * 0.2} stroke="#d9b45a" strokeWidth={sw * 1.2} strokeLinecap="round" />
      <line x1={t1.x} y1={t1.y + T * 0.07} x2={t1.x + T * 0.04} y2={t1.y + T * 0.2} stroke="#d9b45a" strokeWidth={sw * 1.2} strokeLinecap="round" />
    </g>
  );
};

/** Backpack: a rounded pack with a front pocket, shoulder straps, a handle and a zipper. */
const Backpack: FC<ArtProps> = (p) => {
  const {id, g, zz, T, o, sw, color} = p;
  const P = (x: number, y: number, z: number) => project(x, y, z, T, o);
  const bx = g.x + 0.12, by = g.y + 0.12, bw = g.w - 0.24, bd = g.d - 0.24, bh = g.h * 0.88, bz = zz + 0.08;
  const pocket: Geo = {x: bx + bw * 0.18, y: by + bd - 0.14, z: bz + bh * 0.2, w: bw * 0.64, d: 0.16, h: bh * 0.38};
  const strap = (u: number) => limb(P(bx + u, by + bd * 0.18, bz + bh), P(bx + u, by + bd * 0.55, bz + 0.14), T * 0.07, shade(color, -0.4), sw);
  const h0 = P(bx + bw * 0.4, by + bd * 0.5, bz + bh), h1 = P(bx + bw * 0.6, by + bd * 0.5, bz + bh + 0.28);
  return (
    <g>
      <IsoBox id={`${id}-body`} x={bx} y={by} z={bz} w={bw} d={bd} h={bh} color={color} T={T} o={o} sw={sw} radius={T * 0.28} />
      <IsoBox id={`${id}-pocket`} {...pocket} color={shade(color, -0.14)} T={T} o={o} sw={sw * 0.8} radius={T * 0.1} />
      <g transform={face('front', pocket, pocket.z, p)}>
        <line x1={0.08} x2={pocket.w - 0.08} y1={0.12} y2={0.12} stroke={PAPER.ink} strokeWidth={line(T, sw, 0.5)} strokeDasharray={`${line(T, sw, 0.5)} ${line(T, sw, 0.5)}`} opacity={0.6} />
      </g>
      {[bw * 0.3, bw * 0.7].map((u, k) => <g key={k}>{strap(u)}</g>)}
      <path d={`M${h0.x},${h0.y} Q${(h0.x + h1.x) / 2},${h1.y + T * 0.2} ${h1.x},${h1.y}`} fill="none" stroke={PAPER.ink} strokeWidth={sw * 1.6} strokeLinecap="round" />
    </g>
  );
};

/** Globe on a stand: a meridian sphere held in a ring above a turned base. */
const StandGlobe: FC<ArtProps> = (p) => {
  const {id, g, zz, T, o, sw, color} = p;
  const standH = g.h * 0.32;
  const sphere: Geo = {...g, w: g.w * 0.92, d: g.d * 0.92, h: g.h - standH};
  const cx = g.x + g.w / 2, cy = g.y + g.d / 2;
  const c = project(cx, cy, zz + standH + sphere.h * 0.55, T, o);
  const r = Math.min(sphere.w, sphere.d) * 0.62 * T;
  return (
    <g>
      <IsoCylinder cx={cx} cy={cy} z={zz} r={Math.min(g.w, g.d) * 0.28} h={0.12} color={shade(color, -0.2)} T={T} o={o} sw={sw} bands={1} />
      <IsoBox id={`${id}-pole`} x={cx - 0.06} y={cy - 0.06} z={zz + 0.12} w={0.12} d={0.12} h={standH - 0.12} color={shade(color, -0.35)} T={T} o={o} sw={sw * 0.8} radius={1} />
      <Globe {...p} g={sphere} zz={zz + standH} />
      <ellipse cx={c.x} cy={c.y} rx={r * 1.05} ry={r * 0.34} fill="none" stroke={PAPER.ink} strokeWidth={sw * 1.2} transform={`rotate(-28 ${c.x} ${c.y})`} />
    </g>
  );
};

/** Certificate: a rolled parchment with text lines and a wax seal. */
const Certificate: FC<ArtProps> = ({g, zz, T, o, sw}) => {
  const c = project(g.x + g.w / 2, g.y + g.d / 2, zz + g.h * 0.55, T, o);
  const w = g.w * T * 0.86, h = g.h * T * 0.78, curl = Math.min(T * 0.16, w * 0.1);
  const sheet = `M${-w / 2 + curl},${-h / 2} Q${-w / 2},${-h / 2} ${-w / 2},${-h / 2 + curl} L${-w / 2},${h / 2 - curl} Q${-w / 2},${h / 2} ${-w / 2 + curl},${h / 2} L${w / 2 - curl},${h / 2} Q${w / 2},${h / 2} ${w / 2},${h / 2 - curl} L${w / 2},${-h / 2 + curl} Q${w / 2},${-h / 2} ${w / 2 - curl},${-h / 2} Z`;
  const sealR = Math.min(w * 0.12, h * 0.16);
  return (
    <g transform={`translate(${c.x} ${c.y})`}>
      <ellipse cx={0} cy={h / 2 + sw * 3} rx={w * 0.42} ry={sw * 2.5} fill={PAPER.shadow} />
      <path d={sheet} fill="#fff3d6" stroke={PAPER.ink} strokeWidth={sw * 0.9} strokeLinejoin="round" />
      {[-1, 1].map((side) => <g key={side}>
        <ellipse cx={side * w / 2} cy={0} rx={curl * 0.85} ry={h * 0.45} fill="#f0dcc0" stroke={PAPER.ink} strokeWidth={sw * 0.8} />
        <path d={`M${side * (w / 2 - curl * 0.3)},${-h * 0.3} q${side * curl * 0.55},${h * 0.15} 0,${h * 0.6}`} fill="none" stroke="#d9c39c" strokeWidth={sw * 0.6} />
      </g>)}
      <rect x={-w * 0.26} y={-h * 0.34} width={w * 0.52} height={Math.max(sw * 2, h * 0.06)} rx={sw} fill={INK_LINE} />
      {[0, 1, 2, 3].map((k) => <line key={k} x1={-w * 0.34} x2={w * (k % 2 ? 0.18 : 0.34)} y1={-h * 0.14 + k * h * 0.12} y2={-h * 0.14 + k * h * 0.12} stroke={INK_LINE} strokeWidth={sw * 0.7} opacity={0.6} />)}
      <circle cx={w * 0.28} cy={h * 0.27} r={sealR} fill={PAPER.bad} stroke={PAPER.ink} strokeWidth={sw * 0.6} />
      <circle cx={w * 0.28} cy={h * 0.27} r={sealR * 0.5} fill="none" stroke="#fffaf1" strokeWidth={sw * 0.7} />
    </g>
  );
};

/** Pencil and notebook: a lined, spiral-bound pad with a pencil lying diagonally across it. */
const Notebook: FC<ArtProps> = (p) => {
  const {g, zz, T, o, sw} = p;
  const P = (x: number, y: number, z: number) => project(x, y, z, T, o);
  const book: Geo = {x: g.x, y: g.y, z: zz, w: g.w * 0.7, d: g.d, h: 0.14};
  const a = P(g.x + g.w * 0.08, g.y + g.d * 0.8, zz + 0.2), b = P(g.x + g.w * 0.66, g.y + g.d * 0.18, zz + 0.2);
  const dx = a.x - b.x, dy = a.y - b.y, L = Math.hypot(dx, dy) || 1;
  const tip = {x: a.x + (dx / L) * T * 0.14, y: a.y + (dy / L) * T * 0.14};
  const tl = {x: a.x - (dy / L) * T * 0.05, y: a.y + (dx / L) * T * 0.05};
  const tr = {x: a.x + (dy / L) * T * 0.05, y: a.y - (dx / L) * T * 0.05};
  return (
    <g>
      <Decorated {...p} g={book} radius={T * 0.05} top={<>
        <rect x={0.12} y={0.1} width={book.w - 0.24} height={book.d - 0.2} rx={0.04} fill={PAPER.card} stroke={PAPER.ink} strokeWidth={line(T, sw, 0.5)} />
        {[0, 1, 2, 3, 4].map((k) => <line key={k} x1={0.24} x2={book.w - 0.2} y1={0.28 + k * ((book.d - 0.5) / 5)} y2={0.28 + k * ((book.d - 0.5) / 5)} stroke="#9fc4ec" strokeWidth={line(T, sw, 0.45)} />)}
        <line x1={0.34} x2={0.34} y1={0.14} y2={book.d - 0.14} stroke={PAPER.bad} strokeWidth={line(T, sw, 0.45)} opacity={0.7} />
        {[0, 1, 2, 3].map((k) => <circle key={k} cx={0.16} cy={0.3 + k * ((book.d - 0.6) / 4)} r={0.06} fill="none" stroke={PAPER.ink} strokeWidth={line(T, sw, 0.4)} />)}
      </>} />
      {limb(a, b, T * 0.085, '#f4c178', sw)}
      <polygon points={poly([tip, tl, tr])} fill="#e8d3a6" stroke={PAPER.ink} strokeWidth={sw * 0.6} strokeLinejoin="round" />
      <circle cx={tip.x} cy={tip.y} r={sw * 0.9} fill="#3a3550" />
      <circle cx={b.x} cy={b.y} r={T * 0.055} fill="#f3b9c6" stroke={PAPER.ink} strokeWidth={sw * 0.5} />
    </g>
  );
};

/* --------------------------------------------------------------------------- finance objects */

/** Bank: a classical temple front - steps, a wall with a door behind a row of columns, a frieze with
 *  the name band, and a gable roof whose triangular pediment faces the viewer. */
const Bank: FC<ArtProps> = (p) => {
  const {id, g, zz, T, o, sw, color} = p;
  const P = (x: number, y: number, z: number) => project(x, y, z, T, o);
  const stone = shade(color, 0.12), f = faces(stone);
  const baseH = 0.3, friezeH = 0.32, roofH = Math.min(0.85, g.w * 0.22);
  const colH = Math.max(0.8, g.h - baseH - friezeH - roofH);
  const colZ = zz + baseH, top = colZ + colH + friezeH;
  const porch = 0.55; // columns stand this far in front of the wall
  const wall: Geo = {x: g.x + 0.25, y: g.y + 0.1, z: 0, w: g.w - 0.5, d: g.d - porch - 0.1, h: colH};
  const n = Math.max(4, Math.round(g.w / 0.6));
  const colY = g.y + g.d - porch / 2;
  const frieze: Geo = {x: g.x, y: g.y, z: 0, w: g.w, d: g.d, h: friezeH};
  // gable roof, ridge running front-to-back (along y): pediment triangle on the front face
  const L = g.x, R = g.x + g.w, M = g.x + g.w / 2, B = g.y, F = g.y + g.d;
  const ped = [P(L, F, top), P(R, F, top), P(M, F, top + roofH)];
  const leftSlope = [P(L, B, top), P(M, B, top + roofH), P(M, F, top + roofH), P(L, F, top)];
  const rightSlope = [P(M, B, top + roofH), P(R, B, top), P(R, F, top), P(M, F, top + roofH)];
  const em = P(M, F, top + roofH * 0.38);
  const doorW = Math.min(0.7, wall.w * 0.22);
  return (
    <g>
      <IsoShadow x={g.x} y={g.y} w={g.w} d={g.d} opacity={0.8} T={T} o={o} sw={sw} />
      {[0, 1, 2].map((k) => <IsoBox key={k} id={`${id}-step${k}`} x={g.x - 0.12 + k * 0.06} y={g.y - 0.06 + k * 0.03} z={zz + k * 0.1} w={g.w + 0.24 - k * 0.12} d={g.d + 0.12 - k * 0.06 - (k === 2 ? 0 : 0)} h={0.1}
        color={shade(color, -0.04 * (2 - k))} T={T} o={o} sw={sw * 0.8} radius={T * 0.02} />)}
      <Decorated {...p} id={`${id}-wall`} g={wall} zz={colZ} color={shade(color, -0.06)} radius={T * 0.02} front={<>
        <rect x={wall.w / 2 - doorW / 2} y={wall.h * 0.32} width={doorW} height={wall.h * 0.68} rx={0.04} fill={shade('#8a6a45', 0)} stroke={PAPER.ink} strokeWidth={line(T, sw, 0.5)} />
        <line x1={wall.w / 2} x2={wall.w / 2} y1={wall.h * 0.32} y2={wall.h} stroke={PAPER.ink} strokeWidth={line(T, sw, 0.4)} />
        {[0.18, wall.w - 0.18 - 0.36].map((x) => <rect key={x} x={x} y={wall.h * 0.3} width={0.36} height={wall.h * 0.42} rx={0.04} fill="#9fc4ec" stroke={PAPER.ink} strokeWidth={line(T, sw, 0.4)} />)}
      </>} />
      {Array.from({length: n}, (_, k) => <IsoCylinder key={k} cx={g.x + 0.3 + k * ((g.w - 0.6) / (n - 1))} cy={colY} z={colZ} r={0.14} h={colH} color={stone} T={T} o={o} sw={sw * 0.9} bands={0} />)}
      <Decorated {...p} id={`${id}-frieze`} g={frieze} zz={colZ + colH} color={stone} radius={T * 0.02} front={<>
        <rect x={g.w / 2 - 0.75} y={0.09} width={1.5} height={friezeH - 0.18} rx={0.03} fill={shade(stone, -0.2)} />
        <rect x={g.w / 2 - 0.5} y={friezeH / 2 - 0.035} width={1} height={0.07} rx={0.03} fill={PAPER.ink} opacity={0.8} />
      </>} />
      <polygon points={poly(leftSlope)} fill={f.top} stroke={PAPER.ink} strokeWidth={sw} strokeLinejoin="round" />
      <polygon points={poly(rightSlope)} fill={f.right} stroke={PAPER.ink} strokeWidth={sw} strokeLinejoin="round" />
      <polygon points={poly(ped)} fill={f.left} stroke={PAPER.ink} strokeWidth={sw * 1.1} strokeLinejoin="round" />
      <circle cx={em.x} cy={em.y} r={T * 0.16} fill="#e3b75c" stroke={PAPER.ink} strokeWidth={sw * 0.7} />
      <text x={em.x} y={em.y + T * 0.06} textAnchor="middle" fontSize={T * 0.2} fontWeight={800} fill={PAPER.ink} fontFamily={PAPER.sans}>$</text>
    </g>
  );
};

/** Coin stack: a tall stack of ridged gold coins with a couple of loose ones beside it. */
const CoinStack: FC<ArtProps> = ({g, zz, T, o, sw}) => {
  const cx = g.x + g.w / 2, cy = g.y + g.d / 2, r = Math.min(g.w, g.d) * 0.4;
  const n = Math.max(4, Math.round(g.h / 0.24)), ch = g.h / n;
  const top = project(cx, cy, zz + g.h, T, o);
  return (
    <g>
      {Array.from({length: n}, (_, k) => <IsoCylinder key={k} cx={cx + (k % 2 ? 0.02 : 0)} cy={cy} z={zz + k * ch} r={r * (1 - k * 0.008)} h={ch} color={k % 2 ? '#e8c46f' : '#d9b45a'} T={T} o={o} sw={sw} bands={1} />)}
      <circle cx={top.x} cy={top.y} r={r * C30 * T * 0.42} fill="none" stroke="#a97f32" strokeWidth={sw * 0.7} />
      <IsoCylinder cx={g.x + 0.3} cy={g.y + g.d * 0.78} z={zz} r={r * 0.55} h={0.07} color="#e8c46f" T={T} o={o} sw={sw * 0.8} bands={1} />
      <IsoCylinder cx={g.x + g.w - 0.28} cy={g.y + g.d * 0.74} z={zz} r={r * 0.5} h={0.07} color="#d9b45a" T={T} o={o} sw={sw * 0.8} bands={1} />
    </g>
  );
};

/** Wallet: a folded leather wallet with a flap, a snap, stitching and a card peeking out. */
const Wallet: FC<ArtProps> = (p) => {
  const {id, g, zz, T, o, sw, color} = p;
  const body: Geo = {x: g.x, y: g.y, z: zz, w: g.w, d: g.d, h: g.h * 0.62};
  const flap: Geo = {x: g.x + 0.08, y: g.y + g.d - 0.2, z: zz + 0.14, w: g.w - 0.16, d: 0.2, h: g.h * 0.38};
  return (
    <g>
      <IsoBox id={`${id}-card`} x={g.x + g.w * 0.2} y={g.y + 0.16} z={zz + body.h} w={g.w * 0.5} d={g.d * 0.6} h={0.05} color="#b8d6f3" T={T} o={o} sw={sw * 0.7} radius={T * 0.04} />
      <IsoBox id={`${id}-body`} {...body} color={shade(color, -0.06)} T={T} o={o} sw={sw} radius={T * 0.14} />
      <IsoBox id={`${id}-flap`} {...flap} color={shade(color, 0.1)} T={T} o={o} sw={sw * 0.8} radius={T * 0.09} />
      <g transform={face('front', flap, flap.z, p)}>
        <circle cx={flap.w / 2} cy={flap.h * 0.52} r={Math.min(0.1, flap.h * 0.18)} fill="#d9b45a" stroke={PAPER.ink} strokeWidth={line(T, sw, 0.4)} />
      </g>
      <g transform={face('top', body, zz, p)}>
        <rect x={0.12} y={0.12} width={body.w - 0.24} height={body.d - 0.24} rx={0.08} fill="none" stroke={shade(color, -0.45)} strokeWidth={line(T, sw, 0.4)} strokeDasharray={`${line(T, sw, 0.4)} ${line(T, sw, 0.4)}`} />
      </g>
    </g>
  );
};

/** Credit card: a flat card with an EMV chip, contactless waves and two overlapping brand circles. */
const CreditCard: FC<ArtProps> = (p) => {
  const {T, sw, color, g, zz} = p;
  const card: Geo = {x: g.x, y: g.y, z: zz, w: g.w, d: g.d, h: 0.06};
  return (
    <Decorated {...p} g={card} radius={T * 0.12} top={<>
      <rect x={0.08} y={0.08} width={card.w - 0.16} height={card.d - 0.16} rx={0.1} fill={shade(color, 0.3)} stroke={shade(color, -0.2)} strokeWidth={line(T, sw, 0.5)} />
      <rect x={0.24} y={0.24} width={Math.min(0.5, card.w * 0.22)} height={Math.min(0.38, card.d * 0.3)} rx={0.05} fill="#d9b45a" stroke={PAPER.ink} strokeWidth={line(T, sw, 0.4)} />
      {[0, 1].map((k) => <line key={k} x1={0.28} x2={0.28 + Math.min(0.5, card.w * 0.22) - 0.08} y1={0.34 + k * 0.12} y2={0.34 + k * 0.12} stroke="#a97f32" strokeWidth={line(T, sw, 0.3)} />)}
      <rect x={0.26} y={card.d * 0.62} width={card.w * 0.42} height={0.08} rx={0.04} fill={PAPER.ink} opacity={0.55} />
      <circle cx={card.w - 0.32} cy={card.d - 0.3} r={Math.min(0.2, card.d * 0.18)} fill="#e5604f" opacity={0.9} />
      <circle cx={card.w - 0.5} cy={card.d - 0.3} r={Math.min(0.2, card.d * 0.18)} fill="#f4c178" opacity={0.9} />
    </>} />
  );
};

/** ATM: a tall cash machine with a screen, keypad, card slot and dispenser on its front face. */
const Atm: FC<ArtProps> = (p) => {
  const {T, sw, color, g, zz} = p;
  const body: Geo = {x: g.x, y: g.y + g.d * 0.28, z: 0, w: g.w, d: g.d * 0.72, h: g.h};
  return (
    <g>
      <IsoBox id={`${p.id}-base`} x={g.x + 0.1} y={g.y + g.d * 0.36} z={zz} w={g.w - 0.2} d={g.d * 0.56} h={0.12} color={shade(color, -0.2)} T={T} o={p.o} sw={sw} radius={T * 0.03} />
      <Decorated {...p} g={body} zz={zz + 0.12} radius={T * 0.06} front={<>
        <rect x={0.1} y={0.1} width={body.w - 0.2} height={body.h * 0.24} rx={0.04} fill={shade(color, -0.5)} stroke={PAPER.ink} strokeWidth={line(T, sw, 0.5)} />
        <rect x={0.18} y={0.18} width={(body.w - 0.36) * 0.8} height={body.h * 0.1} rx={0.03} fill={SCREEN} />
        <rect x={0.18} y={0.18 + body.h * 0.13} width={(body.w - 0.36) * 0.55} height={0.06} rx={0.03} fill="#9fc4ec" opacity={0.7} />
        {Array.from({length: 3}, (_, r) => Array.from({length: 3}, (_, c) => <rect key={`${r}${c}`} x={0.24 + c * ((body.w - 0.48) / 3)} y={body.h * 0.42 + r * 0.16} width={(body.w - 0.48) / 3 - 0.08} height={0.11} rx={0.03} fill={shade(color, -0.25)} stroke={PAPER.ink} strokeWidth={line(T, sw, 0.35)} />))}
        <rect x={0.24} y={body.h * 0.84} width={(body.w - 0.48) * 0.55} height={0.09} rx={0.04} fill={PAPER.ink} opacity={0.75} />
        <rect x={0.24} y={body.h * 0.91} width={(body.w - 0.48) * 0.75} height={0.12} rx={0.03} fill={shade(color, -0.45)} stroke={PAPER.ink} strokeWidth={line(T, sw, 0.4)} />
      </>} />
    </g>
  );
};

/** Safe: a heavy vault with a round door, a radial handle, a dial and side hinges. */
const Safe: FC<ArtProps> = (p) => {
  const {T, sw, color, g, zz} = p;
  const body: Geo = {x: g.x, y: g.y, z: zz, w: g.w, d: g.d, h: g.h};
  const r = Math.min(body.w, body.h) * 0.32, cx = body.w / 2, cy = body.h / 2;
  return (
    <Decorated {...p} g={body} radius={T * 0.05} front={<>
      <circle cx={cx} cy={cy} r={r} fill={shade(color, 0.16)} stroke={PAPER.ink} strokeWidth={line(T, sw, 0.7)} />
      <circle cx={cx} cy={cy} r={r * 0.78} fill="none" stroke={shade(color, -0.4)} strokeWidth={line(T, sw, 0.5)} />
      {[0, 1, 2, 3, 4, 5, 6, 7].map((k) => {
        const a = (k * Math.PI) / 4;
        return <line key={k} x1={cx + Math.cos(a) * r * 0.2} y1={cy + Math.sin(a) * r * 0.2} x2={cx + Math.cos(a) * r * 0.72} y2={cy + Math.sin(a) * r * 0.72} stroke={shade(color, -0.45)} strokeWidth={line(T, sw, 0.85)} strokeLinecap="round" />;
      })}
      <circle cx={cx} cy={cy} r={r * 0.19} fill="#d9b45a" stroke={PAPER.ink} strokeWidth={line(T, sw, 0.4)} />
      <rect x={cx + r * 0.62} y={cy - r * 0.28} width={0.11} height={r * 0.56} rx={0.05} fill={shade(color, -0.35)} stroke={PAPER.ink} strokeWidth={line(T, sw, 0.4)} />
    </>} side={<>
      {[0.3, 0.7].map((v) => <rect key={v} x={body.d - 0.12} y={body.h * v} width={0.14} height={0.16} rx={0.03} fill={shade(color, -0.4)} stroke={PAPER.ink} strokeWidth={line(T, sw, 0.4)} />)}
    </>} />
  );
};

/** Piggy bank: a rounded pig with a snout, ears, legs, a coin slot and a curled tail. */
const PiggyBank: FC<ArtProps> = ({g, zz, T, o, sw, color}) => {
  const c = project(g.x + g.w / 2, g.y + g.d / 2, zz + g.h * 0.5, T, o);
  const s = Math.min(g.w, g.d) * T * 0.46;
  return (
    <g transform={`translate(${c.x} ${c.y})`}>
      <ellipse cx={0} cy={s * 0.85} rx={s * 1.05} ry={s * 0.2} fill={PAPER.shadow} />
      <path d={`M${-s * 0.95},${s * 0.12} q${-s * 0.45},${-s * 0.1} ${-s * 0.42},${s * 0.25} q${s * 0.28},${s * 0.05} ${s * 0.42},${-s * 0.12}`} fill="none" stroke={PAPER.ink} strokeWidth={sw * 1.2} strokeLinecap="round" />
      <rect x={-s * 0.68} y={s * 0.55} width={s * 0.28} height={s * 0.4} rx={s * 0.1} fill={shade(color, -0.2)} stroke={PAPER.ink} strokeWidth={sw * 0.7} />
      <rect x={s * 0.42} y={s * 0.55} width={s * 0.28} height={s * 0.4} rx={s * 0.1} fill={shade(color, -0.2)} stroke={PAPER.ink} strokeWidth={sw * 0.7} />
      <path d={`M${s * 0.3},${-s * 0.62} L${s * 0.5},${-s * 1.05} L${s * 0.72},${-s * 0.5} Z`} fill={shade(color, -0.12)} stroke={PAPER.ink} strokeWidth={sw * 0.7} strokeLinejoin="round" />
      <ellipse cx={-s * 0.05} cy={0} rx={s * 1.12} ry={s * 0.82} fill={shade(color, 0.12)} stroke={PAPER.ink} strokeWidth={sw} />
      <ellipse cx={s * 1.02} cy={s * 0.12} rx={s * 0.3} ry={s * 0.25} fill={shade(color, 0.32)} stroke={PAPER.ink} strokeWidth={sw * 0.7} />
      <circle cx={s * 1.05} cy={s * 0.06} r={s * 0.045} fill={PAPER.ink} />
      <circle cx={s * 1.18} cy={s * 0.18} r={s * 0.045} fill={PAPER.ink} />
      <circle cx={s * 0.45} cy={-s * 0.28} r={s * 0.075} fill={PAPER.ink} />
      <rect x={-s * 0.34} y={-s * 0.78} width={s * 0.66} height={s * 0.12} rx={s * 0.06} fill={shade(color, -0.55)} stroke={PAPER.ink} strokeWidth={sw * 0.5} />
    </g>
  );
};

/** Cash bundle: a stack of banknotes with a paper band and a denomination medallion. */
const CashBundle: FC<ArtProps> = (p) => {
  const {T, sw, color, g, zz} = p;
  const stack: Geo = {x: g.x, y: g.y, z: zz, w: g.w, d: g.d, h: g.h};
  return (
    <Decorated {...p} g={stack} radius={T * 0.03} top={<>
      <rect x={0.1} y={0.1} width={stack.w - 0.2} height={stack.d - 0.2} rx={0.05} fill={shade(color, 0.35)} stroke={shade(color, -0.3)} strokeWidth={line(T, sw, 0.5)} />
      <rect x={0.2} y={0.2} width={stack.w - 0.4} height={stack.d - 0.4} rx={0.03} fill="none" stroke={shade(color, -0.25)} strokeWidth={line(T, sw, 0.4)} />
      <circle cx={stack.w / 2} cy={stack.d / 2} r={Math.min(0.26, stack.d * 0.24)} fill={shade(color, -0.1)} stroke={shade(color, -0.35)} strokeWidth={line(T, sw, 0.4)} />
    </>} front={<>
      <rect x={0} y={stack.h * 0.32} width={stack.w} height={stack.h * 0.34} fill="#f2e9da" stroke={PAPER.ink} strokeWidth={line(T, sw, 0.5)} opacity={0.95} />
    </>} side={<>
      <rect x={0} y={stack.h * 0.32} width={stack.d} height={stack.h * 0.34} fill="#f2e9da" stroke={PAPER.ink} strokeWidth={line(T, sw, 0.5)} opacity={0.95} />
    </>} />
  );
};

/** Stock chart board: a presentation board with grid, rising bars and an upward trend line. */
const StockChart: FC<ArtProps> = (p) => {
  const {T, sw, color, g, zz} = p;
  const board: Geo = {x: g.x, y: g.y + g.d * 0.35, z: 0, w: g.w, d: 0.2, h: g.h * 0.9};
  const boardZ = zz + 0.3;
  const w = board.w, h = board.h;
  const trend = Array.from({length: 8}, (_, k) => {
    const fx = 0.18 + k * ((w - 0.36) / 7);
    const fy = h * (0.72 - k * 0.07 + (k % 2 ? 0.05 : -0.03));
    return `${fx.toFixed(2)},${fy.toFixed(2)}`;
  }).join(' ');
  return (
    <g>
      {[board.x + 0.2, board.x + board.w - 0.34].map((x) => <IsoBox key={x} id={`${p.id}-leg${x}`} x={x} y={board.y + 0.03} z={zz} w={0.12} d={0.12} h={0.3} color={shade(color, -0.3)} T={T} o={p.o} sw={sw * 0.8} radius={1} />)}
      <Decorated {...p} g={board} zz={boardZ} radius={T * 0.05} front={<>
        <rect x={0.05} y={0.05} width={w - 0.1} height={h - 0.1} rx={0.04} fill={PAPER.card} stroke={PAPER.ink} strokeWidth={line(T, sw, 0.5)} />
        {[0, 1, 2, 3].map((k) => <line key={`h${k}`} x1={0.12} x2={w - 0.12} y1={0.14 + k * ((h - 0.28) / 4)} y2={0.14 + k * ((h - 0.28) / 4)} stroke="#d8cfc0" strokeWidth={line(T, sw, 0.3)} />)}
        {Array.from({length: 8}, (_, k) => <rect key={`b${k}`} x={0.18 + k * ((w - 0.36) / 8)} y={h - 0.18 - h * (0.1 + k * 0.055)} width={(w - 0.36) / 8 - 0.08} height={h * (0.1 + k * 0.055)} rx={0.02} fill={shade('#b9e2c7', -0.05)} stroke={PAPER.ink} strokeWidth={line(T, sw, 0.35)} />)}
        <polyline points={trend} fill="none" stroke={PAPER.bad} strokeWidth={line(T, sw, 0.95)} strokeLinejoin="round" strokeLinecap="round" />
        <circle cx={w - 0.18} cy={h * (0.72 - 7 * 0.07 + 0.05)} r={0.07} fill={PAPER.bad} stroke={PAPER.ink} strokeWidth={line(T, sw, 0.35)} />
      </>} />
    </g>
  );
};

/** Calculator: a flat device with an LCD readout and a grid of rounded keys. */
const Calculator: FC<ArtProps> = (p) => {
  const {T, sw, color, g, zz} = p;
  const calc: Geo = {x: g.x, y: g.y, z: zz, w: g.w, d: g.d, h: 0.12};
  return (
    <Decorated {...p} g={calc} radius={T * 0.08} top={<>
      <rect x={0.1} y={0.1} width={calc.w - 0.2} height={calc.d - 0.2} rx={0.06} fill={shade(color, 0.2)} stroke={shade(color, -0.3)} strokeWidth={line(T, sw, 0.5)} />
      <rect x={0.18} y={0.16} width={calc.w - 0.36} height={calc.d * 0.22} rx={0.03} fill={SCREEN} stroke={PAPER.ink} strokeWidth={line(T, sw, 0.45)} />
      <rect x={calc.w - 0.42} y={calc.d * 0.2} width={calc.w * 0.16} height={calc.d * 0.12} rx={0.02} fill={LED} />
      {Array.from({length: 4}, (_, r) => Array.from({length: 4}, (_, c) => <rect key={`${r}${c}`} x={0.2 + c * ((calc.w - 0.4) / 4)} y={calc.d * 0.46 + r * (calc.d * 0.12)} width={(calc.w - 0.4) / 4 - 0.08} height={calc.d * 0.09} rx={0.03} fill={r === 0 ? shade(color, -0.2) : PAPER.card} stroke={PAPER.ink} strokeWidth={line(T, sw, 0.35)} />))}
    </>} />
  );
};

/** Receipt: a narrow paper slip with a header, item lines, a total and a barcode. */
const Receipt: FC<ArtProps> = ({g, zz, T, o, sw}) => {
  const c = project(g.x + g.w / 2, g.y + g.d / 2, zz + g.h * 0.5, T, o);
  const w = g.w * T * 0.72, h = g.h * T * 0.86, teeth = Math.min(T * 0.09, w * 0.08);
  const bottom = Array.from({length: 9}, (_, k) => ({x: -w / 2 + (k * w) / 8, y: h / 2 + (k % 2 ? teeth : 0)}));
  const sheet = `M${-w / 2},${-h / 2} L${w / 2},${-h / 2} L${w / 2},${h / 2} ` + [...bottom].reverse().map((p) => `L${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ') + ' Z';
  return (
    <g transform={`translate(${c.x} ${c.y})`}>
      <path d={sheet} fill={PAPER.card} stroke={PAPER.ink} strokeWidth={sw * 0.9} strokeLinejoin="round" />
      <rect x={-w * 0.3} y={-h * 0.4} width={w * 0.6} height={Math.max(sw * 2, h * 0.05)} rx={sw} fill={INK_LINE} />
      {[0, 1, 2, 3].map((k) => <g key={k}>
        <line x1={-w * 0.34} x2={w * (k % 2 ? 0.02 : 0.16)} y1={-h * 0.24 + k * h * 0.11} y2={-h * 0.24 + k * h * 0.11} stroke={INK_LINE} strokeWidth={sw * 0.7} opacity={0.65} />
        <line x1={w * 0.3} x2={w * 0.36} y1={-h * 0.24 + k * h * 0.11} y2={-h * 0.24 + k * h * 0.11} stroke={INK_LINE} strokeWidth={sw * 0.7} opacity={0.65} />
      </g>)}
      <line x1={-w * 0.36} x2={w * 0.36} y1={h * 0.16} y2={h * 0.16} stroke={INK_LINE} strokeWidth={sw * 0.6} strokeDasharray={`${sw * 2} ${sw * 1.5}`} />
      <rect x={-w * 0.34} y={h * 0.22} width={w * 0.42} height={Math.max(sw * 2, h * 0.05)} rx={sw} fill={PAPER.ink} />
      <rect x={w * 0.16} y={h * 0.22} width={w * 0.2} height={Math.max(sw * 2, h * 0.05)} rx={sw} fill={PAPER.bad} />
      {Array.from({length: 14}, (_, k) => <line key={`bc${k}`} x1={-w * 0.34 + k * (w * 0.68 / 14)} x2={-w * 0.34 + k * (w * 0.68 / 14)} y1={h * 0.34} y2={h * 0.44} stroke={PAPER.ink} strokeWidth={k % 3 === 0 ? sw * 1.4 : sw * 0.7} />)}
    </g>
  );
};

/* --------------------------------------------------------------- retail & business objects */

/** Shop: a storefront with a window, a door and a striped awning projecting over the pavement. */
const Shop: FC<ArtProps> = (p) => {
  const {id, g, zz, T, o, sw, color} = p;
  const P = (x: number, y: number, z: number) => project(x, y, z, T, o);
  const az = zz + g.h * 0.62, backY = g.y + g.d, frontY = g.y + g.d + 0.55;
  const stripes = Math.max(6, Math.round(g.w / 0.4)), step = g.w / stripes;
  return (
    <g>
      <Decorated {...p} radius={T * 0.04} front={<>
        <rect x={0.14} y={g.h * 0.43} width={g.w * 0.58} height={g.h * 0.45} rx={0.03} fill={SCREEN} stroke={PAPER.ink} strokeWidth={line(T, sw, 0.5)} />
        <rect x={g.w * 0.72} y={g.h * 0.42} width={g.w * 0.22} height={g.h * 0.56} rx={0.03} fill={SCREEN} stroke={PAPER.ink} strokeWidth={line(T, sw, 0.5)} />
        <line x1={g.w * 0.76} x2={g.w * 0.76} y1={g.h * 0.7} y2={g.h * 0.78} stroke="#f4da93" strokeWidth={line(T,sw,0.8)} />
        {[0,1,2,3].map(k => <rect key={k} x={0.27+k*g.w*0.12} y={g.h*0.7-k%2*0.08} width={g.w*0.08} height={g.h*0.14+k%2*0.08} fill={['#f4a596','#f4da93','#b9e2c7','#b8d6f3'][k]} />)}
        <rect x={g.w * 0.22} y={g.h * 0.1} width={g.w * 0.56} height={g.h * 0.16} rx={0.05} fill={SCREEN} />
        <text x={g.w * 0.5} y={g.h * 0.215} textAnchor="middle" fontSize={g.h * 0.1} fontFamily={PAPER.sans} fontWeight={700} fill={PAPER.card}>SHOP</text>
      </>} side={<>
        <rect x={g.d * 0.14} y={g.h * 0.46} width={g.d * 0.72} height={g.h * 0.4} rx={0.03} fill={SCREEN} />
        <line x1={g.d * 0.5} x2={g.d * 0.5} y1={g.h * 0.46} y2={g.h * 0.86} stroke={color} strokeWidth={line(T,sw,1.4)} />
      </>} />
      {Array.from({length: stripes}, (_, k) => {
        const x = g.x + k * step;
        return <polygon key={k} points={poly([P(x, backY, az), P(x + step, backY, az), P(x + step, frontY, az - 0.16), P(x, frontY, az - 0.16)])}
          fill={k % 2 ? '#fffaf1' : '#e5604f'} stroke={PAPER.ink} strokeWidth={sw * 0.5} strokeLinejoin="round" />;
      })}
      <IsoBox id={`${id}-sign`} x={g.x + g.w * 0.3} y={g.y + 0.1} z={zz + g.h} w={g.w * 0.4} d={0.16} h={0.38} color="#f4da93" T={T} o={o} sw={sw * 0.8} radius={T * 0.05} />
    </g>
  );
};

/** Shopping cart: an open wire basket with a mesh front, a handle and four castors. */
const ShoppingCart: FC<ArtProps> = ({g, zz, T, o, sw, color}) => {
  const P = (x: number, y: number, z: number) => project(x, y, z, T, o);
  const x0 = g.x + 0.12, x1 = g.x + g.w - 0.12, yf = g.y + g.d - 0.1, yb = g.y + 0.15;
  const zb = zz + 0.4, zt = zz + g.h * 0.9;
  const front = poly([P(x0, yf, zb), P(x1, yf, zb), P(x1, yf, zt), P(x0, yf, zt)]);
  const back = poly([P(x0, yb, zb), P(x1, yb, zb), P(x1, yb, zt), P(x0, yb, zt)]);
  const wheels = [[x0 + 0.1, yb], [x1 - 0.1, yb], [x0 + 0.1, yf], [x1 - 0.1, yf]].map(([x, y]) => P(x, y, zz));
  return (
    <g>
      <polygon points={back} fill={shade(color, 0.3)} opacity={0.3} stroke={PAPER.ink} strokeWidth={sw * 0.7} />
      <polygon points={front} fill={shade(color, 0.2)} opacity={0.3} stroke={PAPER.ink} strokeWidth={sw * 0.7} />
      {[1, 2, 3, 4].map((k) => { const x = x0 + k * ((x1 - x0) / 5), a = P(x, yf, zb), b = P(x, yf, zt); return <line key={`v${k}`} x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke={PAPER.ink} strokeWidth={sw * 0.6} />; })}
      {[1, 2, 3].map((k) => { const z = zb + k * ((zt - zb) / 4), a = P(x0, yf, z), b = P(x1, yf, z); return <line key={`h${k}`} x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke={PAPER.ink} strokeWidth={sw * 0.6} />; })}
      <polygon points={poly([P(x0,yb,zt),P(x1,yb,zt),P(x1,yf,zt),P(x0,yf,zt)])} fill="none" stroke={PAPER.ink} strokeWidth={sw} strokeLinejoin="round" />
      <polyline points={poly([P(x0,yb,zt),P(x0,yb,zz+0.16),P(x1,yb,zz+0.16),P(x1,yf,zz+0.16),P(x0,yf,zz+0.16),P(x0,yf,zt)])} fill="none" stroke={PAPER.ink} strokeWidth={sw*0.9} strokeLinejoin="round" />
      <polyline points={poly([P(x0,yb,zt),P(x0-0.2,yb,zt+0.18),P(x0-0.2,yf,zt+0.18),P(x0,yf,zt)])} fill="none" stroke={SCREEN} strokeWidth={sw*1.5} strokeLinejoin="round" />
      {wheels.map((w, i) => <circle key={i} cx={w.x} cy={w.y} r={sw * 2.6} fill="#3a3550" stroke={PAPER.ink} strokeWidth={sw * 0.5} />)}
    </g>
  );
};

/** Conveyor: a roller belt on legs carrying a taped cardboard parcel. */
const Conveyor: FC<ArtProps> = ({id, g, zz, T, o, sw, color}) => {
  const belt: Geo = {x: g.x, y: g.y + g.d * 0.2, z: zz + 0.45, w: g.w, d: g.d * 0.6, h: 0.12};
  const box: Geo = {x: g.x + g.w * 0.32, y: g.y + g.d * 0.3, z: belt.z + belt.h, w: g.w * 0.3, d: g.d * 0.4, h: Math.max(0.3, g.h * 0.45)};
  const legs = [[g.x + 0.2, g.y + g.d * 0.3], [g.x + g.w - 0.4, g.y + g.d * 0.3], [g.x + g.w - 0.4, g.y + g.d * 0.75], [g.x + 0.2, g.y + g.d * 0.75]];
  const rollers = Math.max(4, Math.round(belt.w / 0.4));
  return (
    <g>
      {legs.map(([x, y], k) => <IsoBox key={k} id={`${id}-l${k}`} x={x} y={y} z={zz} w={0.1} d={0.1} h={0.45} color={shade(color, -0.3)} T={T} o={o} sw={sw * 0.7} radius={1} />)}
      <IsoBox id={`${id}-belt`} {...belt} color={shade(color, -0.12)} T={T} o={o} sw={sw} radius={T * 0.04} />
      <g transform={face('top', belt, belt.z, {T, o, sw})}>
        {Array.from({length: rollers}, (_, k) => { const x = 0.15 + k * ((belt.w - 0.3) / (rollers - 1)); return <line key={k} x1={x} x2={x} y1={0.1} y2={belt.d - 0.1} stroke={PAPER.ink} strokeWidth={line(T, sw, 0.4)} opacity={0.6} />; })}
      </g>
      <IsoBox id={`${id}-box`} {...box} color="#e9d3a6" T={T} o={o} sw={sw} radius={T * 0.02} />
      <g transform={face('top', box, box.z, {T, o, sw})}><rect x={box.w * 0.42} y={0.05} width={box.w * 0.16} height={box.d - 0.1} fill="#d9b45a" opacity={0.85} /></g>
    </g>
  );
};

/** Register: a sales counter with a till, display and a key pad. */
const Register: FC<ArtProps> = (p) => {
  const {id, g, zz, T, o, sw, color} = p;
  const counter: Geo = {x: g.x, y: g.y, z: zz, w: g.w, d: g.d, h: g.h * 0.55};
  const reg: Geo = {x: g.x + 0.2, y: g.y + 0.2, z: zz + counter.h, w: g.w * 0.5, d: g.d * 0.6, h: g.h * 0.4};
  return (
    <g>
      <IsoBox id={`${id}-counter`} {...counter} color={shade(color, 0.1)} T={T} o={o} sw={sw} radius={T * 0.03} />
      <g transform={face('front', counter, counter.z, p)}>
        <rect x={0.15} y={0.18} width={counter.w - 0.3} height={counter.h * 0.4} rx={0.04} fill={shade(color, -0.2)} stroke={PAPER.ink} strokeWidth={line(T, sw, 0.5)} />
        <rect x={counter.w / 2 - 0.22} y={counter.h * 0.42} width={0.44} height={0.08} rx={0.03} fill={shade(color, -0.45)} />
      </g>
      <IsoBox id={`${id}-till`} {...reg} color={shade(color, 0.3)} T={T} o={o} sw={sw} radius={T * 0.05} />
      <g transform={face('top', reg, reg.z, p)}>
        <rect x={0.1} y={0.1} width={reg.w - 0.2} height={reg.d * 0.32} rx={0.03} fill={SCREEN} stroke={PAPER.ink} strokeWidth={line(T, sw, 0.4)} />
        {[0, 1, 2].map((r) => [0, 1, 2, 3].map((c) => <rect key={`${r}${c}`} x={0.14 + c * ((reg.w - 0.28) / 4)} y={reg.d * 0.45 + r * (reg.d * 0.16)} width={(reg.w - 0.28) / 4 - 0.06} height={reg.d * 0.12} rx={0.02} fill={PAPER.card} stroke={PAPER.ink} strokeWidth={line(T, sw, 0.3)} />))}
      </g>
    </g>
  );
};

/** Warehouse: tall shelving stacked with cardboard boxes. */
const Warehouse: FC<ArtProps> = ({id, g, zz, T, o, sw, color}) => {
  const levels = 3, lh = g.h / levels;
  const bw = (g.w - 0.4) / 2;
  return (
    <g>
      <IsoBox id={`${id}-l`} x={g.x} y={g.y} z={zz} w={0.12} d={g.d} h={g.h} color={shade(color, -0.1)} T={T} o={o} sw={sw} radius={T * 0.02} />
      <IsoBox id={`${id}-r`} x={g.x + g.w - 0.12} y={g.y} z={zz} w={0.12} d={g.d} h={g.h} color={shade(color, -0.1)} T={T} o={o} sw={sw} radius={T * 0.02} />
      {[0, 1, 2, 3].map((k) => <IsoBox key={k} id={`${id}-s${k}`} x={g.x} y={g.y} z={zz + k * lh} w={g.w} d={g.d} h={0.1} color={shade(color, 0.08)} T={T} o={o} sw={sw * 0.9} radius={T * 0.02} />)}
      {[0, 1, 2].map((k) => [0, 1].map((i) => <IsoBox key={`${k}${i}`} id={`${id}-b${k}${i}`} x={g.x + 0.2 + i * bw} y={g.y + 0.12} z={zz + k * lh + 0.1} w={bw - 0.1} d={g.d - 0.24} h={lh * (0.62 + ((i + k) % 3) * 0.07)} color={k % 2 ? '#e9d3a6' : '#ecd9b4'} T={T} o={o} sw={sw * 0.7} radius={T * 0.02} />))}
    </g>
  );
};

/** Price tag: a hanging label with a punched hole and a price panel. */
const PriceTag: FC<ArtProps> = ({g, zz, T, o, sw, color}) => {
  const c = project(g.x + g.w / 2, g.y + g.d / 2, zz + g.h * 0.5, T, o);
  const w = g.w * T * 0.78, h = g.h * T * 0.7;
  const tag = `M${-w / 2 + w * 0.2},${-h / 2} L${w / 2},${-h / 2} L${w / 2},${h / 2} L${-w / 2 + w * 0.2},${h / 2} L${-w / 2},0 Z`;
  return (
    <g transform={`translate(${c.x} ${c.y})`}>
      <line x1={-w * 0.32} x2={-w * 0.32} y1={-h * 0.85} y2={-h * 0.05} stroke={PAPER.ink} strokeWidth={sw * 0.9} />
      <path d={tag} fill={shade(color, 0.35)} stroke={PAPER.ink} strokeWidth={sw * 0.9} strokeLinejoin="round" />
      <circle cx={-w * 0.29} cy={0} r={Math.min(w * 0.08, h * 0.1)} fill={PAPER.card} stroke={PAPER.ink} strokeWidth={sw * 0.6} />
      <rect x={-w * 0.04} y={-h * 0.3} width={w * 0.44} height={h * 0.24} rx={sw} fill={PAPER.card} stroke={PAPER.ink} strokeWidth={sw * 0.5} />
      <line x1={-w * 0.26} x2={w * 0.32} y1={h * 0.22} y2={h * 0.22} stroke={PAPER.ink} strokeWidth={sw * 0.7} opacity={0.5} />
    </g>
  );
};

/** Shopping bag: a paper carrier bag with two arched handles and a logo disc. */
const ShoppingBag: FC<ArtProps> = (p) => {
  const {id, g, zz, T, o, sw, color} = p;
  const body: Geo = {x: g.x + 0.1, y: g.y + 0.1, z: zz, w: g.w - 0.2, d: g.d - 0.2, h: g.h * 0.85};
  const h0 = project(g.x + g.w * 0.35, g.y + g.d * 0.5, zz + body.h, T, o);
  const h1 = project(g.x + g.w * 0.65, g.y + g.d * 0.5, zz + body.h, T, o);
  const lift = Math.min(0.5, g.h * 0.3) * T;
  return (
    <g>

      <IsoBox id={`${id}-bag`} {...body} color={color} T={T} o={o} sw={sw} radius={T * 0.05} />
      {[0, 0.16].map((v) => <path key={v} d={`M${h0.x - v * T},${h0.y + v * T * 0.5} Q${(h0.x + h1.x) / 2 - v * T},${Math.min(h0.y, h1.y) - lift * 2} ${h1.x - v * T},${h1.y + v * T * 0.5}`} fill="none" stroke={PAPER.ink} strokeWidth={sw * 1.25} strokeLinecap="round" />)}
      <g transform={face('front', body, body.z, p)}><circle cx={body.w / 2} cy={body.h * 0.5} r={Math.min(0.2, body.h * 0.17)} fill={shade(color, 0.35)} stroke={PAPER.ink} strokeWidth={line(T, sw, 0.5)} /></g>
    </g>
  );
};

/** Factory: a workshop building with windows, a tall chimney and drifting smoke. */
const Factory: FC<ArtProps> = ({id, g, zz, T, o, sw, color}) => {
  const body: Geo = {x: g.x, y: g.y, z: zz, w: g.w, d: g.d, h: g.h * 0.62};
  const chimney: Geo = {x: g.x + g.w * 0.62, y: g.y + g.d * 0.2, z: zz + body.h, w: g.w * 0.18, d: g.d * 0.45, h: g.h * 0.5};
  const smoke = project(g.x + g.w * 0.71, g.y + g.d * 0.42, zz + g.h * 1.12, T, o);
  return (
    <g>
      <IsoBox id={`${id}-body`} {...body} color={shade(color, -0.08)} T={T} o={o} sw={sw} radius={T * 0.03} />
      <g transform={face('front', body, body.z, {T, o, sw})}>
        {[0, 1, 2, 3].map((k) => <rect key={k} x={0.2 + k * ((body.w - 0.4) / 4)} y={body.h * 0.32} width={(body.w - 0.4) / 4 - 0.1} height={body.h * 0.34} rx={0.03} fill={SCREEN} stroke={PAPER.ink} strokeWidth={line(T, sw, 0.4)} />)}
      </g>
      <IsoBox id={`${id}-chimney`} {...chimney} color={shade(color, -0.25)} T={T} o={o} sw={sw} radius={T * 0.02} />
      {[0, 1, 2].map((k) => <circle key={k} cx={smoke.x + k * T * 0.16} cy={smoke.y - k * T * 0.24} r={T * (0.1 + k * 0.04)} fill="#d2d5de" opacity={0.8 - k * 0.2} stroke={PAPER.ink} strokeWidth={sw * 0.4} />)}
    </g>
  );
};

/** Office desk: a work desk with a monitor, plus a swivel chair tucked behind. */
const OfficeDesk: FC<ArtProps> = (p) => {
  const {id, g, zz, T, o, sw, color} = p;
  const topZ = zz + g.h * 0.5;
  const top: Geo = {x: g.x, y: g.y, z: topZ, w: g.w * 0.62, d: g.d, h: 0.09};
  const seat: Geo = {x: g.x + g.w * 0.7, y: g.y + g.d * 0.12, z: zz + 0.35, w: g.w * 0.26, d: g.d * 0.7, h: 0.08};
  const back: Geo = {x: g.x + g.w * 0.92, y: g.y + g.d * 0.12, z: zz + 0.35, w: 0.09, d: g.d * 0.7, h: g.h * 0.55};
  const monitor: Geo = {x: g.x + 0.3, y: g.y + g.d * 0.2, z: topZ + 0.09, w: g.w * 0.32, d: 0.14, h: g.h * 0.38};
  return (
    <g>
      {[[g.x + 0.12, g.y + 0.12], [g.x + top.w - 0.22, g.y + 0.12], [g.x + top.w - 0.22, g.y + g.d - 0.22], [g.x + 0.12, g.y + g.d - 0.22]].map(([x, y], k) => <IsoBox key={`d${k}`} id={`${id}-d${k}`} x={x} y={y} z={zz} w={0.1} d={0.1} h={topZ - zz} color={shade(color, -0.3)} T={T} o={o} sw={sw * 0.7} radius={1} />)}
      <IsoBox id={`${id}-top`} {...top} color={shade('#f4da93', 0.05)} T={T} o={o} sw={sw} radius={T * 0.04} />
      <Decorated {...p} g={monitor} zz={monitor.z} radius={T * 0.04} front={<rect x={0.06} y={0.06} width={monitor.w - 0.12} height={monitor.h - 0.12} rx={0.03} fill={SCREEN} stroke={PAPER.ink} strokeWidth={line(T, sw, 0.4)} />} />
      {[[g.x + g.w * 0.72, g.y + g.d * 0.2], [g.x + g.w * 0.88, g.y + g.d * 0.2], [g.x + g.w * 0.72, g.y + g.d * 0.76], [g.x + g.w * 0.88, g.y + g.d * 0.76]].map(([x, y], k) => <IsoBox key={`c${k}`} id={`${id}-c${k}`} x={x} y={y} z={zz} w={0.09} d={0.09} h={0.35} color={shade(color, -0.35)} T={T} o={o} sw={sw * 0.7} radius={1} />)}
      <IsoBox id={`${id}-seat`} {...seat} color={shade(color, -0.1)} T={T} o={o} sw={sw} radius={T * 0.06} />
      <IsoBox id={`${id}-back`} {...back} color={shade(color, -0.05)} T={T} o={o} sw={sw} radius={T * 0.05} />
    </g>
  );
};

/** Handshake: two sleeves and clasping hands meeting in the middle. */
const Handshake: FC<ArtProps> = ({g, zz, T, o, sw, color}) => {
  const c = project(g.x + g.w / 2, g.y + g.d / 2, zz + g.h * 0.5, T, o);
  const s = g.w * T * 0.3;
  return (
    <g transform={`translate(${c.x} ${c.y})`}>
      <path d={`M${-s * 1.5},${s * 0.35} L${-s * 0.5},${s * 0.05} L${-s * 0.4},${-s * 0.25} L${-s * 1.5},${-s * 0.1} Z`} fill={shade(color, -0.1)} stroke={PAPER.ink} strokeWidth={sw * 0.8} strokeLinejoin="round" />
      <path d={`M${s * 1.5},${s * 0.35} L${s * 0.5},${s * 0.05} L${s * 0.4},${-s * 0.25} L${s * 1.5},${-s * 0.1} Z`} fill={shade('#9fc4ec', -0.1)} stroke={PAPER.ink} strokeWidth={sw * 0.8} strokeLinejoin="round" />
      <rect x={-s * 0.58} y={-s * 0.3} width={s * 0.72} height={s * 0.52} rx={s * 0.2} fill="#f6d3b6" stroke={PAPER.ink} strokeWidth={sw * 0.8} transform="rotate(-12)" />
      <rect x={-s * 0.12} y={-s * 0.26} width={s * 0.72} height={s * 0.52} rx={s * 0.2} fill="#f0c39f" stroke={PAPER.ink} strokeWidth={sw * 0.8} transform="rotate(12)" />
      {[0, 1, 2].map((k) => <line key={k} x1={-s * (0.3 - k * 0.18)} x2={-s * (0.2 - k * 0.18)} y1={-s * 0.18} y2={s * 0.16} stroke="#d9a67f" strokeWidth={sw * 0.6} />)}
    </g>
  );
};

/** Meeting table: a broad tabletop on a central pedestal with chairs around it. */
const MeetingTable: FC<ArtProps> = (p) => {
  const {id, g, zz, T, o, sw} = p;
  const tableZ = zz + g.h * 0.65;
  const chair = (u: number, near: boolean) => {
    const x = g.x + g.w * u, y = g.y + g.d * (near ? 0.78 : 0.02), w = g.w * 0.19, d = g.d * 0.2;
    return <g key={`${u}-${near}`}>
      <IsoBox id={`${id}-stem-${u}-${near}`} x={x+w*0.4} y={y+d*0.4} z={zz} w={w*0.2} d={d*0.2} h={g.h*0.36} color="#a5a9b4" T={T} o={o} sw={sw*0.7} />
      <IsoBox id={`${id}-seat-${u}-${near}`} x={x} y={y} z={zz+g.h*0.36} w={w} d={d} h={g.h*0.1} color="#b8d6f3" T={T} o={o} sw={sw*0.8} radius={T*0.05} />
      <IsoBox id={`${id}-back-${u}-${near}`} x={x} y={y+(near?d*0.85:0)} z={zz+g.h*0.4} w={w} d={d*0.15} h={g.h*0.6} color="#b8d6f3" T={T} o={o} sw={sw*0.8} radius={T*0.05} />
    </g>;
  };
  const top = {...g, x:g.x+g.w*0.04,y:g.y+g.d*0.23,z:tableZ,w:g.w*0.92,d:g.d*0.54,h:g.h*0.1};
  return <g>
    {[0.08,0.4,0.72].map(u=>chair(u,false))}
    {[0.25,0.7].map(u=><IsoBox key={u} id={`${id}-leg-${u}`} x={g.x+g.w*u} y={g.y+g.d*0.45} z={zz} w={0.12} d={g.d*0.18} h={tableZ-zz} color="#a5a9b4" T={T} o={o} sw={sw*0.8} />)}
    <Decorated {...p} g={top} zz={tableZ} color="#f4da93" radius={T*0.16} top={<>
      {[0.2,0.65].map(u=><rect key={u} x={top.w*u} y={top.d*0.3} width={top.w*0.14} height={top.d*0.35} fill={PAPER.card} stroke={PAPER.ink} strokeWidth={line(T,sw,0.35)} />)}
    </>} />
    {[0.08,0.4,0.72].map(u=>chair(u,true))}
  </g>;
};

/* ---------------------------------------------------------- transport & logistics objects */

const VehicleWheel: FC<Space & {x: number; y: number; z: number; r: number}> = ({x, y, z, r, T, o, sw}) => {
  const q = project(x, y, z, T, o);
  return <g transform={`matrix(${C30} ${S30} 0 1 ${q.x} ${q.y})`}>
    <circle r={r * T} fill="#343442" stroke={PAPER.ink} strokeWidth={sw * 0.7} />
    <circle r={r * T * 0.5} fill="#c9cdd5" stroke={PAPER.ink} strokeWidth={sw * 0.5} />
    <circle r={r * T * 0.17} fill={SCREEN} />
  </g>;
};

/** Car: a low body with a glazed cabin, headlights and four wheels. */
const Car: FC<ArtProps> = (p) => {
  const {id, g, zz, T, sw, color} = p;
  const body = {...g, z: zz + g.h * 0.16, h: g.h * 0.33};
  const cabin = {...g, x: g.x + g.w * 0.2, y: g.y + g.d * 0.08, z: body.z + body.h, w: g.w * 0.55, d: g.d * 0.84, h: g.h * 0.38};
  return <g>
    <Decorated {...p} g={body} zz={body.z} radius={T * 0.1} front={<>
      <line x1={0.12} x2={g.w - 0.12} y1={body.h * 0.7} y2={body.h * 0.7} stroke={shade(color, -0.3)} strokeWidth={line(T, sw, 0.5)} />
      <rect x={g.w * 0.46} y={0.08} width={g.w * 0.09} height={0.04} rx={0.02} fill={PAPER.ink} />
    </>} side={<>
      {[0.12, g.d - 0.38].map(x => <rect key={x} x={x} y={0.08} width={0.26} height={0.12} rx={0.04} fill="#fff3bd" />)}
      <rect x={g.d * 0.32} y={body.h * 0.6} width={g.d * 0.36} height={0.09} rx={0.03} fill={SCREEN} />
    </>} />
    <Decorated {...p} id={`${id}-cabin`} g={cabin} zz={cabin.z} radius={T * 0.1} front={<>
      {[0, 1].map(k => <rect key={k} x={0.1 + k * cabin.w * 0.46} y={0.09} width={cabin.w * 0.4} height={cabin.h * 0.65} rx={0.05} fill={SCREEN} />)}
    </>} side={<rect x={0.08} y={0.08} width={cabin.d - 0.16} height={cabin.h * 0.66} rx={0.05} fill={SCREEN} />} />
    {[0.2, 0.8].map(u => <VehicleWheel key={u} {...p} x={g.x + g.w * u} y={g.y + g.d + 0.02} z={zz + g.h * 0.16} r={g.h * 0.17} />)}
  </g>;
};

/** Truck: a cargo box behind a lower cab, with a side stripe and wheels. */
const Truck: FC<ArtProps> = (p) => {
  const {id, g, zz, T, o, sw, color} = p;
  const cargo: Geo = {x: g.x, y: g.y, z: zz + 0.22, w: g.w * 0.66, d: g.d, h: g.h * 0.82};
  const cab: Geo = {x: g.x + g.w * 0.66, y: g.y, z: zz + 0.22, w: g.w * 0.34, d: g.d, h: g.h * 0.55};

  return (
    <g>
      <IsoBox id={`${id}-cargo`} {...cargo} color={shade(color, 0.28)} T={T} o={o} sw={sw} radius={T * 0.05} />
      <IsoBox id={`${id}-cab`} {...cab} color={color} T={T} o={o} sw={sw} radius={T * 0.08} />
      <g transform={face('front', cab, cab.z, p)}><rect x={0.1} y={0.12} width={cab.w - 0.2} height={cab.h * 0.46} rx={0.05} fill={SCREEN} stroke={PAPER.ink} strokeWidth={line(T, sw, 0.5)} /></g>
      <g transform={face('side', cargo, cargo.z, p)}><line x1={0.1} x2={cargo.d - 0.1} y1={cargo.h * 0.52} y2={cargo.h * 0.52} stroke={PAPER.bad} strokeWidth={line(T, sw, 0.8)} /></g>
      <g transform={face('side', cab, cab.z, p)}>
        <rect x={0.12} y={0.1} width={cab.d - 0.24} height={cab.h * 0.43} rx={0.04} fill={SCREEN} />
        {[0.12, cab.d - 0.34].map(x => <rect key={x} x={x} y={cab.h * 0.7} width={0.22} height={0.12} rx={0.03} fill="#fff3bd" />)}
      </g>
      <g transform={face('front', cargo, cargo.z, p)}>
        {[0.2,0.4,0.6,0.8].map(u => <line key={u} x1={cargo.w*u} x2={cargo.w*u} y1={0.12} y2={cargo.h-0.12} stroke={shade(color,-0.2)} strokeWidth={line(T,sw,0.4)} />)}
        <rect x={0.1} y={cargo.h * 0.72} width={cargo.w - 0.2} height={0.12} fill={shade(color,-0.2)} />
      </g>
      {[0.17,0.82].map(u => <VehicleWheel key={u} {...p} x={g.x+g.w*u} y={g.y+g.d+0.02} z={zz+0.22} r={0.22} />)}
    </g>
  );
};

/** Bus: a long vehicle with a row of windows, a door and wheels. */
const Bus: FC<ArtProps> = (p) => {
  const {id, g, zz, T, o, sw, color} = p;
  const P = (x: number, y: number, z: number) => project(x, y, z, T, o);
  const body: Geo = {x: g.x, y: g.y, z: zz, w: g.w, d: g.d, h: g.h * 0.85};
  const n = Math.max(4, Math.round(g.w / 0.5));
  const wheel = (x: number) => { const q = P(x, g.y + g.d - 0.06, zz); return <g key={x}><circle cx={q.x} cy={q.y} r={sw * 3} fill="#3a3550" stroke={PAPER.ink} strokeWidth={sw * 0.6} /><circle cx={q.x} cy={q.y} r={sw * 1.2} fill={shade(color, -0.2)} /></g>; };
  return (
    <g>
      <IsoBox id={`${id}-body`} {...body} color={color} T={T} o={o} sw={sw} radius={T * 0.1} />
      <g transform={face('side', body, body.z, p)}>
        <rect x={body.d * 0.1} y={body.h * 0.12} width={body.d * 0.8} height={body.h * 0.42} rx={0.07} fill={SCREEN} />
        {[0.16, body.d - 0.36].map(x => <rect key={x} x={x} y={body.h * 0.73} width={0.2} height={0.12} rx={0.04} fill="#fff3bd" />)}
        <rect x={body.d * 0.32} y={body.h * 0.86} width={body.d * 0.36} height={0.07} fill={PAPER.ink} />
      </g>
      <g transform={face('front', body, body.z, p)}>
        <rect x={0.1} y={body.h * 0.6} width={body.w - 0.2} height={0.1} fill={shade(color,-0.3)} />
        {Array.from({length: n}, (_, k) => <rect key={k} x={0.12 + k * ((body.w - 0.24) / n)} y={0.16} width={(body.w - 0.24) / n - 0.1} height={body.h * 0.42} rx={0.03} fill={SCREEN} stroke={PAPER.ink} strokeWidth={line(T, sw, 0.4)} />)}
        <rect x={body.w * 0.76} y={body.h * 0.12} width={body.w * 0.16} height={body.h * 0.8} rx={0.03} fill={shade(color, -0.3)} stroke={PAPER.ink} strokeWidth={line(T, sw, 0.4)} />
      </g>
      {wheel(g.x + g.w * 0.18)}{wheel(g.x + g.w * 0.8)}
    </g>
  );
};

/** Train: a long carriage with windows and a front cab on rails. */
const Train: FC<ArtProps> = (p) => {
  const {id, g, zz, T, o, sw, color} = p;
  const P = (x: number, y: number, z: number) => project(x, y, z, T, o);
  const railZ = zz + 0.1;
  const body: Geo = {x: g.x, y: g.y, z: railZ + 0.12, w: g.w, d: g.d, h: g.h * 0.8};
  const n = Math.max(4, Math.round(g.w / 0.55));
  return (
    <g>
      {[g.y + g.d * 0.25, g.y + g.d * 0.75].map((y) => { const a = P(g.x - 0.2, y, railZ), b = P(g.x + g.w + 0.2, y, railZ); return <line key={y} x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke={PAPER.ink} strokeWidth={sw * 1.2} />; })}
      {[0.2,0.3,0.72,0.82].map(u => <VehicleWheel key={u} {...p} x={g.x+g.w*u} y={g.y+g.d} z={zz+0.16} r={0.15} />)}
      <IsoBox id={`${id}-body`} {...body} color={color} T={T} o={o} sw={sw} radius={T * 0.12} />
      <g transform={face('side', body, body.z, p)}>
        <rect x={body.d * 0.1} y={body.h * 0.12} width={body.d * 0.8} height={body.h * 0.42} rx={0.07} fill={SCREEN} />
        {[0.16, body.d - 0.36].map(x => <rect key={x} x={x} y={body.h * 0.73} width={0.2} height={0.12} rx={0.04} fill="#fff3bd" />)}
        <rect x={body.d * 0.32} y={body.h * 0.86} width={body.d * 0.36} height={0.07} fill={PAPER.ink} />
      </g>
      <g transform={face('front', body, body.z, p)}>
        <rect x={0.1} y={body.h * 0.6} width={body.w - 0.2} height={0.1} fill={shade(color,-0.3)} />
        {Array.from({length: n}, (_, k) => <rect key={k} x={0.14 + k * ((body.w - 0.28) / n)} y={0.2} width={(body.w - 0.28) / n - 0.12} height={body.h * 0.36} rx={0.03} fill={SCREEN} stroke={PAPER.ink} strokeWidth={line(T, sw, 0.4)} />)}
      </g>
    </g>
  );
};

/** Airplane: a fuselage with swept wings, a tail fin and a row of windows. */
const Airplane: FC<ArtProps> = (p) => {
  const {id, g, zz, T, o, sw, color} = p;
  const P = (x: number, y: number, z: number) => project(g.x + x * g.w, g.y + y * g.d, zz + z * g.h, T, o);
  const panel = (coords: number[][], fill: string) => <polygon points={poly(coords.map(([x,y,z]) => P(x,y,z)))} fill={fill} stroke={PAPER.ink} strokeWidth={sw * 0.8} strokeLinejoin="round" />;
  const body = {...g, x: g.x + g.w * 0.05, y: g.y + g.d * 0.43, z: zz + g.h * 0.32, w: g.w * 0.9, d: g.d * 0.14, h: g.h * 0.25};
  return <g>
    {panel([[0.36,0.46,0.4],[0.6,0,0.36],[0.73,0,0.36],[0.61,0.47,0.4]], shade(color,-0.06))}
    {panel([[0.78,0.46,0.42],[0.91,0.22,0.4],[0.99,0.22,0.4],[0.94,0.48,0.42]], color)}
    <Decorated {...p} id={`${id}-fuselage`} g={body} zz={body.z} color={shade(color,0.35)} radius={T * 0.24} front={<>
      <rect x={body.w * 0.07} y={0.04} width={body.w * 0.1} height={body.h * 0.55} rx={0.04} fill={SCREEN} />
      {Array.from({length: 7}, (_, k) => <rect key={k} x={body.w * (0.25 + k * 0.08)} y={0.07} width={body.w * 0.035} height={body.h * 0.4} rx={0.025} fill={SCREEN} />)}
    </>} />
    {panel([[0.36,0.54,0.4],[0.6,1,0.36],[0.73,1,0.36],[0.61,0.53,0.4]], shade(color,0.13))}
    {panel([[0.78,0.54,0.42],[0.91,0.78,0.4],[0.99,0.78,0.4],[0.94,0.52,0.42]], color)}
    {panel([[0.76,0.5,0.56],[0.9,0.5,1],[0.98,0.5,1],[0.95,0.5,0.56]], shade(color,-0.18))}
  </g>;
};

/** Ship: a hull with a bow, a wheelhouse and a stack of shipping containers. */
const Ship: FC<ArtProps> = ({id, g, zz, T, o, sw, color}) => {
  const P = (x: number, y: number, z: number) => project(x, y, z, T, o);
  const hull: Geo = {x: g.x, y: g.y, z: zz, w: g.w * 0.78, d: g.d, h: g.h * 0.4};
  const bow = poly([P(g.x + g.w * 0.78, g.y, zz + hull.h), P(g.x + g.w, g.y + g.d / 2, zz + hull.h), P(g.x + g.w * 0.78, g.y + g.d, zz + hull.h)]);
  const bridge: Geo = {x: g.x + g.w * 0.08, y: g.y + g.d * 0.2, z: zz + hull.h, w: g.w * 0.2, d: g.d * 0.6, h: g.h * 0.35};
  const boxes = [['#e5604f', 0.36], ['#b8d6f3', 0.52], ['#f4c178', 0.68]] as const;
  return (
    <g>
      <IsoBox id={`${id}-hull`} {...hull} color={shade(color, -0.1)} T={T} o={o} sw={sw} radius={T * 0.08} />
      <polygon points={poly([P(g.x+g.w*0.78,g.y+g.d,zz+hull.h),P(g.x+g.w,g.y+g.d/2,zz+hull.h),P(g.x+g.w*0.92,g.y+g.d/2,zz+0.08),P(g.x+g.w*0.78,g.y+g.d,zz)])} fill={shade(color,-0.22)} stroke={PAPER.ink} strokeWidth={sw} strokeLinejoin="round" />
      <polygon points={bow} fill={shade(color, 0.05)} stroke={PAPER.ink} strokeWidth={sw} strokeLinejoin="round" />
      {boxes.map(([c, u], k) => <IsoBox key={k} id={`${id}-c${k}`} x={g.x + g.w * u} y={g.y + g.d * 0.16} z={zz + hull.h} w={g.w * 0.13} d={g.d * 0.68} h={g.h * (0.2 + k * 0.04)} color={c} T={T} o={o} sw={sw * 0.8} radius={T * 0.02} />)}
      <Decorated id={`${id}-bridge`} g={bridge} zz={bridge.z} color="#fffaf1" T={T} o={o} sw={sw} radius={T * 0.04} front={<rect x={bridge.w*0.1} y={bridge.h*0.18} width={bridge.w*0.8} height={bridge.h*0.35} fill={SCREEN} />} side={<rect x={bridge.d*0.1} y={bridge.h*0.18} width={bridge.d*0.8} height={bridge.h*0.35} fill={SCREEN} />} />
    </g>
  );
};

/** Bicycle: drawn in the vertical plane along x (like the other vehicles), so its wheels are iso ellipses. */
const Bicycle: FC<ArtProps> = (p) => {
  const {g, zz, T, o, sw, color} = p;
  const plane: Geo = {x: g.x, y: g.y + g.d / 2 - 0.0, z: 0, w: g.w, d: 0, h: g.h};
  const r = Math.min(g.w * 0.21, g.h * 0.32), wy = g.h - r; // wheel centres (face units, y down)
  const back = r + 0.05, front = g.w - r - 0.05;
  const crank = {x: g.w * 0.45, y: wy}, seat = {x: g.w * 0.36, y: wy - r * 1.55}, head = {x: front - r * 0.35, y: wy - r * 1.55};
  const k = line(T, sw, 1.5), thin = line(T, sw, 0.5);
  const wheel = (cx: number) => <g key={cx}>
    <circle cx={cx} cy={wy} r={r} fill="none" stroke={PAPER.ink} strokeWidth={line(T, sw, 1.6)} />
    {[0, 1, 2, 3].map((i) => { const a = (i * Math.PI) / 4; return <line key={i} x1={cx - Math.cos(a) * r} y1={wy - Math.sin(a) * r} x2={cx + Math.cos(a) * r} y2={wy + Math.sin(a) * r} stroke={PAPER.ink} strokeWidth={thin} opacity={0.45} />; })}
    <circle cx={cx} cy={wy} r={r * 0.1} fill={PAPER.ink} />
  </g>;
  const bar = (a: {x: number; y: number}, b: {x: number; y: number}, key: string, c = color) => <line key={key} x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke={c} strokeWidth={k} strokeLinecap="round" />;
  const shadowC = project(g.x + g.w / 2, g.y + g.d / 2, zz, T, o);
  return (
    <g>
      <ellipse cx={shadowC.x} cy={shadowC.y} rx={g.w * T * 0.5} ry={g.w * T * 0.16} fill={PAPER.shadow} opacity={0.7} />
      <g transform={face('front', plane, zz, p)}>
        {wheel(back)}{wheel(front)}
        {/* frame: outline in ink first, colour on top */}
        {[[{x: back, y: wy}, crank], [crank, seat], [seat, {x: back, y: wy}], [seat, head], [crank, head], [head, {x: front, y: wy}]].map(([a, b], i) => <g key={i}>
          <line x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke={PAPER.ink} strokeWidth={k * 1.7} strokeLinecap="round" />
          {bar(a, b, `c${i}`)}
        </g>)}
        <line x1={seat.x - 0.2} x2={seat.x + 0.14} y1={seat.y - 0.08} y2={seat.y - 0.08} stroke={PAPER.ink} strokeWidth={line(T, sw, 2.4)} strokeLinecap="round" />
        <line x1={head.x} y1={head.y} x2={head.x + 0.08} y2={head.y - 0.22} stroke={PAPER.ink} strokeWidth={line(T, sw, 1.4)} strokeLinecap="round" />
        <line x1={head.x - 0.06} x2={head.x + 0.24} y1={head.y - 0.24} y2={head.y - 0.24} stroke={PAPER.ink} strokeWidth={line(T, sw, 1.8)} strokeLinecap="round" />
        <circle cx={crank.x} cy={crank.y} r={r * 0.2} fill={PAPER.card} stroke={PAPER.ink} strokeWidth={thin * 1.6} />
      </g>
    </g>
  );
};

/** Traffic light: a pole with a boxed three-lamp head (red, amber, green) facing the viewer. */
const TrafficLight: FC<ArtProps> = (p) => {
  const {id, g, zz, T, o, sw, color} = p;
  const cx = g.x + g.w / 2, cy = g.y + g.d / 2;
  const headW = Math.min(0.62, g.w * 0.8), headD = 0.36, headH = Math.min(1.25, g.h * 0.46);
  const headZ = zz + g.h - headH;
  const head: Geo = {x: cx - headW / 2, y: cy - headD / 2, z: 0, w: headW, d: headD, h: headH};
  const lamps = ['#e5604f', '#f4c14e', '#5cc97a'];
  const lr = Math.min(headW * 0.3, headH * 0.13);
  return (
    <g>
      <IsoShadow x={cx - 0.3} y={cy - 0.3} w={0.6} d={0.6} opacity={0.7} T={T} o={o} sw={sw} />
      <IsoCylinder cx={cx} cy={cy} z={zz} r={0.22} h={0.1} color={shade(color, -0.2)} T={T} o={o} sw={sw} bands={0} />
      <IsoBox id={`${id}-pole`} x={cx - 0.06} y={cy - 0.06} z={zz + 0.1} w={0.12} d={0.12} h={headZ - zz - 0.1} color="#4a5068" T={T} o={o} sw={sw * 0.8} radius={1} />
      <Decorated {...p} id={`${id}-head`} g={head} zz={headZ} color="#3f4458" radius={T * 0.06} front={<>
        {lamps.map((c, k) => {
          const y = headH * (0.2 + k * 0.3);
          return <g key={c}>
            <circle cx={headW / 2} cy={y} r={lr * 1.25} fill="#2b2f3d" />
            <circle cx={headW / 2} cy={y} r={lr} fill={c} stroke={PAPER.ink} strokeWidth={line(T, sw, 0.4)} />
            <circle cx={headW / 2 - lr * 0.35} cy={y - lr * 0.35} r={lr * 0.3} fill="#ffffff" opacity={0.55} />
          </g>;
        })}
      </>} />
    </g>
  );
};

/** Fuel pump: a forecourt pump with a display, keypad and a hose on a hook. */
const FuelPump: FC<ArtProps> = (p) => {
  const {id, g, zz, T, o, sw, color} = p;
  const body: Geo = {x: g.x, y: g.y + g.d * 0.3, z: zz, w: g.w * 0.7, d: g.d * 0.6, h: g.h};
  const c = project(g.x + g.w * 0.82, g.y + g.d * 0.5, zz + g.h * 0.6, T, o);
  return (
    <g>
      <IsoBox id={`${id}-base`} x={g.x - 0.1} y={g.y + g.d * 0.25} z={zz} w={g.w * 0.9} d={g.d * 0.7} h={0.1} color={shade(color, -0.25)} T={T} o={o} sw={sw} radius={T * 0.03} />
      <Decorated {...p} g={body} zz={zz + 0.1} radius={T * 0.08} front={<>
        <rect x={0.12} y={0.14} width={body.w - 0.24} height={body.h * 0.24} rx={0.04} fill={SCREEN} stroke={PAPER.ink} strokeWidth={line(T, sw, 0.5)} />
        <rect x={0.2} y={body.h * 0.46} width={body.w - 0.4} height={body.h * 0.3} rx={0.03} fill={shade(color, 0.15)} stroke={PAPER.ink} strokeWidth={line(T, sw, 0.4)} />
        {[0, 1, 2].map((k) => <line key={k} x1={0.3} x2={body.w - 0.3} y1={body.h * (0.52 + k * 0.08)} y2={body.h * (0.52 + k * 0.08)} stroke={PAPER.ink} strokeWidth={line(T, sw, 0.35)} opacity={0.6} />)}
      </>} />
      <path d={`M${c.x},${c.y - T * 0.1} q${T * 0.5},${T * 0.5} ${T * 0.12},${T * 0.7}`} fill="none" stroke={PAPER.ink} strokeWidth={sw * 1.6} strokeLinecap="round" />
      <rect x={c.x + T * 0.06} y={c.y + T * 0.6} width={T * 0.12} height={T * 0.2} rx={T * 0.03} fill={shade(color, -0.2)} stroke={PAPER.ink} strokeWidth={sw * 0.6} />
    </g>
  );
};

/** Map pin: a teardrop marker with a circular hole, standing on its tip. */
const MapPin: FC<ArtProps> = ({g, zz, T, o, sw, color}) => {
  const c = project(g.x + g.w / 2, g.y + g.d / 2, zz + g.h * 0.5, T, o);
  const w = g.w * T * 0.5, h = g.h * T * 0.9, r = w * 0.34;
  const pin = `M${c.x},${c.y + h / 2} C${c.x - w},${c.y + h * 0.05} ${c.x - r * 1.7},${c.y - h / 2} ${c.x},${c.y - h / 2} C${c.x + r * 1.7},${c.y - h / 2} ${c.x + w},${c.y + h * 0.05} ${c.x},${c.y + h / 2} Z`;
  return (
    <g>
      <ellipse cx={c.x} cy={c.y + h / 2 + sw * 2} rx={w * 0.4} ry={sw * 2.5} fill={PAPER.shadow} />
      <path d={pin} fill={color} stroke={PAPER.ink} strokeWidth={sw} strokeLinejoin="round" />
      <circle cx={c.x} cy={c.y - h * 0.12} r={r} fill={PAPER.card} stroke={PAPER.ink} strokeWidth={sw * 0.7} />
    </g>
  );
};

/* ---------------------------------------------------------------------------- dispatch */

export type ArtKind = RoadKind | GeneralKind | 'server' | 'database' | 'storage' | 'cache' | 'cloud' | 'loadbalancer' | 'router' | 'api' | 'queue' | 'client' |
  'laptop' | 'phone' | 'cpu' | 'memory' | 'globe' | 'lock' | 'file' | 'code' | 'box' |
  'tile' | 'tv' | 'radio' | 'newspaper' | 'tower' | 'satellite' | 'building' | 'book' | 'mic' | 'camera' | 'billboard' |
  'hospital' | 'doctor' | 'bed' | 'ambulance' | 'pill' | 'syringe' | 'heartmonitor' | 'microscope' | 'testtubes' | 'dna' |
  'school' | 'teacher' | 'desk' | 'bookshelf' | 'gradcap' | 'backpack' | 'standglobe' | 'certificate' | 'notebook' |
  'bank' | 'coins' | 'wallet' | 'creditcard' | 'atm' | 'safe' | 'piggybank' | 'cash' | 'stockchart' | 'calculator' | 'receipt' |
  'shop' | 'shoppingcart' | 'conveyor' | 'register' | 'warehouse' | 'pricetag' | 'shoppingbag' | 'factory' | 'officedesk' | 'handshake' | 'meetingtable' |
  'car' | 'truck' | 'road' | 'bus' | 'train' | 'airplane' | 'ship' | 'bicycle' | 'trafficlight' | 'fuelpump' | 'mappin';

/** Draws one object kind; g is its footprint and height (grid units), zz its current height above the ground. */
export const IsoArt: FC<ArtProps & {kind: ArtKind}> = (props) => {
  const {kind, g, zz, color, T, sw} = props;
  if (Object.prototype.hasOwnProperty.call(GENERAL_KINDS, kind)) return <GeneralArt {...props} kind={kind as GeneralKind} />;
  if (isRoadKind(kind)) return <RoadArt {...props} kind={kind} />;
  switch (kind) {
    case 'server': return <ServerRack {...props} />;
    case 'database': case 'storage': return <DatabaseArt {...props} />;
    case 'cache': return <FlatWithIcon {...props} glyph={Zap} />;
    case 'loadbalancer': return <FlatWithIcon {...props} glyph={Split} ports={3} />;
    case 'api': return <FlatWithIcon {...props} glyph={Plug} ports={2} />;
    case 'router': return <Router {...props} />;
    case 'queue': return <Queue {...props} />;
    case 'cpu': return <Chip {...props} />;
    case 'memory': return <MemoryStick {...props} />;
    case 'lock': return <Padlock {...props} />;
    case 'globe': return <Globe {...props} />;
    case 'cloud': return <Cloud {...props} />;
    case 'box': return <Cardboard {...props} />;
    case 'tile': return <Tile {...props} />;
    case 'tv': return <Television {...props} />;
    case 'radio': return <RadioSet {...props} />;
    case 'newspaper': return <Newspaper {...props} />;
    case 'tower': return <Tower {...props} />;
    case 'satellite': return <Satellite {...props} />;
    case 'building': return <Building {...props} />;
    case 'book': return <Book {...props} />;
    case 'mic': return <Microphone {...props} />;
    case 'camera': return <Camera {...props} />;
    case 'billboard': return <Billboard {...props} />;
    case 'hospital': return <Hospital {...props} />;
    case 'doctor': return <Doctor {...props} />;
    case 'bed': return <PatientBed {...props} />;
    case 'ambulance': return <Ambulance {...props} />;
    case 'pill': return <PillBottle {...props} />;
    case 'syringe': return <Syringe {...props} />;
    case 'heartmonitor': return <HeartMonitor {...props} />;
    case 'microscope': return <Microscope {...props} />;
    case 'testtubes': return <TestTubeRack {...props} />;
    case 'dna': return <Dna {...props} />;
    case 'school': return <School {...props} />;
    case 'teacher': return <Teacher {...props} />;
    case 'desk': return <Desk {...props} />;
    case 'bookshelf': return <Bookshelf {...props} />;
    case 'gradcap': return <GradCap {...props} />;
    case 'backpack': return <Backpack {...props} />;
    case 'standglobe': return <StandGlobe {...props} />;
    case 'certificate': return <Certificate {...props} />;
    case 'notebook': return <Notebook {...props} />;
    case 'bank': return <Bank {...props} />;
    case 'coins': return <CoinStack {...props} />;
    case 'wallet': return <Wallet {...props} />;
    case 'creditcard': return <CreditCard {...props} />;
    case 'atm': return <Atm {...props} />;
    case 'safe': return <Safe {...props} />;
    case 'piggybank': return <PiggyBank {...props} />;
    case 'cash': return <CashBundle {...props} />;
    case 'stockchart': return <StockChart {...props} />;
    case 'calculator': return <Calculator {...props} />;
    case 'receipt': return <Receipt {...props} />;
    case 'shop': return <Shop {...props} />;
    case 'shoppingcart': return <ShoppingCart {...props} />;
    case 'conveyor': return <Conveyor {...props} />;
    case 'register': return <Register {...props} />;
    case 'warehouse': return <Warehouse {...props} />;
    case 'pricetag': return <PriceTag {...props} />;
    case 'shoppingbag': return <ShoppingBag {...props} />;
    case 'factory': return <Factory {...props} />;
    case 'officedesk': return <OfficeDesk {...props} />;
    case 'handshake': return <Handshake {...props} />;
    case 'meetingtable': return <MeetingTable {...props} />;
    case 'car': return <Car {...props} />;
    case 'truck': return <Truck {...props} />;
    case 'bus': return <Bus {...props} />;
    case 'train': return <Train {...props} />;
    case 'airplane': return <Airplane {...props} />;
    case 'ship': return <Ship {...props} />;
    case 'bicycle': return <Bicycle {...props} />;
    case 'trafficlight': return <TrafficLight {...props} />;
    case 'fuelpump': return <FuelPump {...props} />;
    case 'mappin': return <MapPin {...props} />;
    case 'client': { // monitor: screen panel on a neck and base
      const screen: Geo = {...g, y: g.y + g.d / 2 - 0.07, d: 0.14, h: g.h * 0.7, z: g.z};
      const base: Geo = {x: g.x + g.w / 2 - 0.45, y: g.y + g.d / 2 - 0.35, z: 0, w: 0.9, d: 0.7, h: 0.08};
      return (
        <g>
          <IsoBox id={`${props.id}-base`} x={base.x} y={base.y} z={zz} w={base.w} d={base.d} h={base.h} color={shade(color, -0.05)} T={T} o={props.o} sw={sw} radius={T * 0.12} />
          <IsoBox id={`${props.id}-neck`} x={g.x + g.w / 2 - 0.08} y={g.y + g.d / 2 - 0.08} z={zz + 0.08} w={0.16} d={0.16} h={g.h * 0.3} color={shade(color, -0.1)} T={T} o={props.o} sw={sw * 0.8} radius={1} />
          <Decorated {...props} g={screen} zz={zz + g.h * 0.3} radius={T * 0.08} front={screenLines(screen.w, screen.h, T, sw)} />
        </g>
      );
    }
    case 'laptop': {
      const base: Geo = {...g, h: 0.12};
      const screen: Geo = {x: g.x, y: g.y, z: 0, w: g.w, d: 0.1, h: g.h - 0.12};
      return (
        <g>
          <Decorated {...props} g={screen} zz={zz + 0.12} radius={T * 0.08} front={screenLines(screen.w, screen.h, T, sw)} />
          <Decorated {...props} g={base} radius={T * 0.08} top={<>
            {Array.from({length: 3}, (_, r) => Array.from({length: 6}, (_, k) => <rect key={`${r}-${k}`} x={0.15 + k * ((g.w - 0.3) / 6)} y={0.18 + 0.1 + r * 0.22} width={(g.w - 0.3) / 6 - 0.06} height={0.15} rx={0.03} fill={shade(color, -0.25)} />))}
          </>} />
        </g>
      );
    }
    case 'phone': {
      const screen: Geo = {...g, y: g.y + g.d / 2 - 0.08, d: 0.16};
      return <Decorated {...props} g={screen} radius={T * 0.14} front={<>
        <rect x={0.08} y={0.14} width={screen.w - 0.16} height={screen.h - 0.28} rx={0.08} fill={SCREEN} stroke={PAPER.ink} strokeWidth={line(T, sw, 0.6)} />
        <rect x={screen.w / 2 - 0.12} y={0.05} width={0.24} height={0.05} rx={0.025} fill={PAPER.ink} />
        {[0, 1, 2].map((k) => <rect key={k} x={0.18} y={0.3 + k * 0.25} width={screen.w - 0.36} height={0.14} rx={0.05} fill={['#9fc4ec', '#f4c178', '#9ed3a8'][k]} />)}
      </>} />;
    }
    case 'code': {
      const screen: Geo = {...g, y: g.y + g.d / 2 - 0.06, d: 0.12};
      return <Decorated {...props} g={screen} radius={T * 0.1} front={<>
        <rect x={0} y={0} width={screen.w} height={0.22} fill={shade(color, -0.15)} />
        {[0, 1, 2].map((k) => <circle key={k} cx={0.15 + k * 0.13} cy={0.11} r={0.04} fill={['#f08a7b', '#f5c451', LED][k]} />)}
        <rect x={0.1} y={0.3} width={screen.w - 0.2} height={screen.h - 0.4} rx={0.06} fill={SCREEN} />
        {[0, 1, 2, 3].filter((k) => 0.45 + k * 0.2 < screen.h - 0.15).map((k) => (
          <rect key={k} x={0.22 + (k === 1 || k === 2 ? 0.18 : 0)} y={0.45 + k * 0.2} width={(screen.w - 0.6) * [0.5, 0.7, 0.4, 0.6][k]} height={0.08} rx={0.04} fill={['#c9b6ec', '#9ed3a8', '#f4c178', '#9fc4ec'][k]} />
        ))}
      </>} />;
    }
    case 'file': {
      const sheet: Geo = {...g, y: g.y + g.d / 2 - 0.05, d: 0.1};
      return <Decorated {...props} g={sheet} radius={T * 0.06} front={<>
        {[0, 1, 2, 3, 4].filter((k) => 0.4 + k * 0.22 < sheet.h - 0.1).map((k) => <rect key={k} x={0.18} y={0.4 + k * 0.22} width={(sheet.w - 0.36) * (k === 0 ? 0.5 : 0.85)} height={0.07} rx={0.03} fill={k === 0 ? PAPER.ink : shade(color, -0.3)} />)}
        <path d={`M${sheet.w - 0.35},0 L${sheet.w},0.35 L${sheet.w - 0.35},0.35 Z`} fill={shade(color, -0.15)} stroke={PAPER.ink} strokeWidth={line(T, sw, 0.5)} />
      </>} />;
    }
    default: return <Decorated {...props} />;
  }
};
