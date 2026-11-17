import {Composition, type CalculateMetadataFunction} from 'remotion';
import data from '../composition.json';
import infrastructure from '../examples/infrastructure.json';
import globe from '../examples/globe-test.json';
import networking from '../examples/networking-complete.json';
import priority from '../examples/networking-priority.json';
import gallery from '../examples/study-gallery.json';
import showcase from '../examples/library-showcase.json';
import {brandTiming} from './brand';
import {totalFrames} from './transitions';
import type {CompositionSpec} from './types';
import {VideoComposition} from './VideoComposition';

// Length, fps and size all come from the JSON (or from --props), never from code.
const calculateMetadata: CalculateMetadataFunction<CompositionSpec> = ({props}) => ({
  durationInFrames: Math.max(1, brandTiming(props.brand, props.fps).offset + totalFrames(props)),
  fps: props.fps,
  width: props.width,
  height: props.height,
});

export const RemotionRoot: React.FC = () => (
  <>
  <Composition
    id="VideoComposition"
    component={VideoComposition}
    durationInFrames={1} // replaced by calculateMetadata
    fps={30}
    width={1920}
    height={1080}
    defaultProps={data as CompositionSpec}
    calculateMetadata={calculateMetadata}
  />
  <Composition
    id="InfrastructureDemo"
    component={VideoComposition}
    durationInFrames={540}
    fps={30}
    width={1920}
    height={1080}
    defaultProps={infrastructure as CompositionSpec}
    calculateMetadata={calculateMetadata}
  />
  <Composition
    id="GlobeDemo"
    component={VideoComposition}
    durationInFrames={510}
    fps={30}
    width={1920}
    height={1080}
    defaultProps={globe as CompositionSpec}
    calculateMetadata={calculateMetadata}
  />
  {[['NetworkingDemo', networking], ['NetworkingPriority', priority], ['StudyGallery', gallery], ['LibraryShowcase', showcase]].map(([id, spec]) => (
    <Composition key={id as string} id={id as string} component={VideoComposition} durationInFrames={1} fps={30} width={1920} height={1080} defaultProps={spec as CompositionSpec} calculateMetadata={calculateMetadata}/>
  ))}
  </>
);
