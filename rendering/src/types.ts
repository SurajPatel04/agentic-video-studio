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
  overlays?: unknown[]; // effects / annotations on top (see src/effects/overlays.tsx)
  narration?: {text: string; voice?: string; delay?: number}; // turned into `voice` by the backend (app/utils/tts.py, Deepgram)
  voice?: {src: string; startAt?: number; frames?: number; volume?: number; words?: {t: string; s: number; e: number}[]}; // narration audio (+ word timings for captions)
  sfx?: {sound: string; at: number; volume?: number}[]; // sound effects at frames (see src/audio)
};

export type CompositionSpec = {
  fps: number;
  width: number;
  height: number;
  theme?: Partial<Theme>;
  defaultTransition?: TransitionSpec;
  captions?: boolean | Record<string, unknown>; // subtitles from narration; false / {enabled: false} = off (see src/audio/Captions.tsx)
  audio?: Record<string, unknown>; // music, effects on/off, volumes, voice (see src/audio)
  brand?: boolean | Record<string, unknown>; // logo intro + corner logo (see src/brand.tsx); false = off
  scenes: SceneSpec[];
};
