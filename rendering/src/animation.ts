import {interpolate, spring} from 'remotion';

/** Named entrance animations that any scene can expose as an `animation` prop. */
export type Entrance = 'fade-up' | 'fade' | 'zoom' | 'slide-left' | 'none';

/** Returns opacity + transform for an element entering at `frame` (relative to its start). */
export const entrance = (
  type: Entrance,
  frame: number,
  fps: number,
  u: number,
): {opacity: number; transform: string} => {
  if (type === 'none') return {opacity: 1, transform: 'none'};
  const p = spring({frame, fps, config: {damping: 200}});
  const opacity = interpolate(p, [0, 1], [0, 1]);
  switch (type) {
    case 'fade':
      return {opacity, transform: 'none'};
    case 'zoom':
      return {opacity, transform: `scale(${interpolate(p, [0, 1], [0.8, 1])})`};
    case 'slide-left':
      return {opacity, transform: `translateX(${(1 - p) * 80 * u}px)`};
    case 'fade-up':
    default:
      return {opacity, transform: `translateY(${(1 - p) * 50 * u}px)`};
  }
};
