import {createContext, useContext} from 'react';
import {useVideoConfig} from 'remotion';
import {PAPER} from './iso/iso';
import type {Theme} from './types';

export const defaultTheme: Theme = {
  background: PAPER.bg,
  text: PAPER.ink,
  muted: PAPER.inkSoft,
  accent: '#71569f',
  fontFamily: PAPER.sans,
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

type SpokenWord = {t: string; s: number};
const SceneWordsContext = createContext<readonly SpokenWord[] | undefined>(undefined);
export const SceneWordsProvider = SceneWordsContext.Provider;
export const useSceneWords = () => useContext(SceneWordsContext);

const BottomCaptionInsetContext = createContext(0);
export const BottomCaptionInsetProvider = BottomCaptionInsetContext.Provider;
export const useBottomCaptionInset = () => useContext(BottomCaptionInsetContext);
