export type Theme = {
  background: string; // any CSS background: color, gradient, ...
  text: string;
  muted: string;
  accent: string;
  fontFamily: string;
};

export type TransitionType = 'none' | 'fade' | 'slide' | 'wipe' | 'flip';
export type Direction = 'from-left' | 'from-right' | 'from-top' | 'from-bottom';

export type TransitionSpec = {
  type: TransitionType;
  durationInFrames?: number;
  direction?: Direction; // slide / wipe / flip
};

export type SceneSpec = {
  id: string;
  component: string; // key in src/registry.ts
  durationInFrames: number;
  props?: Record<string, unknown>; // passed straight to the component
  theme?: Partial<Theme>; // per-scene theme override
  background?: string; // shortcut for theme.background
  transition?: TransitionSpec; // transition INTO this scene
};

export type CompositionSpec = {
  fps: number;
  width: number;
  height: number;
  theme?: Partial<Theme>;
  defaultTransition?: TransitionSpec;
  scenes: SceneSpec[];
};
