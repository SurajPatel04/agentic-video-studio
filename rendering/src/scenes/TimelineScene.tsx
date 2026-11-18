import {Easing, interpolate, useCurrentFrame} from 'remotion';
import {z} from 'zod';
import {StudyFrame} from '../components/StudyFrame';
import {useTheme} from '../theme';

const nonnegative = z.number().int().nonnegative();
const positive = z.number().int().positive();

export const timelineSceneSchema = z.object({
  title: z.string().default('A short history of the internet'),
  eyebrow: z.string().default('TIMELINE / HOW WE GOT HERE'),
  events: z.array(z.object({
    date: z.string(),
    title: z.string(),
    detail: z.string().optional(),
  })).min(2).max(7).default([
    {date: '1969', title: 'ARPANET', detail: 'The first packet-switched network connects four university computers.'},
    {date: '1983', title: 'TCP/IP', detail: 'A common protocol lets separate networks talk to each other.'},
    {date: '1991', title: 'World Wide Web', detail: 'Pages, links, and browsers make the internet usable for everyone.'},
    {date: '2007', title: 'The smartphone', detail: 'The internet moves from desks into pockets.'},
    {date: '2020s', title: 'Always connected', detail: 'Cloud services, video, and remote work depend on the network.'},
  ]),
  orientation: z.enum(['horizontal', 'vertical']).default('horizontal'),
  startAt: nonnegative.default(10),
  stagger: nonnegative.default(22),
  revealFrames: positive.default(16),
  footer: z.string().default(''),
});

export const description = 'A horizontal or vertical timeline with dated events, connector lines, and sequential reveals.';
export const tags = ['timeline', 'history', 'dates', 'events', 'chronology'];

const clamp = (value: number) => Math.min(1, Math.max(0, value));

export const TimelineScene: React.FC<z.input<typeof timelineSceneSchema>> = (input) => {
  const p = timelineSceneSchema.parse(input);
  const frame = useCurrentFrame();
  const theme = useTheme();
  const n = p.events.length;
  const lineProgress = interpolate(frame, [p.startAt, p.startAt + p.revealFrames + n * p.stagger], [0, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
    easing: Easing.out(Easing.cubic),
  });

  if (p.orientation === 'vertical') {
    return (
      <StudyFrame title={p.title} eyebrow={p.eyebrow} footer={p.footer || undefined}>
        <div style={{position: 'relative', height: '100%', padding: '4px 0 4px 0'}}>
          <div style={{position: 'absolute', left: 18, top: 8, bottom: 8, width: 3, background: '#243e54', borderRadius: 3}} />
          <div style={{position: 'absolute', left: 18, top: 8, width: 3, height: `calc(${lineProgress * 100}% - ${lineProgress * 16}px)`, background: theme.accent, borderRadius: 3}} />
          <div style={{display: 'flex', flexDirection: 'column', justifyContent: 'space-between', height: '100%'}}>
            {p.events.map((event, i) => {
              const reveal = clamp((frame - p.startAt - i * p.stagger) / p.revealFrames);
              return (
                <div key={`${event.date}-${i}`} style={{position: 'relative', display: 'flex', alignItems: 'center', gap: 24, paddingLeft: 54, opacity: reveal, transform: `translateX(${(1 - reveal) * 18}px)`}}>
                  <div style={{position: 'absolute', left: 10, top: '50%', width: 18, height: 18, marginTop: -9, borderRadius: '50%', background: theme.accent, border: `4px solid ${theme.background}`, boxShadow: `0 0 0 2px ${theme.accent}`}} />
                  <div style={{width: 130, flex: '0 0 130px', fontSize: 22, fontWeight: 750, color: theme.accent}}>{event.date}</div>
                  <div style={{flex: 1, padding: '9px 18px', background: '#fffaf1', borderRadius: 10, border: '1px solid #2b485e'}}>
                    <div style={{fontSize: 24, fontWeight: 650}}>{event.title}</div>
                    {event.detail ? <div style={{fontSize: 17, lineHeight: 1.3, color: theme.muted, marginTop: 2}}>{event.detail}</div> : null}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </StudyFrame>
    );
  }

  const gap = 16;
  const cardWidth = Math.min(300, (1440 - gap * (n - 1)) / n);
  const totalWidth = cardWidth * n + gap * (n - 1);
  const startX = (1440 - totalWidth) / 2;
  const centerY = 286;
  const cardHeight = 198;

  return (
    <StudyFrame title={p.title} eyebrow={p.eyebrow} footer={p.footer || undefined}>
      <div style={{position: 'relative', height: '100%'}}>
        <div style={{position: 'absolute', left: startX, right: 1440 - startX - totalWidth, top: centerY, height: 3, background: '#243e54', borderRadius: 3}} />
        <div style={{position: 'absolute', left: startX, top: centerY, width: totalWidth * lineProgress, height: 3, background: theme.accent, borderRadius: 3}} />

        {p.events.map((event, i) => {
          const centerX = startX + cardWidth / 2 + i * (cardWidth + gap);
          const above = i % 2 === 0;
          const reveal = clamp((frame - p.startAt - i * p.stagger) / p.revealFrames);
          const cardTop = above ? centerY - 38 - cardHeight : centerY + 38;
          return (
            <div key={`${event.date}-${i}`} style={{position: 'absolute', left: 0, top: 0, width: '100%', height: '100%', pointerEvents: 'none'}}>
              <div style={{position: 'absolute', left: centerX, top: above ? cardTop + cardHeight : centerY, width: 2, height: 38, background: '#3c5d75', opacity: reveal}} />
              <div style={{position: 'absolute', left: centerX - 9, top: centerY - 9, width: 18, height: 18, borderRadius: '50%', background: theme.accent, border: `4px solid ${theme.background}`, boxShadow: `0 0 0 2px ${theme.accent}`, opacity: reveal, transform: `scale(${0.7 + reveal * 0.3})`}} />
              <div
                style={{
                  position: 'absolute',
                  left: centerX - cardWidth / 2,
                  top: cardTop,
                  width: cardWidth,
                  height: cardHeight,
                  boxSizing: 'border-box',
                  padding: '17px 18px',
                  background: '#fffaf1',
                  border: '1px solid #2e4a61',
                  borderRadius: 14,
                  opacity: reveal,
                  transform: `translateY(${(1 - reveal) * (above ? 18 : -18)}px)`,
                }}
              >
                <div style={{fontSize: 22, fontWeight: 750, color: theme.accent, marginBottom: 5}}>{event.date}</div>
                <div style={{fontSize: 24, fontWeight: 650, lineHeight: 1.15, marginBottom: 8}}>{event.title}</div>
                {event.detail ? <div style={{fontSize: 17, lineHeight: 1.32, color: theme.muted}}>{event.detail}</div> : null}
              </div>
            </div>
          );
        })}
      </div>
    </StudyFrame>
  );
};
