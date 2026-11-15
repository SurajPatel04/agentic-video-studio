import {z} from 'zod';
import type {CSSProperties} from 'react';
import {AbsoluteFill, useCurrentFrame, useVideoConfig} from 'remotion';
import {entrance, type Entrance} from '../animation';
import {useTheme, useUnit} from '../theme';

export type BulletListSceneProps = {
  title?: string;
  items: string[];
  startAt?: number; // frame the first item appears
  stagger?: number; // frames between items
  itemFrames?: number[]; // exact frame per item; overrides startAt/stagger
  bullet?: string;
  animation?: Entrance;
  titleStyle?: CSSProperties;
  itemStyle?: CSSProperties;
};

export const BulletListScene: React.FC<BulletListSceneProps> = ({
  title,
  items,
  startAt = 15,
  stagger = 20,
  itemFrames,
  bullet = '•',
  animation = 'slide-left',
  titleStyle,
  itemStyle,
}) => {
  const frame = useCurrentFrame();
  const {fps} = useVideoConfig();
  const theme = useTheme();
  const u = useUnit();

  return (
    <AbsoluteFill style={{padding: 120 * u, justifyContent: 'center', gap: 28 * u}}>
      {title ? (
        <h2
          style={{
            margin: 0,
            marginBottom: 24 * u,
            fontSize: 84 * u,
            fontWeight: 700,
            color: theme.text,
            ...entrance('fade-up', frame, fps, u),
            ...titleStyle,
          }}
        >
          {title}
        </h2>
      ) : null}
      {items.map((item, i) => {
        const at = itemFrames?.[i] ?? startAt + i * stagger;
        return (
          <div
            key={i}
            style={{
              display: 'flex',
              gap: 24 * u,
              fontSize: 60 * u,
              color: theme.text,
              ...entrance(animation, frame - at, fps, u),
              ...itemStyle,
            }}
          >
            <span style={{color: theme.accent}}>{bullet}</span>
            <span>{item}</span>
          </div>
        );
      })}
    </AbsoluteFill>
  );
};

export const bulletListSceneSchema = z.object({title:z.string().optional(),items:z.array(z.string()).default(['First point','Second point']),startAt:z.number().int().nonnegative().optional(),stagger:z.number().int().nonnegative().optional(),itemFrames:z.array(z.number().int().nonnegative()).optional(),bullet:z.string().optional(),animation:z.enum(['fade-up','fade','zoom','slide-left','none']).optional(),titleStyle:z.record(z.string(),z.unknown()).optional(),itemStyle:z.record(z.string(),z.unknown()).optional()});
export const description = 'A bullet list with frame-timed item reveals.';
export const tags = ['text', 'list', 'bullets'];
