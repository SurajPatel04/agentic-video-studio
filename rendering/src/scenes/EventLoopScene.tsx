/**
 * EventLoopScene: how JavaScript / Node.js runs code, in the paper style. Panels (only the ones the
 * steps use are drawn): the code with the running line, the CALL STACK (a bucket of frames with their
 * local variables), the HEAP (objects; a variable that holds "@id" draws an arrow to the object), the
 * Node / Web APIs (timers, I/O waiting in the background), the MICROTASK queue (promises), the TASK
 * queue (timers, I/O callbacks), the event loop and the console.
 *
 * Things move by id, so a callback visibly travels: stack -> APIs -> task queue -> back onto the stack.
 * Presets: "event-loop" (setTimeout vs Promise vs console.log) and "memory" (stack vs heap, GC).
 */
import type {FC} from 'react';
import {spring, useCurrentFrame, useVideoConfig} from 'remotion';
import {z} from 'zod';
import {Sfx} from '../audio';
import {PAPER} from '../iso/iso';
import {useSceneLength, useUnit} from '../theme';
import {MONO, PaperStage, clamp01, flexValue, type Cue} from './paperStage';
import {CodeCard, FILL, NoteBar, Panel, arrowHead, argsOf, flexSteps, lerp, playhead, schedule, show, stepSchema, valOf, type Step} from './dsaKit';

const VERBS: Record<string, string> = {
  call: 'call', push: 'call', invoke: 'call', enter: 'call', run: 'call', execute: 'call', function: 'call', frame: 'call',
  return: 'return', pop: 'return', exit: 'return', finish: 'return', end: 'return', leave: 'return',
  log: 'log', print: 'log', console: 'log', consolelog: 'log', output: 'log', write: 'log',
  api: 'api', settimeout: 'api', setinterval: 'api', timer: 'api', fetch: 'api', readfile: 'api', io: 'api', webapi: 'api', nodeapi: 'api', async: 'api', start: 'api', schedule: 'api', register: 'api', request: 'api', libuv: 'api',
  done: 'done', ready: 'done', complete: 'done', completed: 'done', resolve: 'done', resolved: 'done', fire: 'done', expire: 'done', timeout: 'done', finished: 'done', callbackready: 'done',
  queue: 'queue', enqueue: 'queue', then: 'micro', microtask: 'micro', promise: 'micro', nexttick: 'micro', queuemicrotask: 'micro', task: 'task', macrotask: 'task', callback: 'task', setimmediate: 'task',
  tick: 'tick', loop: 'tick', eventloop: 'tick', dequeue: 'tick', next: 'tick', pick: 'tick', take: 'tick',
  alloc: 'alloc', new: 'alloc', create: 'alloc', object: 'alloc', heap: 'alloc', allocate: 'alloc', malloc: 'alloc',
  set: 'set', var: 'set', let: 'set', const: 'set', assign: 'set', variable: 'set', local: 'set',
  free: 'free', gc: 'free', collect: 'free', garbage: 'free', garbagecollect: 'free', release: 'free', delete: 'free',
  line: 'line', highlight: 'line', note: 'note', say: 'note', wait: 'note',
};
const KINDS = ['call', 'return', 'log', 'api', 'done', 'queue', 'micro', 'task', 'tick', 'alloc', 'set', 'free', 'line', 'note'];

const PRESETS = {
  'event-loop': {
    code: ["console.log('A');", 'setTimeout(() => {', "  console.log('B');", '}, 0);', 'Promise.resolve().then(() => {', "  console.log('C');", '});', "console.log('D');"],
    steps: [
      {do: 'call', name: 'main()', note: 'the script starts: main() goes on the call stack'},
      {do: 'call', name: "log('A')", line: 1}, {do: 'log', text: 'A'}, {do: 'return'},
      {do: 'call', name: 'setTimeout(cb, 0)', line: 2}, {do: 'api', name: 'timer 0 ms', callback: "cb: log('B')", id: 'timer', note: 'setTimeout hands the timer to Node; JS does not wait'}, {do: 'return'},
      {do: 'call', name: 'Promise.then(cb)', line: 5}, {do: 'micro', name: "cb: log('C')", id: 'promise', note: 'the promise is already resolved: its callback waits in the microtask queue'}, {do: 'return'},
      {do: 'done', id: 'timer', note: '0 ms passed: the timer callback waits in the task queue'},
      {do: 'call', name: "log('D')", line: 8}, {do: 'log', text: 'D'}, {do: 'return'},
      {do: 'return', note: 'main() is done: the call stack is empty'},
      {do: 'tick', note: 'event loop: stack empty → run ALL microtasks first'}, {do: 'log', text: 'C', line: 6}, {do: 'return'},
      {do: 'tick', note: 'microtasks empty → take the next task'}, {do: 'log', text: 'B', line: 3}, {do: 'return', note: 'output: A D C B'},
    ],
  },
  memory: {
    code: ['function makeUser(name) {', '  let age = 30;', '  const user = { name, age };', '  return user;', '}', "let u = makeUser('Asha');", 'u = null;'],
    steps: [
      {do: 'call', name: 'main()', vars: {u: 'undefined'}, line: 6},
      {do: 'call', name: "makeUser('Asha')", vars: {name: "'Asha'"}, line: 1, note: 'a call gets a frame on the stack with its local variables'},
      {do: 'set', name: 'age', value: 30, line: 2, note: 'numbers and short strings live right in the frame'},
      {do: 'alloc', id: 'user', label: 'User', fields: ["name: 'Asha'", 'age: 30'], var: 'user', line: 3, note: 'objects live in the heap; the variable only holds a reference (arrow)'},
      {do: 'return', line: 4, note: 'the frame is popped: name, age, user are gone…'},
      {do: 'set', name: 'u', value: '@user', line: 6, note: '…but the object survives: u now points at it'},
      {do: 'set', name: 'u', value: 'null', line: 7, note: 'nothing points at the object any more'},
      {do: 'free', id: 'user', note: 'the garbage collector frees unreachable objects'},
    ],
  },
} as const;

const flexLoop = (raw: unknown) => {
  if (!raw || typeof raw !== 'object') return raw;
  const r = {...(raw as Record<string, unknown>)};
  r.preset = flexValue(r.preset ?? r.example, {'event loop': 'event-loop', eventloop: 'event-loop', 'event-loop': 'event-loop', async: 'event-loop', memory: 'memory', 'stack and heap': 'memory', 'stack-heap': 'memory', heap: 'memory', gc: 'memory', none: 'none'});
  if (r.preset === undefined) delete r.preset;
  delete r.example;
  r.runtime = flexValue(r.runtime ?? r.env ?? r.platform, {node: 'node', nodejs: 'node', 'node.js': 'node', server: 'node', browser: 'browser', web: 'browser', chrome: 'browser', js: 'browser', javascript: 'browser'});
  if (r.runtime === undefined) delete r.runtime;
  delete r.env; delete r.platform;
  if (typeof r.code === 'string') r.code = r.code.replace(/\n+$/, '').split('\n');
  if (r.steps === undefined) for (const k of ['actions', 'events', 'operations', 'ops', 'timeline']) if (r[k] !== undefined) { r.steps = r[k]; delete r[k]; }
  if (r.steps !== undefined) r.steps = (flexSteps(r.steps, VERBS, {label: 'name', fn: 'name', func: 'name', function: 'name', task: 'name', output: 'text', value: 'value', delay: 'ms', time: 'ms', queue: 'to', target: 'id', ref: 'id', cb: 'callback', locals: 'vars', variables: 'vars', props: 'fields', properties: 'fields'}) as Record<string, unknown>[]).map((s) => {
    if (!s || typeof s !== 'object') return s;
    const o = {...s};
    const a = argsOf(o);
    if (o.do === 'micro' || o.do === 'task') { o.to = o.do; o.do = 'queue'; }
    if (typeof o.to === 'string') o.to = /micro|promise|then|tick/i.test(o.to) ? 'micro' : 'task';
    if (o.do === 'log' && o.text === undefined && (o.name !== undefined || a[0] !== undefined)) { o.text = o.name ?? a.join(' '); delete o.name; }
    if (o.do === 'log' && o.text === undefined && o.note !== undefined && o.value !== undefined) o.text = o.value;
    if (o.name === undefined && a[0] !== undefined && o.do !== 'log') o.name = String(a[0]);
    if (typeof o.ms === 'string') o.ms = Number(String(o.ms).replace(/ms$/, '')) || 0;
    if (o.fields && !Array.isArray(o.fields) && typeof o.fields === 'object') o.fields = Object.entries(o.fields as object).map(([k, v]) => `${k}: ${typeof v === 'string' ? `'${v}'` : JSON.stringify(v)}`);
    if (Array.isArray(o.vars)) o.vars = Object.fromEntries((o.vars as unknown[]).map((v) => (typeof v === 'string' ? v.split(/\s*=\s*/) : [String(v), ''])));
    delete o.args;
    return o;
  });
  return r;
};

export const eventLoopSceneSchema = z.preprocess(flexLoop, z.object({
  eyebrow: z.string().max(40).optional(),
  title: z.string().max(70).optional(),
  preset: z.enum(['event-loop', 'memory', 'none']).optional(), // used when no steps are given (default event-loop)
  runtime: z.enum(['node', 'browser']).default('node'), // names the APIs panel "Node APIs (libuv)" or "Web APIs"
  code: z.array(z.string().max(60)).max(16).optional(),
  steps: z.array(stepSchema).max(40).optional(),
  panels: z.array(z.enum(['code', 'stack', 'heap', 'apis', 'micro', 'task', 'console'])).optional(), // force panels on
  sound: z.boolean().default(true),
}).strict().superRefine((p, ctx) => {
  (p.steps ?? []).forEach((s, i) => {
    if (!KINDS.includes(s.do)) ctx.addIssue({code: 'custom', path: ['steps', i, 'do'], message: 'use call, return, log, api, done, queue (to micro|task), tick, alloc, set, free, line, note'});
    if (s.do === 'log' && valOf(s, 'text') === undefined) ctx.addIssue({code: 'custom', path: ['steps', i, 'text'], message: 'log needs "text"'});
    if (s.line !== undefined && p.code && s.line > p.code.length) ctx.addIssue({code: 'custom', path: ['steps', i, 'line'], message: `line ${s.line} but the code has ${p.code.length} lines`});
  });
}));
type Props = z.output<typeof eventLoopSceneSchema>;
const LOG_H = 40; // console line height (design px)

export const description =
  'How JavaScript / Node.js runs code (paper style): code with the running line, the CALL STACK (frames with local vars), the ' +
  'HEAP (objects; a var with value "@id" draws an arrow to it), Node/Web APIs (timers, I/O), the MICROTASK queue (promises), ' +
  'the TASK queue, the event loop and the console. Only used panels are drawn. "steps": call {name, vars} | return | log {text} | ' +
  'api {name, callback, id} | done {id} (API finished → task queue) | queue {name, to: micro|task} | tick (event loop moves the next ' +
  'microtask, else task, onto the stack) | alloc {id, label, fields, var} | set {name, value} | free {id} | note; each may have "line". ' +
  'Presets without steps: "event-loop" (A D C B) and "memory" (stack vs heap, GC).';
export const tags = ['event loop', 'javascript', 'node', 'nodejs', 'node.js', 'async', 'await', 'promise', 'promises', 'callback', 'settimeout', 'call stack', 'stack', 'heap', 'memory', 'garbage collection', 'microtask', 'task queue', 'libuv', 'non-blocking', 'concurrency', 'reference', 'stack vs heap'];

type Frame = {id: string; label: string; vars: [string, string][]};
type Tok = {id: string; label: string; sub?: string};
type Obj = {id: string; label: string; fields: string[]};
type St = {stack: Frame[]; apis: Tok[]; micro: Tok[]; task: Tok[]; out: Tok[]; heap: Obj[]; line?: number};
type Rect = {x: number; y: number; w: number; h: number};

export const EventLoopScene: FC<z.input<typeof eventLoopSceneSchema>> = (input) => {
  const p = eventLoopSceneSchema.parse(input) as Props;
  const f = useCurrentFrame();
  const {fps, width: W, height: H} = useVideoConfig();
  const u = useUnit();
  const len = useSceneLength();
  const preset = p.steps ? undefined : PRESETS[p.preset === 'memory' ? 'memory' : 'event-loop'];
  const steps = (p.steps ?? (preset?.steps as unknown as Step[]) ?? []) as Step[];
  const code = p.code ?? (preset ? [...preset.code] : undefined);

  // replay
  let n = 0;
  const nid = (pre: string) => `${pre}${n++}`;
  const states: St[] = [{stack: [], apis: [], micro: [], task: [], out: [], heap: []}];
  const notes: (string | undefined)[] = [];
  const sounds: (string | undefined)[] = [];
  for (const s of steps) {
    const a = states[states.length - 1];
    const b: St = {stack: a.stack.map((x) => ({...x, vars: [...x.vars]})), apis: [...a.apis], micro: [...a.micro], task: [...a.task], out: [...a.out], heap: [...a.heap], line: s.line ?? a.line};
    const name = String(valOf(s, 'name') ?? '');
    let note = s.note, sound: string | undefined;
    const top = b.stack[b.stack.length - 1];
    if (s.do === 'call') {
      const vars = s.vars && typeof s.vars === 'object' ? Object.entries(s.vars as Record<string, unknown>).map(([k, v]) => [k, show(v)] as [string, string]) : [];
      b.stack.push({id: String(s.id ?? nid('f')), label: name || 'fn()', vars});
      note ??= `call ${name || 'a function'} → push a frame`; sound = 'pop';
    } else if (s.do === 'return') {
      const f0 = b.stack.pop(); note ??= f0 ? `${f0.label} returns → its frame is popped` : 'the stack is empty'; sound = 'whoosh';
    } else if (s.do === 'log') {
      b.out.push({id: nid('o'), label: show(valOf(s, 'text'))}); note ??= `console prints ${show(valOf(s, 'text'))}`; sound = 'blip';
    } else if (s.do === 'api') {
      const ms = valOf(s, 'ms');
      b.apis.push({id: String(s.id ?? s.callback ?? nid('a')), label: name || 'timer', sub: s.callback !== undefined ? String(s.callback) : ms !== undefined ? `${ms} ms` : undefined});
      note ??= `${name || 'the API'} runs in the background; JavaScript keeps going`; sound = 'data';
    } else if (s.do === 'done') {
      const key = String(s.id ?? s.name ?? s.callback ?? '');
      const i = Math.max(0, b.apis.findIndex((t) => t.id === key || t.label === key || t.sub === key));
      const t = b.apis.splice(i, 1)[0];
      if (t) { const q = s.to === 'micro' ? b.micro : b.task; q.push({id: t.id, label: t.sub ?? t.label}); note ??= `${t.label} finished → its callback joins the ${s.to === 'micro' ? 'microtask' : 'task'} queue`; }
      sound = 'ding';
    } else if (s.do === 'queue') {
      const q = s.to === 'task' ? b.task : b.micro;
      q.push({id: String(s.id ?? nid('q')), label: name || (s.callback ? String(s.callback) : 'callback')});
      note ??= `${name || 'the callback'} waits in the ${s.to === 'task' ? 'task' : 'microtask'} queue`; sound = 'drop';
    } else if (s.do === 'tick') {
      const from = s.from === 'task' ? 'task' : s.from === 'micro' ? 'micro' : b.micro.length ? 'micro' : 'task';
      const t = b[from].shift();
      if (t) { b.stack.push({id: t.id, label: t.label, vars: []}); note ??= `event loop: the stack is empty → run ${t.label} from the ${from === 'micro' ? 'microtask' : 'task'} queue`; }
      else note ??= 'event loop: nothing to do, wait';
      sound = 'swipe';
    } else if (s.do === 'alloc') {
      const id = String(s.id ?? nid('h'));
      b.heap.push({id, label: name || String(s.label ?? 'Object'), fields: Array.isArray(s.fields) ? (s.fields as unknown[]).map(String).slice(0, 4) : []});
      if (typeof s.var === 'string' && top) { const fr = b.stack[b.stack.length - 1]; const i = fr.vars.findIndex((v) => v[0] === s.var); if (i >= 0) fr.vars[i] = [s.var, `@${id}`]; else fr.vars.push([s.var, `@${id}`]); }
      note ??= `new object in the heap${typeof s.var === 'string' ? `; ${s.var} holds a reference to it` : ''}`; sound = 'pop';
    } else if (s.do === 'set') {
      const fr = b.stack[b.stack.length - 1];
      const v = show(valOf(s, 'value'));
      if (fr) { const i = fr.vars.findIndex((x) => x[0] === name); if (i >= 0) fr.vars[i] = [name, v]; else fr.vars.push([name, v]); }
      note ??= `${name} = ${v.startsWith('@') ? 'a reference' : v}`; sound = 'tick';
    } else if (s.do === 'free') {
      const key = String(s.id ?? s.name ?? '');
      b.heap = b.heap.filter((o) => o.id !== key && o.label !== key);
      note ??= 'garbage collector frees it'; sound = 'remove';
    }
    states.push(b); notes.push(note); sounds.push(sound);
  }
  const {starts, dur} = schedule(steps.length, len, fps, 0.08);
  const {c, k} = playhead(f, starts, dur);
  const prev = states[c < 0 ? 0 : c], next = states[c + 1] ?? prev;
  const cur = c < 0 ? undefined : steps[c];
  const st = k >= 0.5 ? next : prev;
  const note = c >= 0 ? notes[c] : undefined;

  // which panels
  const used = new Set(p.panels ?? []);
  if (code) used.add('code');
  for (const s of steps) {
    if (s.do === 'call' || s.do === 'return' || s.do === 'tick') used.add('stack');
    if (s.do === 'log') used.add('console');
    if (s.do === 'alloc' || s.do === 'free') used.add('heap');
    if (s.do === 'api' || s.do === 'done') used.add('apis');
    if (s.do === 'queue' || s.do === 'done' || s.do === 'tick') { used.add('micro'); used.add('task'); }
  }
  used.add('stack');
  const asyncCol = used.has('apis') || used.has('micro') || used.has('task');
  const leftCol = used.has('code') || used.has('console');
  const cols = [leftCol && 'left', 'stack', used.has('heap') && 'heap', asyncCol && 'async'].filter(Boolean) as string[];
  const weight: Record<string, number> = {left: 1.3, stack: 0.95, heap: 0.95, async: 1.25};
  const top = 205 * u, bottom = H - (H > W ? 390 : 250) * u, gapC = 34 * u;
  const avail = W - 160 * u - gapC * (cols.length - 1);
  const totalW = cols.reduce((a, b) => a + weight[b], 0);
  const colX: Record<string, Rect> = {};
  let x = 80 * u;
  if (H > W && cols[0] === 'left' && cols.length > 1) {
    // portrait: code + console across the top, the other columns side by side below (4 columns would be too narrow)
    const side = 60 * u, pTop = top + 40 * u, topH = (bottom - pTop) * 0.42; // titles often wrap to 2 lines here
    colX.left = {x: side, y: pTop, w: W - 2 * side, h: topH};
    const rest = cols.slice(1), restW = W - 2 * side - gapC * (rest.length - 1), restTotal = rest.reduce((a, b) => a + weight[b], 0);
    x = side;
    for (const col of rest) { const w = (restW * weight[col]) / restTotal; colX[col] = {x, y: pTop + topH + 60 * u, w, h: bottom - pTop - topH - 60 * u}; x += w + gapC; }
  } else for (const col of cols) { const w = (avail * weight[col]) / totalW; colX[col] = {x, y: top, w, h: bottom - top}; x += w + gapC; }
  const L = colX.left, S = colX.stack, HP = colX.heap, A = colX.async;
  // code card as tall as its lines (CodeCard: 44 head + 20 padding + 46 per line); the console gets the rest
  const logs = steps.filter((s) => s.do === 'log').length;
  let codeShare = 1;
  if (L && code && used.has('console')) {
    const codeNeed = (84 * u + code.length * 46 * u) / L.h, consNeed = (84 * u + Math.max(3, logs) * LOG_H * u) / L.h; // 20 gap + 60 head/padding
    // both fit: the console takes what it needs and the code the rest; too little room: share in proportion
    codeShare = codeNeed + consNeed <= 1 ? 1 - consNeed : codeNeed / (codeNeed + consNeed);
    codeShare = Math.min(0.75, Math.max(0.35, codeShare));
  }
  const codeR = L && used.has('code') ? {x: L.x, y: L.y, w: L.w, h: used.has('console') ? L.h * codeShare : L.h} : undefined;
  const consR = L && used.has('console') ? {x: L.x, y: codeR ? L.y + L.h * codeShare + 20 * u : L.y, w: L.w, h: codeR ? L.h * (1 - codeShare) - 20 * u : L.h} : undefined;
  const apisR = A && used.has('apis') ? {x: A.x, y: A.y, w: A.w, h: A.h * 0.36} : undefined;
  const qTop = A ? (apisR ? A.y + A.h * 0.36 + 70 * u : A.y + 70 * u) : 0;
  const qH = A ? (A.y + A.h - qTop - 20 * u) / 2 : 0;
  const microR = A && used.has('micro') ? {x: A.x, y: qTop, w: A.w, h: qH} : undefined;
  const taskR = A && used.has('task') ? {x: A.x, y: qTop + qH + 20 * u, w: A.w, h: qH} : undefined;

  // token rectangles
  const frameH = (fr: Frame) => 58 * u + fr.vars.length * 36 * u;
  const where = (s: St, id: string): {r: Rect; kind: string} | undefined => {
    let y = S.y + S.h - 16 * u;
    for (const fr of s.stack) { const h = frameH(fr); y -= h + 8 * u; if (fr.id === id) return {r: {x: S.x + 16 * u, y, w: S.w - 32 * u, h}, kind: 'frame'}; }
    if (apisR) { const i = s.apis.findIndex((t) => t.id === id); if (i >= 0) return {r: {x: apisR.x + 14 * u, y: apisR.y + 56 * u + i * 78 * u, w: apisR.w - 28 * u, h: 68 * u}, kind: 'api'}; }
    for (const [q, R0, kind] of [[s.micro, microR, 'micro'], [s.task, taskR, 'task']] as const) {
      if (!R0) continue;
      const i = q.findIndex((t) => t.id === id);
      const w = Math.min(230 * u, (R0.w - 28 * u) / Math.max(2, q.length) - 10 * u);
      if (i >= 0) return {r: {x: R0.x + 14 * u + i * (w + 10 * u), y: R0.y + 56 * u, w, h: R0.h - 72 * u}, kind};
    }
    if (consR) {
      const i = s.out.findIndex((t) => t.id === id);
      const rows = Math.max(1, Math.floor((consR.h - 60 * u) / (LOG_H * u))), shift = Math.max(0, s.out.length - rows);
      // a line scrolled off the top is gone (it fades out) instead of drawing over the header
      if (i >= shift) return {r: {x: consR.x + 18 * u, y: consR.y + 52 * u + (i - shift) * LOG_H * u, w: consR.w - 36 * u, h: (LOG_H - 4) * u}, kind: 'log'};
    }
    if (HP) {
      const i = s.heap.findIndex((o) => o.id === id);
      if (i >= 0) { const two = HP.w > 440 * u; const cw = two ? (HP.w - 42 * u) / 2 : HP.w - 28 * u; let yy = HP.y + 58 * u; const colI = two ? i % 2 : 0; for (let j = colI; j < i; j += two ? 2 : 1) yy += 70 * u + s.heap[j].fields.length * 30 * u + 14 * u; return {r: {x: HP.x + 14 * u + colI * (cw + 14 * u), y: yy, w: cw, h: 70 * u + s.heap[i].fields.length * 30 * u}, kind: 'obj'}; }
    }
    return undefined;
  };
  const topFrame = (s: St) => (s.stack.length ? where(s, s.stack[s.stack.length - 1].id)?.r : undefined);
  const spawnFrom = topFrame(prev) ?? {x: S.x + 16 * u, y: S.y - 40 * u, w: S.w - 32 * u, h: 58 * u};
  const ids = new Set<string>();
  for (const s of [prev, next]) { s.stack.forEach((x) => ids.add(x.id)); [...s.apis, ...s.micro, ...s.task, ...s.out].forEach((x) => ids.add(x.id)); s.heap.forEach((x) => ids.add(x.id)); }
  const labelOf = (s: St, id: string): {label: string; sub?: string; vars?: [string, string][]; fields?: string[]} | undefined =>
    s.stack.find((x) => x.id === id) ?? [...s.apis, ...s.micro, ...s.task, ...s.out].find((x) => x.id === id) ?? s.heap.find((x) => x.id === id);
  const STYLE: Record<string, {bg: string; font: number}> = {frame: {bg: '#ddd3f7', font: 22}, api: {bg: '#fbe3c8', font: 20}, micro: {bg: '#c9ecd2', font: 19}, task: {bg: '#cfe2f7', font: 19}, log: {bg: 'transparent', font: 24}, obj: {bg: '#f7d9e3', font: 21}};

  const cues: Cue[] = [];
  if (p.sound) sounds.forEach((s, i) => { if (s) cues.push({sound: s, at: Math.round(starts[i]), volume: 0.2}); });
  const enter = spring({frame: f, fps, config: {damping: 16, stiffness: 110}});
  const loopSpin = cur?.do === 'tick' ? k * 360 : 0;
  const rects = new Map<string, Rect>();

  const tokens = [...ids].map((id) => {
    const a = where(prev, id), b = where(next, id);
    if (!a && !b) return null;
    const kind = (k >= 0.5 ? b ?? a : a ?? b)!.kind;
    let r: Rect, opacity = 1;
    if (a && b) r = {x: lerp(a.r.x, b.r.x, k), y: lerp(a.r.y, b.r.y, k), w: lerp(a.r.w, b.r.w, k), h: lerp(a.r.h, b.r.h, k)};
    else if (b) { const from = b.kind === 'log' || b.kind === 'obj' || b.kind === 'api' || b.kind === 'micro' || b.kind === 'task' ? spawnFrom : {...b.r, y: b.r.y - 60 * u}; r = {x: lerp(from.x, b.r.x, k), y: lerp(from.y, b.r.y, k), w: lerp(from.w, b.r.w, k), h: lerp(from.h, b.r.h, k)}; opacity = clamp01(k * 2.2); }
    else { r = {...a!.r, y: a!.r.y - (a!.kind === 'frame' ? 50 * u * k : 0)}; opacity = 1 - k; }
    rects.set(id, r);
    const info = labelOf(k >= 0.5 ? next : prev, id) ?? labelOf(prev, id) ?? labelOf(next, id)!;
    const sty = STYLE[kind];
    const isTop = kind === 'frame' && st.stack[st.stack.length - 1]?.id === id;
    const freeing = kind === 'obj' && !b;
    return (
      <div key={id} style={{position: 'absolute', left: r.x, top: r.y, width: r.w, height: r.h, opacity, borderRadius: 12 * u, background: freeing ? FILL.red : sty.bg, border: kind === 'log' ? 'none' : `${2.5 * u}px solid ${PAPER.ink}`, boxSizing: 'border-box',
        boxShadow: kind === 'log' ? undefined : isTop ? `0 0 0 ${5 * u}px rgba(138,111,209,0.35)` : `0 ${4 * u}px ${9 * u}px rgba(70,50,30,0.12)`, overflow: 'hidden', fontFamily: MONO, padding: kind === 'log' ? 0 : `${8 * u}px ${12 * u}px`}}>
        <div style={{fontWeight: 800, fontSize: sty.font * u, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', color: kind === 'log' ? PAPER.ink : undefined}}>
          {kind === 'log' ? <span style={{color: FILL.green}}>&gt; </span> : kind === 'api' ? '⏱ ' : kind === 'obj' ? '{ } ' : null}{info.label}
        </div>
        {info.sub && kind === 'api' ? <div style={{fontSize: 17 * u, color: PAPER.inkSoft, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis'}}>{info.sub}</div> : null}
        {kind === 'frame' && info.vars ? info.vars.map(([name, v]) => (
          <div key={name} style={{height: 36 * u, display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: 19 * u, borderTop: `${1.5 * u}px dashed rgba(43,40,51,0.25)`}}>
            <span>{name}</span>{v.startsWith('@') ? <span style={{width: 12 * u, height: 12 * u, borderRadius: 99, background: PAPER.ink, marginRight: 2 * u}} /> : <span style={{fontWeight: 800, maxWidth: '60%', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap'}}>{v}</span>}
          </div>
        )) : null}
        {kind === 'obj' && info.fields ? info.fields.map((fl, i) => <div key={i} style={{fontSize: 17 * u, height: 30 * u, display: 'flex', alignItems: 'center', whiteSpace: 'nowrap', overflow: 'hidden'}}>{fl}</div>) : null}
        {freeing ? <div style={{position: 'absolute', right: 10 * u, top: 8 * u, fontFamily: PAPER.sans, fontWeight: 800, fontSize: 16 * u, color: '#b2402f'}}>GC</div> : null}
      </div>
    );
  });

  // reference arrows: frame var "@id" -> heap object
  const refs: {x1: number; y1: number; x2: number; y2: number; key: string; op: number}[] = [];
  for (const s of [k >= 0.5 ? next : prev]) {
    s.stack.forEach((fr) => fr.vars.forEach(([name, v], i) => {
      if (!v.startsWith('@')) return;
      const fr0 = rects.get(fr.id), obj = rects.get(v.slice(1));
      if (!fr0 || !obj) return;
      refs.push({x1: fr0.x + fr0.w - 18 * u, y1: fr0.y + 58 * u + i * 36 * u + 18 * u - 8 * u, x2: obj.x, y2: obj.y + 30 * u, key: `${fr.id}-${name}`, op: 1});
    }));
  }
  const lastLine = c >= 0 ? st.line : undefined;
  const apiLabel = p.runtime === 'node' ? 'Node APIs (libuv)' : 'Web APIs';

  return (
    <PaperStage eyebrow={p.eyebrow} title={p.title}>
      <div style={{position: 'absolute', inset: 0, opacity: enter}}>
        {codeR && code ? <CodeCard lines={code} active={lastLine} x={codeR.x} y={codeR.y} w={codeR.w} h={codeR.h} u={u} title={p.runtime === 'node' ? 'index.js' : 'script.js'} /> : null}
        {consR ? <Panel x={consR.x} y={consR.y} w={consR.w} h={consR.h} u={u} label="Console" tint="#e6e0d4" /> : null}
        {consR ? <div style={{position: 'absolute', left: consR.x + 2.5 * u, top: consR.y + 44 * u, width: consR.w - 5 * u, height: consR.h - 46 * u, background: '#fffaf1', borderRadius: `0 0 ${16 * u}px ${16 * u}px`}} /> : null}
        {/* stack bucket */}
        <svg width={W} height={H} style={{position: 'absolute', inset: 0}}>
          <path d={`M${S.x},${S.y + 40 * u} L${S.x},${S.y + S.h - 22 * u} Q${S.x},${S.y + S.h} ${S.x + 22 * u},${S.y + S.h} L${S.x + S.w - 22 * u},${S.y + S.h} Q${S.x + S.w},${S.y + S.h} ${S.x + S.w},${S.y + S.h - 22 * u} L${S.x + S.w},${S.y + 40 * u}`} fill="rgba(255,250,241,0.75)" stroke={PAPER.ink} strokeWidth={3.5 * u} />
        </svg>
        <div style={{position: 'absolute', left: S.x, width: S.w, top: S.y - 6 * u, textAlign: 'center', fontWeight: 800, fontSize: 22 * u}}>Call stack</div>
        {HP ? <Panel x={HP.x} y={HP.y} w={HP.w} h={HP.h} u={u} label="Heap (objects)" tint="#f7d9e3" /> : null}
        {apisR ? <Panel x={apisR.x} y={apisR.y} w={apisR.w} h={apisR.h} u={u} label={apiLabel} tint="#fbe3c8" /> : null}
        {microR ? <Panel x={microR.x} y={microR.y} w={microR.w} h={microR.h} u={u} label="Microtask queue (promises)" tint="#c9ecd2" /> : null}
        {taskR ? <Panel x={taskR.x} y={taskR.y} w={taskR.w} h={taskR.h} u={u} label={p.runtime === 'node' ? 'Task queue (timers, I/O)' : 'Task queue (timers, events)'} tint="#cfe2f7" /> : null}
        {/* event loop badge */}
        {A && (microR || taskR) ? (
          // in the free strip above the queues (inside the async column), so it never touches the call stack
          <div style={{position: 'absolute', left: A.x, width: A.w, top: qTop - 70 * u, height: 70 * u, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10 * u}}>
            <svg width={44 * u} height={44 * u} viewBox="-32 -32 64 64" style={{transform: `rotate(${loopSpin}deg)`, flex: 'none'}}>
              <path d="M 0 -22 A 22 22 0 1 1 -21 7" fill="none" stroke={cur?.do === 'tick' ? FILL.accent : PAPER.ink} strokeWidth={5} strokeLinecap="round" />
              <path d="M -29 0 L -21 12 L -12 2 Z" fill={cur?.do === 'tick' ? FILL.accent : PAPER.ink} />
            </svg>
            <div style={{fontSize: 19 * u, fontWeight: 800, color: cur?.do === 'tick' ? FILL.accent : PAPER.inkSoft, whiteSpace: 'nowrap'}}>event loop</div>
          </div>
        ) : null}
        {tokens}
        <svg width={W} height={H} style={{position: 'absolute', inset: 0, pointerEvents: 'none'}}>
          {refs.map((r) => {
            const mx = (r.x1 + r.x2) / 2;
            return <g key={r.key} opacity={r.op}><path d={`M${r.x1},${r.y1} C${mx},${r.y1} ${mx},${r.y2} ${r.x2 - 4 * u},${r.y2}`} stroke={FILL.purple} strokeWidth={3.5 * u} fill="none" /><path d={arrowHead(r.x2 - 30 * u, r.y2, r.x2, r.y2, 15 * u)} fill={FILL.purple} /></g>;
          })}
        </svg>
      </div>
      <NoteBar text={note} cx={W / 2} y={H - 236 * u} u={u} maxW={W - 200 * u} />
      {cues.map((q, i) => <Sfx key={i} sound={q.sound} at={q.at} volume={q.volume} />)}
    </PaperStage>
  );
};
