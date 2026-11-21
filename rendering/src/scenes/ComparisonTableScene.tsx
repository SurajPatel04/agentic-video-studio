import {useCurrentFrame} from 'remotion';
import {z} from 'zod';
import {StudyFrame} from '../components/StudyFrame';
import {useTheme} from '../theme';
import {fitColumns, fitRows} from './tableFit';

const MAX_COLUMNS = 6, MAX_ROWS = 8;
/** Forgiving input: extra columns / rows are dropped and each row is padded or cut to one cell per column. */
const fitComparison = (raw: unknown) => {
  if (!raw || typeof raw !== 'object') return raw;
  const r = {...(raw as Record<string, unknown>)};
  if (r.columns !== undefined) r.columns = fitColumns(r.columns, MAX_COLUMNS);
  const width = Array.isArray(r.columns) ? r.columns.length : undefined;
  if (r.rows !== undefined) r.rows = fitRows(r.rows, {width, max: MAX_ROWS});
  return r;
};

export const comparisonTableSceneSchema = z.preprocess(fitComparison, z.object({
  title: z.string().default('LAN, MAN, WAN — what changes?'),
  columns: z.array(z.string()).min(2).max(MAX_COLUMNS).default(['Property', 'LAN', 'MAN', 'WAN']),
  rows: z.array(z.array(z.string())).min(1).max(MAX_ROWS).default([
    ['Range', 'Room, building, campus', 'Across a city', 'Regions and countries'],
    ['Speed', 'Depends on technology', 'Depends on technology', 'Depends on technology'],
    ['Cost', 'Local equipment + cabling', 'Metro links + equipment', 'Long-distance links + services'],
    ['Example', 'School computer lab', 'City-wide campus network', 'Company branches worldwide'],
  ]),
  startAt: z.number().int().nonnegative().default(12),
  rowStagger: z.number().int().nonnegative().default(24),
  revealFrames: z.number().int().positive().default(15),
  footer: z.string().default('Network size describes coverage; it does not guarantee speed or cost.'),
}).superRefine((p, ctx) => {p.rows.forEach((row, i) => {if (row.length !== p.columns.length) ctx.addIssue({code: 'custom', path: ['rows', i], message: 'Each row must match the number of columns'});});}));
export const description = 'A configurable comparison table (up to 6 columns and 8 rows) with sequential row reveals.';
export const tags = ['comparison', 'table', 'LAN', 'MAN', 'WAN'];
export const ComparisonTableScene: React.FC<z.input<typeof comparisonTableSceneSchema>> = (input) => {
  const p = comparisonTableSceneSchema.parse(input);
  const frame = useCurrentFrame();
  const theme = useTheme();
  return <StudyFrame title={p.title} eyebrow="COMPARE / COVERAGE & CONNECTIONS" footer={p.footer}>
    <div style={{display: 'grid', gridTemplateColumns: `repeat(${p.columns.length}, 1fr)`, borderRadius: 18, overflow: 'hidden', border: '1px solid #385167'}}>
      {p.columns.map((c, i) => <div key={i} style={{padding: p.rows.length > 6 ? '12px 14px' : p.columns.length > 4 ? '18px 16px' : '25px 24px', fontSize: p.columns.length > 5 ? 22 : p.columns.length > 4 ? 24 : 28, fontWeight: 700, color: i ? theme.accent : theme.muted, background: '#f0e8da'}}>{c}</div>)}
      {p.rows.map((row, r) => {
        const progress = Math.max(0, Math.min(1, (frame - p.startAt - r * p.rowStagger) / p.revealFrames));
        return row.map((cell, c) => <div key={`${r}-${c}`} style={{minHeight: Math.min(102, 435 / p.rows.length), boxSizing: 'border-box', padding: p.rows.length > 6 ? '7px 14px' : p.columns.length > 4 ? '12px 16px' : '20px 24px', borderTop: '1px solid #304357', background: r % 2 ? '#f0e8da' : '#fffaf1', opacity: progress, transform: `translateY(${(1-progress)*12}px)`, fontSize: p.columns.length > 5 || p.rows.length > 7 ? 19 : p.columns.length > 4 || p.rows.length > 6 ? 22 : 26, overflowWrap: 'anywhere', lineHeight: p.rows.length > 6 ? 1.2 : 1.35, fontWeight: c === 0 ? 650 : 400, color: c === 0 ? theme.text : '#514b59'}}>{cell}</div>);
      })}
    </div>
  </StudyFrame>;
};
