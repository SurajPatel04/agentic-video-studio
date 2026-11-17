/**
 * HashScene: a hash table in the paper style. A key goes into the hash function (the sum is shown),
 * "% size" picks a bucket, and the key flies there; a second key in the same bucket grows a chain
 * ("collision"). get / delete walk the chain node by node. The bucket is computed for you (sum of
 * letter codes, or the number itself) unless a step gives "bucket".
 */
import type {FC} from 'react';
import {spring, useCurrentFrame, useVideoConfig} from 'remotion';
import {z} from 'zod';
import {Sfx} from '../audio';
import {PAPER} from '../iso/iso';
import {useSceneLength, useUnit} from '../theme';
import {MONO, PaperStage, clamp01, flexValue, type Cue} from './paperStage';
import {FILL, NoteBar, arrowHead, argsOf, flexSteps, intOf, lerpPt, playhead, schedule, show, stepSchema, valOf, type Pt, type Step} from './dsaKit';

const VERBS: Record<string, string> = {
  insert: 'insert', put: 'insert', set: 'insert', add: 'insert', store: 'insert', save: 'insert', write: 'insert',
  get: 'get', find: 'get', lookup: 'get', search: 'get', read: 'get', has: 'get', contains: 'get', fetch: 'get',
  delete: 'delete', remove: 'delete', del: 'delete', erase: 'delete', drop: 'delete', note: 'note', say: 'note', resize: 'note',
};
const HASHES = ['sum', 'length', 'first', 'number'] as const;
const flexHash = (raw: unknown) => {
  if (!raw || typeof raw !== 'object') return raw;
  const r = {...(raw as Record<string, unknown>)};
  for (const k of ['buckets', 'capacity', 'slots', 'tableSize', 'm']) if (r.size === undefined && typeof r[k] === 'number') { r.size = r[k]; delete r[k]; }
  for (const k of ['hashFunction', 'function', 'fn']) if (r.hash === undefined && typeof r[k] === 'string') { r.hash = r[k]; delete r[k]; }
  r.hash = flexValue(r.hash, {sum: 'sum', 'char sum': 'sum', ascii: 'sum', 'sum of codes': 'sum', len: 'length', length: 'length', first: 'first', 'first letter': 'first', number: 'number', mod: 'number', modulo: 'number', int: 'number', identity: 'number'});
  if (r.hash === undefined) delete r.hash;
  if (r.entries && !Array.isArray(r.entries) && typeof r.entries === 'object') r.entries = Object.entries(r.entries as object).map(([key, value]) => ({key, value}));
  if (r.steps === undefined) for (const k of ['actions', 'operations', 'ops', 'keys']) if (r[k] !== undefined) { r.steps = r[k]; delete r[k]; }
  if (Array.isArray(r.steps)) r.steps = (r.steps as unknown[]).map((s) => (typeof s === 'string' && !/\s/.test(s.trim()) ? {do: 'insert', key: s} : typeof s === 'number' ? {do: 'insert', key: s} : s));
  if (r.steps !== undefined) r.steps = (flexSteps(r.steps, VERBS, {name: 'key', k: 'key', item: 'key', val: 'value', v: 'value', index: 'bucket', slot: 'bucket'}) as Record<string, unknown>[]).map((s) => {
    if (s && typeof s === 'object' && s.do === undefined && s.key !== undefined) return {...s, do: 'insert'};
    if (s && typeof s === 'object' && s.key === undefined && Array.isArray(s.args) && s.args.length) return {...s, key: s.args[0], value: s.value ?? s.args[1]};
    return s;
  });
  return r;
};

const EXAMPLE_STEPS = [{do: 'insert', key: 'cat', value: 'meow'}, {do: 'insert', key: 'dog', value: 'woof'}, {do: 'insert', key: 'act', value: 'play'}, {do: 'get', key: 'act'}];

export const hashSceneSchema = z.preprocess(flexHash, z.object({
  eyebrow: z.string().max(40).optional(),
  title: z.string().max(70).optional(),
  size: z.number().int().min(3).max(12).default(8),
  hash: z.enum(HASHES).optional(), // default: sum of letter codes for words, the number itself for numbers
  entries: z.array(z.object({key: z.union([z.string().max(12), z.number()]), value: z.union([z.string().max(12), z.number()]).optional()}).strict()).max(10).default([]), // in the table at the start
  steps: z.array(stepSchema).max(16).default(EXAMPLE_STEPS),
  showValues: z.boolean().default(true),
  sound: z.boolean().default(true),
}).strict().superRefine((p, ctx) => {
  p.steps.forEach((s, i) => {
    if (!Object.values(VERBS).includes(s.do)) ctx.addIssue({code: 'custom', path: ['steps', i, 'do'], message: 'use insert, get, delete or note'});
    if (s.do !== 'note' && valOf(s, 'key') === undefined) ctx.addIssue({code: 'custom', path: ['steps', i, 'key'], message: `${s.do} needs "key"`});
    const b = intOf(s, 'bucket');
    if (b !== undefined && (b < 0 || b >= p.size)) ctx.addIssue({code: 'custom', path: ['steps', i, 'bucket'], message: `bucket must be 0..${p.size - 1}`});
  });
}));
type Props = z.output<typeof hashSceneSchema>;

export const description =
  'A hash table in the paper style: a key goes through the hash function (the sum is shown), "% size" picks a bucket, ' +
  'and the key flies there; keys landing in the same bucket grow a chain (collision). get / delete walk the chain node ' +
  'by node. Give "size" (buckets, 3-12), optional "entries", and "steps": insert {key, value} | get {key} | delete {key} | note. ' +
  'Buckets are computed (sum of letter codes, or the number) unless a step gives "bucket". "act" and "cat" collide.';
export const tags = ['hash table', 'hash map', 'hashmap', 'dictionary', 'hashing', 'hash function', 'collision', 'bucket', 'chaining', 'dict', 'map', 'object', 'set', 'dsa', 'o(1)'];

type Node = {id: number; key: string | number; value?: string | number};
type St = {b: Node[][]};
type Micro = {kind: 'hash' | 'place' | 'walk' | 'found' | 'missing' | 'remove' | 'note'; key?: string | number; value?: string | number; bucket?: number; at?: number; id?: number; note?: string; formula?: string[]; collide?: boolean};

const codesOf = (k: string) => [...k].map((c) => c.charCodeAt(0));
const hashOf = (key: string | number, size: number, mode?: string): {bucket: number; formula: string[]} => {
  const isNum = typeof key === 'number' || (/^-?\d+$/.test(String(key)) && mode !== 'sum');
  const m = mode ?? (isNum ? 'number' : 'sum');
  if (m === 'number' && isNum) { const n = Number(key); const b = ((n % size) + size) % size; return {bucket: b, formula: [`hash(${n}) = ${n}`, `${n} % ${size} = ${b}`]}; }
  const s = String(key);
  if (m === 'length') return {bucket: s.length % size, formula: [`len("${s}") = ${s.length}`, `${s.length} % ${size} = ${s.length % size}`]};
  if (m === 'first') { const c = s.charCodeAt(0); return {bucket: c % size, formula: [`code("${s[0]}") = ${c}`, `${c} % ${size} = ${c % size}`]}; }
  const codes = codesOf(s), sum = codes.reduce((a, b) => a + b, 0);
  return {bucket: sum % size, formula: [s.length <= 4 ? `${codes.join(' + ')} = ${sum}` : `sum of ${s.length} letter codes = ${sum}`, `${sum} % ${size} = ${sum % size}`]};
};

export const HashScene: FC<z.input<typeof hashSceneSchema>> = (input) => {
  const p = hashSceneSchema.parse(input) as Props;
  const f = useCurrentFrame();
  const {fps, width: W, height: H} = useVideoConfig();
  const u = useUnit();
  const len = useSceneLength();

  let nid = 0;
  const init: St = {b: Array.from({length: p.size}, () => [])};
  for (const e of p.entries) { const {bucket} = hashOf(e.key, p.size, p.hash); const row = init.b[bucket]; const i = row.findIndex((x) => x.key === e.key); if (i >= 0) row[i] = {...row[i], value: e.value}; else row.push({id: nid++, key: e.key, value: e.value}); }
  // micro steps
  const micros: Micro[] = [];
  const shadow = init.b.map((r) => [...r]);
  for (const s of p.steps as Step[]) {
    if (s.do === 'note') { micros.push({kind: 'note', note: s.note}); continue; }
    const key = valOf(s, 'key') ?? (argsOf(s)[0] as string), value = valOf(s, 'value');
    const forced = intOf(s, 'bucket');
    const h = hashOf(key, p.size, p.hash);
    const bucket = forced ?? h.bucket;
    const formula = forced !== undefined ? [`hash("${key}") % ${p.size}`, `= ${bucket}`] : h.formula;
    const row = shadow[bucket];
    micros.push({kind: 'hash', key, bucket, formula, note: s.note ?? `${s.do === 'insert' ? 'put' : s.do}("${key}") → hash it`});
    if (s.do === 'insert') {
      const i = row.findIndex((x) => String(x.key) === String(key));
      if (i >= 0) { micros.push({kind: 'walk', bucket, at: i, key}); micros.push({kind: 'place', key, value, bucket, id: row[i].id, note: `"${key}" is already there → update the value`}); row[i] = {...row[i], value}; }
      else { const id = nid++; micros.push({kind: 'place', key, value, bucket, id, collide: row.length > 0, note: row.length ? `collision! bucket ${bucket} already has "${row.map((x) => x.key).join('", "')}" → add to its chain` : `bucket ${bucket} is empty → store it there`}); row.push({id, key, value}); }
    } else {
      let hit = -1;
      for (let i = 0; i < row.length; i++) { micros.push({kind: 'walk', bucket, at: i, key, note: `compare "${row[i].key}" with "${key}"${String(row[i].key) === String(key) ? ' ✓' : ''}`}); if (String(row[i].key) === String(key)) { hit = i; break; } }
      if (hit < 0) micros.push({kind: 'missing', bucket, key, note: row.length ? `end of the chain: "${key}" is not here` : `bucket ${bucket} is empty: "${key}" is not here`});
      else if (s.do === 'get') micros.push({kind: 'found', bucket, at: hit, key, id: row[hit].id, note: `found → ${show(row[hit].value ?? row[hit].key)}${hit ? ` (${hit + 1} compares)` : ' (1 step, no scanning)'}`});
      else { micros.push({kind: 'remove', bucket, at: hit, key, id: row[hit].id, note: `delete "${key}" and re-link the chain`}); row.splice(hit, 1); }
    }
  }
  const states: St[] = [init];
  for (const m of micros) {
    const s = states[states.length - 1];
    const n: St = {b: s.b.map((r) => [...r])};
    if (m.kind === 'place' && m.bucket !== undefined && m.id !== undefined) { const row = n.b[m.bucket]; const i = row.findIndex((x) => x.id === m.id); if (i >= 0) row[i] = {...row[i], value: m.value}; else row.push({id: m.id, key: m.key!, value: m.value}); }
    if (m.kind === 'remove' && m.bucket !== undefined) n.b[m.bucket] = n.b[m.bucket].filter((x) => x.id !== m.id);
    states.push(n);
  }
  const {starts, dur} = schedule(micros.length, len, fps, 0.08);
  const {c, k} = playhead(f, starts, dur);
  const prev = states[c < 0 ? 0 : c], next = states[c + 1] ?? prev;
  const cur = c < 0 ? undefined : micros[c];
  const lastHash = [...micros.slice(0, c + 1)].reverse().find((m) => m.kind === 'hash');
  const op = lastHash; // the key currently being worked on

  // layout
  const portrait = H > W;
  const top = 220 * u, bottom = H - 255 * u;
  const rowH = Math.min(86 * u, (bottom - top) / p.size);
  const bx = portrait ? 120 * u : W * 0.43, bw = 76 * u;
  const by = (i: number) => top + (bottom - top - rowH * p.size) / 2 + i * rowH;
  const maxChain = Math.max(1, ...states.map((s) => Math.max(...s.b.map((r) => r.length))));
  const nodeW = Math.min(p.showValues ? 230 * u : 150 * u, (W - 90 * u - bx - bw - 30 * u) / maxChain - 46 * u), nodeH = rowH * 0.74;
  const nodeAt = (b: number, i: number): Pt => ({x: bx + bw + 46 * u + i * (nodeW + 46 * u), y: by(b) + (rowH - nodeH) / 2, w: nodeW, h: nodeH});
  const machine = portrait ? {x: W / 2 - 230 * u, y: top - 10 * u, w: 460 * u, h: 150 * u} : {x: 110 * u, y: (top + bottom) / 2 - 110 * u, w: Math.min(520 * u, bx - 190 * u), h: 220 * u};
  const keyIn: Pt = {x: machine.x + machine.w / 2 - 90 * u, y: machine.y - 100 * u, w: 180 * u, h: 64 * u};
  const keyHash: Pt = {x: machine.x + machine.w / 2 - 90 * u, y: machine.y + 18 * u, w: 180 * u, h: 64 * u};
  const where = (s: St, id: number): Pt | undefined => { for (let b = 0; b < s.b.length; b++) { const i = s.b[b].findIndex((x) => x.id === id); if (i >= 0) return nodeAt(b, i); } return undefined; };
  const nodes = new Map<number, Node>();
  [...prev.b.flat(), ...next.b.flat()].forEach((x) => nodes.set(x.id, x));

  const cues: Cue[] = [];
  if (p.sound) micros.forEach((m, i) => {
    const at = Math.round(starts[i]);
    if (m.kind === 'hash') cues.push({sound: 'data', at, volume: 0.2});
    if (m.kind === 'place') cues.push({sound: m.collide ? 'alert' : 'drop', at: at + Math.round(dur * 0.6), volume: 0.22});
    if (m.kind === 'walk') cues.push({sound: 'tick', at, volume: 0.2});
    if (m.kind === 'found') cues.push({sound: 'success', at, volume: 0.28});
    if (m.kind === 'missing') cues.push({sound: 'error', at, volume: 0.2});
    if (m.kind === 'remove') cues.push({sound: 'remove', at, volume: 0.22});
  });
  const enter = spring({frame: f, fps, config: {damping: 16, stiffness: 110}});
  const activeBucket = op && cur && cur.kind !== 'hash' && cur.kind !== 'note' ? op.bucket : cur?.kind === 'hash' && k > 0.75 ? cur.bucket : undefined;
  const count = (k >= 0.5 ? next : prev).b.flat().length;
  const note = [...micros.slice(0, c + 1)].reverse().find((m) => m.note)?.note;
  const formulaStep = cur?.kind === 'hash' ? Math.floor(k * 2.2) : 2;

  // the key chip of the current operation (before it lands)
  let chip: {pt: Pt; label: string; opacity: number} | undefined;
  if (cur?.kind === 'hash') chip = {pt: lerpPt(keyIn, keyHash, k), label: String(cur.key), opacity: clamp01(k * 3)};
  else if (op && cur && (cur.kind === 'walk' || cur.kind === 'found' || cur.kind === 'missing' || cur.kind === 'remove') ) chip = {pt: keyHash, label: String(op.key), opacity: 1};

  return (
    <PaperStage eyebrow={p.eyebrow} title={p.title}>
      <div style={{position: 'absolute', inset: 0, opacity: enter}}>
        {/* stats */}
        <div style={{position: 'absolute', right: 90 * u, top: (p.title ? 70 : 56) * u, display: 'flex', gap: 12 * u}}>
          {[['keys', count], ['buckets', p.size], ['load', (count / p.size).toFixed(2)]].map(([a, b]) => <div key={a as string} style={{padding: `${8 * u}px ${16 * u}px`, borderRadius: 12 * u, background: PAPER.card, border: `${2 * u}px solid ${PAPER.ink}`, fontSize: 21 * u, fontWeight: 700, color: PAPER.inkSoft}}>{a}: <span style={{fontFamily: MONO, color: PAPER.ink, fontWeight: 800}}>{b}</span></div>)}
        </div>
        {/* hash machine */}
        <div style={{position: 'absolute', left: machine.x, top: machine.y, width: machine.w, height: machine.h, borderRadius: 22 * u, background: '#e9e2f7', border: `${3 * u}px solid ${PAPER.ink}`, boxShadow: `0 ${8 * u}px ${18 * u}px rgba(70,50,30,0.14)`}}>
          <div style={{position: 'absolute', left: 0, right: 0, bottom: 14 * u, textAlign: 'center', fontFamily: MONO, fontSize: 21 * u, color: PAPER.ink, lineHeight: 1.5}}>
            {op?.formula ? op.formula.map((l, i) => <div key={i} style={{opacity: lastHash === cur && i >= formulaStep ? 0.15 : 1, fontWeight: i === 1 ? 800 : 500, color: i === 1 ? FILL.purple : PAPER.ink}}>{l}</div>) : <div style={{fontWeight: 800}}>hash(key) % {p.size}</div>}
          </div>
          <div style={{position: 'absolute', left: 16 * u, top: -16 * u, padding: `${2 * u}px ${12 * u}px`, borderRadius: 10 * u, background: PAPER.ink, color: '#fffaf1', fontSize: 18 * u, fontWeight: 800, fontFamily: MONO}}>hash()</div>
        </div>
        {/* buckets */}
        {Array.from({length: p.size}, (_, b) => {
          const on = activeBucket === b;
          return <div key={b} style={{position: 'absolute', left: bx, top: by(b) + 4 * u, width: bw, height: rowH - 8 * u, borderRadius: 12 * u, background: on ? FILL.compare : FILL.soft, border: `${2.5 * u}px solid ${PAPER.ink}`, boxSizing: 'border-box',
            display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: MONO, fontWeight: 800, fontSize: Math.min(28 * u, rowH * 0.4), boxShadow: on ? `0 0 0 ${5 * u}px rgba(255,160,60,0.4)` : undefined}}>{b}</div>;
        })}
        {/* chain links */}
        <svg width={W} height={H} style={{position: 'absolute', inset: 0, pointerEvents: 'none'}}>
          {/* path from the machine to the chosen bucket */}
          {cur && (cur.kind === 'hash' ? k > 0.75 : cur.kind === 'place') && op?.bucket !== undefined ? (() => {
            const x1 = machine.x + machine.w, y1 = machine.y + machine.h / 2, x2 = bx - 8 * u, y2 = by(op.bucket) + rowH / 2;
            return <g><path d={`M${x1},${y1} C${x1 + 60 * u},${y1} ${x2 - 60 * u},${y2} ${x2},${y2}`} stroke={FILL.accent} strokeWidth={3.5 * u} fill="none" strokeDasharray={`${10 * u} ${8 * u}`} /><path d={arrowHead(x2 - 30 * u, y2, x2, y2, 16 * u)} fill={FILL.accent} /></g>;
          })() : null}
          {Array.from({length: p.size}, (_, b) => {
            const pts = [...nodes.values()].map((nd) => {
              const a = where(prev, nd.id), z2 = where(next, nd.id);
              if (!a && !z2) return null;
              const inRow = (s: St) => s.b[b].some((x) => x.id === nd.id);
              if (!inRow(prev) && !inRow(next)) return null;
              const q = a && z2 ? lerpPt(a, z2, k) : (z2 ?? a)!;
              return {q, order: (next.b[b].findIndex((x) => x.id === nd.id) + 1 || prev.b[b].findIndex((x) => x.id === nd.id) + 1)};
            }).filter(Boolean).sort((x, y) => x!.order - y!.order) as {q: Pt}[];
            const chain = [{x: bx + bw - 20 * u, y: by(b) + rowH / 2 - nodeH / 2, w: 20 * u, h: nodeH}, ...pts.map((x) => x.q)];
            return chain.slice(0, -1).map((a, i) => {
              const z2 = chain[i + 1];
              const x1 = a.x + (a.w ?? 0), y1 = a.y + (a.h ?? 0) / 2, x2 = z2.x - 2 * u, y2 = z2.y + (z2.h ?? 0) / 2;
              return <g key={`${b}-${i}`}><line x1={x1} y1={y1} x2={x2 - 8 * u} y2={y2} stroke={PAPER.ink} strokeWidth={3 * u} /><path d={arrowHead(x1, y1, x2, y2, 14 * u)} fill={PAPER.ink} /></g>;
            });
          })}
        </svg>
        {/* chain nodes */}
        {[...nodes.values()].map((nd) => {
          const a = where(prev, nd.id), z2 = where(next, nd.id);
          const placing = cur?.kind === 'place' && cur.id === nd.id && !a;
          const removing = cur?.kind === 'remove' && cur.id === nd.id;
          let q: Pt, opacity = 1;
          if (placing) { q = lerpPt(keyHash, z2!, k); }
          else if (removing) { q = {...a!, y: a!.y + k * 60 * u}; opacity = 1 - k; }
          else if (a && z2) q = lerpPt(a, z2, k);
          else if (a || z2) q = (a ?? z2)!; else return null;
          const walkHere = cur && (cur.kind === 'walk' || cur.kind === 'found') && cur.bucket !== undefined && prev.b[cur.bucket][cur.at ?? -1]?.id === nd.id;
          const isFound = cur?.kind === 'found' && cur.id === nd.id;
          const updated = cur?.kind === 'place' && cur.id === nd.id && !!a;
          const shown = (k >= 0.5 ? next : prev).b.flat().find((x) => x.id === nd.id) ?? nd;
          const fill = removing ? FILL.red : isFound ? FILL.found : walkHere ? FILL.compare : updated ? FILL.blue : placing && cur?.collide ? '#ffd9c7' : FILL.item;
          return (
            <div key={nd.id} style={{position: 'absolute', left: q.x, top: q.y, width: q.w, height: q.h, borderRadius: 12 * u, background: fill, border: `${2.5 * u}px solid ${PAPER.ink}`, boxSizing: 'border-box', opacity,
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 * u, fontFamily: MONO, fontSize: Math.min(24 * u, (q.h ?? 50) * 0.36), whiteSpace: 'nowrap', overflow: 'hidden',
              boxShadow: walkHere || isFound ? `0 0 0 ${5 * u}px ${isFound ? 'rgba(63,154,87,0.4)' : 'rgba(255,160,60,0.45)'}` : `0 ${5 * u}px ${10 * u}px rgba(70,50,30,0.12)`}}>
              <b>{show(shown.key)}</b>{p.showValues && shown.value !== undefined ? <span style={{color: PAPER.inkSoft}}>: {show(shown.value)}</span> : null}
            </div>
          );
        })}
        {chip ? <div style={{position: 'absolute', left: chip.pt.x, top: chip.pt.y, width: chip.pt.w, height: chip.pt.h, borderRadius: 999, background: '#fff', border: `${3 * u}px solid ${FILL.accent}`, boxSizing: 'border-box', opacity: chip.opacity,
          display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: MONO, fontWeight: 800, fontSize: 26 * u}}>"{chip.label}"</div> : null}
        {cur?.kind === 'missing' && op?.bucket !== undefined ? <div style={{position: 'absolute', left: nodeAt(op.bucket, next.b[op.bucket].length).x, top: by(op.bucket) + rowH / 2 - 18 * u, fontFamily: MONO, fontWeight: 800, fontSize: 24 * u, color: '#b2402f', opacity: k}}>null ✗</div> : null}
      </div>
      <NoteBar text={note} cx={W / 2} y={H - 238 * u} u={u} maxW={W - 200 * u} />
      {cues.map((q, i) => <Sfx key={i} sound={q.sound} at={q.at} volume={q.volume} />)}
    </PaperStage>
  );
};
