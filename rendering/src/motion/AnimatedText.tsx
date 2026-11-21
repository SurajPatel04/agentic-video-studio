import type {CSSProperties, FC, ReactNode} from 'react';
import {useCurrentFrame, useVideoConfig} from 'remotion';
import {z} from 'zod';
import {entrance, type Entrance} from '../animation';
import {Sfx} from '../audio';
import {useSceneWords, useTheme, useUnit} from '../theme';
import {CircleMark, Highlight, Underline} from './marks';
import {parseMarkup, type Segment} from './markup';

export const textAnimationTypes = ['words', 'letters', 'lines', 'typewriter', 'fade', 'none'] as const;
export type TextAnimation = (typeof textAnimationTypes)[number];
export const textAnimationSchema = z.enum(textAnimationTypes);

export type AnimatedTextProps = {
  text: string; // supports **bold**, ==highlight==, __underline__, ((circle)); "\n" = new line
  mode?: TextAnimation;
  startAt?: number; // frame the text starts (scene-relative)
  stagger?: number; // frames between words / lines (letters use stagger / 3)
  charsPerSecond?: number; // typewriter speed
  entrance?: Entrance; // how each word / letter / line enters
  markDelay?: number; // frames after a marked word appears before its mark draws
  syncHighlights?: boolean;
  as?: 'h1' | 'h2' | 'h3' | 'p' | 'span' | 'div';
  style?: CSSProperties;
  boldStyle?: CSSProperties;
  markColor?: string;
  cursor?: boolean; // typewriter cursor
  typingSound?: boolean; // typewriter: key sounds while typing (default on)
};

type Token = {text: string; mark: Segment['mark']; line: number; space: boolean};

// STT can write "special-case" as one token while the slide says "special cases".
const speechTokens = (text: string) => (text.toLowerCase().match(/[\p{L}\p{N}]+/gu) ?? [])
  .map(word => word.length > 4 && /[^s]s$/.test(word) ? word.slice(0, -1) : word);

/** Split into words (keeping marked phrases together) on lines. */
const tokenize = (text: string): Token[] => {
  const tokens: Token[] = [];
  text.split('\n').forEach((lineText, line) => {
    for (const seg of parseMarkup(lineText)) {
      if (seg.mark !== 'none') {
        tokens.push({text: seg.text, mark: seg.mark, line, space: false});
        continue;
      }
      for (const piece of seg.text.split(/(\s+)/)) {
        if (!piece) continue;
        tokens.push({text: piece, mark: 'none', line, space: /^\s+$/.test(piece)});
      }
    }
  });
  return tokens;
};

/**
 * Education-style text: words rise in one by one (or letters, lines, typewriter), and marked
 * words get a highlighter, underline, circle or accent colour once they appear.
 */
export const AnimatedText: FC<AnimatedTextProps> = ({
  text,
  mode = 'words',
  startAt = 0,
  stagger = 4,
  charsPerSecond = 28,
  entrance: enter = 'rise',
  markDelay = 6,
  syncHighlights = false,
  as: Tag = 'p',
  style,
  boldStyle,
  markColor,
  cursor = true,
  typingSound = true,
}) => {
  const frame = useCurrentFrame();
  const {fps} = useVideoConfig();
  const theme = useTheme();
  const u = useUnit();
  const spoken = useSceneWords();
  const speech = syncHighlights && spoken?.length
    ? spoken.flatMap(({t, s}) => speechTokens(t).map(word => ({word, s})))
    : undefined;
  const tokens = tokenize(text);
  const local = frame - startAt;

  // Typewriter: reveal characters over time.
  const typed = mode === 'typewriter' ? Math.max(0, Math.floor((local / fps) * charsPerSecond)) : Infinity;
  let charCount = 0;

  // Word index (spaces don't count) for staggering.
  let wordIndex = -1;
  const lineCount = text.split('\n').length;

  const decorate = (tok: Token, appearAt: number, content: ReactNode): ReactNode => {
    const at = appearAt + markDelay;
    switch (tok.mark) {
      case 'bold':
        return <span style={{color: markColor ?? theme.accent, fontWeight: 800, ...boldStyle}}>{content}</span>;
      case 'highlight': {
        if (speech) {
          const phrase = speechTokens(tok.text);
          const start = phrase.length ? speech.findIndex((_, i) =>
            phrase.every((word, j) => speech[i + j]?.word === word)) : -1;
          if (start < 0) return content;
          return <Highlight at={Math.max(appearAt, speech[start].s)} duration={9} color={markColor}>{content}</Highlight>;
        }
        return <Highlight at={at} color={markColor}>{content}</Highlight>;
      }
      case 'underline':
        return <Underline at={at} color={markColor}>{content}</Underline>;
      case 'circle':
        return <CircleMark at={at} color={markColor}>{content}</CircleMark>;
      default:
        return content;
    }
  };

  const lines: ReactNode[][] = Array.from({length: lineCount}, () => []);
  tokens.forEach((tok, i) => {
    if (!tok.space) wordIndex++;
    if (mode === 'typewriter') {
      const visible = tok.text.slice(0, Math.max(0, typed - charCount));
      const appearAt = startAt + Math.ceil((charCount / charsPerSecond) * fps);
      charCount += tok.text.length;
      if (!visible) return;
      lines[tok.line].push(<span key={i} style={{whiteSpace: 'pre'}}>{decorate(tok, appearAt + Math.ceil((tok.text.length / charsPerSecond) * fps), visible)}</span>);
      return;
    }
    if (tok.space) {
      // Plain space: collapses and wraps like normal text (no stray space at a line start).
      lines[tok.line].push(' ');
      return;
    }
    const appearAt =
      mode === 'lines' ? startAt + tok.line * stagger * 3 :
      mode === 'fade' || mode === 'none' ? startAt :
      startAt + wordIndex * stagger;
    if (mode === 'letters') {
      const letters = [...tok.text].map((ch, k) => {
        const at = appearAt + k * Math.max(1, stagger / 3);
        return <span key={k} style={{display: 'inline-block', ...entrance(enter, frame - at, fps, u)}}>{ch}</span>;
      });
      lines[tok.line].push(<span key={i} style={{display: 'inline-block'}}>{decorate(tok, appearAt + tok.text.length * (stagger / 3), letters)}</span>);
      return;
    }
    const anim = mode === 'none' ? {} : entrance(mode === 'fade' ? 'fade' : enter, frame - appearAt, fps, u);
    lines[tok.line].push(
      <span key={i} style={{display: 'inline-block', ...anim}}>{decorate(tok, appearAt, tok.text)}</span>,
    );
  });

  const showCursor = mode === 'typewriter' && cursor && (typed < charCount || Math.floor(local / (fps / 2)) % 2 === 0) && local >= 0;

  return (
    <Tag style={{margin: 0, ...style}}>
      {lines.map((parts, li) => (
        // One line flows inline (fits inside rows/badges); several lines stack.
        <span key={li} style={{display: lineCount > 1 ? 'block' : 'inline'}}>
          {parts}
          {showCursor && li === lines.length - 1 ? (
            <span style={{display: 'inline-block', width: '0.08em', height: '1em', marginLeft: '0.05em', background: 'currentColor', verticalAlign: '-0.12em'}} />
          ) : null}
        </span>
      ))}
      {mode === 'typewriter' && typingSound ? (
        <Sfx sound="typing" at={startAt} duration={Math.ceil((charCount / charsPerSecond) * fps)} loop volume={0.7} />
      ) : null}
    </Tag>
  );
};
