/**
 * ArrayScene: an array as bars or boxes, in the paper style. Give "values" and an "algorithm"
 * (bubble, selection, insertion, merge, quick, binary-search, linear-search) and every comparison and swap is
 * generated and traced, with i/j pointers, counters and the pseudocode line lighting up. Or give
 * your own "steps" (compare, swap, set, sorted, pointer, range, found, note).
 */
import type {FC} from 'react';
import {spring, useCurrentFrame, useVideoConfig} from 'remotion';
import {z} from 'zod';
import {Sfx} from '../audio';
import {PAPER} from '../iso/iso';
import {useSceneLength, useUnit} from '../theme';
import {MONO, PaperStage, flexValue, type Cue} from './paperStage';
import {CodeCard, Counters, FILL, NoteBar, PointerTag, argsOf, flexSteps, flexValues, intOf, lerp, playhead, schedule, show, stepSchema, valOf, type Step} from './dsaKit';

const ALGOS = ['none', 'bubble', 'selection', 'insertion', 'merge', 'quick', 'binary-search', 'linear-search'] as const;
const VERBS: Record<string, string> = {
  compare: 'compare', cmp: 'compare', check: 'compare', test: 'compare', look: 'compare', visit: 'compare', highlight: 'compare',
  swap: 'swap', exchange: 'swap', switch: 'swap', set: 'set', write: 'set', assign: 'set', update: 'set', put: 'set', change: 'set', shift: 'set',
  sorted: 'sorted', done: 'sorted', lock: 'sorted', mark: 'sorted', marksorted: 'sorted', final: 'sorted', place: 'sorted',
  pointer: 'pointer', point: 'pointer', move: 'pointer', pointers: 'pointer', range: 'range', window: 'range', narrow: 'range', bounds: 'range',
  found: 'found', match: 'found', hit: 'found', return: 'found', notfound: 'missing', missing: 'missing', miss: 'missing', note: 'note', say: 'note', pause: 'note', wait: 'note',
};
const ALGO_ALIASES: Record<string, string> = {merge:'merge', 'merge sort':'merge', mergesort:'merge', quick:'quick', 'quick sort':'quick', quicksort:'quick', bubble: 'bubble', 'bubble sort': 'bubble', bubblesort: 'bubble', selection: 'selection', 'selection sort': 'selection', insertion: 'insertion', 'insertion sort': 'insertion',
  binary: 'binary-search', 'binary search': 'binary-search', binarysearch: 'binary-search', bsearch: 'binary-search', linear: 'linear-search', 'linear search': 'linear-search', 'sequential search': 'linear-search', search: 'linear-search', none: 'none', manual: 'none', custom: 'none'};

const EXAMPLE = [5, 2, 8, 1, 9, 3];

const flexArray = (raw: unknown) => {
  if (!raw || typeof raw !== 'object') return raw;
  const r = {...(raw as Record<string, unknown>)};
  for (const k of ['array', 'items', 'data', 'list', 'input', 'numbers', 'elements', 'arr']) if (r.values === undefined && r[k] !== undefined) { r.values = r[k]; delete r[k]; }
  r.values = flexValues(r.values);
  for (const k of ['algo', 'sort', 'method']) if (r.algorithm === undefined && typeof r[k] === 'string') { r.algorithm = r[k]; delete r[k]; }
  r.algorithm = flexValue(r.algorithm, ALGO_ALIASES);
  for (const k of ['find', 'search', 'key', 'value']) if (r.target === undefined && (typeof r[k] === 'number' || typeof r[k] === 'string')) { r.target = r[k]; delete r[k]; }
  if (typeof r.target === 'string' && r.target.trim() !== '' && !Number.isNaN(Number(r.target))) r.target = Number(r.target);
  r.look = flexValue(r.look ?? r.style ?? r.view, {bar: 'bars', bars: 'bars', chart: 'bars', columns: 'bars', box: 'boxes', boxes: 'boxes', cells: 'boxes', cards: 'boxes', squares: 'boxes'});
  if (r.look === undefined) delete r.look;
  delete r.style; delete r.view;
  if (r.steps === undefined) for (const k of ['actions', 'operations', 'ops', 'trace']) if (r[k] !== undefined) { r.steps = r[k]; delete r[k]; }
  if (r.steps !== undefined) r.steps = flexSteps(r.steps, VERBS, {index: 'i', a: 'i', left: 'i', first: 'i', b: 'j', right: 'j', second: 'j', value: 'value', to: 'value'});
  if (typeof r.code === 'string') r.code = r.code.replace(/\n+$/, '').split('\n');
  if (r.steps === undefined && r.algorithm === undefined) r.algorithm = 'bubble';
  return r;
};

export const arraySceneSchema = z.preprocess(flexArray, z.object({
  eyebrow: z.string().max(40).optional(),
  title: z.string().max(70).optional(),
  values: z.array(z.union([z.number(), z.string().max(8)])).min(1).max(12).default(EXAMPLE),
  algorithm: z.enum(ALGOS).default('none'),
  target: z.union([z.number(), z.string().max(8)]).optional(), // for the searches
  look: z.enum(['bars', 'boxes']).optional(), // default: bars for numbers, boxes otherwise
  steps: z.array(stepSchema).max(80).default([]),
  code: z.array(z.string().max(60)).max(14).optional(), // pseudocode; steps may light up a "line"
  showCode: z.boolean().optional(),
  counters: z.boolean().default(true),
  sound: z.boolean().default(true),
}).strict().superRefine((p, ctx) => {
  if ((p.algorithm === 'binary-search' || p.algorithm === 'linear-search') && p.target === undefined) ctx.addIssue({code: 'custom', path: ['target'], message: 'a search needs "target": the value to find'});
  if (p.algorithm !== 'none' && p.algorithm !== 'linear-search' && p.values.some((v) => typeof v !== 'number')) ctx.addIssue({code: 'custom', path: ['values'], message: 'sorting and binary search need numbers'});
  if (p.algorithm === 'bubble' && p.values.length > 10) ctx.addIssue({code: 'custom', path: ['values'], message: 'bubble sort on more than 10 values is too long to watch: use 5-8 values'});
  p.steps.forEach((s, k) => {
    const n = p.values.length;
    for (const key of ['i', 'j']) { const v = intOf(s, key); if (v !== undefined && (v < 0 || v >= n)) ctx.addIssue({code: 'custom', path: ['steps', k, key], message: `index ${v} is outside the array (0..${n - 1})`}); }
    if (!Object.values(VERBS).includes(s.do)) ctx.addIssue({code: 'custom', path: ['steps', k, 'do'], message: 'use compare, swap, set, sorted, pointer, range, found, missing or note'});
  });
}));
type Props = z.output<typeof arraySceneSchema>;

export const description =
  'An array as bars or boxes (paper style). Give "values" (up to 12) and "algorithm": bubble | selection | insertion | merge | quick | ' +
  'binary-search | linear-search (+ "target") and every comparison and swap is traced automatically with i/j pointers, ' +
  'comparison/swap counters and the pseudocode line lighting up. Or give your own "steps": compare {i,j}, swap {i,j}, ' +
  'set {i,value}, sorted {i}, pointer {name,i}, range {lo,hi}, found {i}, note; every step may have a "note".';
export const tags = ['array', 'sorting', 'sort', 'bubble sort', 'selection sort', 'insertion sort', 'merge sort', 'quick sort', 'binary search', 'linear search', 'algorithm', 'dsa', 'swap', 'big o', 'complexity', 'search'];

/* ------------------------------------------------------------------ state + generators */
type Item = {id: number; v: number | string};
type St = {items: Item[]; sorted: Set<number>; found?: number; missing?: boolean; ptr: Record<string, number>; range?: [number, number]; cmp: number; swaps: number; writes: number};
type Micro = {kind: string; i?: number; j?: number; value?: number | string; note?: string; line?: number; ptr?: Record<string, number | null>; lo?: number; hi?: number; all?: boolean};

const CODE: Record<string, string[]> = {
  merge: ['split the range into two halves', 'sort each half recursively', 'compare the heads of the two runs', 'copy the smaller head to the buffer', 'write the merged run back'],
  quick: ['choose the last value as pivot', 'scan the range before the pivot', 'move values ≤ pivot to the left', 'place pivot between partitions', 'sort the partitions recursively'],
  bubble: ['for i in 0 .. n-1:', '  for j in 0 .. n-2-i:', '    if a[j] > a[j+1]:', '      swap(a[j], a[j+1])'],
  selection: ['for i in 0 .. n-1:', '  min = i', '  for j in i+1 .. n-1:', '    if a[j] < a[min]: min = j', '  swap(a[i], a[min])'],
  insertion: ['for i in 1 .. n-1:', '  j = i', '  while j > 0 and a[j-1] > a[j]:', '    swap(a[j-1], a[j])', '    j = j - 1'],
  'binary-search': ['lo, hi = 0, n-1', 'while lo <= hi:', '  mid = (lo + hi) // 2', '  if a[mid] == x: return mid', '  if a[mid] < x: lo = mid + 1', '  else: hi = mid - 1', 'return -1'],
  'linear-search': ['for i in 0 .. n-1:', '  if a[i] == x: return i', 'return -1'],
};

const generate = (algo: string, values: (number | string)[], target: number | string | undefined): {start: (number | string)[]; micros: Micro[]} => {
  const a = [...values];
  const m: Micro[] = [];
  const n = a.length;
  const sw = (i: number, j: number) => { [a[i], a[j]] = [a[j], a[i]]; };
  if (algo === 'bubble') {
    for (let i = 0; i < n - 1; i++) {
      let swapped = false;
      for (let j = 0; j < n - 1 - i; j++) {
        const big = (a[j] as number) > (a[j + 1] as number);
        m.push({kind: 'compare', i: j, j: j + 1, line: 3, ptr: {j}, note: `${a[j]} > ${a[j + 1]}? ${big ? 'yes → swap' : 'no → keep'}`});
        if (big) { m.push({kind: 'swap', i: j, j: j + 1, line: 4}); sw(j, j + 1); swapped = true; }
      }
      m.push({kind: 'sorted', i: n - 1 - i, line: 1, ptr: {j: null}, note: `${a[n - 1 - i]} is in its final place`});
      if (!swapped) { m.push({kind: 'sorted', all: true, line: 1, note: 'no swaps in a full pass → sorted, stop early'}); return {start: values, micros: m}; }
    }
    m.push({kind: 'sorted', all: true, note: 'sorted!'});
  } else if (algo === 'selection') {
    for (let i = 0; i < n - 1; i++) {
      let min = i;
      m.push({kind: 'pointer', line: 2, ptr: {i, min: i, j: null}, note: `find the smallest from index ${i}`});
      for (let j = i + 1; j < n; j++) {
        const less = (a[j] as number) < (a[min] as number);
        m.push({kind: 'compare', i: min, j, line: 4, ptr: {j}, note: `${a[j]} < ${a[min]}? ${less ? 'yes → new min' : 'no'}`});
        if (less) { min = j; m.push({kind: 'pointer', line: 4, ptr: {min}}); }
      }
      if (min !== i) { m.push({kind: 'swap', i, j: min, line: 5, note: `swap ${a[i]} and ${a[min]}`}); sw(i, min); }
      m.push({kind: 'sorted', i, line: 1, ptr: {min: null, j: null}});
    }
    m.push({kind: 'sorted', all: true, ptr: {i: null}, note: 'sorted!'});
  } else if (algo === 'insertion') {
    m.push({kind: 'sorted', i: 0, line: 1, note: 'one item is already "sorted"'});
    for (let i = 1; i < n; i++) {
      let j = i;
      m.push({kind: 'pointer', line: 2, ptr: {i, j}, note: `insert ${a[i]} into the sorted part`});
      while (j > 0) {
        const big = (a[j - 1] as number) > (a[j] as number);
        m.push({kind: 'compare', i: j - 1, j, line: 3, note: `${a[j - 1]} > ${a[j]}? ${big ? 'yes → swap left' : 'no → in place'}`});
        if (!big) break;
        m.push({kind: 'swap', i: j - 1, j, line: 4}); sw(j - 1, j); j--;
        m.push({kind: 'pointer', line: 5, ptr: {j}});
      }
      m.push({kind: 'sorted', i, line: 1});
    }
    m.push({kind: 'sorted', all: true, ptr: {i: null, j: null}, note: 'sorted!'});
  } else if (algo === 'merge') {
    function sort(lo:number, hi:number) {
      if (lo >= hi) return;
      const mid = Math.floor((lo+hi)/2);
      m.push({kind:'range',lo,hi,line:1,note:`Split indices ${lo}–${hi} after ${mid}`});
      sort(lo,mid);
      sort(mid+1,hi);
      const buffer = [];
      let left = lo, right = mid+1;
      m.push({kind:'range',lo,hi,line:2,note:'Merge the two sorted runs'});
      while (left<=mid || right<=hi) {
        if (left<=mid && right<=hi) m.push({kind:'compare',i:left,j:right,line:3});
        const takeLeft = right>hi || (left<=mid && Number(a[left])<=Number(a[right]));
        buffer.push(a[takeLeft ? left++ : right++]);
        m.push({kind:'note',line:4,note:'Buffer: '+buffer.join(', ')});
      }
      buffer.forEach((value,index) => {
        a[lo+index]=value;
        m.push({kind:'set',i:lo+index,value,line:5});
      });
    }
    sort(0,n-1);
    m.push({kind:'sorted',all:true,lo:0,hi:n-1,note:'Sorted'});
  } else if (algo === 'quick') {
    function partition(lo:number, hi:number) {
      if (lo>=hi) return;
      const pivot=Number(a[hi]);
      m.push({kind:'range',lo,hi,line:1,ptr:{pivot:hi},note:`Partition around ${pivot}`});
      let boundary=lo;
      for (let j=lo;j<hi;j++) {
        m.push({kind:'compare',i:j,j:hi,line:2});
        if (Number(a[j])<=pivot) {
          if (boundary!==j) {sw(boundary,j); m.push({kind:'swap',i:boundary,j,line:3});}
          boundary++;
        }
      }
      if (boundary!==hi) {sw(boundary,hi); m.push({kind:'swap',i:boundary,j:hi,line:4});}
      m.push({kind:'sorted',i:boundary,line:4,ptr:{pivot:null},note:`Pivot ${pivot} is in its final place`});
      partition(lo,boundary-1);
      partition(boundary+1,hi);
    }
    partition(0,n-1);
    m.push({kind:'sorted',all:true,lo:0,hi:n-1,note:'Sorted'});
  } else if (algo === 'binary-search') {
    const sorted = [...a].sort((x, y) => (x as number) - (y as number));
    let lo = 0, hi = n - 1;
    m.push({kind: 'range', lo, hi, line: 1, ptr: {lo, hi}, note: `look for ${target} in the sorted array`});
    while (lo <= hi) {
      const mid = Math.floor((lo + hi) / 2);
      m.push({kind: 'pointer', line: 3, ptr: {mid}, note: `mid = (${lo} + ${hi}) // 2 = ${mid}`});
      const v = sorted[mid] as number;
      m.push({kind: 'compare', i: mid, line: 4, note: `a[${mid}] = ${v}${v === target ? ` = ${target}` : v < (target as number) ? ` < ${target} → go right` : ` > ${target} → go left`}`});
      if (v === target) { m.push({kind: 'found', i: mid, line: 4, note: `found ${target} at index ${mid}`}); return {start: sorted, micros: m}; }
      if (v < (target as number)) lo = mid + 1; else hi = mid - 1;
      m.push({kind: 'range', lo, hi, line: v < (target as number) ? 5 : 6, ptr: {lo: Math.min(lo, n - 1), hi: Math.max(hi, 0), mid: null}, note: lo <= hi ? `half the array is gone: ${hi - lo + 1} left` : undefined});
    }
    m.push({kind: 'missing', line: 7, note: `${target} is not in the array → return -1`});
    return {start: sorted, micros: m};
  } else if (algo === 'linear-search') {
    for (let i = 0; i < n; i++) {
      const hit = String(a[i]) === String(target);
      m.push({kind: 'compare', i, line: 2, ptr: {i}, note: `a[${i}] = ${a[i]}${hit ? ' ✓' : ` ≠ ${target}`}`});
      if (hit) { m.push({kind: 'found', i, line: 2, note: `found after ${i + 1} check${i ? 's' : ''}`}); return {start: values, micros: m}; }
    }
    m.push({kind: 'missing', line: 3, note: `${target} is not here: checked all ${n} → return -1`});
  }
  return {start: values, micros: m};
};

/** User steps -> micro steps. */
const fromSteps = (steps: Step[]): Micro[] => steps.map((s) => {
  const args = argsOf(s);
  const i = intOf(s, 'i') ?? (typeof args[0] === 'number' ? args[0] : undefined);
  const j = intOf(s, 'j') ?? (typeof args[1] === 'number' ? args[1] : undefined);
  const ptr: Record<string, number | null> = {};
  if (s.pointers && typeof s.pointers === 'object') for (const [k, v] of Object.entries(s.pointers as Record<string, unknown>)) ptr[k] = typeof v === 'number' ? v : null;
  if (s.do === 'pointer' && typeof s.name === 'string' && i !== undefined) ptr[s.name] = i;
  return {kind: s.do, i, j, value: valOf(s, 'value', 'to', 'new') ?? (args[1] as number | undefined), note: s.note, line: s.line, ptr, lo: intOf(s, 'lo', 'from', 'start', 'low') ?? i, hi: intOf(s, 'hi', 'end', 'high') ?? j, all: s.all === true || (s.do === 'sorted' && i === undefined)};
});

const apply = (st: St, m: Micro): St => {
  const n: St = {...st, items: [...st.items], sorted: new Set(st.sorted), ptr: {...st.ptr}};
  for (const [k, v] of Object.entries(m.ptr ?? {})) { if (v === null) delete n.ptr[k]; else n.ptr[k] = v; }
  if (m.kind === 'compare') n.cmp++;
  if (m.kind === 'swap' && m.i !== undefined && m.j !== undefined) { [n.items[m.i], n.items[m.j]] = [n.items[m.j], n.items[m.i]]; n.swaps++; }
  if (m.kind === 'set' && m.i !== undefined && m.value !== undefined) { n.items[m.i] = {...n.items[m.i], v: m.value}; n.writes++; }
  if (m.kind === 'sorted') { if (m.all) n.items.forEach((it) => n.sorted.add(it.id)); else if (m.i !== undefined) n.sorted.add(n.items[m.i].id); }
  if ((m.kind === 'range' || (m.kind === 'sorted' && m.all)) && m.lo !== undefined && m.hi !== undefined) n.range = [m.lo, m.hi];
  if (m.kind === 'found' && m.i !== undefined) n.found = n.items[m.i].id;
  if (m.kind === 'missing') n.missing = true;
  return n;
};

export const ArrayScene: FC<z.input<typeof arraySceneSchema>> = (input) => {
  const p = arraySceneSchema.parse(input) as Props;
  const f = useCurrentFrame();
  const {fps, width: W, height: H} = useVideoConfig();
  const u = useUnit();
  const len = useSceneLength();

  const gen = p.algorithm !== 'none' && p.steps.length === 0 ? generate(p.algorithm, p.values, p.target) : {start: p.values, micros: fromSteps(p.steps)};
  const micros = gen.micros;
  const states: St[] = [{items: gen.start.map((v, id) => ({id, v})), sorted: new Set(), ptr: {}, cmp: 0, swaps: 0, writes: 0}];
  for (const m of micros) states.push(apply(states[states.length - 1], m));
  const {starts, dur} = schedule(micros.length, len, fps);
  const {c, k} = playhead(f, starts, dur);
  const prev = states[c < 0 ? 0 : c], next = states[c + 1] ?? prev;
  const cur = c < 0 ? undefined : micros[c];
  const lastNote = [...micros.slice(0, c + 1)].reverse().find((m) => m.note)?.note;
  const lastLine = [...micros.slice(0, c + 1)].reverse().find((m) => m.line)?.line;

  const n = p.values.length;
  const numeric = gen.start.every((v) => typeof v === 'number');
  const look = p.look ?? (numeric && p.algorithm !== 'binary-search' && p.algorithm !== 'linear-search' ? 'bars' : 'boxes');
  const code = p.code ?? (p.algorithm !== 'none' ? CODE[p.algorithm] : undefined);
  const showCode = (p.showCode ?? true) && !!code && W > H;

  // layout
  const top = 200 * u, bottom = H - 230 * u;
  const codeW = showCode ? Math.min(560 * u, W * 0.32) : 0;
  const left = 100 * u, right = W - 90 * u - (showCode ? codeW + 50 * u : 0);
  const cell = Math.min(150 * u, (right - left) / n);
  const itemW = cell * 0.78;
  const x0 = (left + right) / 2 - (cell * n) / 2;
  const slotX = (i: number) => x0 + cell * i + (cell - itemW) / 2;
  const nums = states.flatMap((s) => s.items.map((it) => (typeof it.v === 'number' ? Math.abs(it.v) : 0)));
  const maxV = Math.max(1, ...nums);
  const barMax = bottom - top - 190 * u;
  const baseY = look === 'bars' ? top + 90 * u + barMax : (top + bottom) / 2 + 40 * u;
  const boxH = Math.min(itemW, 130 * u);

  const posOf = (st: St, id: number) => st.items.findIndex((it) => it.id === id);
  const curIdx = (id: number) => lerp(posOf(prev, id), posOf(next, id), k);
  const hot = (id: number, which: 'i' | 'j') => cur && (cur.kind === 'compare' || cur.kind === 'swap' || cur.kind === 'set') && cur[which] !== undefined && prev.items[cur[which]!]?.id === id;

  const cues: Cue[] = [];
  if (p.sound) micros.forEach((m, i) => {
    const at = Math.round(starts[i]);
    if (m.kind === 'compare') cues.push({sound: 'tick', at, volume: 0.18});
    if (m.kind === 'swap') cues.push({sound: 'swipe', at, volume: 0.22});
    if (m.kind === 'set') cues.push({sound: 'pop', at, volume: 0.2});
    if (m.kind === 'found') cues.push({sound: 'success', at, volume: 0.3});
    if (m.kind === 'missing') cues.push({sound: 'error', at, volume: 0.22});
    if (m.kind === 'sorted' && m.all) cues.push({sound: 'chime', at, volume: 0.25});
  });
  const enter = spring({frame: f, fps, config: {damping: 16, stiffness: 110}});
  const st = k >= 0.5 ? next : prev;
  const counters: [string, string | number, string?][] = [];
  if (p.counters && micros.some((m) => m.kind === 'compare')) counters.push(['comparisons', st.cmp]);
  if (p.counters && micros.some((m) => m.kind === 'swap')) counters.push(['swaps', st.swaps]);
  if (p.counters && micros.some((m) => m.kind === 'set')) counters.push(['writes', st.writes]);
  if (p.target !== undefined && p.algorithm.includes('search')) counters.unshift(['target', String(p.target), FILL.accent]);
  const ptrNames = [...new Set(states.flatMap((s) => Object.keys(s.ptr)))];
  const ptrColor = (name: string) => ['#ff7a1a', '#8a6fd1', '#3f9a57', '#d1497a', '#3b82c4'][ptrNames.indexOf(name) % 5];

  return (
    <PaperStage eyebrow={p.eyebrow} title={p.title}>
      {counters.length ? <Counters items={counters} x={90 * u + (showCode ? codeW + 50 * u : 0)} y={(p.title ? 70 : 56) * u} u={u} /> : null}
      {/* index row */}
      {Array.from({length: n}, (_, i) => {
        const inRange = !st.range || (i >= st.range[0] && i <= st.range[1]);
        return <div key={i} style={{position: 'absolute', left: slotX(i), width: itemW, top: baseY + (look === 'bars' ? 10 : boxH / 2 + 10) * u + (look === 'bars' ? 0 : 0), textAlign: 'center', fontFamily: MONO, fontSize: 20 * u, color: PAPER.inkSoft, opacity: (inRange ? 1 : 0.35) * enter}}>{i}</div>;
      })}
      {look === 'bars' ? <div style={{position: 'absolute', left: x0 - 10 * u, width: cell * n + 20 * u, top: baseY, height: 3 * u, background: PAPER.ink, opacity: enter}} /> : null}
      {/* items */}
      {prev.items.map((it) => {
        const pi = posOf(prev, it.id), ni = posOf(next, it.id);
        const moving = pi !== ni;
        const idx = curIdx(it.id);
        const x = x0 + cell * idx + (cell - itemW) / 2;
        const arc = moving ? Math.sin(Math.PI * k) * (look === 'bars' ? 40 : 120) * u * (look === 'bars' || ni > pi ? -1 : 1) : 0;
        const v = (k >= 0.5 ? next : prev).items[ni]?.v ?? it.v;
        const inRange = !st.range || (idx >= st.range[0] - 0.01 && idx <= st.range[1] + 0.01);
        const done = st.sorted.has(it.id), found = st.found === it.id;
        const fill = found ? FILL.found : hot(it.id, 'i') || hot(it.id, 'j') ? (cur!.kind === 'swap' ? FILL.swap : cur!.kind === 'set' ? FILL.blue : FILL.compare) : done ? FILL.done : FILL.item;
        const glow = found ? 'rgba(63,154,87,0.35)' : hot(it.id, 'i') || hot(it.id, 'j') ? 'rgba(255,160,60,0.4)' : undefined;
        const h = look === 'bars' ? Math.max(36 * u, (Math.abs(typeof v === 'number' ? v : 0) / maxV) * barMax) : boxH;
        const y = look === 'bars' ? baseY - h : baseY - boxH / 2;
        const pop = cur?.kind === 'set' && hot(it.id, 'i') ? 1 + Math.sin(Math.PI * k) * 0.12 : 1;
        return (
          <div key={it.id} style={{position: 'absolute', left: x, top: y + arc, width: itemW, height: h, borderRadius: (look === 'bars' ? 12 : 18) * u, background: fill, border: `${2.5 * u}px solid ${PAPER.ink}`, boxSizing: 'border-box',
            boxShadow: glow ? `0 0 0 ${6 * u}px ${glow}` : `0 ${6 * u}px ${12 * u}px rgba(70,50,30,0.12)`, opacity: (inRange ? 1 : 0.32) * enter, transform: `scale(${pop})`,
            display: 'flex', alignItems: look === 'bars' ? 'flex-start' : 'center', justifyContent: 'center', paddingTop: look === 'bars' ? 8 * u : 0}}>
            <span style={{fontFamily: MONO, fontWeight: 800, fontSize: Math.min(look === 'bars' ? 30 * u : 44 * u, itemW * 0.38)}}>{show(v)}</span>
          </div>
        );
      })}
      {/* pointers */}
      {ptrNames.map((name) => {
        const a = prev.ptr[name], b = next.ptr[name];
        if (a === undefined && b === undefined) return null;
        const idx = a === undefined ? b! : b === undefined ? a : lerp(a, b, k);
        const op = a === undefined ? k : b === undefined ? 1 - k : 1;
        const same = ptrNames.filter((o) => o !== name && Math.round((k >= 0.5 ? next : prev).ptr[o] ?? -9) === Math.round(idx));
        const stack = same.filter((o) => ptrNames.indexOf(o) < ptrNames.indexOf(name)).length;
        return <PointerTag key={name} x={x0 + cell * idx + cell / 2} y={baseY + (look === 'bars' ? 46 : boxH / 2 + 46) * u + stack * 64 * u} label={name} u={u} color={ptrColor(name)} opacity={op * enter} />;
      })}
      {showCode && code ? <CodeCard lines={code} active={lastLine} x={W - 90 * u - codeW} y={top} w={codeW} h={Math.min(bottom - top + 60 * u, (code.length * 46 + 90) * u)} u={u} title={p.algorithm !== 'none' ? p.algorithm.replace('-', ' ') : 'code'} opacity={enter} /> : null}
      <NoteBar text={lastNote} cx={(left + right) / 2} y={top + 4 * u} u={u} maxW={right - left} />
      {cues.map((q, i) => <Sfx key={i} sound={q.sound} at={q.at} volume={q.volume} />)}
    </PaperStage>
  );
};
