/**
 * LiveChartScene: a bar / line / race chart (paper style) whose numbers change on screen. Values come
 * from data or from a formula over a range ("P*(1+r)^t" for t = 0..10). Steps change them: set a
 * parameter (every bar is recalculated and grows to its new height), set / add / scale values, append
 * or remove a bar, sort, highlight, reveal bars one by one. Numbers count while they move, the axis
 * rescales smoothly, and race bars swap places as their rank changes. A side panel shows the formula,
 * the parameters and the worked calculation, plus optional stats (total, average, max...).
 */
import type {FC} from 'react';
import {spring, useCurrentFrame, useVideoConfig} from 'remotion';
import {z} from 'zod';
import {Sfx} from '../audio';
import {PAPER} from '../iso/iso';
import {useSceneLength, useUnit} from '../theme';
import {MONO, PaperStage, clamp01, flexValue, type Cue} from './paperStage';
import {FILL, NoteBar, argsOf, flexSteps, flexValues, lerp, stepSchema, type Step} from './dsaKit';
import {compile, fmtNum, niceAxis, prettyExpr, substitute, timeline, tryCompile, type Compiled, type Vars} from './plotKit';

const VERBS: Record<string, string> = {
  set: 'set', change: 'set', update: 'set', param: 'set', params: 'set', adjust: 'set', let: 'set', values: 'set', data: 'set',
  add: 'add', increase: 'add', grow: 'add', plus: 'add', inc: 'add', subtract: 'subtract', decrease: 'subtract', minus: 'subtract', reduce: 'subtract',
  scale: 'scale', multiply: 'scale', times: 'scale', double: 'scale', halve: 'halve', half: 'halve',
  append: 'append', push: 'append', insert: 'append', new: 'append',
  remove: 'remove', delete: 'remove', drop: 'remove', pop: 'remove',
  sort: 'sort', rank: 'sort', order: 'sort',
  highlight: 'highlight', focus: 'highlight', show: 'highlight', point: 'highlight', select: 'highlight', compare: 'highlight',
  reveal: 'reveal', draw: 'reveal', build: 'reveal', appear: 'reveal', count: 'reveal',
  note: 'note', say: 'note', pause: 'note', wait: 'note',
};
const KINDS = ['bar', 'line', 'race'] as const;
const STATS = ['total', 'average', 'max', 'min', 'last', 'change'] as const;
const COLORS = ['#8a6fd1', '#ff7a1a', '#3f9a57'];
const RESERVED = new Set(['do', 'note', 'line', 'args', 'label', 'labels', 'value', 'values', 'series', 'by', 'order', 'count', 'params', 'param', 'name']);

const numOf = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : typeof v === 'string' && v.trim() !== '' && !Number.isNaN(Number(v.replace(/[,$%€£₹]/g, ''))) ? Number(v.replace(/[,$%€£₹]/g, '')) : undefined);

const flexLive = (raw: unknown) => {
  if (!raw || typeof raw !== 'object') return raw;
  const r = {...(raw as Record<string, unknown>)};
  for (const k of ['type', 'chart', 'chartType', 'style']) if (r.kind === undefined && typeof r[k] === 'string') { r.kind = r[k]; delete r[k]; }
  r.kind = flexValue(r.kind, {bar: 'bar', bars: 'bar', column: 'bar', columns: 'bar', histogram: 'bar', line: 'line', lines: 'line', trend: 'line', 'line chart': 'line', area: 'line', curve: 'line',
    race: 'race', 'bar race': 'race', ranking: 'race', rank: 'race', horizontal: 'race', hbar: 'race', leaderboard: 'race', 'horizontal bar': 'race'});
  if (r.kind === undefined) delete r.kind;
  for (const k of ['expr', 'equation', 'function', 'fn']) if (r.formula === undefined && typeof r[k] === 'string') { r.formula = r[k]; delete r[k]; }
  if (r.formula && typeof r.formula === 'object') { const o = r.formula as Record<string, unknown>; r.formula = o.expr ?? o.formula; for (const k of ['var', 'from', 'to', 'step']) if (r[k] === undefined && o[k] !== undefined) r[k] = o[k]; }
  for (const k of ['variable', 'over', 'x']) if (r.var === undefined && typeof r[k] === 'string') { r.var = r[k]; delete r[k]; }
  if (Array.isArray(r.range) && r.from === undefined) { r.from = r.range[0]; r.to = r.range[1]; if (r.range[2] !== undefined) r.step = r.range[2]; delete r.range; }
  for (const k of ['parameters', 'variables', 'vars', 'constants']) if (r.params === undefined && r[k] !== undefined) { r.params = r[k]; delete r[k]; }
  if (Array.isArray(r.params)) r.params = Object.fromEntries((r.params as Record<string, unknown>[]).filter((x) => x && typeof x === 'object').map((x) => [String(x.name ?? x.id), numOf(x.value) ?? 1]));
  if (r.params && typeof r.params === 'object') r.params = Object.fromEntries(Object.entries(r.params as object).map(([k, v]) => [k, numOf(v) ?? v]));
  for (const k of ['categories', 'names', 'xLabels', 'keys']) if (r.labels === undefined && r[k] !== undefined) { r.labels = r[k]; delete r[k]; }
  // data shapes: {A: 3, B: 5} | [{label, value}] | values: [..]
  const data = r.data ?? r.items ?? r.points;
  if (data !== undefined && r.series === undefined) {
    if (Array.isArray(data) && data.every((d) => d && typeof d === 'object')) { r.labels = r.labels ?? data.map((d) => String((d as Record<string, unknown>).label ?? (d as Record<string, unknown>).name ?? '')); r.series = [{name: '', values: data.map((d) => (d as Record<string, unknown>).value)}]; }
    else if (data && typeof data === 'object' && !Array.isArray(data)) { r.labels = r.labels ?? Object.keys(data); r.series = [{name: '', values: Object.values(data)}]; }
    else if (Array.isArray(data)) r.values = data;
    delete r.data; delete r.items; delete r.points;
  }
  if (r.values !== undefined && r.series === undefined) { r.series = [{name: '', values: r.values}]; delete r.values; }
  if (typeof r.labels === 'string') r.labels = (r.labels as string).split(/\s*,\s*/);
  if (Array.isArray(r.labels)) r.labels = (r.labels as unknown[]).map(String);
  if (Array.isArray(r.series)) r.series = (r.series as unknown[]).map((s) => {
    if (Array.isArray(s)) return {values: flexValues(s)};
    if (typeof s === 'string') return {expr: s};
    if (!s || typeof s !== 'object') return s;
    const o = {...(s as Record<string, unknown>)};
    for (const k of ['data', 'y', 'points']) if (o.values === undefined && o[k] !== undefined) { o.values = o[k]; delete o[k]; }
    for (const k of ['formula', 'equation', 'fn']) if (o.expr === undefined && typeof o[k] === 'string') { o.expr = o[k]; delete o[k]; }
    for (const k of ['label', 'title']) if (o.name === undefined && typeof o[k] === 'string') { o.name = o[k]; delete o[k]; }
    if (o.values !== undefined) o.values = (flexValues(o.values) as unknown[]).map?.((v) => numOf(v) ?? v) ?? o.values;
    if (o.name === undefined) o.name = '';
    return o;
  });
  if (typeof r.stats === 'string') r.stats = [r.stats];
  if (Array.isArray(r.stats)) r.stats = (r.stats as unknown[]).map((s) => flexValue(s, {sum: 'total', total: 'total', avg: 'average', mean: 'average', average: 'average', max: 'max', highest: 'max', top: 'max', min: 'min', lowest: 'min', last: 'last', final: 'last', latest: 'last', change: 'change', growth: 'change', diff: 'change'}));
  for (const [a, b] of [['prefix', 'valuePrefix'], ['suffix', 'valueSuffix'], ['unit', 'valueSuffix'], ['currency', 'valuePrefix']] as const) if (r[b] === undefined && typeof r[a] === 'string') { r[b] = r[a]; delete r[a]; }
  if (r.steps === undefined) for (const k of ['actions', 'animation', 'changes', 'sequence']) if (r[k] !== undefined) { r.steps = r[k]; delete r[k]; }
  if (r.steps !== undefined) r.steps = flexSteps(r.steps, VERBS, {bar: 'label', item: 'label', key: 'label', category: 'label', at: 'label', amount: 'by', factor: 'by', delta: 'by', direction: 'order', n: 'count'});
  // nothing to chart: the compound-interest example
  if (r.series === undefined && r.formula === undefined && r.labels === undefined) {
    r.formula = EXAMPLE.formula; r.var ??= 't'; r.from ??= 0; r.to ??= 10;
    r.params = {...EXAMPLE.params, ...(r.params as object ?? {})};
    r.steps ??= EXAMPLE.steps; r.valuePrefix ??= '$'; r.xLabel ??= 'year'; r.stats ??= ['last', 'change'];
  }
  return r;
};

const EXAMPLE = {
  formula: 'P*(1 + r)^t', params: {P: 1000, r: 0.05},
  steps: [
    {do: 'reveal', note: 'Each year the balance grows by r'},
    {do: 'set', r: 0.1, note: 'Double the rate to 10%: every year is recalculated'},
    {do: 'highlight', label: '10', note: 'After 10 years: more than double the start'},
  ],
};

export const liveChartSceneSchema = z.preprocess(flexLive, z.object({
  eyebrow: z.string().max(40).optional(),
  title: z.string().max(70).optional(),
  kind: z.enum(KINDS).default('bar'),
  labels: z.array(z.string().max(16)).max(14).optional(), // default: the formula range, or 1..n
  series: z.array(z.object({
    name: z.string().max(24).default(''),
    values: z.array(z.number()).max(14).optional(),
    expr: z.string().max(80).optional(), // instead of values: a formula of "var" and the params
    color: z.string().max(30).optional(),
  }).strict()).max(3).optional(),
  formula: z.string().max(80).optional(), // shortcut for one series with this expr
  var: z.string().max(12).optional(), // the formula's x (default: its variable that is not a param, else "t")
  from: z.number().default(0),
  to: z.number().optional(),
  step: z.number().positive().default(1),
  params: z.record(z.string(), z.number()).default({}),
  steps: z.array(stepSchema).max(12).default([]),
  valuePrefix: z.string().max(6).default(''),
  valueSuffix: z.string().max(10).default(''),
  decimals: z.number().int().min(0).max(4).optional(),
  xLabel: z.string().max(24).optional(),
  yLabel: z.string().max(24).optional(),
  stats: z.array(z.enum(STATS)).max(4).default([]),
  showValues: z.boolean().default(true),
  showPanel: z.boolean().default(true),
  sound: z.boolean().default(true),
}).strict().superRefine((p, ctx) => {
  if (!p.series && !p.formula) ctx.addIssue({code: 'custom', path: ['series'], message: 'give "series" (or "values" / "data") or a "formula"'});
  const exprs = [p.formula, ...(p.series ?? []).map((s) => s.expr)].filter((e): e is string => !!e);
  exprs.forEach((e) => { const r = tryCompile(e); if (typeof r === 'string') ctx.addIssue({code: 'custom', path: ['formula'], message: `cannot read "${e}": ${r}`}); });
  (p.series ?? []).forEach((s, i) => {
    if (!s.values && !s.expr) ctx.addIssue({code: 'custom', path: ['series', i], message: 'give "values" or "expr"'});
    if (s.values && p.labels && s.values.length !== p.labels.length) ctx.addIssue({code: 'custom', path: ['series', i, 'values'], message: `${s.values.length} values for ${p.labels.length} labels`});
  });
  if (exprs.length) {
    const to = p.to ?? p.from + 9 * p.step;
    if ((to - p.from) / p.step > 13) ctx.addIssue({code: 'custom', path: ['to'], message: 'at most 14 points: raise "step" or narrow from..to'});
    if (to < p.from) ctx.addIssue({code: 'custom', path: ['to'], message: '"to" must be ≥ "from"'});
  }
  p.steps.forEach((s, i) => { if (!Object.values(VERBS).includes(s.do)) ctx.addIssue({code: 'custom', path: ['steps', i, 'do'], message: 'use set, add, scale, append, remove, sort, highlight, reveal or note'}); });
}));
type Props = z.output<typeof liveChartSceneSchema>;

export const description =
  'A bar / line / race chart (paper style) whose numbers change on screen. Values come from "series" data or a "formula" ' +
  'over a range ("P*(1+r)^t", var t, from 0 to 10, params {P, r}). Steps: set {r: 0.1} (every value recalculated, bars ' +
  'grow) | set {label, value} | set {values: [...]} | add {label?, by} | scale {by} | append {label, value} | remove {label} | ' +
  'sort {order} | highlight {label} | reveal {count} (bars or the line appear one by one) | note. Numbers count while they move, ' +
  'the axis rescales, race bars swap rank. The panel shows the formula, params and the worked calculation; "stats": total, average, max, min, last, change.';
export const tags = ['chart', 'live chart', 'animated chart', 'bar chart', 'line chart', 'bar race', 'ranking', 'data', 'numbers',
  'growth', 'compound interest', 'interest', 'calculation', 'formula', 'statistics', 'trend', 'population', 'finance', 'budget'];

type St = {labels: string[]; vals: Record<string, number>[]; p: Vars; shown: number; hi: string[]};
type Micro = {kind: string; note?: string; changed?: string[]};

export const LiveChartScene: FC<z.input<typeof liveChartSceneSchema>> = (input) => {
  const p = liveChartSceneSchema.parse(input) as Props;
  const f = useCurrentFrame();
  const {fps, width: W, height: H} = useVideoConfig();
  const u = useUnit();
  const len = useSceneLength();

  // ---- series and formula setup
  const series = p.series ?? [{name: '', expr: p.formula, values: undefined, color: undefined}];
  const exprs: (Compiled | undefined)[] = series.map((s) => (s.expr ?? (p.series ? undefined : p.formula) ? compile((s.expr ?? p.formula)!) : undefined));
  const anyExpr = exprs.find(Boolean);
  const base: Vars = {...p.params};
  const varName = p.var ?? anyExpr?.vars.find((v) => base[v] === undefined) ?? 't';
  for (const cf of exprs) for (const v of cf?.vars ?? []) if (v !== varName && base[v] === undefined) base[v] = 1;
  const paramNames = Object.keys(base).filter((k) => k !== varName);
  const rangeVals: number[] = [];
  if (anyExpr) { const to = p.to ?? p.from + 9 * p.step; for (let x = p.from; x <= to + p.step * 1e-6 && rangeVals.length < 14; x += p.step) rangeVals.push(Math.round(x * 1e6) / 1e6); }
  const n0 = Math.max(rangeVals.length, ...series.map((s) => s.values?.length ?? 0));
  const labels0 = p.labels ?? (rangeVals.length ? rangeVals.map((x) => fmtNum(x)) : Array.from({length: n0}, (_, i) => String(i + 1)));
  const xOf: Record<string, number> = {}; // label -> formula variable value
  labels0.forEach((l, i) => { xOf[l] = rangeVals[i] ?? numOf(l) ?? i; });
  const calc = (si: number, label: string, vars: Vars) => exprs[si]!.fn({...vars, [varName]: xOf[label] ?? numOf(label) ?? 0});
  const recompute = (st: St) => { series.forEach((_, si) => { if (exprs[si]) for (const l of st.labels) st.vals[si][l] = calc(si, l, st.p); }); };

  // ---- states
  const init: St = {labels: [...labels0], vals: series.map((s) => Object.fromEntries(labels0.map((l, i) => [l, s.values?.[i] ?? 0]))), p: base, shown: labels0.length, hi: []};
  recompute(init);
  if ((p.steps as Step[]).some((s) => s.do === 'reveal')) init.shown = 0;
  const states: St[] = [init];
  const micros: Micro[] = [];
  const labelOf = (v: unknown) => (v === undefined || v === null ? undefined : String(typeof v === 'number' ? fmtNum(v) : v));
  for (const s of p.steps as Step[]) {
    const prev = states[states.length - 1];
    const n: St = {labels: [...prev.labels], vals: prev.vals.map((v) => ({...v})), p: {...prev.p}, shown: prev.shown, hi: prev.hi};
    const args = argsOf(s);
    const si = Math.max(0, Math.min(series.length - 1, numOf(s.series) ?? 0));
    const label = labelOf(s.label) ?? (typeof args[0] === 'string' && n.labels.includes(args[0]) ? args[0] : undefined);
    const targets = label !== undefined ? [label] : n.labels;
    const m: Micro = {kind: s.do, note: s.note};
    if (s.do === 'set') {
      const changed: string[] = [];
      const put = (k: string, v: unknown) => { const val = numOf(v); if (val !== undefined && paramNames.includes(k)) { n.p[k] = val; changed.push(k); } };
      if (s.params && typeof s.params === 'object') for (const [k, v] of Object.entries(s.params as object)) put(k, v);
      if (typeof s.param === 'string') put(s.param, s.value);
      for (const [k, v] of Object.entries(s)) if (!RESERVED.has(k)) put(k, v);
      for (let i = 0; i < args.length; i++) { const a = args[i]; if (typeof a === 'string' && a.includes('=')) { const [k, v] = a.split('='); put(k.trim(), v); } else if (typeof a === 'string' && paramNames.includes(a)) { put(a, args[i + 1]); i++; } }
      if (changed.length) { recompute(n); m.changed = changed; if (!m.note) m.note = changed.map((k) => `${k} = ${fmtNum(n.p[k])}`).join(', ') + ' → recalculated'; }
      const vals = flexValues(s.values);
      if (Array.isArray(vals)) vals.forEach((v, i) => { const x = numOf(v); if (x !== undefined && n.labels[i] !== undefined) n.vals[si][n.labels[i]] = x; });
      const value = numOf(s.value ?? (label !== undefined ? args[1] : undefined));
      if (label !== undefined && value !== undefined) { if (!n.labels.includes(label)) n.labels.push(label); n.vals[si][label] = value; n.hi = [label]; }
    } else if (['add', 'subtract', 'scale', 'halve'].includes(s.do)) {
      const isAdd = s.do === 'add' || s.do === 'subtract';
      let by = numOf(s.by ?? s.value ?? (label !== undefined ? args[1] : args[0]));
      if (by === undefined) by = s.do === 'scale' ? 2 : s.do === 'halve' ? 0.5 : 1;
      if (s.do === 'subtract') by = -Math.abs(by);
      for (const l of targets) n.vals[si][l] = isAdd ? (n.vals[si][l] ?? 0) + by : (n.vals[si][l] ?? 0) * by;
      if (label !== undefined) n.hi = [label];
      m.kind = isAdd ? 'add' : 'scale';
      if (!m.note) m.note = isAdd ? `${by >= 0 ? '+' : '−'}${fmtNum(Math.abs(by))} ${label !== undefined ? `to ${label}` : 'to every value'}` : `× ${fmtNum(by)} ${label !== undefined ? `for ${label}` : 'for every value'}`;
    } else if (s.do === 'append') {
      const l = label ?? labelOf(args[0]) ?? String(n.labels.length + 1);
      if (!n.labels.includes(l) && n.labels.length < 14) { n.labels.push(l); if (n.shown >= n.labels.length - 1) n.shown = n.labels.length; }
      if (xOf[l] === undefined) xOf[l] = numOf(l) ?? n.labels.length - 1;
      // one value per series: "value" for the chosen series, or "values": [..] for all; formula series calculate theirs
      const many = flexValues(s.values);
      series.forEach((_, j) => {
        const v = Array.isArray(many) ? numOf(many[j]) : j === si ? numOf(s.value ?? args[1]) : undefined;
        if (v !== undefined) n.vals[j][l] = v;
        else if (exprs[j]) n.vals[j][l] = calc(j, l, n.p);
      });
      n.hi = [l];
    } else if (s.do === 'remove') {
      if (label !== undefined) { n.labels = n.labels.filter((x) => x !== label); n.shown = Math.min(n.shown, n.labels.length); }
    } else if (s.do === 'sort') {
      const desc = !/asc|low|small|up/.test(String(s.order ?? args[0] ?? 'desc'));
      n.labels.sort((a, b) => (desc ? n.vals[si][b] - n.vals[si][a] : n.vals[si][a] - n.vals[si][b]));
      if (!m.note) m.note = desc ? 'sorted: biggest first' : 'sorted: smallest first';
    } else if (s.do === 'highlight') {
      const ls = Array.isArray(s.labels) ? (s.labels as unknown[]).map(labelOf).filter((x): x is string => !!x) : label !== undefined ? [label] : args.map(labelOf).filter((x): x is string => !!x && n.labels.includes(x));
      n.hi = ls;
    } else if (s.do === 'reveal') {
      const cnt = numOf(s.count ?? args[0]);
      n.shown = Math.min(n.labels.length, cnt !== undefined ? prev.shown + cnt : n.labels.length);
    }
    micros.push(m);
    states.push(n);
  }

  // ---- timeline: reveal steps get more time when many bars appear
  const {starts, dur: baseDur} = timeline(micros.length, len, fps, 0.08, 1.6);
  let c = -1;
  for (let i = 0; i < starts.length; i++) if (f >= starts[i]) c = i;
  const slot = starts.length > 1 ? starts[1] - starts[0] : len * 0.84;
  const durOf = (i: number) => (micros[i]?.kind === 'reveal' ? Math.max(baseDur, Math.min(slot * 0.92, (states[i + 1].shown - states[i].shown) * fps * 0.35)) : baseDur);
  const raw = c < 0 ? 0 : clamp01((f - starts[c]) / durOf(c));
  const k = raw < 0.5 ? 4 * raw ** 3 : 1 - (-2 * raw + 2) ** 3 / 2;
  const prev = states[c < 0 ? 0 : c], next = states[c + 1] ?? prev;
  const cur = c < 0 ? undefined : micros[c];
  const vars: Vars = Object.fromEntries(paramNames.map((nm) => [nm, lerp(prev.p[nm], next.p[nm], k)]));
  const enterK = clamp01(f / (fps * 1.1));
  const grow0 = 1 - (1 - enterK) ** 3; // first draw of the chart

  // every label that exists now, in a stable order (leaving ones fade out)
  const all = [...next.labels, ...prev.labels.filter((l) => !next.labels.includes(l))];
  const presence = (l: string) => (prev.labels.includes(l) && next.labels.includes(l) ? 1 : next.labels.includes(l) ? k : 1 - k);
  const valOf = (si: number, l: string) => {
    const a = prev.vals[si][l], b = next.vals[si][l];
    return a === undefined ? b ?? 0 : b === undefined ? a : lerp(a, b, k);
  };
  const has = (si: number, l: string) => prev.vals[si][l] !== undefined || next.vals[si][l] !== undefined; // a series may skip a label
  const shownL = lerp(prev.shown, next.shown, raw);
  const growOf = (l: string) => {
    const i = Math.max(next.labels.indexOf(l), prev.labels.indexOf(l));
    return clamp01(shownL - i) * presence(l) * grow0;
  };
  const visible = all.filter((l) => growOf(l) > 0 || presence(l) > 0);

  // ---- layout
  const portrait = H > W;
  const hasTitle = !!(p.title || p.eyebrow);
  const hasPanel = p.showPanel && (!!anyExpr || p.stats.length > 0);
  const panelW = hasPanel ? (portrait ? W - 180 * u : Math.min(540 * u, W * 0.3)) : 0;
  const top = (hasTitle ? 230 : 130) * u;
  const chart = portrait
    ? {x: 90 * u, y: top, w: W - 180 * u, h: (H - top - 200 * u) * (hasPanel ? 0.6 : 1)}
    : {x: 90 * u, y: top, w: W - 180 * u - (panelW ? panelW + 40 * u : 0), h: H - top - 170 * u};
  const panel = portrait ? {x: 90 * u, y: chart.y + chart.h + 30 * u, w: panelW, h: H - 200 * u - chart.y - chart.h - 30 * u} : {x: chart.x + chart.w + 40 * u, y: top, w: panelW, h: chart.h};
  const race = p.kind === 'race';
  const padL = race ? Math.min(220 * u, 30 * u + Math.max(...all.map((l) => l.length)) * 14 * u) : 96 * u;
  const area = {x: chart.x + padL, y: chart.y + (race ? 28 : 46) * u, w: chart.w - padL - (race ? 150 : 30) * u, h: chart.h - (race ? 28 + 50 : 46 + 66) * u};

  // value axis: rescales smoothly between the states' ranges
  const rangeOf = (st: St) => {
    const vs = st.labels.slice(0, Math.max(1, Math.ceil(st.shown))).flatMap((l) => st.vals.map((v) => v[l] ?? 0)).filter(Number.isFinite);
    const lo = Math.min(0, ...vs), hi = Math.max(0, ...vs);
    return niceAxis(lo, hi || 1, 5);
  };
  const ra = rangeOf(prev.shown ? prev : next), rb = rangeOf(next);
  const vmin = lerp(ra.min, rb.min, k), vmax = lerp(ra.max, rb.max, k);
  const ticks = (k < 0.5 ? ra : rb).ticks.filter((t) => t >= vmin - 1e-9 && t <= vmax + 1e-9);
  const fmtV = (v: number) => `${v < 0 ? '−' : ''}${p.valuePrefix}${fmtNum(Math.abs(v), p.decimals)}${p.valueSuffix}`;
  const vpos = (v: number) => (race ? area.x + ((v - vmin) / (vmax - vmin)) * area.w : area.y + area.h - ((v - vmin) / (vmax - vmin)) * area.h);
  const zero = vpos(Math.max(vmin, Math.min(vmax, 0)));

  // category position: lerp between the old and new order (bars slide when sorted / ranked)
  const raceOrder = (st: St) => [...st.labels].sort((a, b) => (st.vals[0][b] ?? 0) - (st.vals[0][a] ?? 0));
  const orderA = race ? raceOrder(prev) : prev.labels, orderB = race ? raceOrder(next) : next.labels;
  const nA = Math.max(1, orderA.length), nB = Math.max(1, orderB.length);
  const slotOf = (l: string) => {
    const a = orderA.indexOf(l), b = orderB.indexOf(l);
    const pa = a >= 0 ? (a + 0.5) / nA : b >= 0 ? (b + 0.5) / nB : 0.5, pb = b >= 0 ? (b + 0.5) / nB : pa;
    return lerp(pa, pb, k);
  };
  const band = (race ? area.h : area.w) / Math.max(nA, nB, 1);
  const colorOf = (si: number) => series[si].color ?? COLORS[si % COLORS.length];
  const hiOf = (l: string) => (next.hi.includes(l) ? (prev.hi.includes(l) ? 1 : k) : prev.hi.includes(l) ? 1 - k : 0);
  const dimIn = (st: St, l: string) => (st.hi.length && !st.hi.includes(l) ? 0.5 : 1); // others fade back while one is highlighted
  const dimOf = (l: string) => lerp(dimIn(prev, l), dimIn(next, l), k);

  // ---- sounds
  const cues: Cue[] = [];
  if (p.sound) micros.forEach((m, i) => {
    const at = Math.round(starts[i]);
    const sfx = ({set: 'rise', add: 'rise', scale: 'rise', append: 'pop', remove: 'remove', sort: 'swipe', highlight: 'ding', reveal: 'data'} as Record<string, string>)[m.kind];
    if (sfx) cues.push({sound: sfx, at, volume: 0.2});
    if (m.kind === 'reveal') for (let j = 1; j < Math.min(14, states[i + 1].shown - states[i].shown); j++) cues.push({sound: 'tick', at: at + Math.round((durOf(i) * j) / (states[i + 1].shown - states[i].shown)), volume: 0.12});
  });
  const enter = spring({frame: f, fps, config: {damping: 18, stiffness: 110}});
  const note = [...micros.slice(0, c + 1)].reverse().find((m) => m.note)?.note;
  const changing = new Set(cur?.kind === 'set' && raw < 1 ? cur.changed ?? [] : []);

  // worked calculation for the highlighted (or last shown) label
  const shownLabels = next.labels.slice(0, Math.max(0, Math.round(shownL)));
  const focus = next.hi.find((l) => next.labels.includes(l)) ?? shownLabels[shownLabels.length - 1];
  const fsi = exprs.findIndex(Boolean);
  const calcLine = anyExpr && focus !== undefined && fsi >= 0 ? `${varName} = ${fmtNum(xOf[focus] ?? numOf(focus) ?? 0)}:  ${substitute(series[fsi].expr ?? p.formula!, {...vars, [varName]: xOf[focus] ?? numOf(focus) ?? 0}, (x) => fmtNum(x))}` : undefined;
  const live = shownLabels.filter((l) => has(0, l)).map((l) => valOf(0, l));
  const statVal = (s: (typeof STATS)[number]) => {
    if (!live.length) return '—';
    const sum = live.reduce((a, b) => a + b, 0);
    if (s === 'total') return fmtV(sum);
    if (s === 'average') return fmtV(sum / live.length);
    if (s === 'max') return fmtV(Math.max(...live));
    if (s === 'min') return fmtV(Math.min(...live));
    if (s === 'last') return fmtV(live[live.length - 1]);
    const first = live[0], last = live[live.length - 1];
    return first ? `${last >= first ? '+' : '−'}${fmtNum(Math.abs(((last - first) / Math.abs(first)) * 100), 1)}%` : '—';
  };

  const fsz = Math.min(1, band / (90 * u));
  const fs = Math.min(1, panel.w / (520 * u));
  return (
    <PaperStage eyebrow={p.eyebrow} title={p.title}>
      <div style={{position: 'absolute', inset: 0, opacity: enter}}>
        <NoteBar text={note} cx={chart.x + chart.w / 2} y={top - 70 * u} u={u} maxW={chart.w} k={cur?.note ? k : 1} />
        <div style={{position: 'absolute', left: chart.x, top: chart.y, width: chart.w, height: chart.h, borderRadius: 20 * u, background: PAPER.card, border: `${2.5 * u}px solid ${PAPER.ink}`, boxShadow: `0 ${8 * u}px ${18 * u}px ${PAPER.shadow}`, boxSizing: 'border-box'}} />
        <svg width={W} height={H} style={{position: 'absolute', inset: 0, overflow: 'visible'}}>
          {/* grid */}
          {ticks.map((t) => race ? (
            <g key={t}><line x1={vpos(t)} x2={vpos(t)} y1={area.y} y2={area.y + area.h} stroke={PAPER.track} strokeWidth={1.5 * u} />
              <text x={vpos(t)} y={area.y + area.h + 30 * u} textAnchor="middle" fontSize={17 * u} fontFamily={MONO} fill={PAPER.inkSoft}>{fmtV(t)}</text></g>
          ) : (
            <g key={t}><line x1={area.x} x2={area.x + area.w} y1={vpos(t)} y2={vpos(t)} stroke={PAPER.track} strokeWidth={1.5 * u} />
              <text x={area.x - 12 * u} y={vpos(t) + 6 * u} textAnchor="end" fontSize={18 * u} fontFamily={MONO} fill={PAPER.inkSoft}>{fmtV(t)}</text></g>
          ))}
          {race ? <line x1={zero} x2={zero} y1={area.y} y2={area.y + area.h} stroke={PAPER.ink} strokeWidth={2.5 * u} />
            : <line x1={area.x} x2={area.x + area.w} y1={zero} y2={zero} stroke={PAPER.ink} strokeWidth={2.5 * u} />}
          {p.yLabel && !race ? <text x={area.x - 80 * u} y={area.y - 16 * u} fontSize={20 * u} fontWeight={800} fill={PAPER.ink}>↑ {p.yLabel}</text> : null}
          {p.xLabel && !race ? <text x={area.x + area.w} y={area.y + area.h + 60 * u} textAnchor="end" fontSize={20 * u} fontWeight={800} fill={PAPER.ink}>{p.xLabel} →</text> : null}

          {/* category labels */}
          {visible.map((l) => {
            const pos = slotOf(l), o = Math.min(1, presence(l)) * (growOf(l) > 0 || !race ? 1 : 0) * grow0;
            const on = hiOf(l);
            return race
              ? <text key={`c${l}`} x={area.x - 16 * u} y={area.y + pos * area.h + 8 * u} textAnchor="end" fontSize={22 * u} fontWeight={800} fill={on > 0.5 ? FILL.accent : PAPER.ink} opacity={o}>{l}</text>
              : <text key={`c${l}`} x={area.x + pos * area.w} y={area.y + area.h + 32 * u} textAnchor="middle" fontSize={Math.max(14, 20 * fsz) * u} fontWeight={on > 0.5 ? 800 : 600} fontFamily={MONO} fill={on > 0.5 ? FILL.accent : PAPER.inkSoft} opacity={o}>{l}</text>;
          })}

          {/* bars */}
          {p.kind !== 'line' ? visible.flatMap((l) => series.map((_, si) => {
            if (race && si > 0) return null;
            const g = growOf(l);
            if (g <= 0 || !has(si, l)) return null;
            const v = valOf(si, l) * g, pos = slotOf(l), on = hiOf(l);
            const ns = race ? 1 : series.length;
            const bw = band * (race ? 0.72 : 0.68) / ns;
            const off = (si - (ns - 1) / 2) * bw;
            const end = vpos(v);
            const fill = colorOf(si);
            const label = p.showValues && (g > 0.6) ? fmtV(valOf(si, l)) : '';
            if (race) {
              const y = area.y + pos * area.h - bw / 2;
              return (
                <g key={`b${l}`} opacity={dimOf(l)}>
                  <rect x={Math.min(zero, end)} y={y} width={Math.abs(end - zero)} height={bw} rx={8 * u} fill={on > 0.5 ? FILL.accent : fill} stroke={PAPER.ink} strokeWidth={2.5 * u} />
                  {label ? <text x={Math.max(zero, end) + 12 * u} y={y + bw / 2 + 8 * u} fontSize={22 * u} fontWeight={800} fontFamily={MONO} fill={PAPER.ink}>{label}</text> : null}
                </g>
              );
            }
            const x = area.x + pos * area.w + off - bw / 2;
            return (
              <g key={`b${l}-${si}`} opacity={dimOf(l)}>
                <rect x={x} y={Math.min(zero, end)} width={bw} height={Math.abs(end - zero)} rx={Math.min(8 * u, bw / 4)} fill={on > 0.5 && series.length === 1 ? FILL.accent : fill} stroke={PAPER.ink} strokeWidth={2.5 * u} />
                {label && ns === 1 ? <text x={x + bw / 2} y={(v >= 0 ? end - 10 * u : end + 24 * u)} textAnchor="middle" fontSize={Math.max(13, 19 * fsz) * u} fontWeight={800} fontFamily={MONO} fill={PAPER.ink}>{label}</text> : null}
              </g>
            );
          })) : null}

          {/* lines */}
          {p.kind === 'line' ? series.map((_, si) => {
            const order = next.labels.filter((l) => presence(l) > 0);
            const pts = order.map((l, i) => ({l, i, x: area.x + slotOf(l) * area.w, y: vpos(valOf(si, l))})).filter((pt) => has(si, pt.l));
            // the line grows point by point: "reach" = how many labels are drawn (fractional = mid-segment)
            const reach = Math.min(shownL, order.length) * grow0;
            const drawn: [number, number][] = [];
            pts.forEach((pt, j) => {
              if (j === 0) { if (reach > pt.i) drawn.push([pt.x, pt.y]); return; }
              if (reach >= pt.i + 1) drawn.push([pt.x, pt.y]);
              else if (reach > pt.i) { const a = pts[j - 1], t = reach - pt.i; drawn.push([lerp(a.x, pt.x, t), lerp(a.y, pt.y, t)]); }
            });
            const d = drawn.map(([x, y], i) => `${i ? 'L' : 'M'}${x.toFixed(1)},${y.toFixed(1)}`).join('');
            const lastI = Math.min(pts.length - 1, Math.ceil(reach) - 1);
            return (
              <g key={`s${si}`}>
                {series.length === 1 && drawn.length > 1 ? <path d={`${d}L${drawn[drawn.length - 1][0]},${zero}L${drawn[0][0]},${zero}Z`} fill={colorOf(si)} opacity={0.12} /> : null}
                <path d={d} fill="none" stroke={colorOf(si)} strokeWidth={6 * u} strokeLinejoin="round" strokeLinecap="round" />
                {pts.map((pt) => {
                  const g = clamp01((reach - pt.i) * 3);
                  if (g <= 0) return null;
                  const on = hiOf(pt.l);
                  const showLbl = p.showValues && (pts.length <= 8 || on > 0.5 || pt.i === lastI) && series.length === 1;
                  return (
                    <g key={pt.l} opacity={g}>
                      <circle cx={pt.x} cy={pt.y} r={(on > 0.5 ? 12 : 8) * u} fill={on > 0.5 ? FILL.accent : PAPER.card} stroke={colorOf(si)} strokeWidth={4 * u} />
                      {showLbl ? <text x={pt.x} y={pt.y - 20 * u} textAnchor="middle" fontSize={19 * u} fontWeight={800} fontFamily={MONO} fill={PAPER.ink} stroke={PAPER.card} strokeWidth={6 * u} paintOrder="stroke">{fmtV(valOf(si, pt.l))}</text> : null}
                    </g>
                  );
                })}
              </g>
            );
          }) : null}
        </svg>

        {/* legend for several series */}
        {series.length > 1 ? (
          <div style={{position: 'absolute', left: area.x, top: chart.y + 10 * u, display: 'flex', gap: 22 * u}}>
            {series.map((s, si) => <div key={si} style={{display: 'flex', alignItems: 'center', gap: 8 * u, fontSize: 19 * u, fontWeight: 700}}><div style={{width: 22 * u, height: 12 * u, borderRadius: 4 * u, background: colorOf(si), border: `${2 * u}px solid ${PAPER.ink}`}} />{s.name || s.expr || `series ${si + 1}`}</div>)}
          </div>
        ) : null}

        {/* side panel */}
        {hasPanel ? (
          <div style={{position: 'absolute', left: panel.x, top: panel.y, width: panel.w, display: 'flex', flexDirection: 'column', gap: 18 * u}}>
            {anyExpr ? (
              <div style={{padding: `${18 * u}px ${22 * u}px`, borderRadius: 18 * u, background: '#e9e2f7', border: `${2.5 * u}px solid ${PAPER.ink}`}}>
                <div style={{fontSize: 18 * u, fontWeight: 800, letterSpacing: 2 * u, color: FILL.purple}}>FORMULA</div>
                {series.map((s, si) => exprs[si] ? <div key={si} style={{fontFamily: MONO, fontWeight: 800, fontSize: 30 * u * fs, marginTop: 6 * u, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', color: series.length > 1 ? colorOf(si) : PAPER.ink}}>{prettyExpr(s.expr ?? p.formula!)}</div> : null)}
                {calcLine ? <div style={{marginTop: 12 * u, fontFamily: MONO, fontSize: 20 * u * fs, color: PAPER.inkSoft, lineHeight: 1.4}}>{calcLine}<br /><span style={{color: PAPER.ink, fontWeight: 800, fontSize: 26 * u * fs}}>= {fmtV(valOf(Math.max(0, fsi), focus!))}</span></div> : null}
              </div>
            ) : null}
            {anyExpr && paramNames.length ? (
              <div style={{padding: `${10 * u}px ${22 * u}px`, borderRadius: 18 * u, background: PAPER.card, border: `${2.5 * u}px solid ${PAPER.ink}`}}>
                {paramNames.slice(0, 4).map((nm) => {
                  const vs = states.map((s) => s.p[nm]);
                  let lo = Math.min(...vs), hi = Math.max(...vs);
                  if (hi - lo < 1e-9) { lo -= Math.abs(lo) || 1; hi += Math.abs(hi) || 1; }
                  const padR = (hi - lo) * 0.15, t = clamp01((vars[nm] - lo + padR) / (hi - lo + 2 * padR));
                  const on = changing.has(nm);
                  return (
                    <div key={nm} style={{display: 'flex', alignItems: 'center', gap: 14 * u, height: 52 * u}}>
                      <div style={{width: 40 * u, fontFamily: MONO, fontWeight: 800, fontSize: 25 * u, color: on ? FILL.accent : PAPER.ink}}>{nm}</div>
                      <div style={{position: 'relative', flex: 1, height: 10 * u, borderRadius: 5 * u, background: PAPER.track}}>
                        <div style={{position: 'absolute', left: 0, top: 0, bottom: 0, width: `${t * 100}%`, borderRadius: 5 * u, background: on ? FILL.accent : FILL.item}} />
                        <div style={{position: 'absolute', left: `calc(${t * 100}% - ${13 * u}px)`, top: -8 * u, width: 26 * u, height: 26 * u, borderRadius: 13 * u, background: on ? FILL.accent : PAPER.card, border: `${3 * u}px solid ${PAPER.ink}`, boxSizing: 'border-box', boxShadow: on ? `0 0 0 ${6 * u}px rgba(255,122,26,0.25)` : undefined}} />
                      </div>
                      <div style={{width: 110 * u, textAlign: 'right', fontFamily: MONO, fontWeight: 800, fontSize: 24 * u, color: on ? FILL.accent : PAPER.ink}}>{fmtNum(vars[nm])}</div>
                    </div>
                  );
                })}
              </div>
            ) : null}
            {p.stats.length ? (
              <div style={{display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 * u}}>
                {p.stats.map((s) => (
                  <div key={s} style={{padding: `${10 * u}px ${16 * u}px`, borderRadius: 14 * u, background: PAPER.card, border: `${2.5 * u}px solid ${PAPER.ink}`}}>
                    <div style={{fontSize: 17 * u, fontWeight: 800, letterSpacing: 1.5 * u, color: PAPER.inkSoft, textTransform: 'uppercase'}}>{s}</div>
                    <div style={{fontFamily: MONO, fontWeight: 800, fontSize: 28 * u * fs, whiteSpace: 'nowrap'}}>{statVal(s)}</div>
                  </div>
                ))}
              </div>
            ) : null}
          </div>
        ) : null}
      </div>
      {cues.map((q, i) => <Sfx key={i} sound={q.sound} at={q.at} volume={q.volume} />)}
    </PaperStage>
  );
};
