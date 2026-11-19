/**
 * Audio: narration (voice), background music and sound effects. All controlled from JSON.
 *
 * Composition JSON:
 *   "audio": {"effects": true, "effectsVolume": 0.5, "transitions": true, "voice": "aura-2-thalia-en",
 *             "music": {"src": "audio/music.mp3", "volume": 0.2, "duck": 0.35}}
 * Scene JSON:
 *   "narration": {"text": "A LAN connects devices in one building.", "delay": 10}   -> the backend (Deepgram) turns this into "voice"
 *   "voice": {"src": "audio/tts/ab12.wav", "startAt": 10, "frames": 96}            (or your own recording)
 *   "sfx": [{"sound": "ding", "at": 45}, {"sound": "audio/my-sound.mp3", "at": 80, "volume": 0.4}]
 *
 * Components also play their own effects (pointer click, check ding, toast, typing, …) when effects are on.
 */
import type {FC} from 'react';
import {createContext, useContext} from 'react';
import {Html5Audio, interpolate, Sequence, staticFile} from 'remotion';
import {z} from 'zod';
import {captionWordSchema} from './Captions';

export {Captions, captionsSettingsSchema, resolveCaptions, type CaptionsSettings, type CaptionWord} from './Captions';

// Built-in WAV assets include generated cues and recorded media sounds.
export const sfxNames = [
  'click', 'pop', 'whoosh', 'typing', 'ding', 'success', 'error', 'lock', 'notify',
  'drop', 'chime', 'blip', 'alert', 'remove', 'rise', 'swipe', 'tick', 'sparkle', 'impact',
  'data', 'connect', 'disconnect', 'coin', 'shutter', 'logo',
  'page-turn', 'desk-stamp', 'mic-switch', 'radio-static',
] as const;
export type SfxName = (typeof sfxNames)[number];

const frame = z.number().int().nonnegative();
/** A file in rendering/public (e.g. "audio/music.mp3") or an http(s) URL. */
const src = z.string().min(1).max(300);

export const audioSettingsSchema = z
  .object({
    effects: z.boolean().default(true), // built-in sound effects from components
    effectsVolume: z.number().min(0).max(2).default(0.5),
    transitions: z.boolean().default(true), // whoosh on scene transitions
    voiceVolume: z.number().min(0).max(2).default(1),
    voice: z.string().max(60).default('aura-2-thalia-en'), // Deepgram voice for `narration`
    music: z
      .object({
        src,
        volume: z.number().min(0).max(1).default(0.2),
        duck: z.number().min(0).max(1).default(0.35), // music volume × this while someone speaks
        loop: z.boolean().default(true),
      })
      .strict()
      .optional(),
  })
  .strict();
export type AudioSettings = z.output<typeof audioSettingsSchema>;

export const narrationSchema = z
  .object({
    text: z.string().min(1).max(2000), // what the narrator says in this scene
    voice: z.string().max(60).optional(), // overrides the composition voice
    delay: frame.default(10), // frames after the scene starts
    pauseAfterSeconds: z.number().min(0).max(15).optional(), // hold after the voice clip
  })
  .strict();

export const voiceSchema = z
  .object({
    src, // audio file (made by the backend TTS step, or your own recording)
    startAt: frame.default(0),
    frames: z.number().int().positive().optional(), // length (for music ducking); filled by the backend TTS step
    volume: z.number().min(0).max(2).default(1),
    words: z.array(captionWordSchema).max(2000).optional(), // when each word is spoken (captions); filled by the backend
  })
  .strict();

export const sfxCueSchema = z
  .object({
    sound: z.union([z.enum(sfxNames), src]), // built-in name or a file
    at: frame,
    volume: z.number().min(0).max(2).default(1),
  })
  .strict();
export const sfxCuesSchema = z.array(sfxCueSchema).max(60);

export const resolveSrc = (s: string) => (/^https?:\/\//.test(s) ? s : staticFile(s.replace(/^\//, '')));
const sfxSrc = (s: string) => ((sfxNames as readonly string[]).includes(s) ? staticFile(`sfx/${s}.wav`) : resolveSrc(s));

/* ----------------------------------------------------------------- effects */

/** Whether components may play effects (off inside the zoom lens, which re-renders the scene). */
export const SfxContext = createContext<{enabled: boolean; volume: number}>({enabled: true, volume: 0.5});

/**
 * Plays a sound effect at a scene-relative frame. Built-in names: click, pop, whoosh, typing,
 * ding, success, error, lock, notify. `duration` (frames) cuts it; `loop` repeats (typing).
 */
export const Sfx: FC<{sound: SfxName | string; at?: number; volume?: number; duration?: number; loop?: boolean}> = ({
  sound, at = 0, volume = 1, duration, loop = false,
}) => {
  const ctx = useContext(SfxContext);
  if (!ctx.enabled || at < 0 || volume <= 0 || ctx.volume <= 0) return null;
  return (
    <Sequence from={at} durationInFrames={duration} layout="none" name={`sfx:${sound}`}>
      <Html5Audio src={sfxSrc(sound)} volume={ctx.volume * volume} loop={loop} />
    </Sequence>
  );
};

/** Several cues (scene JSON `sfx`). */
export const SfxCues: FC<{cues: z.output<typeof sfxCuesSchema>}> = ({cues}) => (
  <>{cues.map((c, i) => <Sfx key={i} sound={c.sound} at={c.at} volume={c.volume} />)}</>
);

/* -------------------------------------------------------------------- voice */

export const Voice: FC<{voice: z.output<typeof voiceSchema>; volume: number}> = ({voice, volume}) => (
  <Sequence from={voice.startAt} durationInFrames={voice.frames ? voice.frames + 5 : undefined} layout="none" name="voice">
    <Html5Audio src={resolveSrc(voice.src)} volume={voice.volume * volume} />
  </Sequence>
);

/* -------------------------------------------------------------------- music */

/** Background music for the whole video; quieter (ducked) while narration plays. */
export const Music: FC<{music: NonNullable<AudioSettings['music']>; speaking: [number, number][]}> = ({music, speaking}) => (
  <Html5Audio
    src={resolveSrc(music.src)}
    loop={music.loop}
    name="music"
    volume={(f) => {
      // 0 → 1 over 10 frames into a spoken part, back to 0 over 10 frames after it
      const w = speaking.reduce((m, [a, b]) => Math.max(m, interpolate(f, [a - 10, a, b, b + 10], [0, 1, 1, 0], {extrapolateLeft: 'clamp', extrapolateRight: 'clamp'})), 0);
      const fadeIn = interpolate(f, [0, 20], [0, 1], {extrapolateRight: 'clamp'});
      return music.volume * fadeIn * (1 - (1 - music.duck) * w);
    }}
  />
);
