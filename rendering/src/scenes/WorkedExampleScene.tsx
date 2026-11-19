import {useCurrentFrame} from 'remotion';
import {z} from 'zod';
import {StudyFrame} from '../components/StudyFrame';
import {useSceneLength, useTheme} from '../theme';

const stage = z.object({
  at: z.number().min(0).max(1),
  action: z.string().min(1).max(100),
  explanation: z.string().min(1).max(125),
  rows: z.array(z.array(z.string().max(52))).min(1).max(5),
  focusRow: z.number().int().nonnegative().optional(),
  focusColumn: z.number().int().nonnegative().optional(),
}).strict();

export const workedExampleSceneSchema = z.object({
  title: z.string().min(1).max(75).default('Select a record by its stable ID'),
  tableTitle: z.string().max(55).default('Catalog'),
  columns: z.array(z.string().max(22)).min(1).max(4).default(['ID', 'Item']),
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
});
export const description = 'A worked example with an instruction beside a live table. Cue each stage to the narration to select a row, reveal a result, insert a record or highlight a changed cell.';
export const tags = ['worked example', 'case study', 'records', 'comparison', 'selection', 'table', 'before and after'];

export function WorkedExampleScene(input: z.input<typeof workedExampleSceneSchema>) {
  const p = workedExampleSceneSchema.parse(input);
  const frame = useCurrentFrame(), len = useSceneLength(), theme = useTheme();
  const current = p.stages.filter(s => Math.round(s.at * len) <= frame).at(-1) ?? p.stages[0];
  return <StudyFrame title={p.title} eyebrow="" textAnimation="none">
    <div style={{display:'grid', gridTemplateColumns:'0.85fr 1.3fr', gap:54, height:'100%', alignItems:'center'}}>
      <div style={{borderLeft:'5px solid #796599', paddingLeft:26}}>
        <div style={{fontSize:36, fontWeight:700, lineHeight:1.22, overflowWrap:'anywhere'}}>{current.action}</div>
        <div style={{fontSize:27, lineHeight:1.35, marginTop:20, color:theme.muted}}>{current.explanation}</div>
      </div>
      <div style={{background:'#fffdf7', border:'2px solid #cabfae', borderRadius:16, overflow:'hidden'}}>
        <div style={{padding:'18px 22px', fontWeight:700, fontSize:27}}>{p.tableTitle}</div>
        <table style={{width:'100%', borderCollapse:'collapse', tableLayout:'fixed', fontSize:24}}>
          <thead><tr>{p.columns.map((col, i) => <th key={i} style={{background:'#eee9df', textAlign:'left', padding:'12px 15px'}}>{col}</th>)}</tr></thead>
          <tbody>{current.rows.map((row, r) => <tr key={r}>{row.map((cell, c) => {
            const focus = current.focusRow === r && (current.focusColumn === undefined || current.focusColumn === c);
            return <td key={c} style={{borderTop:'1px solid #ddd5c8', padding:'15px', overflowWrap:'anywhere',
              background:focus ? '#dbecdf' : undefined, fontWeight:focus ? 700 : 450}}>{cell}</td>;
          })}</tr>)}</tbody>
        </table>
      </div>
    </div>
  </StudyFrame>;
}
