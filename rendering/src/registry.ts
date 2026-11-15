import type {ComponentType} from 'react';
import {ZodObject, type ZodType} from 'zod';
import * as Infrastructure from './scenes/InfrastructureScene';
import * as Title from './scenes/TitleScene';
import * as Bullet from './scenes/BulletListScene';
import * as Quote from './scenes/QuoteScene';
import * as Globe from './scenes/GlobeScene';
import * as Network from './scenes/NetworkScene';
import * as City from './scenes/CityNetworkScene';
import * as Zoom from './scenes/ZoomOutScene';
import * as Journey from './scenes/PacketJourneyScene';
import * as Comparison from './scenes/ComparisonTableScene';
import * as Definition from './scenes/DefinitionScene';
import * as Example from './scenes/ExampleCardScene';
import * as Steps from './scenes/StepsScene';
import * as Quiz from './scenes/QuizScene';
import * as Summary from './scenes/SummaryScene';

// A single contract for scene lookup, validation, and LLM discovery.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type SceneEntry = {component: ComponentType<any>; schema: ZodType; description: string; tags: string[]};
const baseCatalog: Record<string, SceneEntry> = {
  TitleScene: {...Title, component: Title.TitleScene, schema: Title.titleSceneSchema},
  BulletListScene: {...Bullet, component: Bullet.BulletListScene, schema: Bullet.bulletListSceneSchema},
  QuoteScene: {...Quote, component: Quote.QuoteScene, schema: Quote.quoteSceneSchema},
  GlobeScene: {...Globe, component: Globe.GlobeScene, schema: Globe.globeSceneSchema},
  InfrastructureScene: {...Infrastructure, component: Infrastructure.InfrastructureScene, schema: Infrastructure.infrastructureSceneSchema},
  BuildingScene: {...Infrastructure, component: Infrastructure.BuildingScene, schema: Infrastructure.infrastructureSceneSchema.extend({preset: Infrastructure.infrastructureSceneSchema.shape.preset.default('city'), title: Infrastructure.infrastructureSceneSchema.shape.title.default('A city takes shape'), caption: Infrastructure.infrastructureSceneSchema.shape.caption.default('Different sizes. One connected city.')})},
  TechnologyScene: {...Infrastructure, component: Infrastructure.TechnologyScene, schema: Infrastructure.infrastructureSceneSchema.extend({preset: Infrastructure.infrastructureSceneSchema.shape.preset.default('technology'), title: Infrastructure.infrastructureSceneSchema.shape.title.default('The hardware behind the network'), caption: Infrastructure.infrastructureSceneSchema.shape.caption.default('Servers, computers, and routers working together.')})},
  NetworkScene: {...Network, component: Network.NetworkScene, schema: Network.networkSceneSchema},
  CityNetworkScene: {...City, component: City.CityNetworkScene, schema: City.cityNetworkSceneSchema},
  ZoomOutScene: {...Zoom, component: Zoom.ZoomOutScene, schema: Zoom.zoomOutSceneSchema},
  PacketJourneyScene: {...Journey, component: Journey.PacketJourneyScene, schema: Journey.packetJourneySceneSchema},
  ComparisonTableScene: {...Comparison, component: Comparison.ComparisonTableScene, schema: Comparison.comparisonTableSceneSchema},
  DefinitionScene: {...Definition, component: Definition.DefinitionScene, schema: Definition.definitionSceneSchema},
  ExampleCardScene: {...Example, component: Example.ExampleCardScene, schema: Example.exampleCardSceneSchema},
  StepsScene: {...Steps, component: Steps.StepsScene, schema: Steps.stepsSceneSchema},
  QuizScene: {...Quiz, component: Quiz.QuizScene, schema: Quiz.quizSceneSchema},
  SummaryScene: {...Summary, component: Summary.SummaryScene, schema: Summary.summarySceneSchema},
};
// Unknown props are errors, not silently dropped: a typo like "titel" must fail validation
// so the planner/agent sees it and fixes the JSON.
const strict = (schema: ZodType): ZodType => (schema instanceof ZodObject ? schema.strict() : schema);
export const sceneCatalog: Record<string, SceneEntry> = Object.fromEntries(
  Object.entries(baseCatalog).map(([name, entry]) => [name, {...entry, schema: strict(entry.schema)}]),
);

export const registry = Object.fromEntries(Object.entries(sceneCatalog).map(([name, entry]) => [name, entry.component]));
