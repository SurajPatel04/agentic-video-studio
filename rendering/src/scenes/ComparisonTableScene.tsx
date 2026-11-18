import {useCurrentFrame} from 'remotion';
import {z} from 'zod';
import {StudyFrame} from '../components/StudyFrame';
import {useTheme} from '../theme';

export const comparisonTableSceneSchema = z.object({
  title: z.string().default('LAN, MAN, WAN — what changes?'),
  columns: z.array(z.string()).min(2).max(5).default(['Property', 'LAN', 'MAN', 'WAN']),
  rows: z.array(z.array(z.string())).min(1).max(7).default([
    ['Range', 'Room, building, campus', 'Across a city', 'Regions and countries'],
    ['Speed', 'Depends on technology', 'Depends on technology', 'Depends on technology'],
    ['Cost', 'Local equipment + cabling', 'Metro links + equipment', 'Long-distance links + services'],
    ['Example', 'School computer lab', 'City-wide campus network', 'Company branches worldwide'],
  ]),
  startAt: z.number().int().nonnegative().default(12),
  rowStagger: z.number().int().nonnegative().default(24),
  revealFrames: z.number().int().positive().default(15),
  footer: z.string().default('Network size describes coverage; it does not guarantee speed or cost.'),
}).superRefine((p, ctx) => {p.rows.forEach((row, i) => {if (row.length !== p.columns.length) ctx.addIssue({code: 'custom', path: ['rows', i], message: 'Each row must match the number of columns'});});});
export const description = 'A configurable comparison table with sequential row reveals.';
export const tags = ['comparison', 'table', 'LAN', 'MAN', 'WAN'];
export const ComparisonTableScene: React.FC<z.input<typeof comparisonTableSceneSchema>> = (input) => {
  const p = comparisonTableSceneSchema.parse(input);
  const frame = useCurrentFrame();
  const theme = useTheme();
  return <StudyFrame title={p.title} eyebrow="COMPARE / COVERAGE & CONNECTIONS" footer={p.footer}>
    <div style={{display: 'grid', gridTemplateColumns: `repeat(${p.columns.length}, 1fr)`, borderRadius: 18, overflow: 'hidden', border: '1px solid #385167'}}>
      {p.columns.map((c, i) => <div key={i} style={{padding: '25px 24px', fontSize: 28, fontWeight: 700, color: i ? theme.accent : theme.muted, background: '#f0e8da'}}>{c}</div>)}
      {p.rows.map((row, r) => {
        const progress = Math.max(0, Math.min(1, (frame - p.startAt - r * p.rowStagger) / p.revealFrames));
        return row.map((cell, c) => <div key={`${r}-${c}`} style={{minHeight: Math.min(102, 435 / p.rows.length), boxSizing: 'border-box', padding: '20px 24px', borderTop: '1px solid #304357', background: r % 2 ? '#f0e8da' : '#fffaf1', opacity: progress, transform: `translateY(${(1-progress)*12}px)`, fontSize: p.columns.length > 4 ? 22 : 26, lineHeight: 1.35, fontWeight: c === 0 ? 650 : 400, color: c === 0 ? theme.text : '#514b59'}}>{cell}</div>);
      })}
    </div>
  </StudyFrame>;
};
