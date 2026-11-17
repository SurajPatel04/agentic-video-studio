import {AbsoluteFill, useCurrentFrame, useVideoConfig, interpolate, spring} from 'remotion';
import {z} from 'zod';
import {entrance} from '../animation';
import {useTheme, useUnit} from '../theme';

export const schema = z.object({
  title: z.string().default('Bubble Sort'),
  values: z.array(z.number()).default([5, 1, 4, 2, 8]),
});

export const description = 'Visualizes bubble sort as numbered vertical bars, highlighting each comparison and animating adjacent swaps. Use it to introduce passes, comparisons, and the final sorted result.';
export const tags = ['sorting', 'bubble-sort', 'algorithms', 'DSA', 'arrays'];

type SortEvent = {
  values: number[];
  left: number;
  right: number;
  swapped: boolean;
  pass: number;
  step: number;
};

export const BubbleSortScene: React.FC<z.input<typeof schema>> = (input) => {
  const p = schema.parse(input);
  const f = useCurrentFrame();
  const {fps, width, height} = useVideoConfig();
  const theme = useTheme();
  const u = useUnit();

  const initial = p.values.slice(0, 12);
  const working = initial.slice();
  const events: SortEvent[] = [];
  let step = 0;
  for (let pass = 0; pass < Math.max(0, working.length - 1); pass++) {
    for (let i = 0; i < working.length - pass - 1; i++) {
      const before = working.slice();
      const swapped = working[i] > working[i + 1];
      if (swapped) [working[i], working[i + 1]] = [working[i + 1], working[i]];
      events.push({values: before, left: i, right: i + 1, swapped, pass: pass + 1, step: ++step});
    }
  }

  // Pace comparisons so the complete sort is visible by the final frame of a typical scene.
  const eventFrames = Math.max(1, Math.floor(149 / Math.max(1, events.length)));
  const eventIndex = events.length ? Math.min(events.length - 1, Math.floor(Math.max(0, f) / eventFrames)) : -1;
  const active = eventIndex >= 0 ? events[eventIndex] : null;
  const localFrame = active ? Math.max(0, f - eventIndex * eventFrames) : 0;
  const swapProgress = active?.swapped
    ? interpolate(localFrame, [Math.min(4, eventFrames * 0.3), eventFrames * 0.8], [0, 1], {extrapolateLeft: 'clamp', extrapolateRight: 'clamp'})
    : 0;
  const isFinished = events.length === 0 || f >= events.length * eventFrames;
  const displayed = isFinished ? working : (active?.values ?? initial);
  const passCount = isFinished ? Math.max(0, initial.length - 1) : Math.max(0, (active?.pass ?? 1) - 1);
  const n = Math.max(1, displayed.length);
  const chartWidth = Math.min(width - 140 * u, 1480 * u);
  const slotWidth = chartWidth / n;
  const barWidth = Math.min(94 * u, slotWidth * 0.64);
  const baseline = Math.min(height - 190 * u, 835 * u);
  const chartHeight = Math.min(430 * u, baseline - 310 * u);
  const minValue = Math.min(0, ...initial);
  const maxValue = Math.max(1, ...initial);
  const heightFor = (value: number) => 90 * u + ((value - minValue) / Math.max(1, maxValue - minValue)) * (chartHeight - 90 * u);
  const entry = spring({frame: f, fps, config: {damping: 16, stiffness: 105}});
  const countText = events.length ? `Pass ${Math.min(active?.pass ?? 1, Math.max(1, initial.length - 1))} / ${Math.max(1, initial.length - 1)}   •   Step ${Math.min(isFinished ? events.length : active?.step ?? 0, events.length)} / ${events.length}` : 'No comparisons needed';

  return (
    <AbsoluteFill style={{backgroundColor: theme.background, color: theme.text, fontFamily: 'Inter, Arial, sans-serif', overflow: 'hidden'}}>
      <div style={{position: 'absolute', top: 62 * u, left: 70 * u, right: 70 * u, textAlign: 'center', fontSize: 60 * u, fontWeight: 800, ...entrance('fade-up', f, fps, u)}}>{p.title}</div>
      <div style={{position: 'absolute', top: 158 * u, left: 70 * u, right: 70 * u, textAlign: 'center', fontSize: 29 * u, color: theme.muted, fontWeight: 600}}>
        {countText}
      </div>
      <div style={{position: 'absolute', left: '50%', top: baseline, width: chartWidth, height: 2 * u, transform: 'translateX(-50%)', backgroundColor: `${theme.muted}66`}} />
      {displayed.map((value, index) => {
        const isPair = !!active && (index === active.left || index === active.right) && !isFinished;
        const isSorted = isFinished || index >= initial.length - passCount;
        let slot = index;
        if (active?.swapped && !isFinished && (index === active.left || index === active.right)) {
          slot = index === active.left ? index + swapProgress : index - swapProgress;
        }
        const x = (width - chartWidth) / 2 + slot * slotWidth + (slotWidth - barWidth) / 2;
        const barHeight = heightFor(value);
        const scale = interpolate(entry, [0, 1], [0.82, 1], {extrapolateLeft: 'clamp', extrapolateRight: 'clamp'});
        const color = isSorted ? '#22c55e' : isPair ? '#f59e0b' : theme.accent;
        return (
          <div key={`${index}-${value}`} style={{position: 'absolute', left: x, top: baseline - barHeight * scale, width: barWidth, height: barHeight * scale, borderRadius: `${12 * u}px ${12 * u}px 0 0`, backgroundColor: color, display: 'flex', alignItems: 'flex-start', justifyContent: 'center', paddingTop: 13 * u, boxSizing: 'border-box', boxShadow: isPair ? `0 0 ${24 * u}px #f59e0b55` : 'none'}}>
            <span style={{fontSize: 27 * u, fontWeight: 800, color: '#ffffff'}}>{value}</span>
          </div>
        );
      })}
      {active && !isFinished ? (
        <div style={{position: 'absolute', top: baseline + 24 * u, left: 70 * u, right: 70 * u, textAlign: 'center', fontSize: 27 * u, color: theme.text, opacity: interpolate(localFrame, [0, 5], [0, 1], {extrapolateLeft: 'clamp', extrapolateRight: 'clamp'})}}>
          Compare <b>{active.values[active.left]}</b> and <b>{active.values[active.right]}</b>
          <span style={{color: active.swapped ? '#f59e0b' : theme.muted}}> {active.swapped ? '— swap' : '— keep order'}</span>
        </div>
      ) : (
        <div style={{position: 'absolute', top: baseline + 24 * u, left: 70 * u, right: 70 * u, textAlign: 'center', fontSize: 29 * u, fontWeight: 700, color: '#22c55e'}}>
          {isFinished && initial.length > 0 ? 'Sorted!' : ''}
        </div>
      )}
      {displayed.length === 0 ? <div style={{position: 'absolute', top: baseline - 50 * u, left: 70 * u, right: 70 * u, textAlign: 'center', color: theme.muted, fontSize: 28 * u}}>Add values to begin</div> : null}
    </AbsoluteFill>
  );
};
