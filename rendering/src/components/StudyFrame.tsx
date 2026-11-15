import type {PropsWithChildren} from 'react';
import {AbsoluteFill, useVideoConfig} from 'remotion';
import {useTheme} from '../theme';

/** A fixed design canvas scales to fit any output ratio without clipping its content. */
export const StudyFrame: React.FC<PropsWithChildren<{title: string; eyebrow?: string; footer?: string}>> = ({title, eyebrow = 'NETWORK FUNDAMENTALS', footer, children}) => {
  const {width, height} = useVideoConfig();
  const scale = Math.min(width / 1600, height / 900);
  const theme = useTheme();
  return <AbsoluteFill style={{background: theme.background, fontFamily: theme.fontFamily, color: theme.text}}>
    <div style={{position: 'absolute', width: 1600, height: 900, left: (width - 1600 * scale) / 2, top: (height - 900 * scale) / 2, transform: `scale(${scale})`, transformOrigin: 'top left'}}>
      <div style={{position: 'absolute', top: 55, left: 80, fontSize: 15, letterSpacing: 4, color: theme.accent}}>{eyebrow}</div>
      <h1 style={{position: 'absolute', top: 92, left: 80, right: 80, margin: 0, fontSize: 52, fontWeight: 650, letterSpacing: -1}}>{title}</h1>
      <div style={{position: 'absolute', top: 195, left: 80, width: 1440, height: 575}}>{children}</div>
      {footer && <div style={{position: 'absolute', top: 815, left: 80, right: 80, borderTop: '1px solid #324658', paddingTop: 18, fontSize: 23, color: theme.muted}}>{footer}</div>}
    </div>
  </AbsoluteFill>;
};
