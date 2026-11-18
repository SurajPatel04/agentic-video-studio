import {PAPER} from '../iso/iso';
import {Easing, Img, interpolate, staticFile, useCurrentFrame} from 'remotion';
import {z} from 'zod';
import {StudyFrame} from '../components/StudyFrame';
import {useTheme} from '../theme';

const nonnegative = z.number().int().nonnegative();
const positive = z.number().int().positive();

export const imageSceneSchema = z.object({
  title: z.string().default('A figure from your source'),
  eyebrow: z.string().default('FIGURE / LOOK CLOSELY'),
  src: z.string().default(''),
  alt: z.string().default(''),
  caption: z.string().default('Add a caption that tells the viewer what to notice.'),
  credit: z.string().default(''),
  fit: z.enum(['cover', 'contain']).default('cover'),
  motion: z.enum(['none', 'pan-left', 'pan-right', 'zoom-in', 'zoom-out']).default('zoom-in'),
  zoom: z.number().min(1).max(1.5).default(1.12),
  startAt: nonnegative.default(0),
  motionFrames: positive.default(150),
  footer: z.string().default(''),
});

export const description = 'A full-width figure or image with a caption, credit, and optional pan or Ken Burns motion.';
export const tags = ['image', 'figure', 'diagram', 'photo', 'pdf', 'source material'];

const clamp = (value: number) => Math.min(1, Math.max(0, value));

const resolveSrc = (src: string): string | null => {
  const trimmed = src.trim();
  if (!trimmed) return null;
  if (trimmed.startsWith('http://') || trimmed.startsWith('https://') || trimmed.startsWith('data:')) return trimmed;
  return staticFile(trimmed.replace(/^\/+/, ''));
};

export const ImageScene: React.FC<z.input<typeof imageSceneSchema>> = (input) => {
  const p = imageSceneSchema.parse(input);
  const frame = useCurrentFrame();
  const theme = useTheme();
  const src = resolveSrc(p.src);
  const progress = interpolate(frame, [p.startAt, p.startAt + p.motionFrames], [0, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
    easing: Easing.inOut(Easing.cubic),
  });

  const transform = (() => {
    switch (p.motion) {
      case 'pan-left':
        return `scale(${p.zoom}) translateX(${(progress - 0.5) * -8}%)`;
      case 'pan-right':
        return `scale(${p.zoom}) translateX(${(progress - 0.5) * 8}%)`;
      case 'zoom-in':
        return `scale(${1 + (p.zoom - 1) * progress})`;
      case 'zoom-out':
        return `scale(${p.zoom - (p.zoom - 1) * progress})`;
      case 'none':
      default:
        return 'scale(1)';
    }
  })();

  return (
    <StudyFrame title={p.title} eyebrow={p.eyebrow} footer={p.footer || undefined}>
      <div style={{height: '100%', display: 'flex', flexDirection: 'column'}}>
        <div style={{position: 'relative', flex: 1, minHeight: 0, borderRadius: 18, overflow: 'hidden', border: `1px solid ${PAPER.track}`, background: PAPER.card}}>
          {src ? (
            <Img
              src={src}
              alt={p.alt || p.title}
              style={{width: '100%', height: '100%', objectFit: p.fit, transform, transformOrigin: 'center', opacity: clamp((frame - p.startAt) / 10)}}
            />
          ) : (
            <div style={{position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 18, color: theme.muted}}>
              <svg width="80" height="80" viewBox="0 0 80 80" fill="none" aria-hidden="true">
                <rect x="7" y="13" width="66" height="54" rx="9" stroke="currentColor" strokeWidth="3" />
                <circle cx="29" cy="33" r="7" stroke="currentColor" strokeWidth="3" />
                <path d="M12 58 L31 42 L45 53 L57 40 L69 53" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
              <div style={{fontSize: 24}}>Image source not set</div>
              <div style={{fontSize: 18, opacity: 0.7}}>Pass a local <code>public/</code> path or an HTTPS URL.</div>
            </div>
          )}
          {p.credit ? (
            <div style={{position: 'absolute', right: 14, bottom: 12, padding: '5px 10px', borderRadius: 7, background: PAPER.card, color: PAPER.ink, fontSize: 15}}>
              {p.credit}
            </div>
          ) : null}
        </div>
        {p.caption ? (
          <div style={{flex: '0 0 auto', paddingTop: 16, fontSize: 23, lineHeight: 1.35, color: theme.muted}}>{p.caption}</div>
        ) : null}
      </div>
    </StudyFrame>
  );
};
