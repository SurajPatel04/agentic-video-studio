import {useCurrentFrame} from 'remotion';
import {z} from 'zod';
import {StudyFrame} from '../components/StudyFrame';
import {useSceneLength, useTheme} from '../theme';
import {clip, fitColumns, fitRows} from './tableFit';

const MAX_COLUMNS = 6, MAX_ROWS = 8;
const stage = z.object({
  at: z.number().min(0).max(1),
  action: z.string().min(1).max(100),
  explanation: z.string().min(1).max(125),
  rows: z.array(z.array(z.string().max(52))).min(1).max(MAX_ROWS),
  focusRow: z.number().int().nonnegative().optional(),
  focusColumn: z.number().int().nonnegative().optional(),
}).strict();

/** Forgiving input: extra columns / rows are dropped, rows padded or cut to one cell per column, long text
 *  clipped (shorter cells when the table is wide, so it still fits). */
const fitWorked = (raw: unknown) => {
  if (!raw || typeof raw !== 'object') return raw;
  const r = {...(raw as Record<string, unknown>)};
  r.title = clip(r.title, 75);
  r.tableTitle = clip(r.tableTitle, 55);
  if (r.columns !== undefined) r.columns = fitColumns(r.columns, MAX_COLUMNS, 22);
  const width = Array.isArray(r.columns) ? r.columns.length : undefined;
  if (Array.isArray(r.stages)) r.stages = r.stages.map((s) => {
    if (!s || typeof s !== 'object') return s;
    const o = {...(s as Record<string, unknown>)};
    o.action = clip(o.action, 100);
    o.explanation = clip(o.explanation, 125);
    o.rows = fitRows(o.rows, {width, max: MAX_ROWS, maxChars: width && width > 4 ? 36 : 52});
    return o;
  });
  return r;
};

export const workedExampleSceneSchema = z.preprocess(fitWorked, z.object({
  title: z.string().min(1).max(75).default('Select a record by its stable ID'),
  tableTitle: z.string().max(55).default('Catalog'),
  columns: z.array(z.string().max(22)).min(1).max(MAX_COLUMNS).default(['ID', 'Item']),
  stages: z.array(stage).min(1).max(8).default([{at: 0, action: 'Read item 42',
    explanation: 'Find the row with the matching identifier.', rows: [['42', 'Book']], focusRow: 0}]),
}).strict().superRefine((p, ctx) => {
  p.stages.forEach((s, i) => {
    const issue = (field: string, message: string) => ctx.addIssue({code:'custom', path:['stages', i, field], message});
    if (i === 0 ? s.at !== 0 : s.at <= p.stages[i - 1].at) issue('at', 'Start at zero and order subsequent stages by time.');
    if (s.rows.some(r => r.length !== p.columns.length)) issue('rows', 'Each row needs one cell per column.');
    if (s.focusRow !== undefined && s.focusRow >= s.rows.length) issue('focusRow', 'Select an existing row.');
    if (s.focusColumn !== undefined && (s.focusRow === undefined || s.focusColumn >= p.columns.length)) issue('focusColumn', 'Select a cell within the focused row.');
  });
}));
export const description = 'A worked example with an instruction beside a live table (up to 6 columns and 8 rows). Cue each stage to the narration to select a row, reveal a result, insert a record or highlight a changed cell.';
export const tags = ['worked example', 'case study', 'records', 'comparison', 'selection', 'table', 'before and after'];

export function WorkedExampleScene(input: z.input<typeof workedExampleSceneSchema>) {
  const p = workedExampleSceneSchema.parse(input);
  const frame = useCurrentFrame(), len = useSceneLength(), theme = useTheme();
  const current = p.stages.filter(s => Math.round(s.at * len) <= frame).at(-1) ?? p.stages[0];
  // Bigger tables get a wider table column and smaller, tighter cells so 6 x 8 still fits the frame.
  const cols = p.columns.length, most = Math.max(...p.stages.map(s => s.rows.length));
  const dense = cols > 4 || most > 5, tight = cols > 5 || most > 6;
  const fontSize = tight ? 19 : dense ? 21 : 24;
  const cellPad = tight ? '8px 10px' : dense ? '11px 12px' : '15px', headPad = tight ? '8px 10px' : dense ? '10px 12px' : '12px 15px';
  return <StudyFrame title={p.title} eyebrow="" textAnimation="none">
    <div style={{display:'grid', gridTemplateColumns: dense ? '0.6fr 1.6fr' : '0.85fr 1.3fr', gap: dense ? 36 : 54, height:'100%', alignItems:'center'}}>
      <div style={{borderLeft:'5px solid #796599', paddingLeft: dense ? 20 : 26}}>
        <div style={{fontSize: dense ? 31 : 36, fontWeight:700, lineHeight:1.22, overflowWrap:'anywhere'}}>{current.action}</div>
        <div style={{fontSize: dense ? 24 : 27, lineHeight:1.35, marginTop:20, color:theme.muted}}>{current.explanation}</div>
      </div>
      <div style={{background:'#fffdf7', border:'2px solid #cabfae', borderRadius:16, overflow:'hidden'}}>
        <div style={{padding: dense ? '12px 18px' : '18px 22px', fontWeight:700, fontSize: dense ? 24 : 27}}>{p.tableTitle}</div>
        <table style={{width:'100%', borderCollapse:'collapse', tableLayout:'fixed', fontSize}}>
          <thead><tr>{p.columns.map((col, i) => <th key={i} style={{background:'#eee9df', textAlign:'left', padding:headPad, overflowWrap:'anywhere'}}>{col}</th>)}</tr></thead>
          <tbody>{current.rows.map((row, r) => <tr key={r}>{row.map((cell, c) => {
            const focus = current.focusRow === r && (current.focusColumn === undefined || current.focusColumn === c);
            return <td key={c} style={{borderTop:'1px solid #ddd5c8', padding:cellPad, lineHeight:1.25, overflowWrap:'anywhere',
              background:focus ? '#dbecdf' : undefined, fontWeight:focus ? 700 : 450}}>{cell}</td>;
          })}</tr>)}</tbody>
        </table>
      </div>
    </div>
  </StudyFrame>;
}
