import type {PropsWithChildren} from 'react';
import {AbsoluteFill, Easing, useCurrentFrame, useVideoConfig} from 'remotion';
import {PAPER} from '../iso/iso';
import {useSceneLength, useTheme, useUnit} from '../theme';

export const lectureColors = [
  {fill: '#e5ddf1', ink: '#5e417e'},
  {fill: '#d9eae1', ink: '#275d49'},
  {fill: '#f6e5cb', ink: '#824d23'},
  {fill: '#dfebf4', ink: '#305d7e'},
  {fill: '#f4dfdf', ink: '#8b4349'},
] as const;

export function useLectureTiming() {
  const frame = useCurrentFrame();
  const length = useSceneLength();
  const {fps} = useVideoConfig();
  const cueFrame = (at: number) => Math.min(length - 1, Math.round(at * length));
  const progress = (at: number, seconds = 0.26) => {
    const start = cueFrame(at);
    if (start === 0) return 1;
    const duration = Math.min(length - start, Math.max(1, Math.round(fps * seconds)));
    return Easing.out(Easing.cubic)(Math.max(0, Math.min(1, (frame - start + 1) / duration)));
  };
  return {frame, cueFrame, progress};
}

export function LectureBoard({title, subtitle, children}: PropsWithChildren<{title: string; subtitle?: string}>) {
  const {width, height} = useVideoConfig();
  const u = useUnit();
  const theme = useTheme();
  const portrait = width < height;
  return <AbsoluteFill style={{
    boxSizing: 'border-box', display: 'grid', gridTemplateRows: 'auto minmax(0, 1fr)',
    gap: (portrait ? 35 : 25) * u, padding: `${65 * u}px ${(portrait ? 55 : 86) * u}px ${(portrait ? 184 : 158) * u}px`,
    color: theme.text, fontFamily: theme.fontFamily,
  }}>
    <header style={{paddingRight: 72 * u}}>
      <h1 style={{margin: 0, fontSize: (portrait ? 53 : 60) * u, lineHeight: 1.08, letterSpacing: -1.3 * u}}>{title}</h1>
      {subtitle ? <p style={{margin: `${13 * u}px 0 0`, fontSize: 28 * u, color: PAPER.inkSoft, lineHeight: 1.25}}>{subtitle}</p> : null}
    </header>
    <div style={{minHeight: 0, minWidth: 0, display: 'flex', alignItems: 'stretch', justifyContent: 'center'}}>{children}</div>
  </AbsoluteFill>;
}
