/**
 * StackScene: a stack (LIFO, a vertical bucket with an open top) or a queue (FIFO, a lane: in at the
 * back, out at the front), in the paper style. Items are pushed / popped one at a time; popped items
 * line up in an "out" row so the order is visible (LIFO reverses it, FIFO keeps it).
 */
import type {FC} from 'react';
import {spring, useCurrentFrame, useVideoConfig} from 'remotion';
import {z} from 'zod';
import {Sfx} from '../audio';
import {PAPER} from '../iso/iso';
import {useSceneLength, useUnit} from '../theme';
import {MONO, PaperStage, clamp01, flexValue, type Cue} from './paperStage';
import {FILL, NoteBar, Panel, argsOf, flexSteps, flexValues, lerpPt, playhead, schedule, show, stepSchema, valOf, type Pt, type Step} from './dsaKit';

const VERBS: Record<string, string> = {
  push: 'push', add: 'push', insert: 'push', enqueue: 'push', enq: 'push', offer: 'push', append: 'push', put: 'push', in: 'push', arrive: 'push', join: 'push',
  pop: 'pop', remove: 'pop', dequeue: 'pop', deq: 'pop', poll: 'pop', take: 'pop', out: 'pop', serve: 'pop', shift: 'pop', leave: 'pop', undo: 'pop',
  peek: 'peek', top: 'peek', front: 'peek', look: 'peek', check: 'peek', note: 'note', say: 'note', wait: 'note', overflow: 'overflow', full: 'overflow', underflow: 'underflow', empty: 'underflow',
};
const flexStack = (raw: unknown) => {
  if (!raw || typeof raw !== 'object') return raw;
  const r = {...(raw as Record<string, unknown>)};
  for (const k of ['type', 'structure', 'mode']) if (r.kind === undefined && typeof r[k] === 'string') { r.kind = r[k]; delete r[k]; }
  r.kind = flexValue(r.kind, {lifo: 'stack', stack: 'stack', 'call stack': 'stack', fifo: 'queue', queue: 'queue', line: 'queue', 'task queue': 'queue', buffer: 'queue'});
  for (const k of ['values', 'initial', 'start', 'data', 'elements']) if (r.items === undefined && r[k] !== undefined) { r.items = r[k]; delete r[k]; }
  r.items = flexValues(r.items);
  if (r.steps === undefined) for (const k of ['actions', 'operations', 'ops']) if (r[k] !== undefined) { r.steps = r[k]; delete r[k]; }
  if (Array.isArray(r.steps)) {
    // "push": [1, 2, 3] -> three pushes
    r.steps = (flexSteps(r.steps, VERBS, {item: 'value', label: 'value', name: 'value', data: 'value'}) as Record<string, unknown>[]).flatMap((s) => {
      const vals = Array.isArray(s?.value) ? s.value : Array.isArray(s?.values) ? s.values : null;
      if (s && vals) return vals.map((v: unknown) => ({...s, value: v, values: undefined}));
      const count = typeof s?.count === 'number' ? s.count : 1;
      return s && s.do === 'pop' && count > 1 ? Array.from({length: Math.min(8, count)}, () => ({...s, count: undefined})) : [s];
    }).map((s) => { if (s && typeof s === 'object') { const o = {...s}; for (const k of ['values', 'count']) if (o[k] === undefined) delete o[k]; return o; } return s; });
  }
  if (r.steps === undefined && r.items === undefined) { r.items = []; }
  return r;
};

const EXAMPLE_STEPS = [{do: 'push', value: 'A'}, {do: 'push', value: 'B'}, {do: 'push', value: 'C'}, {do: 'peek'}, {do: 'pop'}, {do: 'pop'}, {do: 'push', value: 'D'}, {do: 'pop'}];

export const stackSceneSchema = z.preprocess(flexStack, z.object({
  eyebrow: z.string().max(40).optional(),
  title: z.string().max(70).optional(),
  kind: z.enum(['stack', 'queue']).default('stack'),
  label: z.string().max(40).optional(), // panel title, e.g. "Undo history", "Print queue"
  items: z.array(z.union([z.string().max(18), z.number()])).max(8).default([]), // already inside at the start (bottom/front first)
  capacity: z.number().int().min(2).max(10).optional(), // pushing past it shows "overflow"
  steps: z.array(stepSchema).max(30).default(EXAMPLE_STEPS),
  outLabel: z.string().max(30).optional(), // name of the row popped items go to ("Served", "Undone")
  sound: z.boolean().default(true),
}).strict().superRefine((p, ctx) => {
  let size = p.items.length;
  p.steps.forEach((s, i) => {
    if (!Object.values(VERBS).includes(s.do)) ctx.addIssue({code: 'custom', path: ['steps', i, 'do'], message: 'use push, pop, peek, note (enqueue/dequeue also work)'});
    if (s.do === 'push') {
      if (valOf(s, 'value') === undefined && argsOf(s)[0] === undefined) ctx.addIssue({code: 'custom', path: ['steps', i, 'value'], message: 'push needs "value"'});
      if (!p.capacity || size < p.capacity) size++;
    }
    if (s.do === 'pop') size = Math.max(0, size - 1);
    if (size > 9) ctx.addIssue({code: 'custom', path: ['steps', i], message: 'more than 9 items do not fit: pop some first'});
  });
}));
type Props = z.output<typeof stackSceneSchema>;

export const description =
  'A stack (LIFO bucket, open at the top) or a queue (FIFO lane: in at the back, out at the front) in the paper style. ' +
  '"kind": stack | queue, "items" already inside, "steps": push {value} | pop | peek | note (enqueue/dequeue work too). ' +
  'Popped items line up in an "out" row so the order is visible. Use for undo history, call stack, print queue, BFS queue.';
export const tags = ['stack', 'queue', 'lifo', 'fifo', 'push', 'pop', 'enqueue', 'dequeue', 'data structures', 'dsa', 'undo', 'call stack', 'buffer'];

type It = {id: number; v: string | number};
type St = {items: It[]; out: It[]; peek?: number; flag?: 'overflow' | 'underflow'};

export const StackScene: FC<z.input<typeof stackSceneSchema>> = (input) => {
  const p = stackSceneSchema.parse(input) as Props;
  const f = useCurrentFrame();
  const {fps, width: W, height: H} = useVideoConfig();
  const u = useUnit();
  const len = useSceneLength();
  const stack = p.kind === 'stack';

  let nextId = 0;
  const states: St[] = [{items: p.items.map((v) => ({id: nextId++, v})), out: []}];
  const steps = p.steps as Step[];
  for (const s of steps) {
    const st = states[states.length - 1];
    const n: St = {items: [...st.items], out: [...st.out]};
    if (s.do === 'push') {
      if (p.capacity && st.items.length >= p.capacity) n.flag = 'overflow';
      else n.items.push({id: nextId++, v: valOf(s, 'value') ?? (argsOf(s)[0] as string) ?? '?'});
    } else if (s.do === 'pop') {
      if (!st.items.length) n.flag = 'underflow';
      else { const it = stack ? n.items.pop()! : n.items.shift()!; n.out.push(it); }
    } else if (s.do === 'peek') n.peek = stack ? st.items.at(-1)?.id : st.items[0]?.id;
    else if (s.do === 'overflow' || s.do === 'underflow') n.flag = s.do;
    states.push(n);
  }
  const {starts, dur} = schedule(steps.length, len, fps, 0.1);
  const {c, k} = playhead(f, starts, dur);
  const prev = states[c < 0 ? 0 : c], next = states[c + 1] ?? prev;
  const cur = c < 0 ? undefined : steps[c];
  const st = k >= 0.5 ? next : prev;

  // layout
  const top = 210 * u, bottom = H - 180 * u;
  const maxItems = Math.max(4, p.capacity ?? 0, ...states.map((s) => s.items.length));
  const portrait = H > W;
  const outCount = Math.max(1, ...states.map((s) => s.out.length));
  let panel: {x: number; y: number; w: number; h: number}, slot: (i: number) => Pt, spawn: Pt, outSlot: (i: number) => Pt, outRow: {x: number; y: number; w: number; h: number};
  const iw = stack ? Math.min(380 * u, W * 0.3) : Math.min(170 * u, (W - 400 * u) / maxItems - 16 * u), ih = stack ? Math.min(84 * u, (bottom - top - 160 * u) / maxItems - 10 * u) : 96 * u;
  const ow = Math.min(150 * u, (portrait ? W - 200 * u : W * 0.42) / Math.max(4, outCount) - 12 * u), oh = 70 * u;
  if (stack) {
    const ph = maxItems * (ih + 10 * u) + 80 * u;
    panel = {x: portrait ? (W - iw - 60 * u) / 2 : W * 0.32 - (iw + 60 * u) / 2, y: bottom - ph, w: iw + 60 * u, h: ph};
    slot = (i) => ({x: panel.x + 30 * u, y: panel.y + panel.h - 20 * u - (i + 1) * (ih + 10 * u) + 10 * u, w: iw, h: ih});
    spawn = {x: panel.x + 30 * u, y: Math.max(top - 40 * u, panel.y - ih - 50 * u), w: iw, h: ih};
    outRow = portrait ? {x: 100 * u, y: top + 20 * u, w: W - 200 * u, h: oh + 70 * u} : {x: W * 0.56, y: (top + bottom) / 2 - oh, w: W * 0.44 - 90 * u, h: oh + 70 * u};
  } else {
    const pw = maxItems * (iw + 16 * u) + 60 * u;
    panel = {x: (W - pw) / 2, y: top + 40 * u, w: pw, h: ih + 90 * u};
    slot = (i) => ({x: panel.x + 30 * u + i * (iw + 16 * u), y: panel.y + 64 * u, w: iw, h: ih});
    spawn = {x: W + 40 * u, y: panel.y + 64 * u, w: iw, h: ih};
    outRow = {x: (W - Math.min(W - 200 * u, outCount * (ow + 12 * u) + 40 * u)) / 2, y: panel.y + panel.h + 120 * u, w: Math.min(W - 200 * u, outCount * (ow + 12 * u) + 40 * u), h: oh + 70 * u};
  }
  outSlot = (i) => ({x: outRow.x + 20 * u + i * (ow + 12 * u), y: outRow.y + 56 * u, w: ow, h: oh});
  const where = (s: St, id: number): Pt | undefined => {
    const i = s.items.findIndex((x) => x.id === id);
    if (i >= 0) return slot(i);
    const o = s.out.findIndex((x) => x.id === id);
    return o >= 0 ? outSlot(o) : undefined;
  };
  const all = new Map<number, It>();
  [...prev.items, ...prev.out, ...next.items, ...next.out].forEach((x) => all.set(x.id, x));
  const topId = stack ? st.items.at(-1)?.id : st.items[0]?.id;
  const backId = stack ? undefined : st.items.at(-1)?.id;

  const cues: Cue[] = [];
  if (p.sound) steps.forEach((s, i) => {
    const at = Math.round(starts[i]);
    if (s.do === 'push') cues.push({sound: states[i + 1].flag ? 'error' : 'drop', at, volume: 0.25});
    if (s.do === 'pop') cues.push({sound: states[i + 1].flag ? 'error' : 'whoosh', at, volume: 0.2});
    if (s.do === 'peek') cues.push({sound: 'blip', at, volume: 0.22});
  });
  const enter = spring({frame: f, fps, config: {damping: 16, stiffness: 110}});
  const note = cur?.note ?? (cur?.do === 'push' && !next.flag ? `${stack ? 'push' : 'enqueue'}(${show(next.items.at(-1)?.v)})` : cur?.do === 'pop' && !next.flag ? `${stack ? 'pop()' : 'dequeue()'} → ${show(next.out.at(-1)?.v)}` : cur?.do === 'peek' ? `${stack ? 'peek()' : 'front()'} → ${show(all.get(next.peek ?? -1)?.v)} (stays inside)` : next.flag === 'overflow' ? 'full → overflow!' : next.flag === 'underflow' ? 'empty → nothing to take' : undefined);
  const label = p.label ?? (stack ? 'Stack (LIFO)' : 'Queue (FIFO)');
  const shake = next.flag && c >= 0 ? Math.sin(k * Math.PI * 8) * (1 - k) * 10 * u : 0;

  return (
    <PaperStage eyebrow={p.eyebrow} title={p.title}>
      <div style={{position: 'absolute', inset: 0, transform: `translateX(${shake}px)`, opacity: enter}}>
        {stack ? (
          <svg width={W} height={H} style={{position: 'absolute', inset: 0}}>
            {/* the bucket: open at the top */}
            <path d={`M${panel.x},${panel.y} L${panel.x},${panel.y + panel.h - 24 * u} Q${panel.x},${panel.y + panel.h} ${panel.x + 24 * u},${panel.y + panel.h} L${panel.x + panel.w - 24 * u},${panel.y + panel.h} Q${panel.x + panel.w},${panel.y + panel.h} ${panel.x + panel.w},${panel.y + panel.h - 24 * u} L${panel.x + panel.w},${panel.y}`}
              fill="rgba(255,250,241,0.75)" stroke={PAPER.ink} strokeWidth={3.5 * u} strokeLinejoin="round" />
          </svg>
        ) : (
          <Panel x={panel.x} y={panel.y} w={panel.w} h={panel.h} u={u} label={label} />
        )}
        {stack ? <div style={{position: 'absolute', left: panel.x, width: panel.w, top: panel.y + panel.h + 14 * u, textAlign: 'center', fontWeight: 800, fontSize: 24 * u}}>{label}</div> : null}
        {/* direction hints */}
        {stack ? (
          <div style={{position: 'absolute', left: panel.x + panel.w + 18 * u, top: panel.y - 10 * u, fontSize: 20 * u, color: PAPER.inkSoft, fontWeight: 700, lineHeight: 1.6}}>↓ push<br />↑ pop</div>
        ) : (
          <>
            <div style={{position: 'absolute', left: panel.x - 140 * u, top: panel.y + panel.h / 2 - 16 * u, width: 120 * u, textAlign: 'right', fontSize: 21 * u, fontWeight: 800, color: FILL.green}}>← out<br /><span style={{fontSize: 17 * u, color: PAPER.inkSoft}}>front</span></div>
            <div style={{position: 'absolute', left: panel.x + panel.w + 20 * u, top: panel.y + panel.h / 2 - 16 * u, width: 120 * u, fontSize: 21 * u, fontWeight: 800, color: FILL.purple}}>← in<br /><span style={{fontSize: 17 * u, color: PAPER.inkSoft}}>back</span></div>
          </>
        )}
        {/* out row */}
        {states.some((s) => s.out.length) ? (
          <Panel x={outRow.x} y={outRow.y} w={outRow.w} h={outRow.h} u={u} label={p.outLabel ?? (stack ? 'Popped (in order)' : 'Served (in order)')} tint="#dff3e2" />
        ) : null}
        {[...all.values()].map((it) => {
          const a = where(prev, it.id), b = where(next, it.id);
          if (!a && !b) return null;
          const from = a ?? spawn, to = b ?? from;
          const q = lerpPt(from, to, k);
          const leaving = !!a && !!b && prev.items.some((x) => x.id === it.id) && next.out.some((x) => x.id === it.id);
          const lift = leaving && stack ? -Math.sin(Math.PI * k) * 140 * u : 0;
          const inOut = !next.items.some((x) => x.id === it.id) && next.out.some((x) => x.id === it.id);
          const isTop = it.id === topId && !inOut;
          const peeked = next.peek === it.id && cur?.do === 'peek';
          const fill = peeked ? FILL.compare : inOut ? FILL.done : isTop ? '#d9cff6' : FILL.item;
          return (
            <div key={it.id} style={{position: 'absolute', left: q.x, top: q.y + lift, width: q.w, height: q.h, borderRadius: 14 * u, background: fill, border: `${2.5 * u}px solid ${PAPER.ink}`, boxSizing: 'border-box',
              display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: MONO, fontWeight: 800, fontSize: Math.min(34 * u, (q.h ?? 60) * 0.42), opacity: a ? 1 : clamp01(k * 2.5),
              boxShadow: peeked ? `0 0 0 ${6 * u}px rgba(255,160,60,0.45)` : `0 ${5 * u}px ${10 * u}px rgba(70,50,30,0.12)`, whiteSpace: 'nowrap', overflow: 'hidden'}}>
              {show(it.v)}
            </div>
          );
        })}
        {/* top / front / back labels */}
        {topId !== undefined ? (() => {
          const q = slot(st.items.findIndex((x) => x.id === topId));
          return stack
            ? <div style={{position: 'absolute', left: q.x - 150 * u, top: q.y + (q.h ?? 0) / 2 - 18 * u, width: 120 * u, textAlign: 'right', fontFamily: MONO, fontWeight: 800, fontSize: 24 * u, color: FILL.accent}}>top →</div>
            : <div style={{position: 'absolute', left: q.x, width: q.w, top: q.y + (q.h ?? 0) + 34 * u, textAlign: 'center', fontFamily: MONO, fontWeight: 800, fontSize: 20 * u, color: FILL.green}}>↑ front</div>;
        })() : null}
        {backId !== undefined && backId !== topId ? (() => {
          const q = slot(st.items.length - 1);
          return <div style={{position: 'absolute', left: q.x, width: q.w, top: q.y + (q.h ?? 0) + 34 * u, textAlign: 'center', fontFamily: MONO, fontWeight: 800, fontSize: 20 * u, color: FILL.purple}}>↑ back</div>;
        })() : null}
        {p.capacity ? <div style={{position: 'absolute', left: panel.x, width: panel.w, top: stack ? panel.y - 40 * u : panel.y - 40 * u, textAlign: 'center', fontSize: 20 * u, fontWeight: 700, color: next.flag === 'overflow' ? '#b2402f' : PAPER.inkSoft}}>size {st.items.length} / {p.capacity}</div> : null}
      </div>
      <NoteBar text={note} cx={stack && !portrait ? W * 0.72 : W / 2} y={stack && !portrait ? outRow.y - 110 * u : H - 250 * u} u={u} maxW={stack && !portrait ? W * 0.44 : W - 200 * u} k={k} />
      {cues.map((q, i) => <Sfx key={i} sound={q.sound} at={q.at} volume={q.volume} />)}
    </PaperStage>
  );
};
