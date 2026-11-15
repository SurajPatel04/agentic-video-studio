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
