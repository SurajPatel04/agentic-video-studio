/**
 * Isometric illustrations: each object kind drawn as what it is (server rack, monitor, phone,
 * router, padlock, ...) in the paper style, from the same box/cylinder primitives.
 *
 * Face drawing: `face(...)` gives an SVG transform that maps a flat 2D drawing (units = grid units,
 * x to the right, y down) onto one face of a box, so slots, screens and icons sit ON the surface.
 */
import type {FC, ReactNode} from 'react';
import {Cpu, icons, Plug, Split, Star, Zap, type LucideIcon} from 'lucide-react';
import {C30, faces, PAPER, project, S30, shade, type Pt} from './iso';
import {IsoBox, IsoCylinder, IsoShadow} from './shapes';

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

type ArtProps = Space & {id: string; g: Geo; zz: number; color: string; icon?: string};

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

/* ---------------------------------------------------------------------------- dispatch */

export type ArtKind = 'server' | 'database' | 'storage' | 'cache' | 'cloud' | 'loadbalancer' | 'router' | 'api' | 'queue' | 'client' |
  'laptop' | 'phone' | 'cpu' | 'memory' | 'globe' | 'lock' | 'file' | 'code' | 'box' |
  'tile' | 'tv' | 'radio' | 'newspaper' | 'tower' | 'satellite' | 'building' | 'book' | 'mic' | 'camera' | 'billboard';

/** Draws one object kind; g is its footprint and height (grid units), zz its current height above the ground. */
export const IsoArt: FC<ArtProps & {kind: ArtKind}> = (props) => {
  const {kind, g, zz, color, T, sw} = props;
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
