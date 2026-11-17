import {z} from 'zod';
import type {CSSProperties} from 'react';
import {AbsoluteFill} from 'remotion';
import {entranceSchema, type Entrance} from '../animation';
import {AnimatedText, textAnimationSchema, type TextAnimation} from '../motion';
import {useTheme, useUnit} from '../theme';

export type TitleSceneProps = {
  title: string; // supports **bold**, ==highlight==, __underline__, ((circle))
  subtitle?: string;
  align?: 'center' | 'left';
  animation?: Entrance; // how each word enters
  textAnimation?: TextAnimation; // words | letters | lines | typewriter | fade | none
  subtitleDelay?: number; // frames after the title
  titleStyle?: CSSProperties;
  subtitleStyle?: CSSProperties;
};

export const TitleScene: React.FC<TitleSceneProps> = ({
  title,
  subtitle,
  align = 'center',
  animation = 'rise',
  textAnimation = 'words',
  subtitleDelay = 15,
  titleStyle,
  subtitleStyle,
}) => {
  const theme = useTheme();
  const u = useUnit();
  const titleWords = title.split(/\s+/).length;

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
      <AnimatedText
        as="h1"
        text={title}
        mode={textAnimation}
        entrance={animation}
        stagger={5}
        style={{fontSize: 120 * u, fontWeight: 800, lineHeight: 1.1, color: theme.text, ...titleStyle}}
      />
      {subtitle ? (
        <AnimatedText
          text={subtitle}
          mode={textAnimation}
          entrance={animation}
          startAt={subtitleDelay + titleWords * 3}
          stagger={3}
          style={{fontSize: 52 * u, color: theme.accent, ...subtitleStyle}}
        />
      ) : null}
    </AbsoluteFill>
  );
};

export const titleSceneSchema = z.object({title: z.string().default('Study video'), subtitle: z.string().optional(), align: z.enum(['center','left']).optional(), animation: entranceSchema.optional(), textAnimation: textAnimationSchema.optional(), subtitleDelay: z.number().int().nonnegative().optional(), titleStyle: z.record(z.string(), z.unknown()).optional(), subtitleStyle: z.record(z.string(), z.unknown()).optional()});
export const description = 'An animated title and optional subtitle.';
export const tags = ['title', 'introduction'];
