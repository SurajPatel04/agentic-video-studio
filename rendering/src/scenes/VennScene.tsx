import {Easing, interpolate, useCurrentFrame} from 'remotion';
import {z} from 'zod';
import {StudyFrame} from '../components/StudyFrame';
import {useTheme} from '../theme';

const nonnegative = z.number().int().nonnegative();
const positive = z.number().int().positive();

const groupSchema = z.object({
  label: z.string(),
  items: z.array(z.string()).min(1).max(4),
});

export const vennSceneSchema = z.object({
  title: z.string().default('Plant cells vs animal cells'),
  eyebrow: z.string().default('VENN / COMPARE & CONTRAST'),
  left: groupSchema.default({
    label: 'Plant cells',
    items: ['Cell wall', 'Chloroplasts', 'Large vacuole'],
  }),
  right: groupSchema.default({
    label: 'Animal cells',
    items: ['Centrioles', 'Small vacuoles', 'Flexible shape'],
  }),
  both: z.array(z.string()).min(1).max(5).default(['Nucleus', 'Mitochondria', 'Cell membrane', 'Cytoplasm']),
  bothLabel: z.string().default('Both'),
  leftColor: z.string().optional(),
  rightColor: z.string().optional(),
  startAt: nonnegative.default(10),
  stagger: nonnegative.default(14),
  revealFrames: positive.default(14),
  footer: z.string().default('Use a Venn diagram when two ideas overlap but are not identical.'),
});

export const description = 'A two-circle Venn diagram for comparing two ideas, with left-only, right-only, and shared points.';
export const tags = ['venn', 'compare', 'contrast', 'overlap', 'diagram'];

const clamp = (value: number) => Math.min(1, Math.max(0, value));

export const VennScene: React.FC<z.input<typeof vennSceneSchema>> = (input) => {
  const p = vennSceneSchema.parse(input);
  const frame = useCurrentFrame();
  const theme = useTheme();
  const leftColor = p.leftColor ?? theme.accent;
  const rightColor = p.rightColor ?? '#a78bfa';
  const circleReveal = interpolate(frame, [p.startAt, p.startAt + 20], [0, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
    easing: Easing.out(Easing.cubic),
  });

  return (
    <StudyFrame title={p.title} eyebrow={p.eyebrow} footer={p.footer || undefined}>
      <div style={{position: 'relative', height: '100%'}}>
        <svg viewBox="0 0 1440 575" width="100%" height="100%" style={{position: 'absolute', inset: 0}}>
          <g opacity={circleReveal} transform={`translate(720 315) scale(${0.94 + circleReveal * 0.06}) translate(-720 -315)`}>
            <circle cx={595} cy={315} r={215} fill={leftColor} fillOpacity={0.16} stroke={leftColor} strokeWidth={3} />
            <circle cx={845} cy={315} r={215} fill={rightColor} fillOpacity={0.16} stroke={rightColor} strokeWidth={3} />
          </g>
        </svg>

        <div style={{position: 'absolute', left: 80, top: 290, width: 250, textAlign: 'right', fontSize: 26, fontWeight: 700, color: leftColor, opacity: circleReveal}}>{p.left.label}</div>
        <div style={{position: 'absolute', left: 1110, top: 290, width: 250, textAlign: 'left', fontSize: 26, fontWeight: 700, color: rightColor, opacity: circleReveal}}>{p.right.label}</div>
        <div style={{position: 'absolute', left: 635, top: 76, width: 170, textAlign: 'center', fontSize: 15, letterSpacing: 2.2, fontWeight: 700, color: theme.muted, opacity: circleReveal}}>{p.bothLabel.toUpperCase()}</div>

        <div style={{position: 'absolute', left: 385, top: 165, width: 210, height: 300, display: 'flex', flexDirection: 'column', justifyContent: 'center', gap: 12, textAlign: 'right'}}>
          {p.left.items.map((text, i) => {
            const reveal = clamp((frame - p.startAt - 8 - i * p.stagger) / p.revealFrames);
            return (
              <div key={text} style={{fontSize: 21, lineHeight: 1.25, color: theme.text, opacity: reveal, transform: `translateX(${(1 - reveal) * -12}px)`}}>
                {text}<span style={{display: 'inline-block', width: 8, height: 8, marginLeft: 10, borderRadius: '50%', background: leftColor}} />
              </div>
            );
          })}
        </div>

        <div style={{position: 'absolute', left: 630, top: 145, width: 180, height: 350, display: 'flex', flexDirection: 'column', justifyContent: 'center', gap: 12, textAlign: 'center'}}>
          {p.both.map((text, i) => {
            const reveal = clamp((frame - p.startAt - 8 - i * p.stagger) / p.revealFrames);
            return (
              <div key={text} style={{fontSize: 20, lineHeight: 1.25, color: theme.text, opacity: reveal, transform: `translateY(${(1 - reveal) * 8}px)`}}>
                {text}
              </div>
            );
          })}
        </div>

        <div style={{position: 'absolute', left: 845, top: 165, width: 210, height: 300, display: 'flex', flexDirection: 'column', justifyContent: 'center', gap: 12, textAlign: 'left'}}>
          {p.right.items.map((text, i) => {
            const reveal = clamp((frame - p.startAt - 8 - i * p.stagger) / p.revealFrames);
            return (
              <div key={text} style={{fontSize: 21, lineHeight: 1.25, color: theme.text, opacity: reveal, transform: `translateX(${(1 - reveal) * 12}px)`}}>
                <span style={{display: 'inline-block', width: 8, height: 8, marginRight: 10, borderRadius: '50%', background: rightColor}} />{text}
              </div>
            );
          })}
        </div>
      </div>
    </StudyFrame>
  );
};
