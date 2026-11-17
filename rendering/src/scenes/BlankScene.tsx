import {AbsoluteFill, useCurrentFrame, useVideoConfig} from 'remotion';
import {z} from 'zod';
import {entrance} from '../animation';
import {AnimatedText} from '../motion/AnimatedText';
import {useTheme, useUnit} from '../theme';

export const blankSceneSchema = z.object({
  title: z.string().optional(), // markup ok
  caption: z.string().optional(),
  titleAt: z.enum(['top', 'center']).default('top'),
});

export const description =
  'Empty canvas with an optional title and caption: a base for overlays (terminal, chat, notification, toggle, lock/encrypt, field lines, sound wave, progress bar, callouts, …).';
export const tags = ['blank', 'canvas', 'overlays', 'ui', 'custom'];

export const BlankScene: React.FC<z.input<typeof blankSceneSchema>> = (input) => {
  const p = blankSceneSchema.parse(input);
  const f = useCurrentFrame();
  const {fps} = useVideoConfig();
  const theme = useTheme();
  const u = useUnit();
  return (
    <AbsoluteFill style={{alignItems: 'center', justifyContent: p.titleAt === 'center' ? 'center' : 'flex-start', paddingTop: p.titleAt === 'top' ? 70 * u : 0}}>
      {p.title ? (
        <AnimatedText text={p.title} as="h2" style={{fontSize: 70 * u, fontWeight: 800, color: theme.text, textAlign: 'center'}} />
      ) : null}
      {p.caption ? (
        <p style={{position: 'absolute', bottom: 60 * u, width: '100%', margin: 0, fontSize: 36 * u, color: theme.muted, textAlign: 'center',
          ...entrance('fade-up', f - 30, fps, u)}}>{p.caption}</p>
      ) : null}
    </AbsoluteFill>
  );
};
