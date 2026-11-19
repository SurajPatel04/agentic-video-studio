import {useVideoConfig} from 'remotion';
import {z} from 'zod';
import {LectureBoard, lectureColors, useLectureTiming} from '../components/LectureBoard';
import {useTheme, useUnit} from '../theme';
import {fraction} from './paperStage';

const level = z.object({
  label: z.string().min(1).max(36),
  detail: z.string().max(90).optional(),
  value: z.number().nonnegative().optional(),
  at: fraction.default(0),
}).strict();

export const layersSceneSchema = z.object({
  title: z.string().min(1).max(78).default('From awareness to action'),
  subtitle: z.string().max(90).optional(),
  mode: z.enum(['funnel', 'pyramid', 'inverted', 'stack']).default('funnel'),
  levels: z.array(level).min(2).max(8).default([
    {label: 'Attention', detail: 'People encounter the message.', at: 0},
    {label: 'Interest', detail: 'Some choose to learn more.', at: 0.24},
    {label: 'Desire', detail: 'The benefit becomes relevant.', at: 0.48},
    {label: 'Action', detail: 'Some take the next step.', at: 0.72},
  ]),
  unit: z.string().max(24).default(''),
}).strict().superRefine((p, ctx) => {
  const measured = p.mode === 'funnel' && p.levels.some(item => item.value !== undefined);
  p.levels.forEach((item, i) => {
    if (measured && (item.value === undefined || (i === 0 ? item.value <= 0 :
      p.levels[i - 1].value !== undefined && item.value > p.levels[i - 1].value!))) {
      ctx.addIssue({code: 'custom', path: ['levels', i, 'value'],
        message: 'Give every funnel level a value, starting above zero and decreasing or staying level.'});
    }
    if (i && item.at < p.levels[i - 1].at) {
      ctx.addIssue({code: 'custom', path: ['levels', i, 'at'], message: 'Reveal levels from top to bottom, in order.'});
    }
  });
});

export const description = 'A progressive funnel, pyramid, inverted pyramid or equal-width stack. Supply levels in top-to-bottom order with labels, details and optional timing cues. When every funnel level has a value, the widths show the relative counts; otherwise the shapes show order. Use for AIDA, sales funnels, news writing, Maslow and OSI layers.';
export const tags = ['funnel', 'pyramid', 'inverted pyramid', 'hierarchy of needs', 'layers', 'stack', 'aida', 'osi', 'maslow', 'conversion', 'gatekeeping'];

const number = new Intl.NumberFormat('en-US', {maximumFractionDigits: 3});

export function LayersScene(input: z.input<typeof layersSceneSchema>) {
  const p = layersSceneSchema.parse(input);
  const {width, height} = useVideoConfig();
  const portrait = width < height;
  const u = useUnit(), theme = useTheme();
  const timing = useLectureTiming();
  const levels = p.levels;
  const measured = p.mode === 'funnel' && levels[0].value !== undefined;
  const active = levels.reduce((last, item, i) => timing.cueFrame(item.at) <= timing.frame ? i : last, -1);
  const widthAt = (boundary: number) => {
    if (measured) return (levels[Math.min(boundary, levels.length - 1)].value ?? 0) / levels[0].value!;
    const t = boundary / levels.length;
    return p.mode === 'pyramid' ? 0.20 + 0.8 * t : 1 - 0.76 * t;
  };
  return <LectureBoard title={p.title} subtitle={p.subtitle}>
    <div style={{width:'100%', alignSelf:'center', display:'grid', maxWidth:(p.mode === 'stack' && levels.every(item => !item.detail) ? 950 : 1470) * u, gap:8 * u,
      gridAutoRows: '1fr', height: Math.min(levels.length * 123, portrait ? 1120 : 704) * u}}>
      {levels.map((item, i) => {
        const color = lectureColors[i % lectureColors.length];
        const top = widthAt(i), bottom = widthAt(i + 1);
        const opacity = timing.progress(item.at, 0.44);
        if (p.mode === 'stack') return <div key={i} style={{display:'grid', alignItems:'center',
          gridTemplateColumns:item.detail ? 'minmax(0,1fr) minmax(0,1.12fr)' : '1fr',
          gap:24*u, opacity, transform:`translateY(${(1-opacity)*9*u}px)`,
          alignSelf:'stretch', minHeight:0}}>
          <div style={{height:'100%', display:'flex', alignItems:'center', paddingInline:22*u, boxSizing:'border-box',
            background:color.fill, color:color.ink, border:`1.5px solid ${color.ink}`, borderRadius:10*u,
            fontSize:31*u, lineHeight:1.1, fontWeight:750, overflowWrap:'anywhere'}}>{item.label}
            {item.value !== undefined ? <span style={{marginLeft:'auto',fontSize:24*u}}>
              {number.format(item.value)}{p.unit ? ` ${p.unit}` : ''}
            </span> : null}
          </div>
          {item.detail ? <div style={{fontSize:23*u, color:theme.muted,lineHeight:1.15}}>{item.detail}</div> : null}
        </div>;
        return <div key={i} style={{display:'grid', gridTemplateColumns:portrait ? '0.75fr 1.25fr' : '1.05fr 1fr',
          columnGap:(portrait ? 25 : 46) * u, minHeight:0, opacity, transform:`translateY(${(1-opacity)*6*u}px)`}}>
          <svg width="100%" height="100%" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden>
            <polygon points={`${50 - top * 50},0 ${50 + top * 50},0 ${50 + bottom * 50},100 ${50 - bottom * 50},100`}
              fill={color.fill} stroke={color.ink} strokeWidth={i === active ? 2.3 * u : 1.2 * u} vectorEffect="non-scaling-stroke"/>
          </svg>
          <div style={{alignSelf:'center', minWidth:0, paddingLeft:16 * u, borderLeft:`${3 * u}px solid ${color.ink}`}}>
            <div style={{display:'flex', flexWrap:'wrap', alignItems:'baseline', gap:10 * u, fontSize:31 * u, fontWeight:750, lineHeight:1.12}}>
              <span>{item.label}</span>
              {item.value !== undefined ? <span style={{color:color.ink, fontSize:25 * u}}>{number.format(item.value)}{p.unit ? ` ${p.unit}` : ''}</span> : null}
            </div>
            {item.detail ? <div style={{marginTop:4 * u, fontSize:(levels.length > 6 && !portrait ? 18 : 23) * u,
              color:theme.muted, lineHeight:1.2, overflowWrap:'anywhere'}}>{item.detail}</div> : null}
          </div>
        </div>;
      })}
    </div>
  </LectureBoard>;
}
