import {interpolate, spring} from 'remotion';
import {z} from 'zod';

/** Named entrance animations that any scene can expose as an `animation` prop. */
export const entranceTypes = [
  'fade-up', 'fade', 'zoom', 'slide-left', 'slide-right', 'slide-down', 'pop', 'blur', 'rise', 'none',
] as const;
export type Entrance = (typeof entranceTypes)[number];
export const entranceSchema = z.enum(entranceTypes);

/** Returns opacity + transform (+ filter) for an element entering at `frame` (relative to its start). */
export const entrance = (
  type: Entrance,
  frame: number,
  fps: number,
  u: number,
): {opacity: number; transform: string; filter?: string} => {
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
    case 'slide-right':
      return {opacity, transform: `translateX(${(p - 1) * 80 * u}px)`};
    case 'slide-down':
      return {opacity, transform: `translateY(${(p - 1) * 50 * u}px)`};
    case 'pop': {
      // Springy overshoot: good for icons, badges, key numbers.
      const s = spring({frame, fps, config: {damping: 10, stiffness: 160}});
      return {opacity: Math.min(1, opacity * 1.6), transform: `scale(${interpolate(s, [0, 1], [0.4, 1])})`};
    }
    case 'blur':
      return {opacity, transform: `scale(${interpolate(p, [0, 1], [1.06, 1])})`, filter: `blur(${(1 - p) * 14 * u}px)`};
    case 'rise':
      // Text-friendly: small lift + slight blur, like modern explainer videos.
      return {opacity, transform: `translateY(${(1 - p) * 26 * u}px)`, filter: `blur(${(1 - p) * 6 * u}px)`};
    case 'fade-up':
    default:
      return {opacity, transform: `translateY(${(1 - p) * 50 * u}px)`};
  }
};
