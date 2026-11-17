import type {CSSProperties, FC, ReactNode} from 'react';
import {useCurrentFrame} from 'remotion';
import {useTheme} from '../theme';
import {progress} from './timing';

type MarkProps = {
  children: ReactNode;
  at?: number; // frame the mark starts drawing (scene-relative)
  duration?: number; // frames to draw
  color?: string;
  style?: CSSProperties;
};

/** Highlighter marker that sweeps left → right behind the text. */
export const Highlight: FC<MarkProps> = ({children, at = 0, duration = 14, color, style}) => {
  const p = progress(useCurrentFrame(), at, duration);
  const theme = useTheme();
  return (
    <span style={{position: 'relative', display: 'inline-block', isolation: 'isolate', ...style}}>
      <span
        style={{
          position: 'absolute', left: '-0.08em', right: '-0.08em', bottom: '0.08em', height: '0.62em', zIndex: -1,
          background: color ?? `color-mix(in srgb, ${theme.accent} 55%, transparent)`,
          borderRadius: '0.18em', transform: `scaleX(${p}) skewX(-6deg)`, transformOrigin: 'left center',
        }}
      />
      {children}
    </span>
  );
};

/** Underline that wipes in left → right with a slight hand-drawn tilt. */
export const Underline: FC<MarkProps & {thickness?: number}> = ({children, at = 0, duration = 14, color, thickness = 0.09, style}) => {
  const p = progress(useCurrentFrame(), at, duration);
  const theme = useTheme();
  return (
    <span style={{position: 'relative', display: 'inline-block', ...style}}>
      {children}
      <span
        style={{
          position: 'absolute', left: '-0.04em', right: '-0.04em', bottom: '-0.1em', height: `${thickness}em`,
          borderRadius: `${thickness}em`, background: color ?? theme.accent,
          transform: `rotate(-0.8deg) scaleX(${p})`, transformOrigin: 'left center',
        }}
      />
    </span>
  );
};

/** Circle that sweeps around the text, with a second offset loop for a hand-drawn look. */
export const CircleMark: FC<MarkProps> = ({children, at = 0, duration = 20, color, style}) => {
  const p = progress(useCurrentFrame(), at, duration);
  const stroke = color ?? '#f43f5e';
  const loop = (k: number, inset: string, rotate: number, opacity: number) => {
    const sweep = Math.max(0, Math.min(1, p * 1.25 - k * 0.25)) * 360;
    const mask = `conic-gradient(from -60deg, #000 ${sweep}deg, transparent ${sweep}deg)`;
    return (
      <span
        style={{
          position: 'absolute', inset, borderRadius: '50%', border: `0.07em solid ${stroke}`, opacity,
          transform: `rotate(${rotate}deg)`, WebkitMaskImage: mask, maskImage: mask,
        }}
      />
    );
  };
  return (
    <span style={{position: 'relative', display: 'inline-block', ...style}}>
      {children}
      {loop(0, '-0.3em -0.38em', -3, 1)}
      {loop(1, '-0.24em -0.3em', 2, 0.55)}
    </span>
  );
};
