import {z} from 'zod';
import type {CSSProperties} from 'react';
import {AbsoluteFill, useCurrentFrame, useVideoConfig} from 'remotion';
import {entrance, type Entrance} from '../animation';
import {useTheme, useUnit} from '../theme';

export type TitleSceneProps = {
  title: string;
  subtitle?: string;
  align?: 'center' | 'left';
  animation?: Entrance;
  subtitleDelay?: number; // frames after the title
  titleStyle?: CSSProperties;
  subtitleStyle?: CSSProperties;
};

export const TitleScene: React.FC<TitleSceneProps> = ({
  title,
  subtitle,
  align = 'center',
  animation = 'fade-up',
  subtitleDelay = 15,
  titleStyle,
  subtitleStyle,
}) => {
  const frame = useCurrentFrame();
  const {fps} = useVideoConfig();
  const theme = useTheme();
  const u = useUnit();

  return (
    <AbsoluteFill
      style={{
        justifyContent: 'center',
        alignItems: align === 'center' ? 'center' : 'flex-start',
        textAlign: align,
        padding: 120 * u,
        gap: 24 * u,
      }}
    >
      <h1
        style={{
          margin: 0,
          fontSize: 120 * u,
          fontWeight: 800,
          lineHeight: 1.1,
          color: theme.text,
          ...entrance(animation, frame, fps, u),
          ...titleStyle,
        }}
      >
        {title}
      </h1>
      {subtitle ? (
        <p
          style={{
            margin: 0,
            fontSize: 52 * u,
            color: theme.accent,
            ...entrance(animation, frame - subtitleDelay, fps, u),
            ...subtitleStyle,
          }}
        >
          {subtitle}
        </p>
      ) : null}
    </AbsoluteFill>
  );
};

export const titleSceneSchema = z.object({title: z.string().default('Study video'), subtitle: z.string().optional(), align: z.enum(['center','left']).optional(), animation: z.enum(['fade-up','fade','zoom','slide-left','none']).optional(), subtitleDelay: z.number().int().nonnegative().optional(), titleStyle: z.record(z.string(), z.unknown()).optional(), subtitleStyle: z.record(z.string(), z.unknown()).optional()});
export const description = 'An animated title and optional subtitle.';
export const tags = ['title', 'introduction'];
