import {AbsoluteFill, useCurrentFrame, useVideoConfig} from 'remotion';
import {z} from 'zod';
import {entrance, entranceSchema} from '../animation';
import {Device, deviceKindSchema, deviceStateSchema} from '../components/Device';
import {AnimatedText, CountUp, DrawArrow, Pulse, stripMarkup, textAnimationSchema} from '../motion';
import {useTheme, useUnit} from '../theme';

const frame = z.number().int().nonnegative();
const point = z.object({x: z.number().min(0).max(100), y: z.number().min(0).max(100)}).strict();

export const explainSceneSchema = z.object({
  eyebrow: z.string().max(40).optional(),
  heading: z.string().default('A **LAN** connects devices in ==one building=='),
  body: z.string().optional(), // markup + "\n" for new lines
  points: z.array(z.string()).max(6).default([]), // each supports markup
  stat: z
    .object({value: z.number(), from: z.number().default(0), prefix: z.string().default(''), suffix: z.string().default(''), decimals: z.number().int().min(0).max(3).default(0), label: z.string().optional()})
    .strict()
    .optional(),
  device: deviceKindSchema.optional(), // icon shown on the right
  deviceState: deviceStateSchema.default('active'),
  arrows: z
    .array(z.object({from: point, to: point, label: z.string().optional(), startAt: frame.optional(), bend: z.number().min(-1).max(1).default(0.25)}).strict())
    .max(4)
    .default([]),
  textAnimation: textAnimationSchema.default('words'),
  entrance: entranceSchema.default('rise'),
  startAt: frame.default(6),
  wordStagger: z.number().int().min(1).max(20).default(4),
  pointStagger: z.number().int().min(1).max(60).default(16),
  align: z.enum(['left', 'center']).default('left'),
});

export const description =
  'Teaching card: heading and body text revealed word by word with **bold**, ==highlight==, __underline__ and ((circle)) marks; optional staggered points, a count-up stat, a device icon and drawn arrows.';
export const tags = ['text', 'explain', 'definition', 'highlight', 'education', 'stat', 'arrow'];

const words = (s?: string) => (s ? stripMarkup(s).split(/\s+/).filter(Boolean).length : 0);

export const ExplainScene: React.FC<z.input<typeof explainSceneSchema>> = (input) => {
  const p = explainSceneSchema.parse(input);
  const f = useCurrentFrame();
  const {fps} = useVideoConfig();
  const theme = useTheme();
  const u = useUnit();

  // Timeline: heading → body → points → stat, each starting after the previous text finished.
  const headingAt = p.startAt + (p.eyebrow ? 8 : 0);
  const bodyAt = headingAt + words(p.heading) * p.wordStagger + 12;
  const pointsAt = bodyAt + (p.body ? words(p.body) * Math.max(2, p.wordStagger - 1) + 14 : 0);
  const statAt = pointsAt + p.points.length * p.pointStagger + 6;
  const center = p.align === 'center';

  return (
    <AbsoluteFill style={{padding: `${90 * u}px ${120 * u}px`, flexDirection: 'row', alignItems: 'center', gap: 80 * u}}>
      <div style={{flex: 1, display: 'flex', flexDirection: 'column', gap: 30 * u, alignItems: center ? 'center' : 'flex-start', textAlign: p.align}}>
        {p.eyebrow ? (
          <div style={{fontSize: 26 * u, letterSpacing: 5 * u, fontWeight: 700, color: theme.accent, ...entrance('fade', f - p.startAt, fps, u)}}>
            {p.eyebrow.toUpperCase()}
          </div>
        ) : null}
        <AnimatedText as="h2" text={p.heading} mode={p.textAnimation} entrance={p.entrance} startAt={headingAt} stagger={p.wordStagger}
          style={{fontSize: 82 * u, fontWeight: 800, lineHeight: 1.15, color: theme.text}} />
        {p.body ? (
          <AnimatedText text={p.body} mode={p.textAnimation} entrance={p.entrance} startAt={bodyAt} stagger={Math.max(2, p.wordStagger - 1)}
            style={{fontSize: 44 * u, lineHeight: 1.45, color: theme.muted, maxWidth: 1250 * u}} />
        ) : null}
        {p.points.length ? (
          <div style={{display: 'flex', flexDirection: 'column', gap: 18 * u, marginTop: 6 * u}}>
            {p.points.map((pt, i) => {
              const at = pointsAt + i * p.pointStagger;
              return (
                <div key={i} style={{display: 'flex', alignItems: 'center', gap: 22 * u, fontSize: 44 * u, color: theme.text, ...entrance('slide-left', f - at, fps, u)}}>
                  <span style={{display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 52 * u, height: 52 * u, borderRadius: '50%',
                    background: `color-mix(in srgb, ${theme.accent} 22%, transparent)`, color: theme.accent, fontSize: 28 * u, fontWeight: 800, flexShrink: 0}}>
                    {i + 1}
                  </span>
                  <AnimatedText as="span" text={pt} mode="none" startAt={at} />
                </div>
              );
            })}
          </div>
        ) : null}
        {p.stat ? (
          <div style={{display: 'flex', alignItems: 'baseline', gap: 20 * u, marginTop: 10 * u, ...entrance('pop', f - statAt, fps, u)}}>
            <Pulse at={[statAt + 50]}>
              <CountUp to={p.stat.value} from={p.stat.from} prefix={p.stat.prefix} suffix={p.stat.suffix} decimals={p.stat.decimals} startAt={statAt} duration={45}
                style={{fontSize: 120 * u, fontWeight: 800, color: theme.accent}} />
            </Pulse>
            {p.stat.label ? <span style={{fontSize: 40 * u, color: theme.muted}}>{p.stat.label}</span> : null}
          </div>
        ) : null}
      </div>
      {p.device ? (
        <div style={{flexShrink: 0}}>
          <Device kind={p.device} state={p.deviceState} size={300} appearAt={headingAt + 6} />
        </div>
      ) : null}
      {p.arrows.map((a, i) => (
        <DrawArrow key={i} from={a.from} to={a.to} label={a.label} bend={a.bend} startAt={a.startAt ?? statAt + i * 12} />
      ))}
    </AbsoluteFill>
  );
};
