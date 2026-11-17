/**
 * Subtitles from the narration's word timings (scene `voice.words`, filled by the backend).
 *
 * Composition JSON (all optional; captions are on by default when words exist):
 *   "captions": {"enabled": true, "position": "bottom", "offset": 125, "size": 44, "maxWords": 7,
 *                "highlight": true, "highlightColor": "#ff5500", "background": true, "mode": "burn"}
 * mode: burn = drawn into the picture; track = not drawn (the backend adds a subtitle track the player
 * can switch on / off, plus captions.srt / .vtt); both = drawn + track.
 * Turn off: "captions": {"enabled": false}  (or "captions": false), or via the API / CLI flag.
 */
import type {FC} from 'react';
import {interpolate, useCurrentFrame} from 'remotion';
import {z} from 'zod';
import {useTheme, useUnit} from '../theme';

export const captionWordSchema = z.object({t: z.string(), s: z.number().int().nonnegative(), e: z.number().int().nonnegative()}).strict();
export type CaptionWord = z.infer<typeof captionWordSchema>;

const captionsObjectSchema = z
  .object({
    enabled: z.boolean().default(true),
    mode: z.enum(['burn', 'track', 'both']).default('burn'),
    position: z.enum(['bottom', 'top']).default('bottom'),
    offset: z.number().min(0).max(400).default(125), // px from the edge (clear of the scenes' own bottom captions)
    size: z.number().min(16).max(120).default(44),
    maxWords: z.number().int().min(1).max(20).default(7), // per line
    highlight: z.boolean().default(true), // colour the word being spoken
    color: z.string().default('#ffffff'),
    highlightColor: z.string().optional(), // default: the brand colour (logo orange), else the theme accent
    background: z.boolean().default(true), // dark pill behind the text
  })
  .strict();
/** `true` / `false`, or an object with the options above. */
export const captionsSettingsSchema = z.union([z.boolean(), captionsObjectSchema]);
export type CaptionsSettings = z.output<typeof captionsObjectSchema>;

export const resolveCaptions = (input: unknown): CaptionsSettings => {
  const parsed = captionsSettingsSchema.parse(input ?? {});
  return typeof parsed === 'boolean' ? {...captionsObjectSchema.parse({}), enabled: parsed} : parsed;
};

/** Split words into caption lines: at most maxWords, break after . ! ? or a pause > 0.5 s. */
const toLines = (words: CaptionWord[], maxWords: number, fps: number) => {
  const lines: CaptionWord[][] = [];
  let cur: CaptionWord[] = [];
  words.forEach((w, i) => {
    cur.push(w);
    const next = words[i + 1];
    const sentenceEnd = /[.!?]["')]?$/.test(w.t);
    const pause = next ? next.s - w.e > fps * 0.5 : true;
    if (cur.length >= maxWords || sentenceEnd || pause) {
      lines.push(cur);
      cur = [];
    }
  });
  if (cur.length) lines.push(cur);
  return lines;
};

export const Captions: FC<{words: CaptionWord[]; settings: CaptionsSettings; fps: number}> = ({words, settings, fps}) => {
  const f = useCurrentFrame();
  const theme = useTheme();
  const u = useUnit();
  if (!settings.enabled || settings.mode === 'track' || !words.length) return null;
  const lines = toLines(words, settings.maxWords, fps);
  // The line on screen: from its first word until the next line starts (or a short hold after the last).
  const idx = lines.findIndex((l, i) => {
    const start = l[0].s - 3;
    const end = i + 1 < lines.length ? Math.min(lines[i + 1][0].s - 3, l[l.length - 1].e + fps) : l[l.length - 1].e + Math.round(fps * 0.6);
    return f >= start && f < end;
  });
  if (idx < 0) return null;
  const line = lines[idx];
  const appear = interpolate(f - (line[0].s - 3), [0, 4], [0, 1], {extrapolateRight: 'clamp'});
  const hl = settings.highlightColor ?? theme.accent;
  return (
    <div style={{position: 'absolute', left: 0, right: 0, [settings.position]: settings.offset * u, display: 'flex', justifyContent: 'center', pointerEvents: 'none', zIndex: 50}}>
      <div style={{maxWidth: '80%', textAlign: 'center', padding: settings.background ? `${10 * u}px ${24 * u}px` : 0, borderRadius: 16 * u,
        background: settings.background ? 'rgba(2,6,23,0.72)' : 'transparent', fontSize: settings.size * u, fontWeight: 700, lineHeight: 1.3,
        color: settings.color, opacity: appear, transform: `translateY(${(1 - appear) * 8 * u}px)`,
        textShadow: settings.background ? 'none' : `0 ${2 * u}px ${8 * u}px rgba(0,0,0,0.9)`}}>
        {line.map((w, i) => {
          const spoken = settings.highlight && f >= w.s && f < (line[i + 1]?.s ?? w.e + 6);
          return (
            <span key={i} style={{color: spoken ? hl : undefined, transition: 'none'}}>
              {w.t}{i < line.length - 1 ? ' ' : ''}
            </span>
          );
        })}
      </div>
    </div>
  );
};
