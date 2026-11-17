import type {PropsWithChildren, ReactNode} from 'react';
import {AbsoluteFill, useVideoConfig} from 'remotion';
import {useTheme} from '../theme';
import {AnimatedText, stripMarkup, type TextAnimation} from '../motion';

type StudyFrameProps = {
  title: string; // supports **bold**, ==highlight==, __underline__, ((circle))
  eyebrow?: string;
  footer?: ReactNode; // a string gets markup + fades in; pass a node for custom timing
  footerAt?: number; // frame a string footer appears
  textAnimation?: TextAnimation; // title style
};

/** A fixed design canvas scales to fit any output ratio without clipping its content. */
export const StudyFrame: React.FC<PropsWithChildren<StudyFrameProps>> = ({
  title, eyebrow = 'THE BIG PICTURE', footer, footerAt = 20, textAnimation = 'words', children,
}) => {
  const {width, height} = useVideoConfig();
  const scale = Math.min(width / 1600, height / 900);
  const theme = useTheme();
  return <AbsoluteFill style={{background: theme.background, fontFamily: theme.fontFamily, color: theme.text}}>
    <div style={{position: 'absolute', width: 1600, height: 900, left: (width - 1600 * scale) / 2, top: (height - 900 * scale) / 2, transform: `scale(${scale})`, transformOrigin: 'top left'}}>
      <div style={{position: 'absolute', top: 55, left: 80, fontSize: 15, letterSpacing: 4, color: theme.accent}}>{eyebrow}</div>
      <AnimatedText as="h1" text={title} mode={textAnimation} stagger={3} style={{position: 'absolute', top: 92, left: 80, right: 80, fontSize: stripMarkup(title).length > 70 ? 38 : stripMarkup(title).length > 52 ? 44 : 52, lineHeight: 1.12, fontWeight: 650, letterSpacing: -1}}/>
      <div style={{position: 'absolute', top: 195, left: 80, width: 1440, height: 575}}>{children}</div>
      {footer ? (
        <div style={{position: 'absolute', top: 815, left: 80, right: 80, borderTop: '1px solid #324658', paddingTop: 12, fontSize: typeof footer === 'string' && stripMarkup(footer).length > 115 ? 18 : 21, color: theme.muted}}>
          {typeof footer === 'string' ? <AnimatedText text={footer} mode="fade" startAt={footerAt} /> : footer}
        </div>
      ) : null}
    </div>
  </AbsoluteFill>;
};
