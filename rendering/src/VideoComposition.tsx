import {linearTiming, TransitionSeries} from '@remotion/transitions';
import {Fragment, useMemo} from 'react';
import {AbsoluteFill} from 'remotion';
import {audioSettingsSchema, Captions, resolveCaptions, type CaptionsSettings, Music, SfxContext, SfxCues, sfxCuesSchema, Sfx, Voice, voiceSchema, type AudioSettings} from './audio';
import {Overlays, overlaysSchema} from './effects/overlays';
import {registry, sceneCatalog} from './registry';
import {defaultTheme, ThemeProvider} from './theme';
import {presentationFor, transitionFrames, transitionInto} from './transitions';
import type {CompositionSpec, SceneSpec, Theme} from './types';

const UnknownScene: React.FC<{name: string}> = ({name}) => (
  <AbsoluteFill
    style={{background: 'crimson', color: 'white', fontSize: 60, justifyContent: 'center', alignItems: 'center'}}
  >
    Unknown component: {name}
  </AbsoluteFill>
);

/** Applies the merged theme + background, then renders the scene's component. */
const SceneFrame: React.FC<{scene: SceneSpec; baseTheme: Theme; audio: AudioSettings; captions: CaptionsSettings; fps: number}> = ({scene, baseTheme, audio, captions, fps}) => {
  const theme: Theme = {
    ...baseTheme,
    ...scene.theme,
    ...(scene.background ? {background: scene.background} : {}),
  };
  const Scene = registry[scene.component];
  const parsed = useMemo(() => Scene ? sceneCatalog[scene.component].schema.safeParse(scene.props ?? {}) : null, [Scene, scene.component, scene.props]);
  if (parsed && !parsed.success) throw new Error(`Scene ${scene.id} (${scene.component}): ${parsed.error.message}`);
  const overlays = useMemo(() => (scene.overlays ? overlaysSchema.safeParse(scene.overlays) : null), [scene.overlays]);
  if (overlays && !overlays.success) throw new Error(`Scene ${scene.id} overlays: ${overlays.error.message}`);

  // A terminal on an otherwise blank canvas is the main visual, not a small accessory.
  const overlayItems = overlays?.success ? overlays.data.map((item) => {
    const focus = scene.component === 'BlankScene' && scene.props?.focusOverlay !== false &&
      scene.props?.titleAt !== 'center' && overlays.data.length === 1 && item.type === 'terminal' &&
      item.at.x === 50 && item.at.y === 50;
    if (!focus || item.type !== 'terminal') return item;
    return {...item, width: Math.max(item.width, 1200),
      fontSize: Math.max(item.fontSize, item.lines.length <= 6 ? 42 : 30)};
  }) : [];

  const voice = useMemo(() => (scene.voice ? voiceSchema.safeParse(scene.voice) : null), [scene.voice]);
  if (voice && !voice.success) throw new Error(`Scene ${scene.id} voice: ${voice.error.message}`);
  const cues = useMemo(() => (scene.sfx ? sfxCuesSchema.safeParse(scene.sfx) : null), [scene.sfx]);
  if (cues && !cues.success) throw new Error(`Scene ${scene.id} sfx: ${cues.error.message}`);

  const content = Scene ? <Scene {...(parsed?.success ? parsed.data as Record<string, unknown> : scene.props)} /> : <UnknownScene name={scene.component} />;

  return (
    <ThemeProvider value={theme}>
      <AbsoluteFill style={{background: theme.background, color: theme.text, fontFamily: theme.fontFamily}}>
        {content}
        {overlays?.success && overlays.data.length ? <Overlays items={overlayItems} scene={content} /> : null}
        {voice?.success ? <Voice voice={voice.data} volume={audio.voiceVolume} /> : null}
        {cues?.success ? <SfxCues cues={cues.data} /> : null}
        {voice?.success && voice.data.words ? <Captions words={voice.data.words} settings={captions} fps={fps} /> : null}
      </AbsoluteFill>
    </ThemeProvider>
  );
};

/** Frame each scene starts at in the final video (transitions overlap the previous scene). */
const sceneStarts = (spec: CompositionSpec) => {
  const starts: number[] = [];
  spec.scenes.forEach((s, i) => starts.push(i === 0 ? 0 : starts[i - 1] + spec.scenes[i - 1].durationInFrames - transitionFrames(spec, i)));
  return starts;
};

export const VideoComposition: React.FC<CompositionSpec> = (spec) => {
  const baseTheme: Theme = {...defaultTheme, ...spec.theme};
  const audio = useMemo(() => {
    const r = audioSettingsSchema.safeParse(spec.audio ?? {});
    if (!r.success) throw new Error(`audio: ${r.error.message}`);
    return r.data;
  }, [spec.audio]);
  const captions = useMemo(() => {
    try {
      return resolveCaptions(spec.captions);
    } catch (e) {
      throw new Error(`captions: ${(e as Error).message}`);
    }
  }, [spec.captions]);
  const starts = sceneStarts(spec);
  // When narration plays (for ducking the music).
  const speaking: [number, number][] = spec.scenes.flatMap((s, i) => {
    const v = s.voice as {startAt?: number; frames?: number} | undefined;
    if (!v) return [];
    const a = starts[i] + (v.startAt ?? 0);
    return [[a, a + (v.frames ?? s.durationInFrames)] as [number, number]];
  });
  return (
    <SfxContext.Provider value={{enabled: audio.effects, volume: audio.effectsVolume}}>
    <AbsoluteFill style={{background: baseTheme.background}}>
      {audio.music ? <Music music={audio.music} speaking={speaking} /> : null}
      {audio.transitions
        ? spec.scenes.map((_, i) => (transitionFrames(spec, i) > 0 ? <Sfx key={`w${i}`} sound="whoosh" at={Math.max(0, starts[i] - 4)} volume={0.6} /> : null))
        : null}
      <TransitionSeries>
        {spec.scenes.map((scene, i) => {
          const frames = transitionFrames(spec, i);
          return (
            <Fragment key={scene.id}>
              {frames > 0 ? (
                <TransitionSeries.Transition
                  presentation={presentationFor(transitionInto(spec, i))}
                  timing={linearTiming({durationInFrames: frames})}
                />
              ) : null}
              <TransitionSeries.Sequence durationInFrames={scene.durationInFrames}>
                <SceneFrame scene={scene} baseTheme={baseTheme} audio={audio} captions={captions} fps={spec.fps} />
              </TransitionSeries.Sequence>
            </Fragment>
          );
        })}
      </TransitionSeries>
    </AbsoluteFill>
    </SfxContext.Provider>
  );
};
