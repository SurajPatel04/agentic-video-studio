/**
 * PipelineScene: a table flowing through data stages, in the paper style. The stages (source, filter,
 * map, join, group, sort, select, load) sit in a row at the top; as each one runs, a sweep passes over
 * the table: rows a filter drops turn red and fall out, changed values flash, new columns slide in
 * (join / map), rows regroup or reorder - then the table settles into the stage's output.
 *
 * Each stage gives its OUTPUT table (columns + rows); nothing is computed, so any operation works.
 * Rows keep their identity through the first column (or "key"). Forgiving input: rows as objects,
 * stage names/ops in plain words, "output"/"result" tables.
 */
import {arrowHead} from './dsaKit';
import type {FC} from 'react';
import {spring, useCurrentFrame, useVideoConfig} from 'remotion';
import {z} from 'zod';
import {Sfx} from '../audio';
import {PAPER} from '../iso/iso';
import {useSceneLength, useUnit} from '../theme';
import {MONO, PaperStage, clamp01, ease, flexValue, fraction, type Cue} from './paperStage';
import {IsoIcon, isoKindFor} from '../iso/IsoIcon';
import {fitColumns, fitRows} from './tableFit';

const cell = z.union([z.string().max(30), z.number(), z.boolean(), z.null()]);
const tableSchema = z.object({
  name: z.string().max(30).optional(),
  columns: z.array(z.string().max(20)).min(1).max(6),
  rows: z.array(z.array(cell)).max(8),
}).strict();
const OPS = ['source', 'filter', 'map', 'join', 'group', 'sort', 'select', 'clean', 'load', 'custom'] as const;
const stageSchema = z.object({
  label: z.string().max(24),
  op: z.enum(OPS).default('custom'),
  detail: z.string().max(60).optional(), // the rule: "price > 20", "total = price * qty"
  columns: z.array(z.string().max(20)).min(1).max(6).optional(), // the table AFTER this stage (omit = unchanged)
  rows: z.array(z.array(cell)).max(8).optional(),
  with: tableSchema.optional(), // join: the other table
  at: fraction.optional(), // when this stage runs (default: evenly spaced)
}).strict();

const EXAMPLE = {
  source: {name: 'orders.csv', columns: ['id', 'item', 'price', 'qty'], rows: [[1, 'pen', 2, 10], [2, 'lamp', 35, 1], [3, 'desk', 120, 1], [4, 'mug', 8, 4], [5, 'chair', 60, 2]]},
  stages: [
    {label: 'Filter', op: 'filter', detail: 'price > 10', columns: ['id', 'item', 'price', 'qty'], rows: [[2, 'lamp', 35, 1], [3, 'desk', 120, 1], [5, 'chair', 60, 2]]},
    {label: 'Map', op: 'map', detail: 'total = price * qty', columns: ['id', 'item', 'price', 'qty', 'total'], rows: [[2, 'lamp', 35, 1, 35], [3, 'desk', 120, 1, 120], [5, 'chair', 60, 2, 120]]},
    {label: 'Sort', op: 'sort', detail: 'total desc', columns: ['id', 'item', 'price', 'qty', 'total'], rows: [[3, 'desk', 120, 1, 120], [5, 'chair', 60, 2, 120], [2, 'lamp', 35, 1, 35]]},
  ],
};

const OP_ALIASES: Record<string, string> = {where: 'filter', drop: 'filter', remove: 'filter', keep: 'filter', transform: 'map', compute: 'map', derive: 'map', calculate: 'map', 'add column': 'map', apply: 'map',
  merge: 'join', lookup: 'join', enrich: 'join', 'left join': 'join', 'inner join': 'join', aggregate: 'group', groupby: 'group', 'group by': 'group', sum: 'group', count: 'group', reduce: 'group',
  order: 'sort', orderby: 'sort', 'order by': 'sort', rank: 'sort', project: 'select', pick: 'select', columns: 'select', extract: 'source', read: 'source', ingest: 'source', input: 'source', e: 'source',
  write: 'load', save: 'load', store: 'load', export: 'load', output: 'load', sink: 'load', l: 'load', dedupe: 'clean', deduplicate: 'clean', fix: 'clean', normalize: 'clean', t: 'map'};
/** Rows as objects -> arrays (columns from the first object). */
const tableish = (t: unknown) => {
  if (!t || typeof t !== 'object') return t;
  const o = {...(t as Record<string, unknown>)};
  if (!o.rows && Array.isArray(o.data)) { o.rows = o.data; delete o.data; }
  if (Array.isArray(o.rows) && o.rows.length && o.rows[0] && typeof o.rows[0] === 'object' && !Array.isArray(o.rows[0])) {
    const cols = (o.columns as string[] | undefined) ?? Object.keys(o.rows[0] as object);
    o.columns = cols;
    o.rows = (o.rows as Record<string, unknown>[]).map((r) => cols.map((c) => (r[c] ?? null) as unknown));
  }
  return o;
};
const flexPipeline = (raw: unknown) => {
  if (!raw || typeof raw !== 'object') return raw;
  const r = {...(raw as Record<string, unknown>)};
  for (const k of ['input', 'data', 'table', 'start']) if (r.source === undefined && r[k] && typeof r[k] === 'object') { r.source = Array.isArray(r[k]) ? {rows: r[k]} : r[k]; delete r[k]; }
  if (Array.isArray(r.source)) r.source = {rows: r.source};
  if (r.source === undefined && Array.isArray(r.rows)) { r.source = {columns: r.columns, rows: r.rows}; delete r.rows; delete r.columns; }
  r.source = tableish(r.source);
  for (const k of ['steps', 'pipeline', 'operations', 'transforms']) if (r.stages === undefined && Array.isArray(r[k])) { r.stages = r[k]; delete r[k]; }
  if (Array.isArray(r.stages)) r.stages = (r.stages as unknown[]).map((s) => {
    if (typeof s === 'string') return {label: s, op: OP_ALIASES[s.toLowerCase()] ?? ((OPS as readonly string[]).includes(s.toLowerCase()) ? s.toLowerCase() : 'custom')};
    if (!s || typeof s !== 'object') return s;
    let o = {...(s as Record<string, unknown>)};
    for (const k of ['name', 'title', 'stage']) if (o.label === undefined && typeof o[k] === 'string') { o.label = o[k]; delete o[k]; }
    for (const k of ['type', 'kind', 'operation', 'step', 'action']) if (o.op === undefined && typeof o[k] === 'string') { o.op = o[k]; delete o[k]; }
    for (const k of ['description', 'expr', 'expression', 'condition', 'rule', 'code', 'sql', 'where', 'by']) if (o.detail === undefined && typeof o[k] === 'string') { o.detail = o[k]; delete o[k]; }
    for (const k of ['output', 'result', 'table', 'after']) if (o[k] && typeof o[k] === 'object') { const t = tableish(Array.isArray(o[k]) ? {rows: o[k]} : o[k]) as Record<string, unknown>; o = {...o, columns: o.columns ?? t.columns, rows: o.rows ?? t.rows}; delete o[k]; }
    o = tableish(o) as Record<string, unknown>;
    if (o.with) o.with = tableish(o.with);
    if (typeof o.op === 'string') o.op = flexValue(o.op, OP_ALIASES);
    if (typeof o.op === 'string' && !(OPS as readonly string[]).includes(o.op)) o.op = 'custom';
    if (o.label === undefined && typeof o.op === 'string') o.label = o.op[0].toUpperCase() + o.op.slice(1);
    if (typeof o.at === 'number' && o.at > 1 && o.at <= 100) o.at = o.at / 100;
    return o;
  });
  // Fit every table: rows without columns keep the previous table's columns; extra columns / rows are
  // dropped, rows padded or cut to one value per column, long text clipped.
  let cols: unknown;
  const fit = (t: Record<string, unknown>) => {
    if (t.columns === undefined && Array.isArray(t.rows) && Array.isArray(cols)) t.columns = cols;
    if (t.columns !== undefined) t.columns = fitColumns(t.columns, 6, 20);
    if (Array.isArray(t.columns)) cols = t.columns;
    if (t.rows !== undefined) t.rows = fitRows(t.rows, {width: Array.isArray(cols) ? cols.length : undefined, max: 8, maxChars: 30});
    return t;
  };
  if (r.source && typeof r.source === 'object' && !Array.isArray(r.source)) r.source = fit({...(r.source as Record<string, unknown>)});
  if (Array.isArray(r.stages)) r.stages = (r.stages as unknown[]).map((s) => {
    if (!s || typeof s !== 'object') return s;
    const o = fit({...(s as Record<string, unknown>)});
    if (o.with && typeof o.with === 'object' && !Array.isArray(o.with)) {
      const main = cols;
      cols = undefined;
      o.with = fit({...(o.with as Record<string, unknown>)});
      cols = main;
    }
    return o;
  });
  return r;
};

export const pipelineSceneSchema = z.preprocess(flexPipeline, z.object({
  eyebrow: z.string().max(40).optional(),
  title: z.string().max(70).optional(),
  source: tableSchema.default(() => tableSchema.parse(EXAMPLE.source)),
  stages: z.array(stageSchema).min(1).max(5).default(() => EXAMPLE.stages.map((s) => stageSchema.parse(s))),
  key: z.string().max(20).optional(), // column that identifies a row through the stages (default: the first)
  sound: z.boolean().default(true),
}).strict().superRefine((p, ctx) => {
  const check = (cols: string[], rows: unknown[][], path: (string | number)[]) => rows.forEach((row, i) => {
    if (row.length !== cols.length) ctx.addIssue({code: 'custom', path: [...path, i], message: `row has ${row.length} values but there are ${cols.length} columns (${cols.join(', ')})`});
  });
  check(p.source.columns, p.source.rows, ['source', 'rows']);
  let cols = p.source.columns;
  p.stages.forEach((s, i) => {
    if (s.rows && !s.columns) ctx.addIssue({code: 'custom', path: ['stages', i, 'columns'], message: 'give "columns" with "rows" (the table after this stage)'});
    if (s.columns) cols = s.columns;
    if (s.rows) check(cols, s.rows, ['stages', i, 'rows']);
  });
}));
type Props = z.output<typeof pipelineSceneSchema>;

export const description =
  'A table flowing through data stages, in the paper style: stages (source, filter, map, join, group, sort, select, ' +
  'clean, load) in a row at the top; as each runs, rows a filter drops turn red and fall out, changed values flash, ' +
  'new columns slide in, rows reorder. Give "source" (columns + up to 8 rows) and "stages" with each stage\'s OUTPUT ' +
  'table (columns + rows) and a "detail" rule. Use for ETL, data cleaning, pandas / SQL transforms, data science steps.';
export const tags = ['pipeline', 'etl', 'data', 'data science', 'pandas', 'dataframe', 'transform', 'filter', 'map', 'join', 'group by', 'aggregate', 'data cleaning', 'spark', 'stream'];

const OP_STYLE: Record<string, {color: string; icon: string}> = {
  source: {color: '#b8d6f3', icon: 'database'}, filter: {color: '#f7c6a3', icon: 'funnel'}, map: {color: '#cdc3ee', icon: 'wand-sparkles'},
  join: {color: '#b9e2c7', icon: 'merge'}, group: {color: '#f4da93', icon: 'layers'}, sort: {color: '#b0dfda', icon: 'arrow-down-wide-narrow'},
  select: {color: '#f3b9c6', icon: 'columns-3'}, clean: {color: '#d9e8b5', icon: 'sparkles'}, load: {color: '#c9d3e0', icon: 'hard-drive-download'}, custom: {color: '#e3dccd', icon: 'cog'},
};
/** The iso object shown on each stage: real objects where they exist, else a tile with the stage's icon. */
const OP_KIND: Record<string, string> = {filter: 'tile', map: 'gear', join: 'tile', group: 'tile', sort: 'tile', select: 'tile', clean: 'tile', load: 'storage', custom: 'gear'};
type Tbl = {columns: string[]; rows: (string | number | boolean | null)[][]};
const show = (v: unknown) => (v === null || v === undefined ? '—' : String(v));

export const PipelineScene: FC<z.input<typeof pipelineSceneSchema>> = (input) => {
  const p = pipelineSceneSchema.parse(input) as Props;
  const f = useCurrentFrame();
  const {fps, width: W, height: H} = useVideoConfig();
  const u = useUnit();
  const len = useSceneLength();
  const n = p.stages.length;

  // the table after each stage (tables[0] = source)
  const tables: Tbl[] = [p.source];
  p.stages.forEach((s) => {
    const prev = tables[tables.length - 1];
    tables.push({columns: s.columns ?? prev.columns, rows: s.rows ?? (s.columns && s.columns.join() !== prev.columns.join() ? prev.rows : prev.rows)});
  });
  // timing: each stage runs at its "at" (default evenly spaced), for D frames; pushed back if they overlap
  const D = Math.min(Math.round(fps * 1.6), Math.round((len * 0.8) / n * 0.75));
  let t0 = 0;
  const starts = p.stages.map((s, k) => { const st = Math.max(Math.round((s.at ?? 0.1 + (0.8 * k) / n) * len), t0); t0 = st + D + 4; return st; });
  if (starts[n - 1] + D > len * 0.97) { const k = (len * 0.97 - D) / Math.max(1, starts[n - 1]); for (let i = 0; i < n; i++) starts[i] = Math.round(starts[i] * k); }
  const cur = starts.map((s) => f >= s).lastIndexOf(true); // running / last run stage (-1 before any)
  const t = cur < 0 ? 1 : clamp01((f - starts[cur]) / D);
  const before = tables[cur < 0 ? 0 : cur], after = tables[cur < 0 ? 0 : cur + 1];

  // rows: match by key column value
  const keyName = p.key ?? p.source.columns[0];
  const keyOf = (tb: Tbl, r: Tbl['rows'][number], i: number) => { const k = tb.columns.indexOf(keyName); return k >= 0 ? show(r[k]) : `#${i}`; };
  const bKeys = before.rows.map((r, i) => keyOf(before, r, i)), aKeys = after.rows.map((r, i) => keyOf(after, r, i));
  const cols = [...after.columns];
  before.columns.forEach((c, i) => { if (!cols.includes(c)) cols.splice(Math.min(i, cols.length), 0, c); });
  const colK = (c: string) => { const inB = before.columns.includes(c), inA = after.columns.includes(c); const g = ease(clamp01((t - 0.45) / 0.45)); return inB && inA ? 1 : inA ? g : 1 - g; };

  // layout
  const portrait = H > W;
  const ROW = 66 * u, HEAD = 62 * u;
  const tabW = Math.min(W - (portrait ? 104 : 260) * u, Math.max(760 * u, cols.length * 250 * u));
  const totalK = cols.reduce((a, c) => a + colK(c), 0) || 1;
  const tableH = HEAD + Math.max(...tables.map((tb) => tb.rows.length), 1) * ROW;
  const tabX = (W - tabW) / 2;
  const tabY = portrait ? 540 * u : Math.max(320 * u, (320 * u + H - 160 * u) / 2 - tableH / 2);
  const sweep = cur >= 0 && t > 0 && t < 0.55 ? t / 0.55 : -1; // a band passing down the table
  const rowPhase = (bi: number) => clamp01((t - (bi / Math.max(1, before.rows.length)) * 0.4) / 0.15); // when the sweep reaches a row
  const flow = ease(clamp01((t - 0.55) / 0.4)); // rows move to their new places

  type DRow = {key: string; bi: number; ai: number; vals: (c: string) => {v: string; changed: boolean}; removed: boolean; added: boolean};
  const drows: DRow[] = [];
  before.rows.forEach((r, bi) => {
    const ai = aKeys.indexOf(bKeys[bi]);
    drows.push({key: bKeys[bi], bi, ai, removed: ai < 0, added: false, vals: (c) => {
      const vb = before.columns.includes(c) ? show(r[before.columns.indexOf(c)]) : '';
      const va = ai >= 0 && after.columns.includes(c) ? show(after.rows[ai][after.columns.indexOf(c)]) : vb;
      return {v: rowPhase(bi) >= 1 || !before.columns.includes(c) ? va : vb, changed: before.columns.includes(c) && after.columns.includes(c) && ai >= 0 && va !== vb};
    }});
  });
  after.rows.forEach((r, ai) => { if (!bKeys.includes(aKeys[ai])) drows.push({key: aKeys[ai], bi: -1, ai, removed: false, added: true, vals: (c) => ({v: after.columns.includes(c) ? show(r[after.columns.indexOf(c)]) : '', changed: false})}); });

  const op = cur >= 0 ? p.stages[cur].op : 'source';
  const style = OP_STYLE[op] ?? OP_STYLE.custom;
  const enter = spring({frame: f, fps, config: {damping: 16, stiffness: 110}});

  // stage pills
  const pills = [{label: p.source.name ?? 'Source', op: 'source' as const, detail: undefined as string | undefined}, ...p.stages];
  const pillColumns = portrait ? Math.min(3, pills.length) : pills.length;
  const pillGap = (portrait ? 46 : 60) * u, pillH = 84 * u, rowGap = 40 * u;
  const pillW = Math.min(250 * u, (W - (portrait ? 104 : 200) * u - (pillColumns - 1) * pillGap) / pillColumns);
  const pillsX = (W - (pillColumns * pillW + (pillColumns - 1) * pillGap)) / 2;
  const pillTop = (portrait ? 226 : 164) * u;
  const pillPosition = (i: number) => {
    const row = Math.floor(i / pillColumns);
    const col = row % 2 === 0 ? i % pillColumns : pillColumns - 1 - (i % pillColumns);
    return {x: pillsX + col * (pillW + pillGap), y: pillTop + row * (pillH + rowGap)};
  };
  const detailY = portrait ? pillPosition(pills.length - 1).y + pillH + 18 * u : 262 * u;

  const cues: Cue[] = [];
  if (p.sound) p.stages.forEach((s, k) => {
    cues.push({sound: 'swipe', at: starts[k], volume: 0.22});
    const removed = tables[k].rows.length > tables[k + 1].rows.length;
    if (removed) cues.push({sound: 'remove', at: starts[k] + Math.round(D * 0.25), volume: 0.22});
    if (tables[k + 1].columns.length > tables[k].columns.length) cues.push({sound: 'pop', at: starts[k] + Math.round(D * 0.6), volume: 0.2});
    cues.push({sound: 'tick', at: starts[k] + D, volume: 0.25});
  });

  const joinWith = cur >= 0 ? p.stages[cur].with : undefined;
  const joinK = joinWith ? Math.min(ease(clamp01((f - starts[cur] + 10) / 14)), 1 - clamp01((t - 0.5) / 0.3)) : 0;

  return (
    <PaperStage eyebrow={p.eyebrow} title={p.title}>
      {/* stages */}
      {pills.map((s, k) => {
        const active = k - 1 === cur && t < 1, done = k - 1 < cur || (k - 1 === cur && t >= 1), st = OP_STYLE[s.op] ?? OP_STYLE.custom;
        const {x, y} = pillPosition(k);
        const prev = k > 0 ? pillPosition(k - 1) : null;
        const color = done || active ? PAPER.ink : PAPER.track;
        const glow = active ? 0.6 + 0.4 * Math.sin(f / 4) : 0;
        return <div key={k}>
          {prev ? (() => {
            const across = prev.y === y, rightward = prev.x < x;
            const startX = across ? prev.x + (rightward ? pillW : 0) : x + pillW / 2;
            const endX = across ? x + (rightward ? 0 : pillW) : startX;
            const startY = across ? y + pillH / 2 : prev.y + pillH;
            const endY = across ? startY : y;
            return <svg width={W} height={H} style={{position: 'absolute', inset: 0, pointerEvents: 'none'}}>
              <path d={`M${startX},${startY} L${endX},${endY}`} stroke={color} strokeWidth={3 * u} />
              <path d={arrowHead(startX, startY, endX, endY, 15 * u)} fill={color} />
            </svg>;
          })() : null}
          <div style={{position: 'absolute', left: x, top: y, width: pillW, height: 84 * u, borderRadius: 18 * u, background: k === 0 || done || active ? st.color : PAPER.card, border: `${2.5 * u}px solid ${PAPER.ink}`,
            display: 'flex', alignItems: 'center', paddingLeft: (portrait ? 74 : 86) * u, paddingRight: 8 * u, boxSizing: 'border-box', fontSize: (portrait ? 20 : 22) * u, fontWeight: 800, opacity: enter, transform: `scale(${active ? 1.06 : 1})`,
            boxShadow: active ? `0 0 0 ${4 * u}px rgba(255,85,0,${0.8 * glow})` : `0 ${4 * u}px 0 ${PAPER.track}`, overflowWrap: 'anywhere', overflow: 'hidden'}}>
            {s.label}
          </div>
          <IsoIcon kind={k === 0 ? isoKindFor(s.label, 'database') : OP_KIND[s.op] ?? 'tile'} icon={st.icon} cx={x + 46 * u} by={y + 76 * u} w={66 * u} h={60 * u} u={u * 0.6} id={`st-${k}`} time={f / fps} highlight={active ? 1 : 0} shadow={false} />
        </div>;
      })}
      {/* rule of the running stage */}
      {cur >= 0 && p.stages[cur].detail ? <div style={{position: 'absolute', left: 0, right: 0, top: detailY, display: 'flex', justifyContent: 'center'}}>
        <div style={{fontFamily: MONO, fontSize: 24 * u, padding: `${6 * u}px ${18 * u}px`, borderRadius: 12 * u, background: style.color, border: `${2 * u}px solid ${PAPER.ink}`, opacity: clamp01((f - starts[cur]) / 6)}}>
          {p.stages[cur].op !== 'custom' ? `${p.stages[cur].op}: ` : ''}{p.stages[cur].detail}
        </div>
      </div> : null}

      {/* the table */}
      <div style={{position: 'absolute', left: tabX, top: tabY, width: tabW, height: HEAD + Math.max(before.rows.length, after.rows.length, 1) * ROW + 8 * u, borderRadius: 18 * u, background: PAPER.card, border: `${2.5 * u}px solid ${PAPER.ink}`,
        overflow: 'hidden', opacity: enter, boxShadow: `0 ${10 * u}px ${22 * u}px rgba(70,50,30,0.15)`}}>
        {/* header */}
        <div style={{position: 'absolute', left: 0, top: 0, width: tabW, height: HEAD, background: '#efe8dc', borderBottom: `${2 * u}px solid ${PAPER.ink}`, display: 'flex'}}>
          {cols.map((c) => {
            const k = colK(c), isNew = !before.columns.includes(c);
            return <div key={c} style={{width: (tabW * k) / totalK, overflow: 'hidden', whiteSpace: 'nowrap', display: 'flex', alignItems: 'center', padding: k > 0.2 ? `0 ${16 * u}px` : 0, boxSizing: 'border-box',
              fontWeight: 800, fontSize: 23 * u, color: isNew ? '#5a3fb0' : PAPER.inkSoft, background: isNew && k > 0 ? `${style.color}` : undefined, opacity: k}}>{c}</div>;
          })}
        </div>
        {/* sweep */}
        {sweep >= 0 ? <div style={{position: 'absolute', left: 0, width: tabW, top: HEAD + sweep * Math.max(1, before.rows.length) * ROW - 6 * u, height: 12 * u, background: `linear-gradient(transparent, ${style.color}, transparent)`, opacity: 0.9}} /> : null}
        {drows.map((d) => {
          const ph = d.bi >= 0 ? rowPhase(d.bi) : clamp01((t - 0.5) / 0.3);
          const yB = d.bi >= 0 ? d.bi : d.ai, yA = d.ai >= 0 ? d.ai : d.bi;
          const y = HEAD + (yB + (yA - yB) * flow) * ROW;
          const pass = yA !== yB && !d.removed ? Math.sin(flow * Math.PI) * (yA > yB ? 1 : -1) * 70 * u : 0; // rows that swap places pass side by side
          const out = d.removed ? ease(clamp01((t - 0.5) / 0.35)) : 0;
          if (cur >= 0 && t >= 1 && d.removed) return null;
          const op = d.added ? ph : 1 - out;
          return <div key={d.key} style={{position: 'absolute', left: 0, top: y, width: tabW, height: ROW, display: 'flex', alignItems: 'center', borderBottom: `${1 * u}px solid ${PAPER.track}`,
            background: d.removed && ph > 0 ? `rgba(229,96,79,${0.18 * ph})` : d.added ? `rgba(76,175,99,${0.15 * (1 - flow)})` : undefined, opacity: op, transform: `translateX(${out * 60 * u + pass}px)`, zIndex: yA > yB ? 2 : 1,
            fontFamily: MONO, fontSize: 26 * u, color: d.removed && ph > 0 ? '#b2402f' : PAPER.ink, textDecoration: d.removed && ph >= 1 ? 'line-through' : undefined}}>
            {cols.map((c) => {
              const k = colK(c), {v, changed} = d.vals(c);
              const flash = changed && ph > 0 && ph < 1 ? 1 : changed && ph >= 1 ? Math.max(0, 1 - (t - 0.15) / 0.4) : 0;
              return <div key={c} style={{width: (tabW * k) / totalK, overflow: 'hidden', whiteSpace: 'nowrap', textOverflow: 'ellipsis', padding: k > 0.2 ? `0 ${16 * u}px` : 0, boxSizing: 'border-box', opacity: k,
                background: flash > 0 ? `rgba(255,170,60,${0.45 * flash})` : undefined, fontWeight: flash > 0 || (!before.columns.includes(c) && k > 0) ? 800 : 500}}>{v}</div>;
            })}
          </div>;
        })}
        <div style={{position: 'absolute', right: 14 * u, bottom: 6 * u, fontSize: 17 * u, color: PAPER.inkSoft, fontWeight: 700}}>{(cur >= 0 && t >= 0.9 ? after : before).rows.length} rows</div>
      </div>
      {/* join input slides in from the right */}
      {joinWith && joinK > 0 ? (
        <div style={{position: 'absolute', left: (portrait ? tabX : Math.min(tabX + tabW + 30 * u, W - 300 * u)) + (1 - joinK) * 80 * u, top: portrait ? tabY + tableH + 35 * u : tabY - 20 * u, zIndex: 3, boxShadow: `0 ${10 * u}px ${20 * u}px rgba(0,0,0,0.15)`, width: portrait ? tabW - 80 * u : 260 * u, borderRadius: 14 * u, background: '#f3fbf4', border: `${2.5 * u}px solid ${PAPER.ink}`, opacity: joinK, overflow: 'hidden', fontSize: 18 * u}}>
          <div style={{padding: `${8 * u}px ${12 * u}px`, fontWeight: 800, background: '#dff3e2', borderBottom: `${2 * u}px solid ${PAPER.ink}`, fontFamily: MONO}}>{joinWith.name ?? 'other table'}</div>
          {joinWith.rows.slice(0, 6).map((r, i) => <div key={i} style={{padding: `${5 * u}px ${12 * u}px`, fontFamily: MONO, borderBottom: `${1 * u}px solid ${PAPER.track}`, whiteSpace: 'nowrap', overflow: 'hidden'}}>{r.map(show).join(' · ')}</div>)}
        </div>
      ) : null}
      {cues.map((c, k) => <Sfx key={k} sound={c.sound} at={c.at} volume={c.volume} />)}
    </PaperStage>
  );
};
