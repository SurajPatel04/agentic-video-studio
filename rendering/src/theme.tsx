import {createContext, useContext} from 'react';
import {useVideoConfig} from 'remotion';
import type {Theme} from './types';

export const defaultTheme: Theme = {
  background: '#0f172a',
  text: '#f8fafc',
  muted: '#94a3b8',
  accent: '#38bdf8',
  fontFamily: "'Inter', 'Segoe UI', 'Helvetica Neue', Arial, sans-serif",
};

const ThemeContext = createContext<Theme>(defaultTheme);
export const ThemeProvider = ThemeContext.Provider;
export const useTheme = () => useContext(ThemeContext);

/**
 * Size unit that scales with the video, so the same scene works at 16:9, 9:16 or 1:1.
 * 1u = 1px on the short side of a 1080p frame. Usage: fontSize: 96 * u
 */
export const useUnit = () => {
  const {width, height} = useVideoConfig();
  return Math.min(width, height) / 1080;
};

/** Length of the current scene in frames (set by VideoComposition), so a scene can time things as a
 *  fraction of itself: the narration stretches scenes, so "halfway" is safer than "frame 90". */
const SceneLengthContext = createContext<number>(150);
export const SceneLengthProvider = SceneLengthContext.Provider;
export const useSceneLength = () => useContext(SceneLengthContext);
