import type {CSSProperties, FC, ReactNode} from 'react';
import {Children} from 'react';
import {interpolate, useCurrentFrame, useVideoConfig} from 'remotion';
import {entrance, type Entrance} from '../animation';
import {useTheme, useUnit} from '../theme';
import {easeInOut, progress} from './timing';

/** Children appear one after another. */
export const Stagger: FC<{
  children: ReactNode;
  startAt?: number;
  gap?: number; // frames between children
  type?: Entrance;
  style?: CSSProperties; // container (e.g. flex direction, gap)
  itemStyle?: CSSProperties;
}> = ({children, startAt = 0, gap = 8, type = 'fade-up', style, itemStyle}) => {
  const frame = useCurrentFrame();
  const {fps} = useVideoConfig();
  const u = useUnit();
  return (
    <div style={style}>
      {Children.toArray(children).map((child, i) => (
        <div key={i} style={{...entrance(type, frame - startAt - i * gap, fps, u), ...itemStyle}}>
          {child}
        </div>
      ))}
    </div>
  );
};

/** Number that counts up: 0 → 100 Mbps. */
export const CountUp: FC<{
  to: number;
  from?: number;
  startAt?: number;
  duration?: number;
  decimals?: number;
  prefix?: string;
  suffix?: string;
  separator?: boolean; // 1,000,000
  style?: CSSProperties;
}> = ({to, from = 0, startAt = 0, duration = 45, decimals = 0, prefix = '', suffix = '', separator = true, style}) => {
  const p = progress(useCurrentFrame(), startAt, duration);
  const value = from + (to - from) * p;
  const text = value.toLocaleString('en-US', {minimumFractionDigits: decimals, maximumFractionDigits: decimals, useGrouping: separator});
  return <span style={{fontVariantNumeric: 'tabular-nums', ...style}}>{prefix}{text}{suffix}</span>;
};

/** Quick scale bump + glow at the given frames: "this one matters". */
export const Pulse: FC<{children: ReactNode; at: number[]; scale?: number; color?: string; style?: CSSProperties}> = ({
  children, at, scale = 1.12, color, style,
}) => {
  const frame = useCurrentFrame();
  const theme = useTheme();
  const u = useUnit();
  const k = Math.max(0, ...at.map((a) => (frame >= a && frame < a + 16 ? Math.sin(((frame - a) / 16) * Math.PI) : 0)));
  return (
    <div style={{display: 'inline-block', transform: `scale(${1 + (scale - 1) * k})`,
      filter: k > 0 ? `drop-shadow(0 0 ${18 * u * k}px ${color ?? theme.accent})` : undefined, ...style}}>
      {children}
    </div>
  );
};

/** Fades / slides children out starting at frame `at` (use before a scene ends). */
export const Exit: FC<{children: ReactNode; at: number; duration?: number; type?: 'fade' | 'down' | 'up' | 'shrink'; style?: CSSProperties}> = ({
  children, at, duration = 12, type = 'fade', style,
}) => {
  const frame = useCurrentFrame();
  const u = useUnit();
  const p = progress(frame, at, duration, easeInOut);
  const transform =
    type === 'down' ? `translateY(${p * 40 * u}px)` : type === 'up' ? `translateY(${-p * 40 * u}px)` : type === 'shrink' ? `scale(${1 - 0.15 * p})` : 'none';
  return <div style={{opacity: 1 - p, transform, ...style}}>{children}</div>;
};

/**
 * Arrow that draws itself from one point to another (x / y in % of the frame), with an
 * optional label. Place inside an AbsoluteFill.
 */
export const DrawArrow: FC<{
  from: {x: number; y: number};
  to: {x: number; y: number};
  startAt?: number;
  duration?: number;
  bend?: number; // curve amount, -1..1
  color?: string;
  width?: number; // 1080p px
  label?: string;
  dashed?: boolean;
}> = ({from, to, startAt = 0, duration = 22, bend = 0.25, color, width = 6, label, dashed = false}) => {
  const frame = useCurrentFrame();
  const {width: W, height: H} = useVideoConfig();
  const theme = useTheme();
  const u = useUnit();
  const p = progress(frame, startAt, duration);
  if (p <= 0) return null;
  const x1 = (from.x / 100) * W;
  const y1 = (from.y / 100) * H;
  const x2 = (to.x / 100) * W;
  const y2 = (to.y / 100) * H;
  const mx = (x1 + x2) / 2 - (y2 - y1) * bend;
  const my = (y1 + y2) / 2 + (x2 - x1) * bend;
  const stroke = color ?? theme.accent;
  // Tangent at the end of the quadratic curve gives the arrowhead angle.
  const angle = Math.atan2(y2 - my, x2 - mx);
  const head = 22 * u;
  const headP = interpolate(p, [0.8, 1], [0, 1], {extrapolateLeft: 'clamp', extrapolateRight: 'clamp'});
  // Point along the curve for the label.
  const t = 0.5;
  const lx = (1 - t) ** 2 * x1 + 2 * (1 - t) * t * mx + t ** 2 * x2;
  const ly = (1 - t) ** 2 * y1 + 2 * (1 - t) * t * my + t ** 2 * y2;
  return (
    <div style={{position: 'absolute', inset: 0, pointerEvents: 'none'}}>
      <svg width={W} height={H} style={{position: 'absolute', inset: 0, overflow: 'visible'}}>
        <path d={`M ${x1} ${y1} Q ${mx} ${my} ${x2} ${y2}`} fill="none" stroke={stroke} strokeWidth={width * u} strokeLinecap="round"
          pathLength={1} strokeDasharray={dashed ? '0.02 0.015' : 1} strokeDashoffset={dashed ? 0 : 1 - p}
          style={dashed ? {clipPath: `inset(0 ${100 - p * 100}% 0 0)`} : undefined} />
        <g transform={`translate(${x2} ${y2}) rotate(${(angle * 180) / Math.PI}) scale(${headP})`}>
          <path d={`M 0 0 L ${-head} ${-head * 0.55} L ${-head * 0.75} 0 L ${-head} ${head * 0.55} Z`} fill={stroke} />
        </g>
      </svg>
      {label ? (
        <div style={{position: 'absolute', left: lx, top: ly, transform: 'translate(-50%, -130%)', padding: `${6 * u}px ${14 * u}px`,
          borderRadius: 10 * u, background: 'rgba(2,6,23,0.75)', color: '#fff', fontSize: 28 * u, fontWeight: 600, whiteSpace: 'nowrap',
          opacity: interpolate(p, [0.5, 1], [0, 1], {extrapolateLeft: 'clamp'})}}>
          {label}
        </div>
      ) : null}
    </div>
  );
};
