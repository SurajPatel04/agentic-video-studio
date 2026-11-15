import type {TransitionPresentation} from '@remotion/transitions';
import {fade} from '@remotion/transitions/fade';
import {flip} from '@remotion/transitions/flip';
import {slide} from '@remotion/transitions/slide';
import {wipe} from '@remotion/transitions/wipe';
import type {CompositionSpec, SceneSpec, TransitionSpec} from './types';

const NONE: TransitionSpec = {type: 'none'};

/** Transition into scene `index` (none before the first scene). */
export const transitionInto = (spec: CompositionSpec, index: number): TransitionSpec => {
  if (index === 0) return NONE;
  return spec.scenes[index].transition ?? spec.defaultTransition ?? NONE;
};

/**
 * Frames the transition into scene `index` overlaps. Clamped so it is never longer
 * than either neighbouring scene (Remotion throws otherwise).
 */
export const transitionFrames = (spec: CompositionSpec, index: number): number => {
  const t = transitionInto(spec, index);
  if (t.type === 'none') return 0;
  const prev: SceneSpec = spec.scenes[index - 1];
  const cur: SceneSpec = spec.scenes[index];
  const wanted = t.durationInFrames ?? 15;
  return Math.max(0, Math.min(wanted, prev.durationInFrames - 1, cur.durationInFrames - 1));
};

/** Total video length: scene lengths minus the frames transitions overlap. */
export const totalFrames = (spec: CompositionSpec): number =>
  spec.scenes.reduce((sum, s, i) => sum + s.durationInFrames - transitionFrames(spec, i), 0);

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const presentationFor = (t: TransitionSpec): TransitionPresentation<any> => {
  const direction = t.direction ?? 'from-right';
  switch (t.type) {
    case 'slide':
      return slide({direction});
    case 'wipe':
      return wipe({direction});
    case 'flip':
      return flip({direction});
    case 'fade':
    default:
      return fade();
  }
};
