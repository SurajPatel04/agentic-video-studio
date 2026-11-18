/**
 * PlotScene: a live function graph in the paper style. Curves come from formulas ("a*x^2 + b") and are
 * recomputed every frame, so a step like {"do": "set", "a": 3} morphs the curve while the slider and
 * the numbers in the side panel count to the new value. Other steps trace a point along the curve
 * (its y is calculated and shown), pin points, draw a tangent (slope calculated), shade the area
 * under the curve (calculated), and zoom the view.
 */
import type {FC} from 'react';
import {interpolate, spring, useCurrentFrame, useVideoConfig} from 'remotion';
import {z} from 'zod';
import {Sfx} from '../audio';
import {PAPER} from '../iso/iso';
import {useSceneLength, useUnit} from '../theme';
import {MONO, PaperStage, clamp01, type Cue} from './paperStage';
import {FILL, NoteBar, argsOf, flexSteps, lerp, stepSchema, type Step} from './dsaKit';
import {compile, fmtNum, niceAxis, prettyExpr, substitute, timeline, tryCompile, type Compiled, type Vars} from './plotKit';

const VERBS: Record<string, string> = {
  set: 'set', change: 'set', update: 'set', param: 'set', params: 'set', adjust: 'set', slide: 'set', vary: 'set', animate: 'set', let: 'set', increase: 'set', decrease: 'set',
  trace: 'trace', move: 'trace', follow: 'trace', walk: 'trace', slidepoint: 'trace',
  mark: 'mark', point: 'mark', plot: 'mark', evaluate: 'mark', eval: 'mark', calc: 'mark', calculate: 'mark', compute: 'mark', pin: 'mark', dot: 'mark',
  tangent: 'tangent', slope: 'tangent', derivative: 'tangent', gradient: 'tangent',
  area: 'area', integral: 'area', integrate: 'area', shade: 'area', fill: 'area',
  zoom: 'zoom', range: 'zoom', view: 'zoom', window: 'zoom', pan: 'zoom',
  clear: 'clear', reset: 'clear', note: 'note', say: 'note', pause: 'note', wait: 'note',
};
const RESERVED = new Set(['do', 'note', 'line', 'args', 'curve', 'x', 'y', 'from', 'to', 'label', 'value', 'param', 'name', 'params']);
const COLORS = ['#8a6fd1', '#ff7a1a', '#3f9a57'];

const numOf = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : typeof v === 'string' && v.trim() !== '' && !Number.isNaN(Number(v)) ? Number(v) : undefined);
const pairOf = (v: unknown): [number, number] | undefined => {
  if (typeof v === 'string') v = v.split(/[\s,;]+|\.\.(?!\.)/).filter(Boolean);
  if (Array.isArray(v) && v.length === 2) { const a = numOf(v[0]), b = numOf(v[1]); if (a !== undefined && b !== undefined && a !== b) return a < b ? [a, b] : [b, a]; }
  if (v && typeof v === 'object' && !Array.isArray(v)) { const o = v as Record<string, unknown>; return pairOf([o.min ?? o.from ?? o.start, o.max ?? o.to ?? o.end]); }
  return undefined;
};

const flexPlot = (raw: unknown) => {
  if (!raw || typeof raw !== 'object') return raw;
  const r = {...(raw as Record<string, unknown>)};
  for (const k of ['expr', 'formula', 'function', 'equation', 'fn', 'f', 'curve', 'expression'])
    if (r.curves === undefined && r[k] !== undefined) { r.curves = r[k]; delete r[k]; }
  for (const k of ['functions', 'formulas', 'equations', 'lines', 'graphs'])
    if (r.curves === undefined && r[k] !== undefined) { r.curves = r[k]; delete r[k]; }
  if (typeof r.curves === 'string' || (r.curves && typeof r.curves === 'object' && !Array.isArray(r.curves))) r.curves = [r.curves];
  if (Array.isArray(r.curves)) r.curves = r.curves.map((c) => {
    if (typeof c === 'string') return {expr: c};
    if (!c || typeof c !== 'object') return c;
    const o = {...(c as Record<string, unknown>)};
    for (const k of ['formula', 'function', 'equation', 'fn', 'f', 'y', 'expression']) if (o.expr === undefined && typeof o[k] === 'string') { o.expr = o[k]; delete o[k]; }
    for (const k of ['name', 'title', 'legend']) if (o.label === undefined && typeof o[k] === 'string') { o.label = o[k]; delete o[k]; }
    if (o.style === 'dashed') { o.dashed = true; delete o.style; }
    return o;
  });
  for (const k of ['parameters', 'variables', 'vars', 'constants', 'sliders']) if (r.params === undefined && r[k] !== undefined) { r.params = r[k]; delete r[k]; }
  if (Array.isArray(r.params)) r.params = Object.fromEntries((r.params as Record<string, unknown>[]).filter((x) => x && typeof x === 'object').map((x) => [String(x.name ?? x.id ?? x.key), numOf(x.value ?? x.start ?? x.initial) ?? 1]));
  if (r.params && typeof r.params === 'object') r.params = Object.fromEntries(Object.entries(r.params as object).map(([k, v]) => [k, numOf(v) ?? v]));
  for (const k of ['xRange', 'domain', 'xrange', 'xAxis']) if (r.x === undefined && r[k] !== undefined) { r.x = r[k]; delete r[k]; }
  for (const k of ['yRange', 'range', 'yrange', 'yAxis']) if (r.y === undefined && r[k] !== undefined) { r.y = r[k]; delete r[k]; }
  if (r.x === undefined && (r.xMin !== undefined || r.xMax !== undefined)) { r.x = [r.xMin, r.xMax]; delete r.xMin; delete r.xMax; }
  if (r.y === undefined && (r.yMin !== undefined || r.yMax !== undefined)) { r.y = [r.yMin, r.yMax]; delete r.yMin; delete r.yMax; }
  for (const k of ['x', 'y'] as const) if (r[k] !== undefined) r[k] = pairOf(r[k]) ?? r[k];
  if (r.steps === undefined) for (const k of ['actions', 'animation', 'changes', 'sequence']) if (r[k] !== undefined) { r.steps = r[k]; delete r[k]; }
  if (r.steps !== undefined) r.steps = flexSteps(r.steps, VERBS, {at: 'x', point: 'x', atX: 'x', start: 'from', end: 'to', variable: 'param', parameter: 'param'});
  return r;
};

const EXAMPLE_STEPS: Step[] = [
  {do: 'set', a: 2, note: 'a = 2: the parabola gets narrower'},
  {do: 'set', a: -0.5, note: 'a below 0 flips it upside down'},
  {do: 'set', a: 1, b: -2, note: 'b moves the whole curve down'},
  {do: 'trace', x: 2, note: 'follow a point: y is calculated at every x'},
  {do: 'tangent', x: 1.5, note: 'the tangent shows the slope at x = 1.5'},
  {do: 'area', from: -1, to: 2, note: 'shaded area = the integral from -1 to 2'},
];

export const plotSceneSchema = z.preprocess(flexPlot, z.object({
  eyebrow: z.string().max(40).optional(),
  title: z.string().max(70).optional(),
  curves: z.array(z.object({
    expr: z.string().min(1).max(80),
    label: z.string().max(30).optional(),
    color: z.string().max(30).optional(),
    dashed: z.boolean().optional(),
  }).strict()).min(1).max(3).default([{expr: 'a*x^2 + b'}]),
  params: z.record(z.string(), z.number()).default({a: 1, b: 0}),
  x: z.tuple([z.number(), z.number()]).default([-3, 3]),
  y: z.tuple([z.number(), z.number()]).optional(), // default: fits every curve in every step
  xLabel: z.string().max(24).default('x'),
  yLabel: z.string().max(24).default('y'),
  steps: z.array(stepSchema).max(12).default(EXAMPLE_STEPS),
  showPanel: z.boolean().default(true),
  sound: z.boolean().default(true),
}).strict().superRefine((p, ctx) => {
  p.curves.forEach((c, i) => {
    const r = tryCompile(c.expr);
    if (typeof r === 'string') ctx.addIssue({code: 'custom', path: ['curves', i, 'expr'], message: `cannot read the formula: ${r}`});
  });
  if (p.x[0] >= p.x[1]) ctx.addIssue({code: 'custom', path: ['x'], message: 'x must be [min, max]'});
  p.steps.forEach((s, i) => {
    if (!Object.values(VERBS).includes(s.do)) ctx.addIssue({code: 'custom', path: ['steps', i, 'do'], message: 'use set, trace, mark, tangent, area, zoom, clear or note'});
    const c = numOf(s.curve);
    if (c !== undefined && (c < 0 || c >= p.curves.length)) ctx.addIssue({code: 'custom', path: ['steps', i, 'curve'], message: `curve is an index 0..${p.curves.length - 1}`});
  });
}));
type Props = z.output<typeof plotSceneSchema>;

export const description =
  'A live function graph (paper style): curves from formulas like "a*x^2 + b", "sin(k*x)", "m*x + c" are recalculated ' +
  'every frame, so "set" steps morph the curve while sliders and numbers count to the new value. Steps: set {a: 3} | ' +
  'trace {x} (dot moves along the curve, y calculated) | mark {x} (pinned point with its value) | tangent {x} (slope) | ' +
  'area {from, to} (integral) | zoom {x: [min,max], y} | clear | note. Give "curves" (1-3, use * ^ and brackets), ' +
  '"params" (starting values), "x" range. y range fits automatically. For data that changes, use LiveChartScene.';
export const tags = ['graph', 'plot', 'function', 'curve', 'formula', 'equation graph', 'parabola', 'linear', 'slope', 'tangent',
  'derivative', 'integral', 'calculus', 'algebra', 'sine', 'wave', 'exponential', 'parameter', 'math animation'];

type St = {p: Vars; trace?: {x: number; c: number; from?: number}; marks: {x: number; c: number; label?: string}[]; tan?: {x: number; c: number}; area?: {a: number; b: number; c: number}; vx: [number, number]; vy?: [number, number]};
type Micro = {kind: string; note?: string; changed?: string[]};

const sample = (cf: Compiled, vars: Vars, x0: number, x1: number, n: number) => {
  const pts: [number, number][] = [];
  for (let i = 0; i <= n; i++) { const x = x0 + ((x1 - x0) * i) / n; pts.push([x, cf.fn({...vars, x})]); }
  return pts;
};
const slopeAt = (cf: Compiled, vars: Vars, x: number) => { const h = 1e-4; return (cf.fn({...vars, x: x + h}) - cf.fn({...vars, x: x - h})) / (2 * h); };
const integrate = (cf: Compiled, vars: Vars, a: number, b: number) => {
  const n = 200, h = (b - a) / n; let s = cf.fn({...vars, x: a}) + cf.fn({...vars, x: b});
  for (let i = 1; i < n; i++) s += (i % 2 ? 4 : 2) * cf.fn({...vars, x: a + i * h});
  return (s * h) / 3;
};
/** y range that fits the curves (ignoring spikes such as tan's asymptotes). */
const fitY = (cfs: Compiled[], states: St[], vx: [number, number]): [number, number] => {
  const ys: number[] = [];
  for (const s of states) for (const cf of cfs) for (const [, y] of sample(cf, s.p, vx[0], vx[1], 80)) if (Number.isFinite(y)) ys.push(y);
  if (!ys.length) return [-1, 1];
  ys.sort((a, b) => a - b);
  let lo = ys[Math.floor(ys.length * 0.02)], hi = ys[Math.ceil(ys.length * 0.98) - 1];
  lo = Math.min(lo, 0); hi = Math.max(hi, 0); // keep the x axis in view
  const pad = (hi - lo) * 0.08 || 1;
  return [lo - pad, hi + pad];
};

export const PlotScene: FC<z.input<typeof plotSceneSchema>> = (input) => {
  const p = plotSceneSchema.parse(input) as Props;
  const f = useCurrentFrame();
  const {fps, width: W, height: H} = useVideoConfig();
  const u = useUnit();
  const len = useSceneLength();
  const cfs = p.curves.map((c) => compile(c.expr));
  const base: Vars = {...p.params};
  for (const cf of cfs) for (const v of cf.vars) if (v !== 'x' && base[v] === undefined) base[v] = 1;
  const paramNames = Object.keys(base).filter((k) => k !== 'x');

  // ---- states
  const init: St = {p: base, marks: [], vx: p.x, vy: p.y};
  const states: St[] = [init];
  const micros: Micro[] = [];
  for (const s of p.steps as Step[]) {
    const prev = states[states.length - 1];
    const n: St = {...prev, p: {...prev.p}, marks: [...prev.marks]};
    const args = argsOf(s);
    const c = Math.max(0, Math.min(cfs.length - 1, numOf(s.curve) ?? 0));
    const xv = numOf(s.x) ?? numOf(s.to) ?? numOf(args[0]);
    const m: Micro = {kind: s.do, note: s.note};
    if (s.do === 'set') {
      const changed: string[] = [];
      const put = (k: string, v: unknown) => { const val = numOf(v); if (val !== undefined && k !== 'x') { n.p[k] = val; changed.push(k); } };
      if (s.params && typeof s.params === 'object') for (const [k, v] of Object.entries(s.params as object)) put(k, v);
      if (typeof s.param === 'string' || typeof s.name === 'string') put(String(s.param ?? s.name), s.value ?? s.to);
      for (const [k, v] of Object.entries(s)) if (!RESERVED.has(k) && (paramNames.includes(k) || typeof v === 'number')) put(k, v);
      for (let i = 0; i < args.length; i++) {
        const a = args[i];
        if (typeof a === 'string' && a.includes('=')) { const [k, v] = a.split('='); put(k.trim(), v); } else if (typeof a === 'string' && numOf(args[i + 1]) !== undefined) { put(a, args[i + 1]); i++; }
      }
      m.changed = changed;
      if (!m.note && changed.length) m.note = changed.map((k) => `${k} = ${fmtNum(n.p[k])}`).join(', ');
    } else if (s.do === 'trace') {
      // a new point slides in from "from" (default: the left side of the view)
      const span = prev.vx[1] - prev.vx[0];
      n.trace = {x: xv ?? prev.vx[1] - span * 0.2, c, from: numOf(s.from) ?? (prev.trace?.c === c ? prev.trace.x : prev.vx[0] + span * 0.08)};
    } else if (s.do === 'mark') {
      const xs = Array.isArray(s.x) ? (s.x as unknown[]).map(numOf).filter((v): v is number => v !== undefined) : xv !== undefined ? [xv] : args.map(numOf).filter((v): v is number => v !== undefined);
      for (const x of xs.slice(0, 6)) n.marks.push({x, c, label: typeof s.label === 'string' ? s.label : undefined});
    } else if (s.do === 'tangent') {
      n.tan = {x: xv ?? 0, c};
    } else if (s.do === 'area') {
      const pr = pairOf(s.x) ?? pairOf([s.from ?? args[0], s.to ?? args[1]]) ?? [prev.vx[0], prev.vx[1]];
      n.area = {a: pr[0], b: pr[1], c};
    } else if (s.do === 'zoom') {
      n.vx = pairOf(s.x) ?? pairOf(args.slice(0, 2)) ?? prev.vx;
      n.vy = pairOf(s.y) ?? (p.y && !pairOf(s.x) ? p.y : undefined);
    } else if (s.do === 'clear') {
      n.marks = []; n.tan = undefined; n.area = undefined; n.trace = undefined;
    }
    micros.push(m);
    states.push(n);
  }
  // y view for every state: given, or fitted over all parameter values seen in the scene
  const fitCache = new Map<string, [number, number]>();
  for (const s of states) {
    if (s.vy) continue;
    const key = s.vx.join(',');
    if (!fitCache.has(key)) fitCache.set(key, fitY(cfs, states, s.vx));
    s.vy = fitCache.get(key);
  }

  // ---- timeline
  const {starts, dur} = timeline(micros.length, len, fps, 0.16, 1.8);
  let c = -1;
  for (let i = 0; i < starts.length; i++) if (f >= starts[i]) c = i;
  const raw = c < 0 ? 0 : clamp01((f - starts[c]) / dur);
  const k = interpolate(raw, [0, 1], [0, 1], {easing: (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2)});
  const prev = states[c < 0 ? 0 : c], next = states[c + 1] ?? prev;
  const cur = c < 0 ? undefined : micros[c];
  const vars: Vars = Object.fromEntries(paramNames.map((n) => [n, lerp(prev.p[n], next.p[n], k)]));
  const vx: [number, number] = [lerp(prev.vx[0], next.vx[0], k), lerp(prev.vx[1], next.vx[1], k)];
  const vy: [number, number] = [lerp(prev.vy![0], next.vy![0], k), lerp(prev.vy![1], next.vy![1], k)];

  // ---- layout
  const portrait = H > W;
  const hasTitle = !!(p.title || p.eyebrow);
  const panelW = p.showPanel ? (portrait ? W - 180 * u : Math.min(560 * u, W * 0.3)) : 0;
  const top = (hasTitle ? 230 : 130) * u;
  const plotBox = portrait
    ? {x: 90 * u, y: top, w: W - 180 * u, h: (H - top - 200 * u) * 0.58}
    : {x: 90 * u, y: top, w: W - 180 * u - (panelW ? panelW + 40 * u : 0), h: H - top - 170 * u};
  const panel = portrait
    ? {x: 90 * u, y: plotBox.y + plotBox.h + 30 * u, w: panelW, h: H - 200 * u - plotBox.y - plotBox.h - 30 * u}
    : {x: plotBox.x + plotBox.w + 40 * u, y: top, w: panelW, h: plotBox.h};
  const pad = {l: 84 * u, r: 30 * u, t: 26 * u, b: 64 * u};
  const area = {x: plotBox.x + pad.l, y: plotBox.y + pad.t, w: plotBox.w - pad.l - pad.r, h: plotBox.h - pad.t - pad.b};
  const sx = (x: number) => area.x + ((x - vx[0]) / (vx[1] - vx[0])) * area.w;
  const sy = (y: number) => area.y + area.h - ((y - vy[0]) / (vy[1] - vy[0])) * area.h;
  const xt = niceAxis(vx[0], vx[1], portrait ? 5 : 8), yt = niceAxis(vy[0], vy[1], 5);
  const x0 = sx(Math.max(vx[0], Math.min(vx[1], 0))), y0 = sy(Math.max(vy[0], Math.min(vy[1], 0)));

  // ---- curves
  const drawIn = (i: number) => interpolate(f, [len * 0.03 + i * fps * 0.35, len * 0.03 + i * fps * 0.35 + fps * 1.2], [0, 1], {extrapolateLeft: 'clamp', extrapolateRight: 'clamp'});
  const span = vy[1] - vy[0];
  const pathOf = (cf: Compiled, v: Vars) => {
    const pts = sample(cf, v, vx[0], vx[1], 320);
    let d = '', pen = false, lastY = 0;
    for (const [x, y] of pts) {
      const ok = Number.isFinite(y) && y > vy[0] - span * 4 && y < vy[1] + span * 4;
      if (!ok) { pen = false; continue; }
      if (pen && Math.abs(y - lastY) > span * 1.5) pen = false; // asymptote: do not join
      d += `${pen ? 'L' : 'M'}${sx(x).toFixed(1)},${sy(y).toFixed(1)}`;
      pen = true; lastY = y;
    }
    return d;
  };
  const colorOf = (i: number) => p.curves[i].color ?? COLORS[i % COLORS.length];
  const yAt = (ci: number, x: number) => cfs[ci].fn({...vars, x});

  // ---- overlays
  const appear = (has: boolean, had: boolean) => (has && had ? 1 : has ? k : had ? 1 - k : 0);
  const tr = next.trace ?? prev.trace;
  const moving = !!next.trace && next.trace !== prev.trace; // this step moves the point
  const traceX = tr ? (moving ? lerp(next.trace!.from ?? next.trace!.x, next.trace!.x, k) : tr.x) : 0;
  const traceO = next.trace ? (prev.trace ? 1 : clamp01(k * 4)) : prev.trace ? 1 - k : 0;
  const tn = next.tan ?? prev.tan;
  const tanX = tn ? (prev.tan && next.tan ? lerp(prev.tan.x, next.tan.x, k) : tn.x) : 0;
  const tanO = appear(!!next.tan, !!prev.tan);
  const ar = next.area ?? prev.area;
  const arA = ar ? (prev.area && next.area ? lerp(prev.area.a, next.area.a, k) : ar.a) : 0;
  const arB = ar ? (prev.area && next.area ? lerp(prev.area.b, next.area.b, k) : next.area && !prev.area ? lerp(ar.a, ar.b, k) : ar.b) : 0;
  const arO = next.area ? 1 : prev.area ? 1 - k : 0;
  const marks = next.marks.map((m, i) => ({...m, o: i < prev.marks.length ? 1 : k}));
  if (next.marks.length < prev.marks.length) prev.marks.forEach((m) => marks.push({...m, o: 1 - k}));

  // ---- sounds
  const cues: Cue[] = [];
  if (p.sound) micros.forEach((m, i) => {
    const at = Math.round(starts[i]);
    const sfx = ({set: 'rise', trace: 'swipe', mark: 'pop', tangent: 'blip', area: 'chime', zoom: 'whoosh', clear: 'remove'} as Record<string, string>)[m.kind];
    if (sfx) cues.push({sound: sfx, at, volume: 0.2});
  });
  const enter = spring({frame: f, fps, config: {damping: 18, stiffness: 110}});
  const note = [...micros.slice(0, c + 1)].reverse().find((m) => m.note)?.note;
  const noteK = cur?.note ? k : 1;
  const changing = new Set(cur?.kind === 'set' && raw < 1 ? cur.changed ?? [] : []);

  // slider ranges cover every value the scene uses
  const ranges = Object.fromEntries(paramNames.map((n) => {
    const vals = states.map((s) => s.p[n]);
    let lo = Math.min(...vals), hi = Math.max(...vals);
    if (hi - lo < 1e-9) { lo -= Math.abs(lo) || 1; hi += Math.abs(hi) || 1; }
    const padR = (hi - lo) * 0.15;
    return [n, [lo - padR, hi + padR]];
  })) as Record<string, [number, number]>;

  const readouts: {label: string; value: string; color: string}[] = [];
  if (tr && traceO > 0.05) readouts.push({label: `x = ${fmtNum(traceX)}`, value: `y = ${fmtNum(yAt(tr.c, traceX))}`, color: colorOf(tr.c)});
  if (tn && tanO > 0.05) readouts.push({label: `slope at x = ${fmtNum(tanX)}`, value: fmtNum(slopeAt(cfs[tn.c], vars, tanX)), color: FILL.accent});
  if (ar && arO > 0.05) readouts.push({label: `area ${fmtNum(arA)} → ${fmtNum(arB)}`, value: `≈ ${fmtNum(integrate(cfs[ar.c], vars, arA, arB))}`, color: FILL.green});
  const calcCurve = tr ? tr.c : 0;
  const calcLine = tr && traceO > 0.05 ? `${substitute(p.curves[calcCurve].expr, {...vars, x: traceX}, (n) => fmtNum(n))} = ${fmtNum(yAt(calcCurve, traceX))}` : undefined;

  const fs = Math.min(1, panel.w / (520 * u));
  return (
    <PaperStage eyebrow={p.eyebrow} title={p.title}>
      <div style={{position: 'absolute', inset: 0, opacity: enter}}>
        <NoteBar text={note} cx={plotBox.x + plotBox.w / 2} y={top - 70 * u} u={u} maxW={plotBox.w} k={noteK} />
        {/* plot card */}
        <div style={{position: 'absolute', left: plotBox.x, top: plotBox.y, width: plotBox.w, height: plotBox.h, borderRadius: 20 * u, background: PAPER.card, border: `${2.5 * u}px solid ${PAPER.ink}`, boxShadow: `0 ${8 * u}px ${18 * u}px ${PAPER.shadow}`, boxSizing: 'border-box'}} />
        <svg width={W} height={H} style={{position: 'absolute', inset: 0, overflow: 'visible'}}>
          <defs><clipPath id="plot-clip"><rect x={area.x} y={area.y} width={area.w} height={area.h} /></clipPath></defs>
          {/* grid + ticks */}
          {xt.ticks.filter((t) => t >= vx[0] - 1e-9 && t <= vx[1] + 1e-9).map((t) => (
            <g key={`x${t}`}>
              <line x1={sx(t)} x2={sx(t)} y1={area.y} y2={area.y + area.h} stroke={PAPER.track} strokeWidth={1.5 * u} />
              <text x={sx(t)} y={area.y + area.h + 30 * u} textAnchor="middle" fontSize={19 * u} fontFamily={MONO} fill={PAPER.inkSoft}>{fmtNum(t)}</text>
            </g>
          ))}
          {yt.ticks.filter((t) => t >= vy[0] - 1e-9 && t <= vy[1] + 1e-9).map((t) => (
            <g key={`y${t}`}>
              <line x1={area.x} x2={area.x + area.w} y1={sy(t)} y2={sy(t)} stroke={PAPER.track} strokeWidth={1.5 * u} />
              <text x={area.x - 12 * u} y={sy(t) + 6 * u} textAnchor="end" fontSize={19 * u} fontFamily={MONO} fill={PAPER.inkSoft}>{fmtNum(t)}</text>
            </g>
          ))}
          {/* axes through 0 */}
          <line x1={area.x} x2={area.x + area.w} y1={y0} y2={y0} stroke={PAPER.ink} strokeWidth={2.5 * u} />
          <line x1={x0} x2={x0} y1={area.y} y2={area.y + area.h} stroke={PAPER.ink} strokeWidth={2.5 * u} />
          <text x={area.x + area.w} y={area.y + area.h + 54 * u} textAnchor="end" fontSize={20 * u} fontWeight={800} fill={PAPER.ink}>{p.xLabel} →</text>
          <text x={area.x - 70 * u} y={area.y - 8 * u} fontSize={20 * u} fontWeight={800} fill={PAPER.ink}>↑ {p.yLabel}</text>
          <g clipPath="url(#plot-clip)">
            {/* area */}
            {ar && arO > 0 ? (() => {
              const a = Math.min(arA, arB), b = Math.max(arA, arB);
              const pts = sample(cfs[ar.c], vars, a, b, 120).filter(([, y]) => Number.isFinite(y));
              if (pts.length < 2) return null;
              const d = `M${sx(a)},${y0} ` + pts.map(([x, y]) => `L${sx(x)},${sy(y)}`).join(' ') + ` L${sx(b)},${y0} Z`;
              return <path d={d} fill={FILL.done} opacity={0.75 * arO} stroke={FILL.green} strokeWidth={2 * u} />;
            })() : null}
            {/* curves */}
            {cfs.map((cf, i) => (
              <path key={i} d={pathOf(cf, vars)} fill="none" stroke={colorOf(i)} strokeWidth={6 * u} strokeLinecap="round" strokeLinejoin="round"
                pathLength={1} strokeDasharray={p.curves[i].dashed ? `${0.012} ${0.01}` : '1 1'} strokeDashoffset={p.curves[i].dashed ? 0 : 1 - drawIn(i)} opacity={p.curves[i].dashed ? drawIn(i) : 1} />
            ))}
            {/* tangent */}
            {tn && tanO > 0 ? (() => {
              const y = yAt(tn.c, tanX), m = slopeAt(cfs[tn.c], vars, tanX), w = (vx[1] - vx[0]) * 0.22;
              return Number.isFinite(y) && Number.isFinite(m) ? (
                <g opacity={tanO}>
                  <line x1={sx(tanX - w)} y1={sy(y - m * w)} x2={sx(tanX + w)} y2={sy(y + m * w)} stroke={FILL.accent} strokeWidth={4.5 * u} strokeLinecap="round" />
                  <circle cx={sx(tanX)} cy={sy(y)} r={9 * u} fill={FILL.accent} stroke={PAPER.ink} strokeWidth={2.5 * u} />
                </g>
              ) : null;
            })() : null}
            {/* trace guide lines */}
            {tr && traceO > 0 ? (() => {
              const y = yAt(tr.c, traceX);
              return Number.isFinite(y) ? (
                <g opacity={traceO}>
                  <line x1={sx(traceX)} x2={sx(traceX)} y1={y0} y2={sy(y)} stroke={PAPER.inkSoft} strokeWidth={2 * u} strokeDasharray={`${8 * u} ${7 * u}`} />
                  <line x1={x0} x2={sx(traceX)} y1={sy(y)} y2={sy(y)} stroke={PAPER.inkSoft} strokeWidth={2 * u} strokeDasharray={`${8 * u} ${7 * u}`} />
                </g>
              ) : null;
            })() : null}
          </g>
          {/* pinned points */}
          {marks.map((m, i) => {
            const y = yAt(m.c, m.x);
            if (!Number.isFinite(y) || y < vy[0] || y > vy[1] || m.x < vx[0] || m.x > vx[1]) return null;
            const s = 0.6 + 0.4 * m.o;
            const lbl = m.label ?? `(${fmtNum(m.x)}, ${fmtNum(y)})`;
            const right = sx(m.x) < area.x + area.w - 200 * u;
            return (
              <g key={`m${i}`} opacity={m.o}>
                <circle cx={sx(m.x)} cy={sy(y)} r={10 * u * s} fill={colorOf(m.c)} stroke={PAPER.ink} strokeWidth={2.5 * u} />
                <text x={sx(m.x) + (right ? 16 : -16) * u} y={sy(y) - 14 * u} textAnchor={right ? 'start' : 'end'} fontSize={20 * u} fontWeight={800} fontFamily={MONO} fill={PAPER.ink} stroke={PAPER.card} strokeWidth={6 * u} paintOrder="stroke">{lbl}</text>
              </g>
            );
          })}
          {/* moving point */}
          {tr && traceO > 0 ? (() => {
            const y = yAt(tr.c, traceX);
            if (!Number.isFinite(y) || y < vy[0] || y > vy[1]) return null;
            const X = sx(traceX), Y = sy(y), right = X < area.x + area.w - 230 * u;
            return (
              <g opacity={traceO}>
                <circle cx={X} cy={Y} r={18 * u} fill={colorOf(tr.c)} opacity={0.25} />
                <circle cx={X} cy={Y} r={11 * u} fill={colorOf(tr.c)} stroke={PAPER.ink} strokeWidth={3 * u} />
                <g transform={`translate(${X + (right ? 22 : -22) * u},${Y - 58 * u})`}>
                  <rect x={right ? 0 : -210 * u} y={0} width={210 * u} height={40 * u} rx={10 * u} fill={PAPER.ink} />
                  <text x={right ? 105 * u : -105 * u} y={27 * u} textAnchor="middle" fontSize={19 * u} fontWeight={800} fontFamily={MONO} fill="#fffaf1">({fmtNum(traceX)}, {fmtNum(y)})</text>
                </g>
              </g>
            );
          })() : null}
        </svg>

        {/* side panel: formulas, sliders, calculated values */}
        {p.showPanel ? (
          <div style={{position: 'absolute', left: panel.x, top: panel.y, width: panel.w, height: panel.h, display: 'flex', flexDirection: portrait ? 'row' : 'column', gap: 20 * u, flexWrap: 'wrap', alignContent: 'flex-start'}}>
            <div style={{width: portrait ? panel.w / 2 - 10 * u : '100%', boxSizing: 'border-box', padding: `${18 * u}px ${22 * u}px`, borderRadius: 18 * u, background: '#e9e2f7', border: `${2.5 * u}px solid ${PAPER.ink}`}}>
              {p.curves.map((cv, i) => (
                <div key={i} style={{display: 'flex', alignItems: 'center', gap: 12 * u, marginTop: i ? 10 * u : 0}}>
                  <div style={{width: 26 * u, height: 8 * u, borderRadius: 4 * u, background: colorOf(i), flexShrink: 0}} />
                  <div style={{fontFamily: MONO, fontWeight: 800, fontSize: 27 * u * fs, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis'}}>{cv.label ?? `y = ${prettyExpr(cv.expr)}`}</div>
                </div>
              ))}
              {calcLine ? <div style={{marginTop: 12 * u, fontFamily: MONO, fontSize: 21 * u * fs, color: PAPER.inkSoft, opacity: traceO}}>y = {calcLine}</div> : null}
            </div>
            {paramNames.length ? (
              <div style={{width: portrait ? panel.w / 2 - 10 * u : '100%', boxSizing: 'border-box', padding: `${14 * u}px ${22 * u}px`, borderRadius: 18 * u, background: PAPER.card, border: `${2.5 * u}px solid ${PAPER.ink}`}}>
                {paramNames.slice(0, 4).map((n) => {
                  const [lo, hi] = ranges[n];
                  const t = clamp01((vars[n] - lo) / (hi - lo));
                  const on = changing.has(n);
                  return (
                    <div key={n} style={{display: 'flex', alignItems: 'center', gap: 14 * u, height: 54 * u}}>
                      <div style={{width: 46 * u, fontFamily: MONO, fontWeight: 800, fontSize: 26 * u, color: on ? FILL.accent : PAPER.ink}}>{n}</div>
                      <div style={{position: 'relative', flex: 1, height: 10 * u, borderRadius: 5 * u, background: PAPER.track}}>
                        <div style={{position: 'absolute', left: 0, top: 0, bottom: 0, width: `${t * 100}%`, borderRadius: 5 * u, background: on ? FILL.accent : FILL.item}} />
                        <div style={{position: 'absolute', left: `calc(${t * 100}% - ${13 * u}px)`, top: -8 * u, width: 26 * u, height: 26 * u, borderRadius: 13 * u, background: on ? FILL.accent : PAPER.card, border: `${3 * u}px solid ${PAPER.ink}`, boxSizing: 'border-box', boxShadow: on ? `0 0 0 ${6 * u}px rgba(255,122,26,0.25)` : undefined}} />
                      </div>
                      <div style={{width: 96 * u, textAlign: 'right', fontFamily: MONO, fontWeight: 800, fontSize: 25 * u, color: on ? FILL.accent : PAPER.ink}}>{fmtNum(vars[n])}</div>
                    </div>
                  );
                })}
              </div>
            ) : null}
            {readouts.map((r) => (
              <div key={r.label} style={{width: portrait ? panel.w / 2 - 10 * u : '100%', boxSizing: 'border-box', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12 * u, padding: `${12 * u}px ${20 * u}px`, borderRadius: 14 * u, background: PAPER.card, border: `${2.5 * u}px solid ${r.color}`}}>
                <div style={{fontSize: 21 * u * fs, fontWeight: 700, color: PAPER.inkSoft, fontFamily: MONO, whiteSpace: 'nowrap'}}>{r.label}</div>
                <div style={{fontSize: 27 * u * fs, fontWeight: 800, color: PAPER.ink, fontFamily: MONO, whiteSpace: 'nowrap'}}>{r.value}</div>
              </div>
            ))}
          </div>
        ) : null}
      </div>
      {cues.map((q, i) => <Sfx key={i} sound={q.sound} at={q.at} volume={q.volume} />)}
    </PaperStage>
  );
};
