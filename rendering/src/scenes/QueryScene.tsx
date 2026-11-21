/**
 * QueryScene: how a database answers a query, in the paper style. The SQL is typed in; then either a
 * full scan (a cursor checks every row, a "rows read" counter climbs) or an index lookup (the index
 * is searched in a few probes and points straight at the matching rows); matching rows light up and
 * fly into a result table that builds on the right.
 *
 * Forgiving input: the WHERE condition and the selected columns are read from the SQL when not given;
 * rows may be objects; operators like "==" are understood.
 */
import type {FC, ReactNode} from 'react';
import {interpolate, spring, useCurrentFrame, useVideoConfig} from 'remotion';
import {z} from 'zod';
import {Sfx} from '../audio';
import {PAPER} from '../iso/iso';
import {useSceneLength, useUnit} from '../theme';
import {DARK, MONO, PaperStage, clamp01, ease, flexValue, type Cue} from './paperStage';
import {fitColumns, fitRows} from './tableFit';

const cell = z.union([z.string().max(40), z.number(), z.boolean(), z.null()]);
const tableSchema = z.object({
  name: z.string().max(30).default('users'),
  columns: z.array(z.string().max(24)).min(1).max(6),
  rows: z.array(z.array(cell)).min(1).max(12),
}).strict();
const OPS = ['=', '!=', '>', '<', '>=', '<=', 'contains'] as const;

const EXAMPLE = {
  query: "SELECT name, city FROM users WHERE city = 'Pune'",
  table: {name: 'users', columns: ['id', 'name', 'city', 'age'], rows: [
    [1, 'Asha', 'Delhi', 31], [2, 'Ravi', 'Pune', 24], [3, 'Meera', 'Mumbai', 29], [4, 'Kabir', 'Pune', 35],
    [5, 'Sara', 'Delhi', 22], [6, 'Dev', 'Chennai', 41], [7, 'Nina', 'Pune', 27], [8, 'Omar', 'Mumbai', 33]]},
};

const SQL_OP: Record<string, string> = {'==': '=', '<>': '!=', like: 'contains', in: '=', eq: '=', ne: '!=', gt: '>', lt: '<', gte: '>=', lte: '<=', equals: '=', is: '='};
/** Read "WHERE col op value" and "SELECT a, b" from SQL text. */
const parseSql = (q: string) => {
  const w = q.match(/where\s+([\w.]+)\s*(==|!=|<>|>=|<=|=|>|<|like|in)\s*\(?\s*'?"?([^'")]*)'?"?/i);
  const sel = q.match(/select\s+(.+?)\s+from/i);
  const cols = sel && sel[1].trim() !== '*' ? sel[1].split(',').map((c) => c.trim().replace(/^.*\./, '').replace(/\s+as\s+\w+$/i, '')) : undefined;
  return {where: w ? {column: w[1].replace(/^.*\./, ''), op: SQL_OP[w[2].toLowerCase()] ?? w[2], value: w[3].replace(/%/g, '').trim()} : undefined, select: cols};
};

const flexQuery = (raw: unknown) => {
  if (!raw || typeof raw !== 'object') return raw;
  const r = {...(raw as Record<string, unknown>)};
  if (r.query === undefined) for (const k of ['sql', 'statement', 'q']) if (typeof r[k] === 'string') { r.query = r[k]; delete r[k]; }
  if (!r.table && (r.rows || r.columns || r.data)) { r.table = {name: r.tableName ?? r.name, columns: r.columns, rows: r.rows ?? r.data}; delete r.rows; delete r.columns; delete r.data; delete r.tableName; delete r.name; }
  if (r.table && typeof r.table === 'object') {
    const t = {...(r.table as Record<string, unknown>)};
    if (t.data && !t.rows) { t.rows = t.data; delete t.data; }
    if (Array.isArray(t.rows) && t.rows.length && t.rows[0] && typeof t.rows[0] === 'object' && !Array.isArray(t.rows[0])) {
      const cols = (t.columns as string[] | undefined) ?? Object.keys(t.rows[0] as object);
      t.columns = cols;
      t.rows = (t.rows as Record<string, unknown>[]).map((o) => cols.map((c) => (o[c] ?? null) as unknown));
    }
    if (t.name === undefined) delete t.name;
    // Fit: extra columns / rows dropped, rows padded or cut to one value per column, long text clipped.
    if (t.columns !== undefined) t.columns = fitColumns(t.columns, 6, 24);
    if (t.rows !== undefined) t.rows = fitRows(t.rows, {width: Array.isArray(t.columns) ? t.columns.length : undefined, max: 12, maxChars: 40});
    r.table = t;
  }
  r.mode = flexValue(r.mode, {'full scan': 'scan', 'table scan': 'scan', 'seq scan': 'scan', 'sequential scan': 'scan', full: 'scan', 'no index': 'scan',
    'index lookup': 'index', 'index scan': 'index', 'index seek': 'index', btree: 'index', 'b-tree': 'index', seek: 'index', lookup: 'index', indexed: 'index'});
  if (typeof r.where === 'string') { r.where = parseSql(`where ${r.where}`).where; }
  if (r.where && typeof r.where === 'object') {
    const w = {...(r.where as Record<string, unknown>)};
    if (w.column === undefined && w.col !== undefined) { w.column = w.col; delete w.col; }
    if (w.op === undefined && w.operator !== undefined) { w.op = w.operator; delete w.operator; }
    if (w.value === undefined && w.equals !== undefined) { w.value = w.equals; w.op = w.op ?? '='; delete w.equals; }
    if (typeof w.op === 'string') w.op = SQL_OP[w.op.toLowerCase()] ?? w.op;
    if (typeof w.value === 'number' || typeof w.value === 'boolean') w.value = String(w.value);
    r.where = w;
  }
  if (typeof r.index === 'boolean') { if (r.index) r.mode = r.mode ?? 'index'; else { r.mode = r.mode ?? 'scan'; } delete r.index; }
  if (typeof r.select === 'string') r.select = r.select.trim() === '*' ? undefined : r.select.split(',').map((c) => c.trim());
  if (r.matches && Array.isArray(r.matches)) r.matches = (r.matches as unknown[]).map(Number).filter((n) => Number.isFinite(n));
  return r;
};

export const querySceneSchema = z.preprocess(flexQuery, z.object({
  eyebrow: z.string().max(40).optional(),
  title: z.string().max(70).optional(),
  query: z.string().max(160).default(EXAMPLE.query),
  table: tableSchema.default(() => tableSchema.parse(EXAMPLE.table)),
  mode: z.enum(['scan', 'index']).optional(), // default: index when "index" names a column, else scan
  index: z.string().max(24).optional(), // the indexed column (default: the WHERE column)
  where: z.object({column: z.string().max(24), op: z.enum(OPS).default('='), value: z.string().max(40)}).strict().optional(), // default: read from the query
  matches: z.array(z.number().int().min(0).max(12)).max(12).optional(), // row numbers (1 = first) instead of a condition
  select: z.array(z.string().max(24)).max(6).optional(), // result columns (default: from the query, else all)
  sound: z.boolean().default(true),
}).strict().superRefine((p, ctx) => {
  const where = p.where ?? parseSql(p.query).where;
  if (where && !p.table.columns.includes(where.column) && !p.matches) ctx.addIssue({code: 'custom', path: ['where', 'column'], message: `"${where.column}" is not a column of the table: ${p.table.columns.join(', ')}`});
  if (p.index && !p.table.columns.includes(p.index)) ctx.addIssue({code: 'custom', path: ['index'], message: `index column must be one of: ${p.table.columns.join(', ')}`});
  p.table.rows.forEach((row, i) => { if (row.length !== p.table.columns.length) ctx.addIssue({code: 'custom', path: ['table', 'rows', i], message: `row has ${row.length} values but the table has ${p.table.columns.length} columns`}); });
  const sel = p.select ?? parseSql(p.query).select;
  sel?.forEach((c, i) => { if (!p.table.columns.includes(c)) ctx.addIssue({code: 'custom', path: ['select', i], message: `"${c}" is not a column: ${p.table.columns.join(', ')}`}); });
}));
type Props = z.output<typeof querySceneSchema>;

export const description =
  'How a database answers a query, in the paper style: the SQL is typed, then a full scan (every row is checked, a ' +
  '"rows read" counter climbs) or an index lookup (the sorted index is searched in a few probes and points straight ' +
  'at the matching rows); matching rows light up and fly into a result table. Give "query" and "table" ' +
  '(columns + up to 12 rows); "mode": "scan" | "index". Make two scenes to compare a scan with an index.';
export const tags = ['sql', 'database', 'query', 'index', 'indexes', 'table', 'select', 'where', 'full scan', 'b-tree', 'performance', 'postgres', 'mysql'];

const KW = /\b(SELECT|FROM|WHERE|AND|OR|ORDER BY|GROUP BY|LIMIT|JOIN|ON|AS|IN|LIKE|INSERT|INTO|VALUES|UPDATE|SET|DELETE|CREATE|INDEX)\b/gi;
const sqlColor = (q: string): ReactNode[] => {
  const out: ReactNode[] = [];
  let last = 0, k = 0;
  const re = new RegExp(`${KW.source}|('[^']*'?)|(\\b\\d+\\b)`, 'gi');
  let m: RegExpExecArray | null;
  while ((m = re.exec(q))) {
    if (m.index > last) out.push(<span key={k++}>{q.slice(last, m.index)}</span>);
    out.push(<span key={k++} style={{color: m[2] ? DARK.green : m[3] ? DARK.orange : DARK.purple, fontWeight: m[1] ? 700 : 400}}>{m[0]}</span>);
    last = m.index + m[0].length;
  }
  if (last < q.length) out.push(<span key={k++}>{q.slice(last)}</span>);
  return out;
};

const test = (v: unknown, op: string, want: string) => {
  const a = String(v ?? ''), na = Number(a), nb = Number(want);
  const num = a !== '' && want !== '' && !Number.isNaN(na) && !Number.isNaN(nb);
  switch (op) {
    case '=': return num ? na === nb : a.toLowerCase() === want.toLowerCase();
    case '!=': return num ? na !== nb : a.toLowerCase() !== want.toLowerCase();
    case '>': return num ? na > nb : a > want;
    case '<': return num ? na < nb : a < want;
    case '>=': return num ? na >= nb : a >= want;
    case '<=': return num ? na <= nb : a <= want;
    default: return a.toLowerCase().includes(want.toLowerCase());
  }
};

export const QueryScene: FC<z.input<typeof querySceneSchema>> = (input) => {
  const p = querySceneSchema.parse(input) as Props;
  const f = useCurrentFrame();
  const {fps, width: W, height: H} = useVideoConfig();
  const u = useUnit();
  const len = useSceneLength();
  const T = p.table;
  const parsed = parseSql(p.query);
  const where = p.where ?? parsed.where;
  const sel = (p.select ?? parsed.select ?? T.columns).filter((c) => T.columns.includes(c));
  const mode = p.mode ?? (p.index ? 'index' : 'scan');
  const idxCol = p.index ?? where?.column ?? T.columns[0];
  const ci = T.columns.indexOf(where?.column ?? '');
  const zeroBased = p.matches?.includes(0);
  const matchSet = new Set(p.matches ? p.matches.map((n) => (zeroBased ? n : n - 1)) : T.rows.map((r, i) => (where && ci >= 0 && test(r[ci], where.op, where.value) ? i : -1)).filter((i) => i >= 0));
  const matches = [...matchSet].filter((i) => i >= 0 && i < T.rows.length).sort((a, b) => a - b);
  const n = T.rows.length;

  // timeline (frames)
  const typeEnd = Math.round(len * 0.16);
  const look0 = Math.round(len * 0.2), look1 = Math.round(len * 0.6);
  const res0 = Math.round(len * 0.64), res1 = Math.round(len * 0.9);
  const typed = p.query.slice(0, Math.floor(p.query.length * clamp01((f - 4) / Math.max(1, typeEnd - 4))));
  // scan: row k checked at frame scanAt(k); index: probes, then jumps to matches
  const scanAt = (k: number) => look0 + ((look1 - look0) * (k + 0.5)) / n;
  const idxRows = T.rows.map((r, i) => ({key: String(r[T.columns.indexOf(idxCol)] ?? ''), i})).sort((a, b) => (Number.isNaN(Number(a.key)) || Number.isNaN(Number(b.key)) ? a.key.localeCompare(b.key) : Number(a.key) - Number(b.key)));
  const firstHit = idxRows.findIndex((x) => matchSet.has(x.i));
  const probes: number[] = [];
  { let lo = 0, hi = idxRows.length - 1; const target = firstHit < 0 ? Math.floor(idxRows.length / 2) : firstHit;
    while (lo <= hi && probes.length < 4) { const mid = Math.floor((lo + hi) / 2); probes.push(mid); if (mid === target) break; if (mid < target) lo = mid + 1; else hi = mid - 1; } }
  const probeAt = (k: number) => look0 + k * Math.round(fps * 0.45);
  const foundAt = probeAt(probes.length);
  const pointAt = (j: number) => foundAt + Math.round(fps * 0.15) + j * Math.round(fps * 0.22);
  const checkedAt = (i: number) => (mode === 'scan' ? scanAt(i) : matchSet.has(i) ? pointAt(matches.indexOf(i)) : Infinity);
  const rowsRead = T.rows.filter((_, i) => f >= checkedAt(i)).length;
  const flyAt = (j: number) => res0 + ((res1 - res0) * j) / Math.max(1, matches.length);

  // layout
  const portrait = H > W;
  const top = (portrait ? 355 : 280) * u, bottom = H - (portrait ? 320 : 170) * u;
  const left = (portrait ? 52 : 90) * u, right = W - left;
  const idxW = mode === 'index' ? (portrait ? 240 : 300) * u : 0, gap = (portrait ? 30 : 40) * u;
  const resW = portrait ? right - left : Math.min(520 * u, (sel.length * 150 + 20) * u);
  const resX = portrait ? left : right - resW;
  const tabX = left + idxW + (idxW ? gap : 0), tabW = (portrait ? right : resX - gap) - tabX;
  const headerH = 52 * u, sectionGap = 52 * u;
  const rowH = Math.min(62 * u, (bottom - top - (portrait ? 2 * headerH + sectionGap : headerH)) /
    (n + 1 + (portrait ? matches.length + 1 : 0)));
  const resY = portrait ? top + headerH + (n + 1) * rowH + sectionGap : top;
  const font = Math.min(26 * u, rowH * 0.46);
  const colW = tabW / T.columns.length;
  const rowY = (i: number) => top + headerH + (i + 1) * rowH;
  const resultCells = (i: number) => sel.map((c) => <div key={c} style={{flex: 1, minWidth: 0, padding: `0 ${14 * u}px`, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis'}}>{String(T.rows[i][T.columns.indexOf(c)] ?? 'NULL')}</div>);
  const rowStyle = {display: 'flex', height: rowH, boxSizing: 'border-box' as const, alignItems: 'center', fontSize: font, fontFamily: MONO, fontWeight: 700, borderBottom: `${1 * u}px solid ${PAPER.track}`};

  const lit = (i: number) => f >= checkedAt(i);
  const scanRow = mode === 'scan' && f >= look0 && f < look1 ? Math.min(n - 1, Math.floor(((f - look0) / (look1 - look0)) * n)) : -1;
  const cues: Cue[] = [];
  if (p.sound) {
    cues.push({sound: 'typing', at: 4, volume: 0.35, duration: Math.max(4, typeEnd - 4), loop: true});
    if (mode === 'scan') T.rows.forEach((_, i) => cues.push({sound: matchSet.has(i) ? 'blip' : 'tick', at: Math.round(scanAt(i)), volume: matchSet.has(i) ? 0.25 : 0.12}));
    else { probes.forEach((_, k) => cues.push({sound: 'tick', at: probeAt(k), volume: 0.25})); cues.push({sound: 'chime', at: foundAt, volume: 0.25}); matches.forEach((_, j) => cues.push({sound: 'connect', at: pointAt(j), volume: 0.15})); }
    matches.forEach((_, j) => cues.push({sound: 'pop', at: Math.round(flyAt(j)), volume: 0.2}));
  }
  const enter = spring({frame: f, fps, config: {damping: 16, stiffness: 110}});
  const counterBad = mode === 'scan';

  return (
    <PaperStage eyebrow={p.eyebrow} title={p.title}>
      {/* query bar */}
      <div style={{position: 'absolute', left, right: W - right, top: (portrait ? 187 : 172) * u, height: (portrait ? 124 : 72) * u, borderRadius: 16 * u, background: DARK.bg, border: `${3 * u}px solid ${PAPER.ink}`, display: 'flex', alignItems: 'center', gap: 16 * u, padding: `0 ${26 * u}px`,
        fontFamily: MONO, fontSize: (portrait ? 22 : 27) * u, color: DARK.text, opacity: enter, whiteSpace: portrait ? 'normal' : 'nowrap', overflowWrap: 'anywhere', overflow: 'hidden'}}>
        <span style={{color: DARK.green, fontWeight: 700}}>sql&gt;</span>
        <span>{sqlColor(typed)}{f < typeEnd + 6 && Math.floor(f / 8) % 2 === 0 ? <span style={{display: 'inline-block', width: 13 * u, height: 28 * u, background: DARK.text, verticalAlign: 'middle', marginLeft: 3 * u}} /> : null}</span>
        <span style={{marginLeft: 'auto', flexShrink: 0, maxWidth: '23%', fontFamily: PAPER.sans, fontSize: 19 * u, fontWeight: 800, padding: `${6 * u}px ${14 * u}px`, borderRadius: 10 * u, background: mode === 'index' ? '#2f5d3a' : '#5d3a2f', color: mode === 'index' ? DARK.green : DARK.orange}}>
          {mode === 'index' ? `INDEX on ${idxCol}` : 'FULL TABLE SCAN'}
        </span>
      </div>

      {/* index panel */}
      {mode === 'index' ? (
        <div style={{position: 'absolute', left, top, width: idxW, borderRadius: 18 * u, background: PAPER.card, border: `${2.5 * u}px solid ${PAPER.ink}`, overflow: 'hidden', opacity: enter}}>
          <div style={{height: headerH, boxSizing: 'border-box', display: 'flex', alignItems: 'center', gap: 10 * u, padding: `0 ${16 * u}px`, background: '#e7f3ea', borderBottom: `${2 * u}px solid ${PAPER.ink}`, fontWeight: 800, fontSize: 20 * u}}>
            <span style={{fontFamily: MONO}}>⚡ index({idxCol})</span>
          </div>
          {idxRows.map((x, k) => {
            const probeK = probes.indexOf(k);
            const probing = probeK >= 0 && f >= probeAt(probeK) && f < probeAt(probeK) + fps * 0.45;
            const found = matchSet.has(x.i) && f >= foundAt;
            return <div key={k} style={{height: rowH, boxSizing: 'border-box', display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: `0 ${16 * u}px`, fontFamily: MONO, fontSize: portrait ? Math.min(font, 22 * u) : font,
              background: found ? '#d8f0dd' : probing ? '#ffe2c4' : k % 2 ? '#fbf6ec' : 'transparent', borderBottom: `${1 * u}px solid ${PAPER.track}`, fontWeight: found ? 800 : 500}}>
              <span style={{overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap'}}>{x.key}</span><span style={{color: PAPER.inkSoft, whiteSpace: 'nowrap', marginLeft: 6 * u}}>→ row {x.i + 1}</span>
            </div>;
          })}
        </div>
      ) : null}

      {/* pointers from the index to the rows */}
      {mode === 'index' ? <svg width={W} height={H} style={{position: 'absolute', inset: 0, pointerEvents: 'none'}}>
        {matches.map((i, j) => {
          const k = clamp01((f - pointAt(j)) / 8);
          if (k <= 0) return null;
            const yIdx = top + headerH + (idxRows.findIndex((x) => x.i === i) + 0.5) * rowH;
          const x0 = left + idxW, x1 = tabX, y1 = rowY(i) + rowH / 2;
          return <path key={i} d={`M${x0},${yIdx} C${x0 + gap / 2},${yIdx} ${x1 - gap / 2},${y1} ${x1},${y1}`} stroke="#3f9a57" strokeWidth={3 * u} fill="none"
            pathLength={1} strokeDasharray={k < 1 ? 1 : undefined} strokeDashoffset={k < 1 ? 1 - k : undefined} />;
        })}
      </svg> : null}

      {/* the table */}
      <div style={{position: 'absolute', left: tabX, top, width: tabW, borderRadius: 18 * u, background: PAPER.card, border: `${2.5 * u}px solid ${PAPER.ink}`, overflow: 'hidden', opacity: enter, boxShadow: `0 ${8 * u}px ${18 * u}px rgba(70,50,30,0.14)`}}>
        <div style={{height: headerH, boxSizing: 'border-box', display: 'flex', alignItems: 'center', padding: `0 ${16 * u}px`, background: '#efe8dc', borderBottom: `${2 * u}px solid ${PAPER.ink}`, fontWeight: 800, fontSize: 20 * u}}>
          <span style={{fontFamily: MONO}}>{T.name}</span>
          <span style={{marginLeft: 'auto', fontSize: 19 * u, padding: `${4 * u}px ${12 * u}px`, borderRadius: 10 * u, background: counterBad && rowsRead > matches.length ? '#fbe1dc' : '#dff3e2', color: counterBad && rowsRead > matches.length ? '#b2402f' : '#2f7a3d'}}>rows read: {rowsRead} / {n}</span>
        </div>
        <div style={{display: 'flex', height: rowH, boxSizing: 'border-box', alignItems: 'center', borderBottom: `${2 * u}px solid ${PAPER.track}`, fontWeight: 800, fontSize: font * 0.9, color: PAPER.inkSoft}}>
          {T.columns.map((c) => <div key={c} style={{width: colW, minWidth: 0, padding: `0 ${14 * u}px`, boxSizing: 'border-box', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: c === where?.column ? '#8a6fd1' : undefined}}>{c}</div>)}
        </div>
        {T.rows.map((r, i) => {
          const hit = matchSet.has(i) && lit(i);
          const miss = !matchSet.has(i) && lit(i);
          const cursor = scanRow === i;
          return <div key={i} style={{display: 'flex', height: rowH, boxSizing: 'border-box', alignItems: 'center', fontSize: font, fontFamily: MONO, borderBottom: `${1 * u}px solid ${PAPER.track}`,
            background: cursor ? '#ffe2c4' : hit ? '#d8f0dd' : miss ? '#f1ece4' : 'transparent', color: miss ? '#a39b90' : PAPER.ink, fontWeight: hit ? 800 : 500, boxShadow: cursor ? `inset ${5 * u}px 0 0 #ff5500` : hit ? `inset ${5 * u}px 0 0 #3f9a57` : undefined}}>
            {r.map((v, k) => <div key={k} style={{width: colW, padding: `0 ${14 * u}px`, boxSizing: 'border-box', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis'}}>{String(v ?? 'NULL')}</div>)}
          </div>;
        })}
      </div>

      {/* result */}
      <div style={{position: 'absolute', left: resX, top: resY, width: resW, borderRadius: 18 * u, background: '#f3fbf4', border: `${2.5 * u}px solid ${PAPER.ink}`, overflow: 'hidden', opacity: interpolate(f, [res0 - 10, res0], [0.35, 1], {extrapolateLeft: 'clamp', extrapolateRight: 'clamp'}) * enter}}>
        <div style={{height: headerH, boxSizing: 'border-box', display: 'flex', alignItems: 'center', padding: `0 ${16 * u}px`, background: '#dff3e2', borderBottom: `${2 * u}px solid ${PAPER.ink}`, fontWeight: 800, fontSize: 20 * u}}>
          result <span style={{marginLeft: 'auto', color: '#2f7a3d'}}>{matches.filter((_, j) => f >= flyAt(j) + 12).length} row{matches.length === 1 ? '' : 's'}</span>
        </div>
        <div style={{display: 'flex', height: rowH, boxSizing: 'border-box', alignItems: 'center', borderBottom: `${2 * u}px solid ${PAPER.track}`, fontWeight: 800, fontSize: font * 0.9, color: PAPER.inkSoft}}>
          {sel.map((c) => <div key={c} style={{flex: 1, minWidth: 0, padding: `0 ${14 * u}px`, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis'}}>{c}</div>)}
        </div>
        {matches.map((i, j) => {
          const k = ease(clamp01((f - flyAt(j)) / 12));
          return k <= 0 ? null : <div key={i} style={{...rowStyle, visibility: k < 1 ? 'hidden' : 'visible'}}>{resultCells(i)}</div>;
        })}
      </div>
      {matches.map((i, j) => {
        const k = ease(clamp01((f - flyAt(j)) / 12));
        if (k <= 0 || k >= 1) return null;
        const y = resY + headerH + (j + 1) * rowH;
        return <div key={i} style={{...rowStyle, position: 'absolute', left: tabX + (resX - tabX) * k,
          top: rowY(i) + (y - rowY(i)) * k, width: tabW + (resW - tabW) * k, background: '#d8f0dd', borderRadius: 6 * u}}>
          {resultCells(i)}
        </div>;
      })}
      {cues.map((c, k) => <Sfx key={k} sound={c.sound} at={c.at} volume={c.volume} duration={c.duration} loop={c.loop} />)}
    </PaperStage>
  );
};
