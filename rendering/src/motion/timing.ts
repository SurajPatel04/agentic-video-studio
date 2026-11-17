import {Easing, interpolate} from 'remotion';

export const easeOut = Easing.bezier(0.16, 1, 0.3, 1);
export const easeInOut = Easing.bezier(0.65, 0, 0.35, 1);

/** 0 → 1 between `start` and `start + duration` (clamped, eased). */
export const progress = (frame: number, start: number, duration: number, easing = easeOut): number =>
  easing(interpolate(frame, [start, start + Math.max(1, duration)], [0, 1], {extrapolateLeft: 'clamp', extrapolateRight: 'clamp'}));
