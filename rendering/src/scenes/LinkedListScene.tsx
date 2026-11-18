/**
 * LinkedListScene: a singly linked list in the paper style ([value | next] boxes joined by arrows, a
 * "head" tag, null at the end). Inserting shows the real pointer work: the new node appears, its next
 * arrow points at the successor, then the predecessor's arrow swings over to it and the list closes
 * up. Deleting swings the arrow past the node before it drops out. find walks a "curr" pointer;
 * reverse flips the arrows one by one with prev / curr pointers.
 */
import type {FC} from 'react';
import {spring, useCurrentFrame, useVideoConfig} from 'remotion';
import {z} from 'zod';
import {Sfx} from '../audio';
import {PAPER} from '../iso/iso';
import {useSceneLength, useUnit} from '../theme';
import {MONO, PaperStage, clamp01, type Cue} from './paperStage';
import {FILL, NoteBar, PointerTag, arrowHead, argsOf, flexSteps, flexValues, intOf, lerp, playhead, schedule, show, stepSchema, valOf, type Step} from './dsaKit';

const VERBS: Record<string, string> = {
  insert: 'insert', add: 'insert', insertat: 'insert', insertafter: 'insert', put: 'insert',
  append: 'append', push: 'append', pushback: 'append', addlast: 'append', addtail: 'append',
  prepend: 'prepend', pushfront: 'prepend', addfirst: 'prepend', addhead: 'prepend', unshift: 'prepend',
  delete: 'delete', remove: 'delete', del: 'delete', erase: 'delete', pop: 'delete', unlink: 'delete',
  find: 'find', search: 'find', traverse: 'find', walk: 'find', get: 'find', contains: 'find', lookup: 'find',
  reverse: 'reverse', flip: 'reverse', note: 'note', say: 'note',
};
const flexLinked = (raw: unknown) => {
  if (!raw || typeof raw !== 'object') return raw;
  const r = {...(raw as Record<string, unknown>)};
  for (const k of ['nodes', 'list', 'items', 'data', 'elements', 'initial']) if (r.values === undefined && r[k] !== undefined) { r.values = r[k]; delete r[k]; }
  r.values = flexValues(r.values);
  if (r.steps === undefined) for (const k of ['actions', 'operations', 'ops']) if (r[k] !== undefined) { r.steps = r[k]; delete r[k]; }
  if (r.steps !== undefined) r.steps = (flexSteps(r.steps, VERBS, {node: 'value', item: 'value', data: 'value', key: 'value', position: 'index', pos: 'index', at_index: 'index', previous: 'after', prev: 'after'}) as Record<string, unknown>[]).map((s) => {
    if (!s || typeof s !== 'object') return s;
    const o = {...s};
    const a = argsOf(o);
    if (o.value === undefined && a[0] !== undefined && o.do !== 'reverse') o.value = a[0];
    if (o.do === 'insert' && o.index === undefined && o.after === undefined && o.before === undefined && a[1] !== undefined) o.index = a[1];
    if (o.at !== undefined && o.index === undefined) { o.index = o.at; delete o.at; }
    delete o.args;
    return o;
  });
  return r;
};

const EXAMPLE_STEPS = [{do: 'insert', value: 7, after: 3}, {do: 'delete', value: 9}, {do: 'find', value: 5}];

export const linkedListSceneSchema = z.preprocess(flexLinked, z.object({
  eyebrow: z.string().max(40).optional(),
  title: z.string().max(70).optional(),
  values: z.array(z.union([z.number(), z.string().max(8)])).max(7).default([3, 9, 5]),
  steps: z.array(stepSchema).max(10).default(EXAMPLE_STEPS),
  sound: z.boolean().default(true),
}).strict().superRefine((p, ctx) => {
  let size = p.values.length;
  p.steps.forEach((s, i) => {
    if (!Object.values(VERBS).includes(s.do)) ctx.addIssue({code: 'custom', path: ['steps', i, 'do'], message: 'use insert {value, index | after}, append, prepend, delete {value | index}, find {value}, reverse, note'});
    if (['insert', 'append', 'prepend'].includes(s.do)) { if (valOf(s, 'value') === undefined) ctx.addIssue({code: 'custom', path: ['steps', i, 'value'], message: `${s.do} needs "value"`}); size++; }
    if (s.do === 'delete') size--;
    if (size > 7) ctx.addIssue({code: 'custom', path: ['steps', i], message: 'more than 7 nodes do not fit: use fewer'});
  });
}));
type Props = z.output<typeof linkedListSceneSchema>;

export const description =
  'A singly linked list in the paper style: [value | next] boxes, arrows, a "head" tag and null at the end. "values" (up to 7), ' +
  '"steps": insert {value, index | after: value} (new node appears, its next points at the successor, then the previous ' +
  'arrow swings to it), append, prepend, delete {value | index} (the arrow swings past the node, it drops out), find {value} ' +
  '(a curr pointer walks), reverse (arrows flip one by one), note. Shows why insert is O(1) once you are there and find is O(n).';
export const tags = ['linked list', 'singly linked list', 'pointer', 'pointers', 'node', 'next', 'head', 'insert', 'delete', 'reverse', 'data structures', 'dsa', 'references'];

type Nd = {id: number; v: string | number; next: number | null};
type St = {nodes: Record<number, Nd>; order: number[]; head: number | null; off: Record<number, number>; ptr: Record<string, number | null>; mark?: number; gone: number[]; found?: number};
type Micro = {st: St; note?: string; sound?: string; hot?: number};

const copy = (s: St): St => ({nodes: Object.fromEntries(Object.entries(s.nodes).map(([k, n]) => [k, {...n}])), order: [...s.order], head: s.head, off: {...s.off}, ptr: {...s.ptr}, gone: [...s.gone]});
const chain = (s: St) => { const out: number[] = []; let x = s.head; const seen = new Set<number>(); while (x !== null && !seen.has(x)) { seen.add(x); out.push(x); x = s.nodes[x]?.next ?? null; } return out; };

export const LinkedListScene: FC<z.input<typeof linkedListSceneSchema>> = (input) => {
  const p = linkedListSceneSchema.parse(input) as Props;
  const f = useCurrentFrame();
  const {fps, width: W, height: H} = useVideoConfig();
  const u = useUnit();
  const len = useSceneLength();

  let nid = 0;
  const s0: St = {nodes: {}, order: [], head: null, off: {}, ptr: {}, gone: []};
  p.values.forEach((v) => { const id = nid++; s0.nodes[id] = {id, v, next: null}; s0.order.push(id); });
  s0.order.forEach((id, i) => { s0.nodes[id].next = s0.order[i + 1] ?? null; });
  s0.head = s0.order[0] ?? null;
  const micros: Micro[] = [];
  let s = s0;
  const push = (st: St, note?: string, sound?: string, hot?: number) => { micros.push({st, note, sound, hot}); s = st; };
  const clean = (st: St) => { const n = copy(st); n.ptr = {}; n.mark = undefined; n.found = undefined; return n; };

  for (const step of p.steps as Step[]) {
    const v = valOf(step, 'value');
    const list = chain(s);
    if (step.do === 'note') { push(copy(s), step.note); continue; }
    if (step.do === 'insert' || step.do === 'append' || step.do === 'prepend') {
      let idx = step.do === 'prepend' ? 0 : step.do === 'append' ? list.length : intOf(step, 'index') ?? list.length;
      const after = valOf(step, 'after'), before = valOf(step, 'before');
      if (after !== undefined) { const i = list.findIndex((id) => String(s.nodes[id].v) === String(after)); if (i >= 0) idx = i + 1; }
      if (before !== undefined) { const i = list.findIndex((id) => String(s.nodes[id].v) === String(before)); if (i >= 0) idx = i; }
      idx = Math.max(0, Math.min(list.length, idx));
      const pred = idx > 0 ? list[idx - 1] : null, succ = list[idx] ?? null;
      // walk to the predecessor
      let base = clean(s);
      for (let i = 0; i < idx && step.do !== 'append'; i++) { const n = copy(base); n.ptr = {curr: list[i]}; push(n, i === 0 ? `walk from head to position ${idx}` : undefined, 'tick'); base = n; }
      const id = nid++;
      let n = copy(base); n.nodes[id] = {id, v: v ?? '?', next: null}; n.off[id] = succ !== null ? s.order.indexOf(succ) : pred !== null ? s.order.indexOf(pred) + 1 : 0;
      push(n, step.note ?? `new node ${show(v)}`, 'pop', id);
      if (succ !== null) { n = copy(n); n.nodes[id].next = succ; push(n, `${show(v)}.next → ${show(s.nodes[succ].v)}`, 'connect', id); }
      n = copy(n);
      if (pred !== null) { n.nodes[pred].next = id; push(n, `${show(n.nodes[pred].v)}.next → ${show(v)} (the old link is replaced)`, 'connect', pred); }
      else { n.head = id; push(n, `head → ${show(v)}`, 'connect', id); }
      n = copy(n); n.order.splice(n.off[id], 0, id); delete n.off[id]; n.ptr = {}; push(n, step.do === 'append' ? undefined : `inserted: only ${succ === null || pred === null ? 1 : 2} pointer${succ === null || pred === null ? '' : 's'} changed, nothing moved in memory`, 'drop');
      continue;
    }
    if (step.do === 'find' || step.do === 'delete') {
      const byIdx = step.do === 'delete' && v === undefined ? intOf(step, 'index') : undefined;
      const target = byIdx !== undefined ? list[byIdx] : list.find((id) => String(s.nodes[id].v) === String(v));
      let base = clean(s);
      const stop = target === undefined ? list.length : list.indexOf(target);
      for (let i = 0; i <= Math.min(stop, list.length - 1); i++) {
        const n = copy(base); n.ptr = {curr: list[i]};
        if (step.do === 'delete' && i > 0) n.ptr.prev = list[i - 1];
        push(n, `curr = ${show(s.nodes[list[i]].v)}${list[i] === target ? ' ✓' : step.do === 'find' ? ` ≠ ${show(v)} → curr = curr.next` : ''}`, 'tick');
        base = n;
      }
      if (target === undefined) { const n = copy(base); n.ptr = {curr: null}; push(n, `reached null: ${show(v ?? byIdx)} is not in the list`, 'error'); continue; }
      if (step.do === 'find') { const n = copy(base); n.found = target; push(n, step.note ?? `found ${show(v)} after ${stop + 1} step${stop ? 's' : ''}`, 'success'); continue; }
      let n = copy(base); n.mark = target; push(n, step.note ?? `delete ${show(s.nodes[target].v)}`, 'alert', target);
      const pred = stop > 0 ? list[stop - 1] : null, after = s.nodes[target].next;
      n = copy(n);
      if (pred !== null) { n.nodes[pred].next = after; push(n, `${show(n.nodes[pred].v)}.next → ${after === null ? 'null' : show(n.nodes[after].v)} (skip over it)`, 'connect', pred); }
      else { n.head = after; push(n, `head → ${after === null ? 'null' : show(n.nodes[after].v)}`, 'connect'); }
      n = copy(n); n.gone.push(target); n.order = n.order.filter((x) => x !== target); n.ptr = {}; n.mark = undefined; delete n.nodes[target];
      push(n, 'nothing points at it any more → it is gone', 'remove');
      continue;
    }
    if (step.do === 'reverse') {
      let n = clean(s); n.ptr = {prev: null, curr: list[0] ?? null}; push(n, step.note ?? 'reverse: prev = null, curr = head');
      let prev: number | null = null;
      for (const id of list) {
        n = copy(n); const nx = n.nodes[id].next; n.nodes[id].next = prev; n.ptr = {prev, curr: id};
        push(n, `${show(n.nodes[id].v)}.next → ${prev === null ? 'null' : show(n.nodes[prev].v)}`, 'swipe', id);
        prev = id; n = copy(n); n.ptr = {prev, curr: nx}; push(n, nx === null ? 'curr is null → done' : 'move prev and curr one step', 'tick');
      }
      n = copy(n); n.head = prev; n.ptr = {}; push(n, `head → ${prev === null ? 'null' : show(n.nodes[prev].v)}: reversed`, 'chime');
    }
  }
  const states = [s0, ...micros.map((m) => m.st)];
  const {starts, dur} = schedule(micros.length, len, fps, 0.1);
  const {c, k} = playhead(f, starts, dur);
  const prev = states[c < 0 ? 0 : c], next = states[c + 1] ?? prev;
  const cur = c < 0 ? undefined : micros[c];
  const st = k >= 0.5 ? next : prev;
  const note = [...micros.slice(0, c + 1)].reverse().find((m) => m.note)?.note;

  // layout
  const maxN = Math.max(3, ...states.map((x) => x.order.length));
  const slot = (W - 260 * u) / maxN;
  const nodeW = Math.min(220 * u, slot - Math.min(70 * u, slot * 0.26)), nodeH = Math.min(96 * u, nodeW * 0.5);
  const gap = Math.min(110 * u, slot - nodeW);
  const rowY = H * 0.47 - nodeH / 2;
  const posIn = (x: St, id: number) => {
    const n = x.order.length;
    const total = n * (nodeW + gap) + 120 * u; // + null
    const x0 = (W - total) / 2;
    const off = x.off[id] !== undefined;
    const i = off ? x.off[id] - 0.5 : x.order.indexOf(id);
    return {x: x0 + i * (nodeW + gap), y: rowY + (off ? 190 * u : 0)};
  };
  const ids = [...new Set([...Object.keys(prev.nodes), ...Object.keys(next.nodes)].map(Number))];
  const posOf = (id: number) => {
    const a = prev.nodes[id] ? posIn(prev, id) : undefined, b = next.nodes[id] ? posIn(next, id) : undefined;
    if (a && b) return {x: lerp(a.x, b.x, k), y: lerp(a.y, b.y, k)};
    return a ? {x: a.x, y: a.y + k * 120 * u} : b!;
  };
  const nullPos = () => {
    const tail = (x: St) => { const ch = chain(x); return ch.length ? posIn(x, ch[ch.length - 1]) : {x: W / 2 - 70 * u - nodeW - gap, y: rowY}; };
    const a = tail(prev), b = tail(next);
    return {x: lerp(a.x, b.x, k) + nodeW + gap, y: lerp(a.y, b.y, k)};
  };
  const ptrColor: Record<string, string> = {curr: FILL.accent, prev: FILL.purple};

  // arrow from node a's next box to target point
  const nextBox = (q: {x: number; y: number}) => ({x: q.x + nodeW * 0.82, y: q.y + nodeH / 2});
  const target = (x: St, id: number) => { const t = x.nodes[id]?.next; return t === null || t === undefined ? 'null' : t; };
  /** Path + the point the arrow head comes from. Forward on one row: straight (or an arc over skipped nodes); to a node off the row: an S-curve; backwards: a loop under/over to the node's middle. */
  const arrowPath = (from: {x: number; y: number}, to: {x: number; y: number}, back: boolean, below: boolean) => {
    const dx = to.x - from.x, dy = to.y - from.y;
    if (!back) {
      if (Math.abs(dy) < 4 * u && dx < nodeW + gap + 60 * u) return {d: `M${from.x},${from.y} L${to.x},${to.y}`, c: {x: from.x, y: from.y}};
      if (Math.abs(dy) < 4 * u) { const cy = from.y - nodeH * 1.05 - Math.min(80 * u, dx * 0.12); const c = {x: to.x - 40 * u, y: cy}; return {d: `M${from.x},${from.y} C${from.x + 40 * u},${cy} ${c.x},${c.y} ${to.x},${to.y}`, c}; }
      const c = {x: to.x - Math.max(40 * u, dx * 0.45), y: to.y};
      return {d: `M${from.x},${from.y} C${from.x + Math.max(40 * u, dx * 0.45)},${from.y} ${c.x},${c.y} ${to.x},${to.y}`, c};
    }
    const c = {x: to.x, y: to.y + (below ? 90 : -90) * u};
    return {d: `M${from.x},${from.y} C${from.x + 70 * u},${from.y + (below ? 40 : -40) * u} ${c.x},${c.y} ${to.x},${to.y}`, c};
  };
  const cues: Cue[] = [];
  if (p.sound) micros.forEach((m, i) => { if (m.sound) cues.push({sound: m.sound, at: Math.round(starts[i]), volume: 0.2}); });
  const enter = spring({frame: f, fps, config: {damping: 16, stiffness: 110}});
  const np = nullPos();

  return (
    <PaperStage eyebrow={p.eyebrow} title={p.title}>
      <div style={{position: 'absolute', inset: 0, opacity: enter}}>
        <svg width={W} height={H} style={{position: 'absolute', inset: 0, overflow: 'visible'}}>
          {ids.map((id) => {
            if (!prev.nodes[id] && !next.nodes[id]) return null;
            const q = posOf(id);
            const from = nextBox(q);
            const ta = prev.nodes[id] ? target(prev, id) : undefined, tb = next.nodes[id] ? target(next, id) : undefined;
            const ptOf = (t: number | 'null' | undefined) => (t === undefined ? undefined : t === 'null' ? {x: np.x, y: np.y + nodeH / 2} : (() => { const z = posOf(t); return z ? (z.x + nodeW * 0.3 < from.x ? {x: z.x + nodeW * 0.4, y: z.y + (z.y > q.y + 4 * u ? 0 : nodeH)} : {x: z.x - 3 * u, y: z.y + nodeH / 2}) : undefined; })());
            const pa = ptOf(ta), pb = ptOf(tb);
            const changing = ta !== tb && ta !== undefined && tb !== undefined;
            const isNull = (k >= 0.5 ? tb ?? ta : ta ?? tb) === 'null';
            if (isNull && !changing) return <g key={id}><circle cx={from.x} cy={from.y} r={6 * u} fill={PAPER.ink} /></g>;
            const to = pa && pb ? {x: lerp(pa.x, pb.x, k), y: lerp(pa.y, pb.y, k)} : (pb ?? pa);
            if (!to) return null;
            const back = to.x < from.x - 10 * u;
            const below = to.y >= q.y + nodeH - 2 * u;
            const dropping = !next.nodes[id];
            const fresh = ta === 'null' && tb !== 'null' && tb !== undefined;
            const color = changing ? FILL.accent : PAPER.ink;
            const {d, c: cp} = arrowPath(from, to, back, below);
            return (
              <g key={id} opacity={dropping ? 1 - k : fresh ? clamp01(k * 2) : 1}>
                <circle cx={from.x} cy={from.y} r={6 * u} fill={color} />
                <path d={d} stroke={color} strokeWidth={(changing ? 4.5 : 3.5) * u} fill="none" />
                <path d={arrowHead(cp.x, cp.y, to.x, to.y, 16 * u)} fill={color} />
              </g>
            );
          })}
        </svg>
        {/* null */}
        <div style={{position: 'absolute', left: np.x, top: np.y + nodeH / 2 - 22 * u, fontFamily: MONO, fontWeight: 800, fontSize: 26 * u, color: PAPER.inkSoft}}>null</div>
        {ids.map((id) => {
          const n = next.nodes[id] ?? prev.nodes[id];
          if (!n) return null;
          const q = posOf(id);
          const isNew = !prev.nodes[id];
          const dropping = !next.nodes[id];
          const fill = dropping || st.mark === id ? FILL.red : st.found === id ? FILL.found : st.ptr.curr === id ? FILL.compare : cur?.hot === id ? '#e3d6ff' : FILL.item;
          return (
            <div key={id} style={{position: 'absolute', left: q.x, top: q.y, width: nodeW, height: nodeH, display: 'flex', borderRadius: 14 * u, border: `${3 * u}px solid ${PAPER.ink}`, boxSizing: 'border-box', overflow: 'hidden', background: fill,
              opacity: isNew ? clamp01(k * 2.5) : dropping ? 1 - k : 1, transform: isNew ? `scale(${0.6 + 0.4 * clamp01(k * 2)})` : undefined, boxShadow: st.found === id ? `0 0 0 ${6 * u}px rgba(63,154,87,0.4)` : `0 ${6 * u}px ${12 * u}px rgba(70,50,30,0.13)`}}>
              <div style={{flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: MONO, fontWeight: 800, fontSize: Math.min(34 * u, nodeH * 0.42)}}>{show(n.v)}</div>
              <div style={{width: nodeW * 0.36, borderLeft: `${2.5 * u}px solid ${PAPER.ink}`, background: 'rgba(255,250,241,0.55)', display: 'flex', alignItems: 'flex-end', justifyContent: 'center', paddingBottom: 4 * u, fontSize: Math.min(14 * u, nodeW * 0.13), color: PAPER.inkSoft, fontWeight: 700}}>next</div>
            </div>
          );
        })}
        {/* head tag */}
        {(() => {
          const ha = prev.head === null ? undefined : posOf(prev.head), hb = next.head === null ? undefined : posOf(next.head);
          const q = ha && hb ? {x: lerp(ha.x, hb.x, k), y: lerp(ha.y, hb.y, k)} : hb ?? ha;
          if (!q) return null;
          return <PointerTag x={q.x + nodeW * 0.32} y={q.y - 10 * u} label="head" u={u} color={PAPER.ink} up={false} />;
        })()}
        {/* walking pointers */}
        {['curr', 'prev'].map((name, j) => {
          const a = prev.ptr[name], b = next.ptr[name];
          const pa = a !== undefined && a !== null && prev.nodes[a] ? posOf(a) : undefined, pb = b !== undefined && b !== null && next.nodes[b] ? posOf(b) : undefined;
          const q = pa && pb ? {x: lerp(pa.x, pb.x, k), y: lerp(pa.y, pb.y, k)} : pb ?? pa;
          if (!q) return null;
          const show0 = (a !== undefined) || (b !== undefined);
          return show0 ? <PointerTag key={name} x={q.x + nodeW * 0.32 + (j ? -nodeW * 0.0 : 0)} y={q.y + nodeH + 10 * u + j * 64 * u} label={name} u={u} color={ptrColor[name]} opacity={pa ? (pb ? 1 : 1 - k) : k} /> : null;
        })}
      </div>
      <NoteBar text={note} cx={W / 2} y={H - 260 * u} u={u} maxW={W - 200 * u} />
      {cues.map((q, i) => <Sfx key={i} sound={q.sound} at={q.at} volume={q.volume} />)}
    </PaperStage>
  );
};
