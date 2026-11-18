import {PAPER} from '../iso/iso';
import {Easing, interpolate, useCurrentFrame} from 'remotion';
import {useId} from 'react';
import {z} from 'zod';
import {StudyFrame} from '../components/StudyFrame';
import {useTheme} from '../theme';

const nonnegative = z.number().int().nonnegative();
const positive = z.number().int().positive();

export const cycleSceneSchema = z.object({
  title: z.string().default('The water cycle'),
  eyebrow: z.string().default('CYCLE / A LOOP THAT REPEATS'),
  steps: z.array(z.object({
    label: z.string(),
    detail: z.string().optional(),
  })).min(3).max(8).default([
    {label: 'Evaporation', detail: 'Heat turns liquid water into vapor.'},
    {label: 'Condensation', detail: 'Vapor cools and forms clouds.'},
    {label: 'Precipitation', detail: 'Rain, snow, or hail falls.'},
    {label: 'Collection', detail: 'Water gathers in rivers, lakes, and oceans.'},
  ]),
  centerLabel: z.string().default('The water cycle'),
  direction: z.enum(['clockwise', 'counterclockwise']).default('clockwise'),
  startAt: nonnegative.default(10),
  stagger: nonnegative.default(22),
  revealFrames: positive.default(16),
  footer: z.string().default('A cycle has no first step; follow the arrows around the loop.'),
});

export const description = 'A circular process diagram with 3–8 labeled stages, animated arrows, and a center label.';
export const tags = ['cycle', 'process', 'loop', 'stages', 'science', 'diagram'];

const clamp = (value: number) => Math.min(1, Math.max(0, value));

type Pt = {x: number; y: number};

const pointOnEllipse = (cx: number, cy: number, rx: number, ry: number, degrees: number): Pt => {
  const radians = (degrees * Math.PI) / 180;
  return {x: cx + rx * Math.cos(radians), y: cy + ry * Math.sin(radians)};
};

export const CycleScene: React.FC<z.input<typeof cycleSceneSchema>> = (input) => {
  const p = cycleSceneSchema.parse(input);
  const frame = useCurrentFrame();
  const theme = useTheme();
  const markerId = `cycle-arrow-${useId().replace(/:/g, '')}`;
  const n = p.steps.length;
  const cx = 720;
  const cy = 286;
  const rx = 430;
  const ry = 178;
  const cardWidth = n <= 4 ? 252 : n <= 6 ? 222 : 192;
  const cardHeight = n <= 6 ? 94 : 82;
  const sign = p.direction === 'clockwise' ? 1 : -1;
  const angleStep = 360 / n;
  const arrowGap = Math.min(16, angleStep * 0.2);

  const activeIndex = p.steps.reduce((latest, _step, i) => (frame >= p.startAt + i * p.stagger ? i : latest), -1);

  return (
    <StudyFrame title={p.title} eyebrow={p.eyebrow} footer={p.footer || undefined}>
      <div style={{position: 'relative', height: '100%'}}>
        <svg viewBox="0 0 1440 575" width="100%" height="100%" style={{position: 'absolute', inset: 0}}>
          <defs>
            <marker id={markerId} viewBox="0 0 10 10" refX="8" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
              <path d="M 0 0 L 10 5 L 0 10 z" fill={theme.accent} />
            </marker>
          </defs>
          <ellipse cx={cx} cy={cy} rx={rx} ry={ry} fill="none" stroke={PAPER.track} strokeWidth={2} strokeDasharray="7 8" />
          {p.steps.map((_step, i) => {
            const startAngle = -90 + sign * (i * angleStep + arrowGap);
            const endAngle = -90 + sign * ((i + 1) * angleStep - arrowGap);
            const start = pointOnEllipse(cx, cy, rx, ry, startAngle);
            const end = pointOnEllipse(cx, cy, rx, ry, endAngle);
            const progress = interpolate(frame, [p.startAt + i * p.stagger, p.startAt + i * p.stagger + p.revealFrames], [0, 1], {
              extrapolateLeft: 'clamp',
              extrapolateRight: 'clamp',
              easing: Easing.inOut(Easing.cubic),
            });
            const largeArc = Math.abs(endAngle - startAngle) > 180 ? 1 : 0;
            const d = `M ${start.x} ${start.y} A ${rx} ${ry} 0 ${largeArc} ${sign > 0 ? 1 : 0} ${end.x} ${end.y}`;
            return (
              <path
                key={`arrow-${i}`}
                d={d}
                fill="none"
                stroke={theme.accent}
                strokeWidth={3}
                strokeLinecap="round"
                markerEnd={`url(#${markerId})`}
                pathLength={1}
                strokeDasharray={1}
                strokeDashoffset={1 - progress}
              />
            );
          })}
        </svg>

        {p.steps.map((step, i) => {
          const angle = -90 + sign * i * angleStep;
          const point = pointOnEllipse(cx, cy, rx, ry, angle);
          const reveal = clamp((frame - p.startAt - i * p.stagger) / p.revealFrames);
          const active = i === activeIndex;
          return (
            <div
              key={`${step.label}-${i}`}
              style={{
                position: 'absolute',
                left: point.x - cardWidth / 2,
                top: point.y - cardHeight / 2,
                width: cardWidth,
                height: cardHeight,
                boxSizing: 'border-box',
                display: 'flex',
                flexDirection: 'column',
                justifyContent: 'center',
                alignItems: 'center',
                textAlign: 'center',
                padding: '8px 12px',
                borderRadius: 14,
                border: `2px solid ${active ? theme.accent : PAPER.inkSoft}`,
                background: active ? `${theme.accent}20` : PAPER.card,
                opacity: reveal,
                transform: `translateY(${(1 - reveal) * 16}px)`,
                boxShadow: '0 8px 22px rgba(0,0,0,0.18)',
              }}
            >
              <div style={{fontSize: n > 6 ? 19 : 22, lineHeight: 1.12, fontWeight: 680, color: active ? theme.accent : theme.text}}>{step.label}</div>
              {step.detail ? <div style={{fontSize: n > 6 ? 13 : 15, lineHeight: 1.25, color: theme.muted, marginTop: 5}}>{step.detail}</div> : null}
            </div>
          );
        })}

        <div style={{position: 'absolute', left: cx - 155, top: cy - 52, width: 310, height: 104, display: 'flex', alignItems: 'center', justifyContent: 'center', textAlign: 'center', padding: 10, boxSizing: 'border-box'}}>
          <div style={{fontSize: 27, lineHeight: 1.2, fontWeight: 700, color: theme.accent, opacity: clamp((frame - p.startAt) / 20)}}>{p.centerLabel}</div>
        </div>
      </div>
    </StudyFrame>
  );
};
