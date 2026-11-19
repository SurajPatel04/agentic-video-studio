import {Easing, interpolate, useCurrentFrame} from 'remotion';
import {z} from 'zod';
import {scaleBand, scaleLinear, scalePoint} from 'd3-scale';
import {area, curveMonotoneX, line} from 'd3-shape';
import {StudyFrame} from '../components/StudyFrame';
import {useSceneLength, useTheme} from '../theme';

const nonnegative = z.number().int().nonnegative();

export const chartSceneSchema = z.object({
  title: z.string().default('Global internet users'),
  eyebrow: z.string().default('CHART / SEE THE TREND'),
  chartType: z.enum(['bar', 'line', 'area']).default('bar'),
  categories: z.array(z.string()).min(2).max(12).default(['2019', '2020', '2021', '2022', '2023', '2024']),
  xValues: z.array(z.number()).min(2).max(12).optional(),
  markers: z.array(z.object({
    at: z.number().min(0).max(1),
    x: z.number(),
    y: z.number().nonnegative(),
    label: z.string().min(1).max(45),
  }).strict()).max(4).default([]),
  series: z.array(z.object({
    name: z.string(),
    values: z.array(z.number().nonnegative()),
    color: z.string().optional(),
  })).min(1).max(4).default([
    {name: 'Internet users (billions)', values: [4.1, 4.6, 4.9, 5.0, 5.2, 5.5], color: '#38bdf8'},
  ]),
  yLabel: z.string().default('Billions of people'),
  xLabel: z.string().default('Year'),
  valueSuffix: z.string().default('B'),
  maxValue: z.number().positive().optional(),
  showValues: z.boolean().default(true),
  showLegend: z.boolean().default(true),
  showGrid: z.boolean().default(true),
  startAt: nonnegative.default(12),
  growFrames: nonnegative.default(42),
  footer: z.string().default('Bars and lines are drawn in proportion to the values shown.'),
}).superRefine((p, ctx) => {
  const {xValues} = p;
  if (xValues && (p.chartType === 'bar' || xValues.length !== p.categories.length ||
    xValues.some((value, i) => i > 0 && value <= xValues[i - 1]))) {
    ctx.addIssue({code: 'custom', path: ['xValues'], message: 'Use one increasing x value per category on a line or area chart.'});
  }
  p.markers.forEach((marker, i) => {
    if (!xValues || marker.x < xValues[0] || marker.x > xValues[xValues.length - 1]) {
      ctx.addIssue({code: 'custom', path: ['markers', i, 'x'], message: 'Place the marker within the numeric x axis.'});
    }
  });
  p.series.forEach((s, i) => {
    if (s.values.length !== p.categories.length) {
      ctx.addIssue({code: 'custom', path: ['series', i, 'values'], message: 'Each series needs one value per category'});
    }
  });
});

export const description = 'A bar, line, or area chart. On a line or area chart, supply xValues for numeric spacing, and add labeled markers to distinguish a prediction from observed data. Use growFrames:0 to keep the existing chart visible while a marker is added on its narration cue.';
export const tags = ['chart', 'bar', 'line', 'area', 'data', 'trend', 'statistics'];

const DEFAULT_COLORS = ['#38bdf8', '#a78bfa', '#34d399', '#fbbf24'];
const clamp = (value: number, min = 0, max = 1) => Math.min(max, Math.max(min, value));
const fmt = (value: number, maxDigits = 2) => new Intl.NumberFormat('en-US', {maximumFractionDigits: maxDigits}).format(value);

export const ChartScene: React.FC<z.input<typeof chartSceneSchema>> = (input) => {
  const p = chartSceneSchema.parse(input);
  const frame = useCurrentFrame(), len = useSceneLength();
  const theme = useTheme();

  const W = 1440;
  const H = 575;
  const left = 95;
  const right = 30;
  const top = 42;
  const bottom = 92;
  const plotW = W - left - right;
  const plotH = H - top - bottom;
  const colors = p.series.map((s, i) => s.color ?? DEFAULT_COLORS[i % DEFAULT_COLORS.length]);

  const rawMax = Math.max(...p.series.flatMap((s) => s.values), ...p.markers.map(marker => marker.y), 0);
  const yScale = scaleLinear().domain([0, p.maxValue ?? (rawMax || 1)]).nice(4).range([plotH, 0]);
  const yTicks = yScale.ticks(4);
  const yTop = yTicks[yTicks.length - 1] || 1;

  const band = scaleBand<string>().domain(p.categories).range([0, plotW]).padding(0.26);
  const point = scalePoint<string>().domain(p.categories).range([0, plotW]).padding(0.22);
  const numericX = p.xValues ? scaleLinear()
    .domain([p.xValues[0], p.xValues[p.xValues.length - 1]]).range([38, plotW - 38]) : undefined;
  const xAt = (category: string, index: number) => numericX && p.xValues ? numericX(p.xValues[index]) : point(category) ?? 0;

  const grow = (start: number) => p.growFrames === 0 ? 1 :
    interpolate(frame, [start, start + p.growFrames], [0, 1],
      {extrapolateLeft: 'clamp', extrapolateRight: 'clamp', easing: Easing.out(Easing.cubic)});

  const linePath = line<[number, number]>().x((d) => d[0]).y((d) => d[1]).curve(curveMonotoneX);
  const areaPath = area<[number, number]>().x((d) => d[0]).y0(plotH).y1((d) => d[1]).curve(curveMonotoneX);

  return (
    <StudyFrame title={p.title} eyebrow={p.eyebrow} footer={p.footer || undefined}
      textAnimation={p.growFrames === 0 ? 'none' : undefined}>
      <div style={{position: 'absolute', top: -8, right: 0, display: 'flex', gap: 24, alignItems: 'center'}}>
        {p.showLegend && p.series.length > 1
          ? p.series.map((s, i) => (
              <div key={s.name} style={{display: 'flex', gap: 9, alignItems: 'center', fontSize: 19, color: theme.muted}}>
                <span style={{width: 15, height: 15, borderRadius: 4, background: colors[i], display: 'inline-block'}} />
                {s.name}
              </div>
            ))
          : null}
      </div>

      <svg viewBox={`0 0 ${W} ${H}`} width="100%" height="100%" role="img" aria-label={p.title}>
        <g transform={`translate(${left}, ${top})`}>
          {p.showGrid
            ? yTicks.map((tick) => (
                <g key={tick}>
                  <line x1={0} x2={plotW} y1={yScale(tick)} y2={yScale(tick)} stroke={theme.muted} strokeOpacity={tick === 0 ? 0 : 0.16} strokeWidth={1} />
                  <text x={-18} y={yScale(tick) + 6} textAnchor="end" fill={theme.muted} fontSize={18}>
                    {fmt(tick, 1)}
                  </text>
                </g>
              ))
            : null}

          <line x1={0} x2={plotW} y1={plotH} y2={plotH} stroke={theme.muted} strokeOpacity={0.45} strokeWidth={1.2} />

          {p.chartType === 'bar'
            ? p.categories.flatMap((category, categoryIndex) => {
                const groupWidth = band.bandwidth() / p.series.length;
                const barWidth = Math.max(8, groupWidth * 0.8);
                return p.series.map((s, seriesIndex) => {
                  const value = s.values[categoryIndex] ?? 0;
                  const progress = grow(p.startAt + categoryIndex * 2);
                  const height = (value / yTop) * plotH * progress;
                  const x = (band(category) ?? 0) + seriesIndex * groupWidth + (groupWidth - barWidth) / 2;
                  const y = plotH - height;
                  return (
                    <g key={`${category}-${s.name}`}>
                      <rect x={x} y={y} width={barWidth} height={Math.max(0, height)} rx={7} fill={colors[seriesIndex]} opacity={0.92} />
                      {p.showValues && progress > 0.55
                        ? <text x={x + barWidth / 2} y={Math.max(14, y - 9)} textAnchor="middle" fill={theme.text} fontSize={18} opacity={clamp((progress - 0.55) / 0.35)}>
                            {fmt(value)}{p.valueSuffix}
                          </text>
                        : null}
                    </g>
                  );
                });
              })
            : p.series.map((s, seriesIndex) => {
                const progress = grow(p.startAt + seriesIndex * 8);
                const points = p.categories.map((category, i) => [xAt(category, i), yScale(s.values[i] ?? 0)] as [number, number]);
                const d = p.chartType === 'area' ? areaPath(points) : linePath(points);
                const clipId = `chart-clip-${seriesIndex}`;
                return (
                  <g key={s.name}>
                    <clipPath id={clipId}>
                      <rect x={0} y={0} width={plotW * progress} height={plotH + 1} />
                    </clipPath>
                    {p.chartType === 'area'
                      ? <path d={d ?? ''} fill={colors[seriesIndex]} fillOpacity={0.2} clipPath={`url(#${clipId})`} />
                      : null}
                    <path d={d ?? ''} fill="none" stroke={colors[seriesIndex]} strokeWidth={5} strokeLinecap="round" strokeLinejoin="round" clipPath={`url(#${clipId})`} />
                    {points.map(([cx, cy], i) => {
                      const pointProgress = clamp((progress * plotW - cx) / 24);
                      return (
                        <g key={`${s.name}-${i}`} opacity={pointProgress}>
                          <circle cx={cx} cy={cy} r={6} fill={colors[seriesIndex]} stroke={theme.background} strokeWidth={2.5} />
                          {p.showValues
                            ? <text x={cx} y={cy - 15} textAnchor="middle" fill={theme.text} fontSize={17}>{fmt(s.values[i] ?? 0)}{p.valueSuffix}</text>
                            : null}
                        </g>
                      );
                    })}
                  </g>
                );
              })}

          {numericX && p.markers.map((marker, i) => {
            if (frame < Math.min(len - 1, Math.round(marker.at * len))) return null;
            const x = numericX(marker.x), y = yScale(marker.y);
            const labelX = Math.max(195, Math.min(plotW - 195, x));
            return <g key={i} fill="#85420d">
              <line x1={x} y1={y} x2={x} y2={plotH} stroke="#a85b19" strokeWidth={2} strokeDasharray="6 5" />
              <circle cx={x} cy={y} r={10} fill="#f5b564" stroke="#85420d" strokeWidth={3} />
              <text x={labelX} y={y - 27} textAnchor="middle" fontSize={23} fontWeight={750}
                stroke={theme.background} strokeWidth={7} paintOrder="stroke">{marker.label}</text>
            </g>;
          })}
          {p.categories.map((category, i) => {
            const x = p.chartType === 'bar' ? (band(category) ?? 0) + band.bandwidth() / 2 : xAt(category, i);
            return (
              <text key={category} x={x} y={plotH + 34} textAnchor="middle" fill={theme.muted} fontSize={19}>
                {category}
              </text>
            );
          })}

          {p.yLabel ? (
            <text x={-64} y={plotH / 2} transform={`rotate(-90, -64, ${plotH / 2})`} textAnchor="middle" fill={theme.muted} fontSize={18}>
              {p.yLabel}
            </text>
          ) : null}
          {p.xLabel ? (
            <text x={plotW / 2} y={plotH + 72} textAnchor="middle" fill={theme.muted} fontSize={18}>
              {p.xLabel}
            </text>
          ) : null}
        </g>
      </svg>
    </StudyFrame>
  );
};
