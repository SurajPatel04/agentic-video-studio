import {linearTiming, TransitionSeries} from '@remotion/transitions';
import {Fragment, useMemo} from 'react';
import {AbsoluteFill} from 'remotion';
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
const SceneFrame: React.FC<{scene: SceneSpec; baseTheme: Theme}> = ({scene, baseTheme}) => {
  const theme: Theme = {
    ...baseTheme,
    ...scene.theme,
    ...(scene.background ? {background: scene.background} : {}),
  };
  const Scene = registry[scene.component];
  const parsed = useMemo(() => Scene ? sceneCatalog[scene.component].schema.safeParse(scene.props ?? {}) : null, [Scene, scene.component, scene.props]);
  if (parsed && !parsed.success) throw new Error(`Scene ${scene.id} (${scene.component}): ${parsed.error.message}`);

  return (
    <ThemeProvider value={theme}>
      <AbsoluteFill style={{background: theme.background, color: theme.text, fontFamily: theme.fontFamily}}>
        {Scene ? <Scene {...(parsed?.success ? parsed.data as Record<string, unknown> : scene.props)} /> : <UnknownScene name={scene.component} />}
      </AbsoluteFill>
    </ThemeProvider>
  );
};

export const VideoComposition: React.FC<CompositionSpec> = (spec) => {
  const baseTheme: Theme = {...defaultTheme, ...spec.theme};
  return (
    <AbsoluteFill style={{background: baseTheme.background}}>
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
                <SceneFrame scene={scene} baseTheme={baseTheme} />
              </TransitionSeries.Sequence>
            </Fragment>
          );
        })}
      </TransitionSeries>
    </AbsoluteFill>
  );
};
