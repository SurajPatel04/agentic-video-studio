import {useLayoutEffect, useRef, useState} from 'react';
import {AbsoluteFill, Easing, interpolate, useCurrentFrame, useVideoConfig} from 'remotion';
import {z} from 'zod';
import {entrance, entranceSchema} from '../animation';
import {Device, deviceKindSchema, deviceStateSchema} from '../components/Device';
import {AnimatedText, CountUp, DrawArrow, Pulse, stripMarkup, textAnimationSchema} from '../motion';
import {useSceneWords, useTheme, useUnit} from '../theme';

const frame = z.number().int().nonnegative();
const point = z.object({x: z.number().min(0).max(100), y: z.number().min(0).max(100)}).strict();

export const explainSceneSchema = z.object({
  eyebrow: z.string().max(40).optional(),
  heading: z.string().default('A **LAN** connects devices in ==one building=='),
  body: z.string().optional(), // markup + "\n" for new lines
  points: z.array(z.string()).max(6).default([]), // each supports markup
  pointCues: z.array(z.string()).max(6).optional(),
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
type PointLayout = {top: number; bottom: number; offset: number};

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
  const spoken = useSceneWords();
  const tokens = (s: string) => stripMarkup(s).toLowerCase().match(/[\p{L}\p{N}]+/gu) ?? [];
  const speech = spoken?.flatMap(({t, s}) => tokens(t).map(word => ({word, frame: s}))) ?? [];
  let cursor = 0;
  let previousFrame = -1;
  const pointFrames = p.points.map((point, i) => {
    const phrase = tokens(p.pointCues?.[i] || point);
    const match = phrase.length ? speech.findIndex((token, j) => j >= cursor && token.frame > previousFrame &&
      phrase.every((word, k) => speech[j + k]?.word === word)) : -1;
    if (match >= 0) cursor = match + phrase.length;
    previousFrame = match >= 0 ? Math.max(p.startAt, speech[match].frame)
      : Math.max(pointsAt + i * p.pointStagger, previousFrame + p.pointStagger);
    return previousFrame;
  });
  const statAt = (pointFrames.at(-1) ?? pointsAt - p.pointStagger) + p.pointStagger + 6;
  const center = p.align === 'center';
  const pointsViewport = useRef<HTMLDivElement>(null);
  const pointsList = useRef<HTMLDivElement>(null);
  const [pointLayout, setPointLayout] = useState<PointLayout[]>([]);
  const pointCount = p.points.length;

  useLayoutEffect(() => {
    const viewport = pointsViewport.current;
    const list = pointsList.current;
    if (!viewport || !list) return;

    const rows = Array.from(list.children) as HTMLElement[];
    const measure = () => {
      const viewportHeight = viewport.clientHeight;
      const tops = rows.map(row => row.offsetTop);
      const layout = rows.map((row, i) => {
        const top = tops[i];
        const bottom = top + row.offsetHeight;
        // Align the viewport to a whole point so the first line never settles halfway offscreen.
        const offset = tops.find(start => start >= bottom - viewportHeight && start <= top) ?? top;
        return {top, bottom, offset};
      });
      setPointLayout(previous => previous.length === layout.length && previous.every((point, i) =>
        point.top === layout[i].top && point.bottom === layout[i].bottom && point.offset === layout[i].offset)
        ? previous : layout);
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(viewport);
    rows.forEach(row => observer.observe(row));
    return () => observer.disconnect();
  }, [pointCount]);

  // Derive the scroll from the frame so a seek or parallel render draws the same list position.
  const scrollFrames = Math.max(1, Math.min(p.pointStagger, Math.round(fps * 0.35)));
  const scrollMoves = pointLayout.slice(0, pointCount).map(({offset}, i) => {
    const at = pointFrames[i];
    return {at, offset, distance: offset - (pointLayout[i - 1]?.offset ?? 0)};
  });
  const scrollOffset = scrollMoves.reduce((total, {at, distance}) => total + distance * interpolate(
    f, [at + scrollFrames * 0.25, at + scrollFrames * 0.8], [0, 1],
    {extrapolateLeft: 'clamp', extrapolateRight: 'clamp', easing: Easing.inOut(Easing.cubic)},
  ), 0);

  return (
    <AbsoluteFill style={{padding: `${(pointCount ? 60 : 90) * u}px ${120 * u}px`, flexDirection: 'row', alignItems: 'center', gap: 80 * u}}>
      <div style={{flex: 1, minWidth: 0, maxHeight: '100%', display: 'flex', flexDirection: 'column', gap: 30 * u, alignItems: center ? 'center' : 'flex-start', textAlign: p.align}}>
        {p.eyebrow ? (
          <div style={{fontSize: 26 * u, letterSpacing: 5 * u, fontWeight: 700, color: theme.accent, ...entrance('fade', f - p.startAt, fps, u)}}>
            {p.eyebrow.toUpperCase()}
          </div>
        ) : null}
        <AnimatedText as="h2" text={p.heading} mode={p.textAnimation} entrance={p.entrance} startAt={headingAt} stagger={p.wordStagger} syncHighlights
          style={{fontSize: 82 * u, fontWeight: 800, lineHeight: 1.15, color: theme.text}} />
        {p.body ? (
          <AnimatedText text={p.body} mode={p.textAnimation} entrance={p.entrance} startAt={bodyAt} stagger={Math.max(2, p.wordStagger - 1)} syncHighlights
            style={{fontSize: 44 * u, lineHeight: 1.45, color: theme.muted, maxWidth: 1250 * u}} />
        ) : null}
        {p.points.length ? (
          <div ref={pointsViewport} style={{width: '100%', minHeight: 0, overflow: 'hidden', marginTop: 6 * u}}>
            <div ref={pointsList} style={{position: 'relative', display: 'flex', flexDirection: 'column', alignItems: center ? 'center' : 'stretch', gap: 18 * u, transform: `translateY(${-scrollOffset}px)`}}>
              {p.points.map((pt, i) => {
                const move = scrollMoves[i];
                const at = pointFrames[i] + (move && move.distance > 0 ? scrollFrames * 0.8 : 0);
                const top = pointLayout[i]?.top;
                const exit = top === undefined ? undefined : scrollMoves.find(next => next.offset > top);
                const outgoingOpacity = exit ? interpolate(f, [exit.at, exit.at + scrollFrames * 0.25], [1, 0],
                  {extrapolateLeft: 'clamp', extrapolateRight: 'clamp'}) : 1;
                const appearance = entrance('fade', f - at, fps, u);
                return (
                  <div key={i} style={{display: 'flex', alignItems: 'center', gap: 22 * u, fontSize: 40 * u,
                    lineHeight: 1.25, color: theme.text, ...appearance, opacity: appearance.opacity * outgoingOpacity}}>
                    <span style={{display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 52 * u, height: 52 * u, borderRadius: '50%',
                      background: `color-mix(in srgb, ${theme.accent} 22%, transparent)`, color: theme.accent, fontSize: 28 * u, fontWeight: 800, flexShrink: 0}}>
                      {i + 1}
                    </span>
                    <AnimatedText as="span" text={pt} mode="none" startAt={at} style={{minWidth: 0, overflowWrap: 'anywhere'}} />
                  </div>
                );
              })}
            </div>
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
