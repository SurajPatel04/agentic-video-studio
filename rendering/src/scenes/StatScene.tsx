import {Easing, interpolate, useCurrentFrame} from 'remotion';
import {z} from 'zod';
import {StudyFrame} from '../components/StudyFrame';
import {useTheme} from '../theme';

const nonnegative = z.number().int().nonnegative();
const positive = z.number().int().positive();

export const statSceneSchema = z.object({
  title: z.string().default('The Sun holds almost everything'),
  eyebrow: z.string().default('KEY NUMBER / WHY IT MATTERS'),
  value: z.number().default(99.8),
  prefix: z.string().default(''),
  suffix: z.string().default('%'),
  decimals: z.number().int().min(0).max(3).default(1),
  label: z.string().default("of the Solar System's mass"),
  detail: z.string().default('Every planet, moon, and asteroid is a rounding error by comparison.'),
  comparisons: z.array(z.object({
    label: z.string(),
    value: z.number().nonnegative(),
    suffix: z.string().optional(),
  })).max(5).default([
    {label: 'Sun', value: 99.8},
    {label: 'Jupiter', value: 0.1},
    {label: 'Everything else', value: 0.1},
  ]),
  startAt: nonnegative.default(10),
  countFrames: positive.default(42),
  accentColor: z.string().optional(),
  footer: z.string().default('A single number can anchor an entire explanation.'),
});

export const description = 'A large animated key statistic with a count-up, supporting text, and optional comparison bars.';
export const tags = ['statistic', 'number', 'key fact', 'data', 'count-up', 'comparison'];

const clamp = (value: number) => Math.min(1, Math.max(0, value));

export const StatScene: React.FC<z.input<typeof statSceneSchema>> = (input) => {
  const p = statSceneSchema.parse(input);
  const frame = useCurrentFrame();
  const theme = useTheme();
  const accent = p.accentColor ?? theme.accent;
  const fmt = (value: number, decimals: number) => new Intl.NumberFormat('en-US', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  }).format(value);

  const progress = interpolate(frame, [p.startAt, p.startAt + p.countFrames], [0, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
    easing: Easing.out(Easing.cubic),
  });
  const comparisonMax = Math.max(...p.comparisons.map((item) => item.value), p.comparisons.length ? 1 : 0);

  return (
    <StudyFrame title={p.title} eyebrow={p.eyebrow} footer={p.footer || undefined}>
      <div style={{height: '100%', display: 'grid', gridTemplateColumns: p.comparisons.length ? '1fr 1fr' : '1fr', gap: 70, alignItems: 'center'}}>
        <div style={{display: 'flex', flexDirection: 'column', justifyContent: 'center', minWidth: 0}}>
          <div style={{display: 'flex', alignItems: 'baseline', gap: 4, lineHeight: 0.95, color: accent}}>
            {p.prefix ? <span style={{fontSize: 72, fontWeight: 650}}>{p.prefix}</span> : null}
            <span style={{fontSize: 168, fontWeight: 820, letterSpacing: -7, fontVariantNumeric: 'tabular-nums'}}>{fmt(p.value * progress, p.decimals)}</span>
            {p.suffix ? <span style={{fontSize: 92, fontWeight: 720}}>{p.suffix}</span> : null}
          </div>
          <div style={{fontSize: 35, lineHeight: 1.22, fontWeight: 620, marginTop: 18, maxWidth: 660}}>{p.label}</div>
          {p.detail ? <div style={{fontSize: 22, lineHeight: 1.4, color: theme.muted, marginTop: 12, maxWidth: 640}}>{p.detail}</div> : null}
        </div>

        {p.comparisons.length ? (
          <div style={{display: 'flex', flexDirection: 'column', gap: 22, padding: '28px 30px', border: '1px solid #2e4b61', borderRadius: 18, background: '#112638'}}>
            {p.comparisons.map((item, i) => {
              const reveal = clamp((frame - p.startAt - 10 - i * 7) / 18);
              const width = comparisonMax ? (item.value / comparisonMax) * 100 : 0;
              return (
                <div key={`${item.label}-${i}`} style={{opacity: reveal, transform: `translateX(${(1 - reveal) * 14}px)`}}>
                  <div style={{display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 8}}>
                    <span style={{fontSize: 22, color: theme.text}}>{item.label}</span>
                    <span style={{fontSize: 20, color: theme.muted, fontVariantNumeric: 'tabular-nums'}}>{fmt(item.value, item.value < 1 ? 2 : 1)}{item.suffix ?? (p.suffix ? p.suffix : '')}</span>
                  </div>
                  <div style={{height: 12, borderRadius: 999, background: '#20394d', overflow: 'hidden'}}>
                    <div style={{height: '100%', width: `${Math.max(width * reveal, item.value > 0 ? 1.5 : 0)}%`, borderRadius: 999, background: i === 0 ? accent : `${accent}99`}} />
                  </div>
                </div>
              );
            })}
          </div>
        ) : null}
      </div>
    </StudyFrame>
  );
};
