import {z} from 'zod';
import type {CSSProperties} from 'react';
import {AbsoluteFill, interpolate, useCurrentFrame, useVideoConfig} from 'remotion';
import {entrance, entranceSchema, type Entrance} from '../animation';
import {AnimatedText, textAnimationSchema, type TextAnimation} from '../motion';
import {useTheme, useUnit} from '../theme';

export type QuoteSceneProps = {
  text: string;
  author?: string;
  animation?: Entrance;
  textAnimation?: TextAnimation;
  slowZoom?: boolean; // gentle zoom across the whole scene
  textStyle?: CSSProperties;
  authorStyle?: CSSProperties;
};

export const QuoteScene: React.FC<QuoteSceneProps> = ({
  text,
  author,
  animation = 'fade',
  textAnimation = 'words',
  slowZoom = true,
  textStyle,
  authorStyle,
}) => {
  const frame = useCurrentFrame();
  const {fps, durationInFrames} = useVideoConfig();
  const theme = useTheme();
  const u = useUnit();
  const scale = slowZoom
    ? interpolate(frame, [0, durationInFrames], [0.96, 1.04], {
        extrapolateLeft: 'clamp',
        extrapolateRight: 'clamp',
      })
    : 1;

  return (
    <AbsoluteFill
      style={{justifyContent: 'center', alignItems: 'center', padding: 140 * u, gap: 32 * u}}
    >
      {/* Zoom on the wrapper so it combines with the entrance transform */}
      <div style={{transform: `scale(${scale})`}}>
        <AnimatedText
          text={`“${text}”`}
          mode={textAnimation}
          entrance={animation === 'fade' ? 'rise' : animation}
          stagger={4}
          style={{
            maxWidth: 1400 * u,
            textAlign: 'center',
            fontSize: 72 * u,
            lineHeight: 1.3,
            fontWeight: 600,
            color: theme.accent,
            ...textStyle,
          }}
        />
      </div>
      {author ? (
        <p
          style={{
            margin: 0,
            fontSize: 40 * u,
            color: theme.muted,
            ...entrance('fade', frame - 20, fps, u),
            ...authorStyle,
          }}
        >
          — {author}
        </p>
      ) : null}
    </AbsoluteFill>
  );
};

export const quoteSceneSchema = z.object({text:z.string().default('Start with a clear idea.'),author:z.string().optional(),animation:entranceSchema.optional(),textAnimation:textAnimationSchema.optional(),slowZoom:z.boolean().optional(),textStyle:z.record(z.string(),z.unknown()).optional(),authorStyle:z.record(z.string(),z.unknown()).optional()});
export const description = 'A quotation or key fact with optional attribution.';
export const tags = ['quote', 'fact'];
