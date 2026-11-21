import {isoSideNoteSchema, PreviousIsoSideNote} from './scenes/IsoScene';
import {linearTiming, TransitionSeries} from '@remotion/transitions';
import {Fragment, useMemo} from 'react';
import {AbsoluteFill, Sequence} from 'remotion';
import {BrandIntro, BrandWatermark, brandTiming, resolveBrand} from './brand';
import {audioSettingsSchema, Captions, resolveCaptions, type CaptionsSettings, Music, SfxContext, SfxCues, sfxCuesSchema, Sfx, Voice, voiceSchema, type AudioSettings} from './audio';
import {Overlays, overlaysSchema} from './effects/overlays';
import {fitProps} from './fitProps';
import {PAPER} from './iso/iso';
import {PaperStage} from './scenes/paperStage';
import {registry, sceneCatalog} from './registry';
import {BottomCaptionInsetProvider, defaultTheme, SceneLengthProvider, SceneWordsProvider, ThemeProvider} from './theme';
import {presentationFor, transitionFrames, transitionInto} from './transitions';
import type {CompositionSpec, SceneSpec} from './types';

const UnknownScene: React.FC<{name: string}> = ({name}) => (
  <AbsoluteFill
    style={{background: 'crimson', color: 'white', fontSize: 60, justifyContent: 'center', alignItems: 'center'}}
  >
    Unknown component: {name}
  </AbsoluteFill>
);

const textCards = new Set(['TitleScene', 'ExplainScene', 'BulletListScene', 'QuoteScene']);
/** Every scene shares the paper canvas, including scenes from older compositions. */
const SceneFrame: React.FC<{scene: SceneSpec; audio: AudioSettings; captions: CaptionsSettings; captionFrames: number; fps: number}> =
  ({scene, audio, captions, captionFrames, fps}) => {
  const Scene = registry[scene.component];
  // Over-limit lists / text / numbers are fitted the same way the validator fits them (fitProps).
  const parsed = useMemo(() => Scene ? fitProps(sceneCatalog[scene.component].schema, scene.props ?? {}).result : null, [Scene, scene.component, scene.props]);
  if (parsed && !parsed.success) throw new Error(`Scene ${scene.id} (${scene.component}): ${parsed.error.message}`);
  const overlays = useMemo(() => (scene.overlays ? fitProps(overlaysSchema, scene.overlays).result : null), [scene.overlays]);
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
  const words = voice?.success ? voice.data.words : undefined;
  const captionWords = captions.enabled && captions.mode !== 'track' && words?.length ? words : undefined;
  const bottomCaptionInset = captionWords && captions.position === 'bottom'
    ? Math.max(165, captions.offset + captions.size * 1.3 + (captions.background ? 20 : 0) + 12) : 0;
  const cues = useMemo(() => (scene.sfx ? sfxCuesSchema.safeParse(scene.sfx) : null), [scene.sfx]);
  if (cues && !cues.success) throw new Error(`Scene ${scene.id} sfx: ${cues.error.message}`);

  const content = Scene ? <Scene {...(parsed?.success ? parsed.data as Record<string, unknown> : scene.props)} /> : <UnknownScene name={scene.component} />;

  return (
    <ThemeProvider value={defaultTheme}>
     <SceneLengthProvider value={scene.durationInFrames}>
      <SceneWordsProvider value={words}>
      <BottomCaptionInsetProvider value={bottomCaptionInset}>
      <AbsoluteFill style={{color: defaultTheme.text, fontFamily: defaultTheme.fontFamily}}>
        <PaperStage>
          {textCards.has(scene.component) ? <AbsoluteFill style={{inset: '6% 5% 17%', width: '90%', height: '77%', borderRadius: 24, background: PAPER.card, border: '1px solid ' + PAPER.track}}>{content}</AbsoluteFill> : content}
        </PaperStage>
        {overlays?.success && overlays.data.length ? <Overlays items={overlayItems} scene={content} /> : null}
        {voice?.success ? <Voice voice={voice.data} volume={audio.voiceVolume} /> : null}
        {cues?.success ? <SfxCues cues={cues.data} /> : null}
        {captionWords ? (
          <Sequence durationInFrames={captionFrames} layout="none" showInTimeline={false}>
            <Captions words={captionWords} settings={captions} fps={fps} />
          </Sequence>
        ) : null}
      </AbsoluteFill>
      </BottomCaptionInsetProvider>
      </SceneWordsProvider>
     </SceneLengthProvider>
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
  const brand = useMemo(() => resolveBrand(spec.brand), [spec.brand]);
  // the word being spoken takes the brand colour unless the JSON names another
  const shownCaptions = useMemo(() => ({...captions, highlightColor: captions.highlightColor ?? brand?.color}), [captions, brand]);
  const {intro, offset} = brandTiming(spec.brand, spec.fps);
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
    <AbsoluteFill style={{background: PAPER.bg}}>
     <Sequence from={offset} name="video">
      {audio.music ? <Music music={audio.music} speaking={speaking} /> : null}
      {audio.transitions
        ? spec.scenes.map((scene, i) => (scene.props?.continued !== true && transitionFrames(spec, i) > 0 ? <Sfx key={`w${i}`} sound="whoosh" at={Math.max(0, starts[i] - 4)} volume={0.6} /> : null))
        : null}
      <TransitionSeries>
        {spec.scenes.map((scene, i) => {
          const frames = transitionFrames(spec, i);
          const previous = spec.scenes[i - 1];
          const oldNote = scene.component === 'IsoScene' && scene.props?.continued === true &&
            previous?.component === 'IsoScene' ? isoSideNoteSchema.safeParse(previous.props?.sideNote) : undefined;
          const previousNote = oldNote?.success && oldNote.data.until === undefined ? oldNote.data : null;
          const transition = transitionInto(spec, i);
          const hideOutgoingCaptions = i + 1 < spec.scenes.length && ['fade', 'wipe'].includes(transitionInto(spec, i + 1).type);
          const captionFrames = scene.durationInFrames - (hideOutgoingCaptions ? transitionFrames(spec, i + 1) : 0);
          return (
            <Fragment key={scene.id}>
              {frames > 0 ? (
                <TransitionSeries.Transition
                  presentation={presentationFor(transition)}
                  timing={linearTiming({durationInFrames: frames})}
                />
              ) : null}
              <TransitionSeries.Sequence durationInFrames={scene.durationInFrames}>
                <PreviousIsoSideNote.Provider value={previousNote}>
                  <SceneFrame scene={scene} audio={audio} captions={shownCaptions} captionFrames={captionFrames} fps={spec.fps} />
                </PreviousIsoSideNote.Provider>
              </TransitionSeries.Sequence>
            </Fragment>
          );
        })}
      </TransitionSeries>
     </Sequence>
      {brand && intro ? (
        <Sequence durationInFrames={intro} name="brand intro">
          <BrandIntro brand={brand} frames={intro} />
        </Sequence>
      ) : null}
      {brand?.watermark ? (
        <Sequence from={intro} name="brand logo">
          <BrandWatermark brand={brand} fadeIn={!intro} />
        </Sequence>
      ) : null}
    </AbsoluteFill>
    </SfxContext.Provider>
  );
};
