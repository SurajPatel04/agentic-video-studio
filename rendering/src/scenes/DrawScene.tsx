/**
 * DrawScene: a flat 2D diagram for any subject the library has no scene for (a heart, an engine, a cell,
 * photosynthesis, a circuit of pipes...). The planner only PLACES ready-made parts and simple shapes on a
 * 100 x 56 grid and says what happens on which narration words; the scene draws, labels and animates them.
 *
 * Built for small models: plain names, few fields, forgiving input. Unknown kinds become an icon or a box,
 * unknown colours become blue, steps that point at a missing shape are dropped, numbers off the grid are
 * clamped, steps without timing are spread over the scene. Nothing here asks the planner for a retry.
 */
import type {FC, ReactNode} from 'react';
import {Easing, interpolate, interpolateColors, useCurrentFrame, useVideoConfig} from 'remotion';
import {z} from 'zod';
import {PAPER} from '../iso/iso';
import {iconByName} from '../iso/objects';
import {useSceneLength} from '../theme';
import {PaperStage, fraction, useStageBox} from './paperStage';

export const GRID_W = 100;
export const GRID_H = 56;

export const COLORS = {
  red: '#e5604f', orange: '#f0a43a', yellow: '#f5cd47', green: '#6cc070', teal: '#4fb3a9', blue: '#5b9bd5',
  purple: '#8c7bc4', pink: '#ef8fb0', brown: '#a8754f', gray: '#a19ba9', white: '#fffaf1', black: '#2b2833',
} as const;
type Color = keyof typeof COLORS;
const colorNames = Object.keys(COLORS) as [Color, ...Color[]];

export const PARTS = ['gear', 'piston', 'cylinder', 'wheel', 'spring', 'battery', 'bulb', 'magnet', 'sun', 'cloud', 'drop',
  'flame', 'bubble', 'leaf', 'tree', 'heart', 'cell', 'atom', 'planet', 'person', 'house', 'mountain', 'wave', 'flask'] as const;
const BASIC = ['circle', 'box', 'ellipse', 'line', 'arrow', 'text', 'polygon', 'icon'] as const;
const KINDS = [...BASIC, ...PARTS] as const;
type Kind = typeof KINDS[number];
const isKind = (k: string): k is Kind => (KINDS as readonly string[]).includes(k);

const KIND_ALIASES: Record<string, Kind> = {
  rect: 'box', rectangle: 'box', square: 'box', card: 'box', label: 'text', words: 'text', dot: 'circle', ball: 'circle',
  oval: 'ellipse', triangle: 'polygon', shape: 'polygon', connector: 'arrow', link: 'line', path: 'line', pipe: 'line',
  cog: 'gear', engine: 'piston', tube: 'cylinder', chamber: 'cylinder', coil: 'spring', lamp: 'bulb', light: 'bulb',
  star: 'sun', water: 'drop', raindrop: 'drop', fire: 'flame', plant: 'tree', organ: 'heart', molecule: 'atom', earth: 'planet',
  globe: 'planet', human: 'person', man: 'person', woman: 'person', student: 'person', building: 'house', hill: 'mountain',
  beaker: 'flask', bottle: 'flask', 'sine-wave': 'wave', oxygen: 'bubble', gas: 'bubble',
};
const COLOR_ALIASES: Record<string, Color> = {
  grey: 'gray', silver: 'gray', violet: 'purple', lavender: 'purple', cyan: 'teal', mint: 'green', lime: 'green', gold: 'yellow',
  amber: 'orange', peach: 'orange', navy: 'blue', sky: 'blue', rose: 'pink', crimson: 'red', maroon: 'red', tan: 'brown', cream: 'white',
};
const DO_ALIASES: Record<string, string> = {
  appear: 'show', reveal: 'show', enter: 'show', disappear: 'hide', remove: 'hide', highlight: 'focus', point: 'focus',
  emphasize: 'focus', moveto: 'move', 'move-to': 'move', slide: 'move', colour: 'color', recolor: 'color', paint: 'color',
  enlarge: 'grow', bigger: 'grow', smaller: 'shrink', play: 'start', animate: 'start', pause: 'stop', rename: 'label', relabel: 'label',
};

const xy = z.tuple([z.number().min(0).max(GRID_W), z.number().min(0).max(GRID_H)]);
const end = z.union([xy, z.string().min(1)]);

const shapeSchema = z.object({
  id: z.string().min(1).max(40),
  kind: z.enum(KINDS).default('circle'),
  at: end.default([50, 28]),
  to: end.optional(),
  bend: z.number().min(-20).max(20).optional(),
  size: z.number().min(1).max(60).optional(),
  w: z.number().min(1).max(GRID_W).optional(),
  h: z.number().min(1).max(GRID_H).optional(),
  points: z.array(xy).min(3).max(12).optional(),
  color: z.enum(colorNames).optional(),
  label: z.string().max(48).optional(),
  labelSide: z.enum(['auto', 'below', 'above', 'left', 'right', 'center']).default('auto'),
  icon: z.string().max(80).optional(),
  rotate: z.number().min(-360).max(360).default(0),
  motion: z.enum(['none', 'spin', 'pulse', 'bob', 'sway', 'shake', 'blink', 'flow', 'orbit']).default('none'),
  around: z.string().optional(),
  amount: z.number().min(0).max(20).default(3),
  speed: z.number().min(0.1).max(4).default(1),
  dashed: z.boolean().default(false),
  hidden: z.boolean().default(false),
  appearAt: fraction.optional(),
});

const stepSchema = z.object({
  at: fraction.optional(),
  target: z.string().min(1),
  do: z.enum(['show', 'hide', 'focus', 'move', 'color', 'grow', 'shrink', 'start', 'stop', 'label']).default('focus'),
  to: xy.optional(),
  color: z.enum(colorNames).optional(),
  label: z.string().max(48).optional(),
  note: z.string().max(90).optional(),
});

const record = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
const key = (v: unknown) => (typeof v === 'string' ? v.trim().toLowerCase().replace(/[\s_]+/g, '-') : '');

/** Forgiving input: fix what a small model gets wrong instead of failing the plan. */
const fixShape = (raw: unknown, index: number) => {
  if (!record(raw)) return raw;
  const o: Record<string, unknown> = {...raw};
  if (typeof o.radius === 'number' && o.size === undefined) o.size = o.radius * 2;
  delete o.radius;
  for (const [from, to] of [['type', 'kind'], ['shape', 'kind'], ['part', 'kind'], ['fill', 'color'], ['colour', 'color'],
    ['text', 'label'], ['name', 'label'], ['position', 'at'], ['pos', 'at'], ['from', 'at'], ['center', 'at'], ['animation', 'motion'],
    ['width', 'w'], ['height', 'h']] as const) {
    if (o[to] === undefined && o[from] !== undefined) o[to] = o[from];
    delete o[from];
  }
  if (o.id === undefined) o.id = `shape${index + 1}`;
  if (typeof o.x === 'number' && typeof o.y === 'number' && o.at === undefined) o.at = [o.x, o.y];
  delete o.x; delete o.y;
  const k = key(o.kind);
  if (k) {
    if (isKind(k)) o.kind = k;
    else if (KIND_ALIASES[k]) o.kind = KIND_ALIASES[k];
    else if (iconByName(k)) { o.icon = o.icon ?? k; o.kind = 'icon'; }
    else o.kind = 'box';
  }
  if (o.kind === 'icon' && !iconByName(typeof o.icon === 'string' ? o.icon : undefined)) o.kind = 'circle';
  const c = key(o.color);
  if (o.color !== undefined) o.color = c in COLORS ? c : COLOR_ALIASES[c] ?? 'blue';
  const m = key(o.motion);
  if (o.motion !== undefined) o.motion = ['spin', 'pulse', 'bob', 'sway', 'shake', 'blink', 'flow', 'orbit'].includes(m) ? m
    : m === 'rotate' ? 'spin' : m === 'bounce' || m === 'up-down' || m === 'pump' ? 'bob' : m === 'beat' ? 'pulse' : 'none';
  if (typeof o.label === 'string' && o.label.length > 48) o.label = o.label.slice(0, 47) + '…';
  if (Array.isArray(o.points) && o.points.length < 3) delete o.points;
  return o;
};

const fixDraw = (raw: unknown) => {
  if (!record(raw)) return raw;
  const p: Record<string, unknown> = {...raw};
  if (Array.isArray(p.objects) && p.shapes === undefined) { p.shapes = p.objects; delete p.objects; }
  const shapes = Array.isArray(p.shapes) ? p.shapes.map(fixShape) : p.shapes;
  const ids = new Set(Array.isArray(shapes) ? shapes.map((s) => (record(s) ? s.id : undefined)) : []);
  // a line or arrow that names a shape that does not exist is dropped (not drawn from a random point)
  const known = (v: unknown) => typeof v !== 'string' || ids.has(v);
  p.shapes = Array.isArray(shapes) ? shapes.filter((s) => !record(s) || !['line', 'arrow'].includes(String(s.kind)) || (known(s.at) && known(s.to))) : shapes;
  if (Array.isArray(p.shapes) && p.shapes.length === 0) p.shapes = shapes;
  if (Array.isArray(p.steps)) {
    p.steps = p.steps.filter(record).map((s) => {
      const o: Record<string, unknown> = {...s};
      for (const [from, to] of [['shape', 'target'], ['id', 'target'], ['object', 'target'], ['action', 'do'], ['caption', 'note'], ['text', 'note']] as const) {
        if (o[to] === undefined && o[from] !== undefined) o[to] = o[from];
        delete o[from];
      }
      const d = key(o.do);
      if (o.do !== undefined) o.do = DO_ALIASES[d.replace(/-/g, '')] ?? DO_ALIASES[d] ?? d;
      const c = key(o.color);
      if (o.color !== undefined) o.color = c in COLORS ? c : COLOR_ALIASES[c] ?? 'orange';
      return o;
    }).filter((s) => ids.has(s.target));
  }
  return p;
};

export const drawSceneSchema = z.preprocess(fixDraw, z.object({
  eyebrow: z.string().max(40).optional(),
  title: z.string().max(70).optional(),
  shapes: z.array(shapeSchema).min(1).max(30).default([
    {id: 'sun', kind: 'sun', at: [30, 26], size: 12, color: 'yellow', label: 'Sun', motion: 'spin', speed: 0.2},
    {id: 'leaf', kind: 'leaf', at: [64, 30], size: 24, color: 'green', label: 'Leaf'},
    {id: 'light', kind: 'arrow', at: 'sun', to: 'leaf', color: 'orange', label: 'Light', motion: 'flow'},
  ] as never),
  steps: z.array(stepSchema).max(16).default([]),
}).strict());

export const example = {
  eyebrow: 'Engine',
  title: 'The power stroke',
  shapes: [
    {id: 'cylinder', kind: 'cylinder', at: [50, 22], size: 22, color: 'gray', label: 'Cylinder', labelSide: 'left'},
    {id: 'piston', kind: 'piston', at: [50, 28], size: 16, color: 'purple', label: 'Piston', labelSide: 'right', motion: 'bob', amount: 5},
    {id: 'spark', kind: 'flame', at: [50, 12], size: 7, color: 'orange', label: 'Spark', labelSide: 'right', hidden: true},
    {id: 'crank', kind: 'wheel', at: [50, 46], size: 12, color: 'gray', label: 'Crankshaft', labelSide: 'right', motion: 'spin'},
    {id: 'rod', kind: 'line', at: 'piston', to: 'crank', color: 'black'},
  ],
  steps: [
    {at: 0.2, target: 'piston', do: 'focus', note: 'The piston moves up and down'},
    {at: 0.5, target: 'spark', do: 'show', note: 'A spark lights the fuel'},
    {at: 0.75, target: 'crank', do: 'focus', note: 'The crankshaft turns'},
  ],
};

export const description = 'A flat 2D diagram for subjects no other scene covers (body, plants, machines, chemistry, physics, '
  + 'nature): place ready-made parts and simple shapes on a 100 x 56 grid, label them, and animate on narration cues. '
  + 'shapes[]: {id, kind, at:[x,y] (centre; x 0-100 left to right, y 0-56 top to bottom), size, color, label}. '
  + `Parts: ${PARTS.join(', ')}. Basic: circle, box (w, h, label inside), ellipse, text, polygon (points), icon (any icon name), `
  + 'line and arrow (at and to are [x,y] or a shape id, so "at": "heart", "to": "lungs" connects them; bend curves it). '
  + 'Colours: red, orange, yellow, green, teal, blue, purple, pink, brown, gray, white, black. '
  + 'motion keeps moving: spin (gears, wheels), bob (pistons, up and down by amount), pulse (a beating heart), sway, shake, blink, '
  + 'flow (moving dashes on a line or arrow: blood, water, current), orbit (circles the shape named in around). '
  + 'hidden true or "cue" on a shape makes it appear when that word is said. '
  + 'steps[]: {cue, target, do: show | hide | focus | move (to [x,y]) | color | grow | shrink | start | stop | label, note} '
  + '(note is a short caption). Keep shapes apart, about 10 grid units between centres, and use 4 to 12 shapes.';
export const tags = ['diagram', 'draw', 'science', 'biology', 'physics', 'chemistry', 'engine', 'machine', 'body', 'heart',
  'plant', 'cell', 'atom', 'nature', 'process', '2d', 'anything'];

type Shape = z.output<typeof shapeSchema>;
type Step = z.output<typeof stepSchema>;
type Pt = [number, number];

const DEFAULT_SIZE: Partial<Record<Kind, number>> = {circle: 6, text: 2.4, icon: 6, cylinder: 18, piston: 14, atom: 14, cell: 16, heart: 12, tree: 14, house: 12, mountain: 16, wave: 16};
const sizeOf = (s: Shape) => s.size ?? DEFAULT_SIZE[s.kind] ?? 10;
/** Height of each part relative to its width (size). */
const ASPECT: Partial<Record<Kind, number>> = {cylinder: 1.4, piston: 0.75, spring: 1.6, battery: 0.5, bulb: 1.2, drop: 1.1, flame: 1.1, tree: 1.2,
  cell: 0.75, planet: 0.7, person: 1.45, house: 0.95, mountain: 0.7, wave: 0.45, leaf: 0.65, flask: 1.15, heart: 0.95, magnet: 1};
const halfSize = (s: Shape, k = 1): Pt => {
  if (s.kind === 'box' || s.kind === 'ellipse') return [(s.w ?? 16) / 2 * k, (s.h ?? (s.kind === 'box' ? 9 : 10)) / 2 * k];
  if (s.kind === 'text') return [Math.max(2, (s.label?.length ?? 4) * sizeOf(s) * 0.29) * k, sizeOf(s) * 0.6 * k];
  const z = sizeOf(s) * k;
  return [z / 2, z * (ASPECT[s.kind] ?? 1) / 2];
};

/** Text on the cream paper must stay readable: light colours (white, yellow, pastel) are darkened. */
const luminance = (color: string) => {
  const m = color.match(/[\d.]+/g);
  const [r, g, b] = color.startsWith('#') ? [1, 3, 5].map((i) => parseInt(color.slice(i, i + 2), 16)) : (m ?? []).map(Number);
  return (0.299 * r + 0.587 * g + 0.114 * b) / 255;
};
const readable = (color: string) => {
  const l = luminance(color);
  return Number.isNaN(l) || l > 0.93 ? INK : l > 0.6 ? interpolateColors(Math.min(1, (l - 0.45) * 1.6), [0, 1], [color, INK]) : color;
};
const shade = (hex: string, t: number) => interpolateColors(Math.abs(t), [0, 1], [hex, t > 0 ? '#ffffff' : '#000000']);
const ease = Easing.bezier(0.45, 0, 0.2, 1);
const LINE_KINDS = new Set<Kind>(['line', 'arrow']);
const INK = PAPER.ink;

/* ------------------------------------------------------------------ parts ------------------------------------------------------------------ */
/** Each part draws in a local box from -50 to 50 across (its height follows ASPECT), outlined in ink. */
const Part: FC<{kind: Kind; c: string; sw: number}> = ({kind, c, sw}) => {
  const ink = {stroke: INK, strokeWidth: sw, strokeLinejoin: 'round' as const, strokeLinecap: 'round' as const};
  const light = shade(c, 0.45), dark = shade(c, -0.25);
  switch (kind) {
    case 'gear': {
      const pts: string[] = [];
      for (let i = 0; i < 40; i++) { const a = (i / 40) * Math.PI * 2, r = i % 4 < 2 ? 50 : 40; pts.push(`${r * Math.cos(a)},${r * Math.sin(a)}`); }
      return <g><polygon points={pts.join(' ')} fill={c} {...ink} /><circle r={14} fill={PAPER.card} {...ink} /></g>;
    }
    case 'piston':
      return <g><rect x={-46} y={-36} width={92} height={72} rx={8} fill={c} {...ink} />
        <line x1={-46} x2={46} y1={-20} y2={-20} {...ink} /><line x1={-46} x2={46} y1={-8} y2={-8} {...ink} />
        <circle cy={14} r={9} fill={dark} {...ink} /></g>;
    case 'cylinder':
      return <g><rect x={-42} y={-66} width={84} height={136} fill={light} opacity={0.55} />
        <path d="M -42 70 L -42 -66 L 42 -66 L 42 70" fill="none" {...ink} strokeWidth={sw * 2.2} stroke={dark} /></g>;
    case 'wheel':
      return <g><circle r={50} fill={c} {...ink} /><circle r={38} fill={light} {...ink} />
        {[0, 60, 120].map((a) => <line key={a} x1={-38 * Math.cos(a * Math.PI / 180)} y1={-38 * Math.sin(a * Math.PI / 180)} x2={38 * Math.cos(a * Math.PI / 180)} y2={38 * Math.sin(a * Math.PI / 180)} {...ink} />)}
        <circle cx={30} r={7} fill={PAPER.warn} {...ink} /><circle r={8} fill={INK} /></g>;
    case 'spring': {
      const pts = Array.from({length: 13}, (_, i) => `${i === 0 || i === 12 ? 0 : i % 2 ? 32 : -32},${-80 + i * (160 / 12)}`);
      return <polyline points={pts.join(' ')} fill="none" {...ink} stroke={c} strokeWidth={sw * 2.4} />;
    }
    case 'battery':
      return <g><rect x={-46} y={-25} width={86} height={50} rx={6} fill={c} {...ink} /><rect x={40} y={-10} width={8} height={20} rx={2} fill={INK} />
        <rect x={-46} y={-25} width={30} height={50} rx={6} fill={dark} {...ink} />
        <text x={14} y={9} fontSize={26} fontWeight={800} textAnchor="middle" fill={INK} fontFamily={PAPER.sans}>+</text></g>;
    case 'bulb':
      return <g><circle cy={-16} r={40} fill={c} {...ink} /><path d="M -14 -10 L -4 6 L 4 -8 L 14 6" fill="none" {...ink} />
        <rect x={-20} y={22} width={40} height={30} rx={4} fill={PAPER.track} {...ink} /><line x1={-20} x2={20} y1={32} y2={32} {...ink} /><line x1={-20} x2={20} y1={42} y2={42} {...ink} /></g>;
    case 'magnet':
      return <g><path d="M -40 50 L -40 -5 A 40 40 0 0 1 40 -5 L 40 50 L 18 50 L 18 -5 A 18 18 0 0 0 -18 -5 L -18 50 Z" fill={c} {...ink} />
        <rect x={-40} y={30} width={22} height={20} fill={COLORS.red} {...ink} /><rect x={18} y={30} width={22} height={20} fill={COLORS.blue} {...ink} /></g>;
    case 'sun':
      return <g>{Array.from({length: 12}, (_, i) => { const a = i * Math.PI / 6; return <line key={i} x1={33 * Math.cos(a)} y1={33 * Math.sin(a)} x2={48 * Math.cos(a)} y2={48 * Math.sin(a)} stroke={c} strokeWidth={sw * 2.2} strokeLinecap="round" />; })}
        <circle r={26} fill={c} {...ink} /></g>;
    case 'cloud': {
      const puffs: [number, number, number][] = [[-26, 8, 22], [0, -8, 28], [26, 6, 22], [8, 14, 22], [-10, 14, 20]];
      return <g>{puffs.map(([x, y, r], i) => <circle key={`o${i}`} cx={x} cy={y} r={r} fill={INK} stroke={INK} strokeWidth={sw * 2} />)}
        {puffs.map(([x, y, r], i) => <circle key={i} cx={x} cy={y} r={r} fill={c} />)}</g>;
    }
    case 'drop':
      return <g><path d="M 0 -55 C 18 -26 38 -6 38 16 A 38 38 0 0 1 -38 16 C -38 -6 -18 -26 0 -55 Z" fill={c} {...ink} />
        <path d="M -20 14 A 20 20 0 0 0 -6 32" fill="none" stroke={light} strokeWidth={sw * 1.6} strokeLinecap="round" /></g>;
    case 'flame':
      return <g><path d="M 0 -55 C 24 -24 42 -2 34 24 C 28 44 12 55 0 55 C -12 55 -28 44 -34 24 C -42 -2 -12 -18 0 -55 Z" fill={c} {...ink} />
        <path d="M 0 -10 C 12 6 20 18 15 32 C 12 42 6 46 0 46 C -6 46 -12 42 -15 32 C -19 18 -6 8 0 -10 Z" fill={COLORS.yellow} /></g>;
    case 'bubble':
      return <g><circle r={46} fill={light} fillOpacity={0.55} {...ink} stroke={c} /><path d="M -26 -14 A 30 30 0 0 1 -10 -30" fill="none" stroke={PAPER.card} strokeWidth={sw * 2} strokeLinecap="round" /></g>;
    case 'leaf':
      return <g><path d="M -50 0 C -30 -40 30 -42 50 0 C 30 42 -30 40 -50 0 Z" fill={c} {...ink} />
        <path d="M -50 0 L 46 0 M -16 0 L 4 -18 M 10 0 L 26 -14 M -16 0 L 4 18 M 10 0 L 26 14" fill="none" stroke={light} strokeWidth={sw} strokeLinecap="round" /></g>;
    case 'tree':
      return <g><rect x={-8} y={10} width={16} height={50} fill={COLORS.brown} {...ink} />
        <circle cx={-20} cy={-10} r={26} fill={INK} /><circle cx={20} cy={-10} r={26} fill={INK} /><circle cy={-32} r={28} fill={INK} />
        <circle cx={-20} cy={-10} r={26 - sw / 2} fill={c} /><circle cx={20} cy={-10} r={26 - sw / 2} fill={c} /><circle cy={-32} r={28 - sw / 2} fill={c} /></g>;
    case 'heart':
      return <g><path d="M 0 46 C -62 4 -52 -46 -24 -46 C -10 -46 0 -36 0 -28 C 0 -36 10 -46 24 -46 C 52 -46 62 4 0 46 Z" fill={c} {...ink} />
        <path d="M -30 -26 A 14 14 0 0 1 -16 -36" fill="none" stroke={light} strokeWidth={sw * 1.6} strokeLinecap="round" /></g>;
    case 'cell':
      return <g><ellipse rx={50} ry={37} fill={light} {...ink} /><circle cx={8} cy={-4} r={13} fill={c} {...ink} /><circle cx={6} cy={-6} r={4} fill={dark} />
        <ellipse cx={-26} cy={12} rx={9} ry={5} fill={c} {...ink} /><ellipse cx={30} cy={16} rx={8} ry={4.5} fill={c} {...ink} /><circle cx={-20} cy={-18} r={3.5} fill={dark} /></g>;
    case 'atom':
      return <g>{[0, 60, 120].map((a) => <ellipse key={a} rx={48} ry={16} fill="none" stroke={INK} strokeWidth={sw * 0.8} transform={`rotate(${a})`} />)}
        <circle r={12} fill={c} {...ink} />{[0, 60, 120].map((a) => <circle key={`e${a}`} cx={48 * Math.cos(a * Math.PI / 180)} cy={48 * Math.sin(a * Math.PI / 180)} r={5} fill={COLORS.blue} {...ink} strokeWidth={sw * 0.7} />)}</g>;
    case 'planet':
      return <g><ellipse rx={50} ry={12} fill="none" stroke={INK} strokeWidth={sw} transform="rotate(-16)" /><circle r={30} fill={c} {...ink} />
        <path d="M -48 4 A 50 12 0 0 0 48 -24" fill="none" stroke={INK} strokeWidth={sw} transform="rotate(-2)" /></g>;
    case 'person':
      return <g><circle cy={-52} r={18} fill={shade(COLORS.orange, 0.35)} {...ink} /><path d="M -30 72 L -30 -10 A 30 26 0 0 1 30 -10 L 30 72 Z" fill={c} {...ink} /></g>;
    case 'house':
      return <g><rect x={-38} y={-6} width={76} height={54} fill={c} {...ink} /><path d="M -48 -4 L 0 -48 L 48 -4 Z" fill={dark} {...ink} />
        <rect x={-10} y={18} width={20} height={30} fill={PAPER.card} {...ink} /></g>;
    case 'mountain':
      return <g><path d="M -50 35 L -14 -30 L 14 10 L 26 -6 L 50 35 Z" fill={c} {...ink} /><path d="M -24 -12 L -14 -30 L -4 -12 L -10 -8 L -14 -14 L -19 -8 Z" fill={PAPER.card} /></g>;
    case 'wave': {
      const d = Array.from({length: 41}, (_, i) => `${i ? 'L' : 'M'} ${-50 + i * 2.5} ${-16 * Math.sin((i / 40) * Math.PI * 4)}`).join(' ');
      return <path d={d} fill="none" stroke={c} strokeWidth={sw * 2.4} strokeLinecap="round" />;
    }
    case 'flask':
      return <g><path d="M -12 -56 L -12 -16 L -44 46 Q -46 54 -38 54 L 38 54 Q 46 54 44 46 L 12 -16 L 12 -56" fill={PAPER.card} {...ink} />
        <path d="M -27 14 L 27 14 L 43 47 Q 44 52 38 52 L -38 52 Q -44 52 -43 47 Z" fill={c} /><line x1={-18} x2={18} y1={-56} y2={-56} {...ink} /></g>;
    default:
      return null;
  }
};

/* ------------------------------------------------------------------ state ------------------------------------------------------------------ */
type Live = {pos: Pt; rest: Pt; color: string; scale: number; visible: number; label?: string; focus: number; moving: boolean};

const MOVE = 18, FADE = 12, FOCUS = 50;

/** Every shape's look at this frame, from its definition and the steps that have happened. */
const liveState = (shapes: Shape[], steps: (Step & {frame: number})[], frame: number, fps: number, len: number) => {
  const byId = new Map(shapes.map((s) => [s.id, s]));
  const out = new Map<string, Live>();
  const point = (v: Shape['at'], fallback: Pt): Pt => (Array.isArray(v) ? [v[0], v[1]] : fallback);
  for (const s of shapes) {
    // a shape with a "show" step (or hidden / a cue) waits for it; a hidden one without either never shows
    const showStep = steps.find((st) => st.target === s.id && st.do === 'show');
    const appear = s.appearAt !== undefined ? s.appearAt * len : showStep ? showStep.frame : s.hidden ? Infinity : 0;
    let visible = appear <= 0 ? 1 : !Number.isFinite(appear) ? 0
      : interpolate(frame, [appear, appear + FADE], [0, 1], {extrapolateLeft: 'clamp', extrapolateRight: 'clamp'});
    let pos = point(s.at, [50, 28]);
    let color: string = COLORS[s.color ?? (LINE_KINDS.has(s.kind) ? 'black' : 'blue')];
    let scale = 1, focus = 0, label = s.label;
    const starts = steps.filter((st) => st.target === s.id && st.do === 'start');
    let moving = s.motion !== 'none' && starts.length === 0;
    for (const st of steps) {
      if (st.target !== s.id || st.frame > frame) continue;
      const t = ease(Math.min(1, (frame - st.frame) / MOVE));
      if (st.do === 'move' && st.to) pos = [pos[0] + (st.to[0] - pos[0]) * t, pos[1] + (st.to[1] - pos[1]) * t];
      else if (st.do === 'color' && st.color) color = interpolateColors(t, [0, 1], [color, COLORS[st.color]]);
      else if (st.do === 'grow') scale *= 1 + 0.35 * t;
      else if (st.do === 'shrink') scale *= 1 - 0.3 * t;
      else if (st.do === 'hide') visible *= 1 - Math.min(1, (frame - st.frame) / FADE);
      else if (st.do === 'label' && st.label) label = st.label;
      else if (st.do === 'start') moving = true;
      else if (st.do === 'stop') moving = false;
      if (st.do === 'focus' || st.do === 'show' || st.do === 'color' || st.do === 'label') {
        const age = frame - st.frame;
        if (age < FOCUS) focus = Math.max(focus, Math.sin(Math.PI * Math.min(1, age / FOCUS)));
      }
    }
    out.set(s.id, {pos, rest: pos, color, scale, visible, label, focus, moving});
  }
  // motions that move the centre: bob, shake, orbit (orbit after the others, around their new positions)
  const t = frame / fps;
  for (const s of shapes) {
    const live = out.get(s.id)!;
    if (!live.moving) continue;
    const w = 2 * Math.PI * s.speed * t;
    if (s.motion === 'bob') live.pos = [live.pos[0], live.pos[1] + s.amount * Math.sin(w * 0.7)];
    if (s.motion === 'shake') live.pos = [live.pos[0] + 0.35 * Math.sin(w * 6), live.pos[1]];
  }
  for (const s of shapes) {
    const live = out.get(s.id)!;
    const center = s.around ? out.get(s.around) : undefined;
    if (!live.moving || s.motion !== 'orbit' || !center || !byId.get(s.around!)) continue;
    const start = point(s.at, live.pos), origin = point(byId.get(s.around!)!.at, center.pos);
    const a = 2 * Math.PI * 0.25 * s.speed * t, dx = start[0] - origin[0], dy = start[1] - origin[1];
    live.pos = [center.pos[0] + dx * Math.cos(a) - dy * Math.sin(a), center.pos[1] + dx * Math.sin(a) + dy * Math.cos(a)];
  }
  return out;
};

/* ------------------------------------------------------------------ labels ------------------------------------------------------------------ */
type Box = {x0: number; y0: number; x1: number; y1: number};
const overlaps = (a: Box, b: Box) => a.x0 < b.x1 && b.x0 < a.x1 && a.y0 < b.y1 && b.y0 < a.y1;
const LABEL_SIZE = 2.1;
const textWidth = (text: string, size: number) => text.length * size * 0.6; // bold sans, a little generous

/** Put each outside label (shapes first, then lines at their middle) on the first side that does not cover
 *  another shape or label. */
const placeLabels = (shapes: Shape[], at: (s: Shape) => Pt, lineMid: (s: Shape) => {p: Pt; steep: boolean} | undefined) => {
  const solid = shapes.filter((s) => !LINE_KINDS.has(s.kind) && s.kind !== 'text').map((s) => {
    const [x, y] = at(s), [hw, hh] = halfSize(s);
    return {id: s.id, box: {x0: x - hw, y0: y - hh, x1: x + hw, y1: y + hh}};
  });
  const taken: Box[] = [];
  const placed = new Map<string, {x: number; y: number; anchor: 'start' | 'middle' | 'end'}>();
  const wanted = [...shapes.filter((s) => !LINE_KINDS.has(s.kind)), ...shapes.filter((s) => LINE_KINDS.has(s.kind))];
  for (const s of wanted) {
    if (!s.label || s.kind === 'text' || s.kind === 'box' || s.labelSide === 'center') continue;
    const line = LINE_KINDS.has(s.kind) ? lineMid(s) : undefined;
    if (LINE_KINDS.has(s.kind) && !line) continue;
    const [x, y] = line ? line.p : at(s), [hw, hh] = line ? [0.8, 0.6] : halfSize(s);
    const w = textWidth(s.label, LABEL_SIZE), h = LABEL_SIZE * 1.25, gap = 1.1;
    const sides = {
      below: {x, y: y + hh + gap + h * 0.8, anchor: 'middle' as const, box: {x0: x - w / 2, y0: y + hh + gap, x1: x + w / 2, y1: y + hh + gap + h}},
      above: {x, y: y - hh - gap - h * 0.2, anchor: 'middle' as const, box: {x0: x - w / 2, y0: y - hh - gap - h, x1: x + w / 2, y1: y - hh - gap}},
      right: {x: x + hw + gap, y: y + h * 0.3, anchor: 'start' as const, box: {x0: x + hw + gap, y0: y - h / 2, x1: x + hw + gap + w, y1: y + h / 2}},
      left: {x: x - hw - gap, y: y + h * 0.3, anchor: 'end' as const, box: {x0: x - hw - gap - w, y0: y - h / 2, x1: x - hw - gap, y1: y + h / 2}},
    };
    const auto = line ? (line.steep ? ['right', 'left', 'above', 'below'] : ['above', 'below', 'right', 'left']) : ['below', 'above', 'right', 'left'];
    const order = (s.labelSide === 'auto' ? auto : [s.labelSide, ...auto]) as (keyof typeof sides)[];
    const inside = (b: Box) => b.x0 >= 0.5 && b.x1 <= GRID_W - 0.5 && b.y0 >= 0.3 && b.y1 <= GRID_H - 0.3;
    const free = (b: Box) => inside(b) && !taken.some((t) => overlaps(t, b)) && !solid.some((o) => o.id !== s.id && overlaps(o.box, b));
    // a line label is extra: it is said once (not on every arrow) and dropped when there is no free room
    if (line && [...placed.keys()].some((id) => LINE_KINDS.has(shapes.find((o) => o.id === id)!.kind) && shapes.find((o) => o.id === id)!.label === s.label)) continue;
    const fits = order.find((k) => free(sides[k].box));
    if (line && !fits) continue;
    const pick = fits ?? order.find((k) => inside(sides[k].box)) ?? order[0];
    taken.push(sides[pick].box);
    placed.set(s.id, sides[pick]);
  }
  return placed;
};

const Label: FC<{x: number; y: number; anchor: 'start' | 'middle' | 'end'; size?: number; opacity: number; children: ReactNode; color?: string}> = ({x, y, anchor, size = LABEL_SIZE, opacity, children, color = INK}) => (
  <text x={x} y={y} textAnchor={anchor} fontSize={size} fontWeight={700} fontFamily={PAPER.sans} fill={color} opacity={opacity}
    stroke={PAPER.bg} strokeWidth={size * 0.28} paintOrder="stroke" strokeLinejoin="round">{children}</text>
);

/* ------------------------------------------------------------------ scene ------------------------------------------------------------------ */
export const DrawScene: FC<z.input<typeof drawSceneSchema>> = (input) => {
  const p = drawSceneSchema.parse(input);
  const frame = useCurrentFrame();
  const {fps} = useVideoConfig();
  const len = useSceneLength();
  const hasTitle = !!(p.title || p.eyebrow);
  const {s: k, x: left, y: top} = useStageBox(1600, 896, hasTitle);
  const scale = (1600 * k) / GRID_W; // px per grid unit

  // steps: missing timings spread evenly between their timed neighbours, then in time order
  const at = p.steps.map((st) => st.at);
  for (let i = 0; i < at.length;) {
    if (at[i] !== undefined) { i++; continue; }
    let j = i;
    while (j < at.length && at[j] === undefined) j++;
    const lo = i > 0 ? at[i - 1]! : 0.05, hi = j < at.length ? at[j]! : 0.95;
    for (let m = i; m < j; m++) at[m] = lo + (hi - lo) * (m - i + 1) / (j - i + 1);
    i = j;
  }
  const steps = p.steps.map((st, i) => ({...st, frame: at[i]! * len})).sort((a, b) => a.frame - b.frame);

  const live = liveState(p.shapes, steps, frame, fps, len);
  const byId = new Map(p.shapes.map((s) => [s.id, s]));
  const note = [...steps].reverse().find((st) => st.note && st.frame <= frame);
  const noteIn = note ? interpolate(frame, [note.frame, note.frame + FADE], [0, 1], {extrapolateRight: 'clamp'}) : 0;
  const t = frame / fps;

  /** A line's curve: bend from the centres, then trim each end where the curve leaves the shape it names. */
  const lineGeo = (s: Shape, where: (id: string) => Pt) => {
    const centre = (v: Shape['at'] | undefined): Pt | undefined => (v === undefined ? undefined : Array.isArray(v) ? [v[0], v[1]] : byId.get(v) ? where(v) : undefined);
    const endPoint = (v: Shape['at'] | undefined, toward: Pt): Pt => {
      if (Array.isArray(v)) return [v[0], v[1]];
      const target = typeof v === 'string' ? byId.get(v) : undefined;
      if (!target || target === s) return toward;
      const c = where(target.id), [hw, hh] = halfSize(target, live.get(target.id)!.scale);
      const dx = toward[0] - c[0], dy = toward[1] - c[1], d = Math.hypot(dx, dy) || 1;
      const r = Math.min(Math.abs(hw * d / (dx || 1e-6)), Math.abs(hh * d / (dy || 1e-6))) + 0.8;
      return [c[0] + (dx / d) * Math.min(r, d * 0.9), c[1] + (dy / d) * Math.min(r, d * 0.9)];
    };
    const a0 = centre(s.at) ?? [40, 28], b0 = centre(s.to) ?? [a0[0] + 15, a0[1]];
    const len2 = Math.hypot(b0[0] - a0[0], b0[1] - a0[1]) || 1;
    const nx = -(b0[1] - a0[1]) / len2, ny = (b0[0] - a0[0]) / len2, bend = s.bend ?? 0;
    const c: Pt = [(a0[0] + b0[0]) / 2 + nx * bend, (a0[1] + b0[1]) / 2 + ny * bend];
    const a = endPoint(s.at, c), b = s.to === undefined ? b0 : endPoint(s.to, c);
    return {a, b, c, mid: [(a[0] + 2 * c[0] + b[0]) / 4, (a[1] + 2 * c[1] + b[1]) / 4] as Pt, steep: Math.abs(ny) <= 0.5};
  };
  // labels are placed from resting positions, then ride along with motions, so they never jump sides
  const rest = (id: string) => live.get(id)!.rest;
  const labels = placeLabels(p.shapes, (s) => rest(s.id), (s) => {
    const g = lineGeo(s, rest);
    return {p: g.mid, steep: g.steep};
  });

  // lines under everything, then big shapes before small ones (an orbit ring never hides its nucleus), text on top
  const layer = (s: Shape) => (LINE_KINDS.has(s.kind) ? -1e6 : s.kind === 'text' ? 1e6 : -halfSize(s)[0] * halfSize(s)[1]);
  const drawn = [...p.shapes].sort((a, b) => layer(a) - layer(b));
  const sw = 0.28; // outline width in grid units

  return (
    <PaperStage eyebrow={p.eyebrow} title={p.title}>
      <svg style={{position: 'absolute', left, top, overflow: 'visible'}} width={GRID_W * scale} height={GRID_H * scale} viewBox={`0 0 ${GRID_W} ${GRID_H}`}>
        {drawn.map((s) => {
          const L = live.get(s.id)!;
          if (L.visible <= 0.001) return null;
          if (LINE_KINDS.has(s.kind)) {
            const {a, b, c: [cx, cy]} = lineGeo(s, (id) => live.get(id)!.pos);
            const d = `M ${a[0]} ${a[1]} Q ${cx} ${cy} ${b[0]} ${b[1]}`;
            const flow = L.moving && s.motion === 'flow';
            const dash = flow || s.dashed ? '1.4 1.1' : undefined;
            const ang = Math.atan2(b[1] - cy, b[0] - cx), head = 1.6 + sw;
            const draw = L.visible >= 1 ? 1 : L.visible;
            return (
              <g key={s.id} opacity={Math.min(1, L.visible * 1.5)}>
                <path d={d} fill="none" stroke={L.color} strokeWidth={sw * (s.kind === 'arrow' ? 2.4 : 2.0) * (1 + L.focus * 0.5)} strokeLinecap="round"
                  strokeDasharray={dash ?? '200 200'} strokeDashoffset={dash ? (flow ? -t * 4 * s.speed : 0) : 200 * (1 - draw)} pathLength={dash ? undefined : 200} />
                {s.kind === 'arrow' && draw > 0.9 ? <polygon fill={L.color}
                  points={`${b[0]},${b[1]} ${b[0] - head * Math.cos(ang - 0.45)},${b[1] - head * Math.sin(ang - 0.45)} ${b[0] - head * Math.cos(ang + 0.45)},${b[1] - head * Math.sin(ang + 0.45)}`} /> : null}
              </g>
            );
          }
          const [x, y] = L.pos, size = sizeOf(s);
          let rot = s.rotate, sc = L.scale * (0.85 + 0.15 * L.visible), op = L.visible;
          if (L.moving) {
            const w = 2 * Math.PI * s.speed * t;
            if (s.motion === 'spin') rot += 120 * s.speed * t;
            if (s.motion === 'sway') rot += 9 * Math.sin(w * 0.6);
            if (s.motion === 'pulse') sc *= 1 + 0.08 * Math.max(0, Math.sin(w * 1.2)) ** 3 * 1.6;
            if (s.motion === 'blink') op *= 0.35 + 0.65 * (Math.sin(w * 1.5) > -0.2 ? 1 : 0);
          }
          const [hw, hh] = halfSize(s);
          const glow = L.focus > 0.01 ? <ellipse cx={x} cy={y} rx={hw * sc + 1.6} ry={hh * sc + 1.6} fill="none" stroke={PAPER.glow} strokeWidth={0.7} opacity={L.focus} /> : null;
          const place = labels.get(s.id);
          const outside = place && L.label ? <Label x={place.x + x - L.rest[0]} y={place.y + y - L.rest[1]} anchor={place.anchor} opacity={op}>{L.label}</Label> : null;
          let body: ReactNode = null;
          if (s.kind === 'circle') body = <circle cx={x} cy={y} r={size / 2 * sc} fill={L.color} stroke={INK} strokeWidth={sw} strokeDasharray={s.dashed ? '1 0.8' : undefined} />;
          else if (s.kind === 'ellipse') body = <ellipse cx={x} cy={y} rx={hw * sc} ry={hh * sc} fill={L.color} stroke={INK} strokeWidth={sw} strokeDasharray={s.dashed ? '1 0.8' : undefined} />;
          else if (s.kind === 'box') {
            const fs = Math.min(2.1, (hw * 2 * 0.86) / Math.max(1, (L.label?.length ?? 1) * 0.64), hh * 1.1);
            body = <g transform={`rotate(${rot} ${x} ${y})`}>
              <rect x={x - hw * sc} y={y - hh * sc} width={hw * 2 * sc} height={hh * 2 * sc} rx={1.2} fill={L.color} stroke={INK} strokeWidth={sw} strokeDasharray={s.dashed ? '1 0.8' : undefined} />
              {L.label ? <text x={x} y={y + fs * 0.35} textAnchor="middle" fontSize={fs * sc} fontWeight={700} fontFamily={PAPER.sans} fill={s.color === 'black' || s.color === 'purple' || s.color === 'brown' ? PAPER.card : INK}>{L.label}</text> : null}
            </g>;
          } else if (s.kind === 'text') {
            body = <Label x={x} y={y + size * 0.35} anchor="middle" size={size} opacity={1} color={readable(L.color)}>{L.label ?? ''}</Label>;
          } else if (s.kind === 'polygon' && s.points) {
            const [ox, oy] = Array.isArray(s.at) ? s.at : [x, y];
            body = <polygon points={s.points.map(([px, py]) => `${px + x - ox},${py + y - oy}`).join(' ')} fill={L.color} stroke={INK} strokeWidth={sw} strokeLinejoin="round" />;
          } else if (s.kind === 'icon') {
            const I = iconByName(s.icon);
            const r = size / 2 * sc;
            body = <g><circle cx={x} cy={y} r={r} fill={PAPER.card} stroke={INK} strokeWidth={sw} />
              {I ? <I x={x - r * 0.6} y={y - r * 0.6} width={r * 1.2} height={r * 1.2} color={s.color ? L.color : INK} strokeWidth={2} /> : null}</g>;
          } else {
            const f = (size / 100) * sc;
            body = <g transform={`translate(${x} ${y}) rotate(${rot}) scale(${f})`}><Part kind={s.kind} c={L.color} sw={sw / f} /></g>;
          }
          if (s.kind === 'circle' || s.kind === 'ellipse' || s.kind === 'polygon' || s.kind === 'icon') {
            body = <g transform={rot ? `rotate(${rot} ${x} ${y})` : undefined}>{body}</g>;
          }
          const inside = L.label && s.labelSide === 'center' && s.kind !== 'box' && s.kind !== 'text'
            ? <Label x={x} y={y + LABEL_SIZE * 0.35} anchor="middle" opacity={op}>{L.label}</Label> : null;
          return <g key={s.id} opacity={op}>{glow}{body}{inside}{outside}</g>;
        })}
        {/* line labels on top of every shape, where placeLabels found room */}
        {p.shapes.filter((s) => LINE_KINDS.has(s.kind)).map((s) => {
          const L = live.get(s.id)!, place = labels.get(s.id);
          return place && L.label && L.visible > 0.001
            ? <Label key={`label-${s.id}`} x={place.x} y={place.y} anchor={place.anchor} opacity={L.visible}>{L.label}</Label> : null;
        })}
        {note?.note ? (
          <g opacity={noteIn}>
            <rect x={GRID_W / 2 - textWidth(note.note, 2.05) / 2 - 1.6} y={GRID_H - 3.6} width={textWidth(note.note, 2.05) + 3.2} height={3.4} rx={1.7} fill={PAPER.card} stroke={INK} strokeWidth={0.18} />
            <text x={GRID_W / 2} y={GRID_H - 1.3} textAnchor="middle" fontSize={1.9} fontWeight={650} fontFamily={PAPER.sans} fill={INK}>{note.note}</text>
          </g>
        ) : null}
      </svg>
    </PaperStage>
  );
};
