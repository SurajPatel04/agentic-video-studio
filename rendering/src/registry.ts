import type {ComponentType} from 'react';
import {ZodObject, type ZodType} from 'zod';
export {overlaysSchema, overlaySchema} from './effects/overlays';
import {stagingCatalog} from './staging';
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
import * as Chart from './scenes/ChartScene';
import * as Equation from './scenes/EquationScene';
import * as Timeline from './scenes/TimelineScene';
import * as Flowchart from './scenes/FlowchartScene';
import * as Code from './scenes/CodeScene';
import * as Map from './scenes/MapScene';
import * as Stat from './scenes/StatScene';
import * as Image from './scenes/ImageScene';
import * as Cycle from './scenes/CycleScene';
import * as Venn from './scenes/VennScene';
import * as DeviceGrid from './scenes/DeviceGridScene';
import * as Device3D from './scenes/Device3DScene';
import * as Explain from './scenes/ExplainScene';
import * as Connection from './scenes/ConnectionScene';
import * as DeviceDemo from './scenes/DeviceDemoScene';
import * as Blank from './scenes/BlankScene';
import * as Iso from './scenes/IsoScene';

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
  ChartScene: {...Chart, component: Chart.ChartScene, schema: Chart.chartSceneSchema},
  EquationScene: {...Equation, component: Equation.EquationScene, schema: Equation.equationSceneSchema},
  TimelineScene: {...Timeline, component: Timeline.TimelineScene, schema: Timeline.timelineSceneSchema},
  FlowchartScene: {...Flowchart, component: Flowchart.FlowchartScene, schema: Flowchart.flowchartSceneSchema},
  CodeScene: {...Code, component: Code.CodeScene, schema: Code.codeSceneSchema},
  MapScene: {...Map, component: Map.MapScene, schema: Map.mapSceneSchema},
  StatScene: {...Stat, component: Stat.StatScene, schema: Stat.statSceneSchema},
  ImageScene: {...Image, component: Image.ImageScene, schema: Image.imageSceneSchema},
  CycleScene: {...Cycle, component: Cycle.CycleScene, schema: Cycle.cycleSceneSchema},
  VennScene: {...Venn, component: Venn.VennScene, schema: Venn.vennSceneSchema},
  DeviceGridScene: {...DeviceGrid, component: DeviceGrid.DeviceGridScene, schema: DeviceGrid.deviceGridSceneSchema},
  Device3DScene: {...Device3D, component: Device3D.Device3DScene, schema: Device3D.device3DSceneSchema},
  ExplainScene: {...Explain, component: Explain.ExplainScene, schema: Explain.explainSceneSchema},
  ConnectionScene: {...Connection, component: Connection.ConnectionScene, schema: Connection.connectionSceneSchema},
  CircuitScene: {component: Connection.ConnectionScene, schema: Connection.circuitSceneSchema, description: Connection.circuitDescription, tags: ['circuit', 'electricity', 'current', 'battery', 'bulb', 'physics', '3d']},
  WirelessScene: {component: Connection.ConnectionScene, schema: Connection.wirelessSceneSchema, description: Connection.wirelessDescription, tags: ['wireless', 'wifi', 'radio', 'waves', 'router', 'phone', '3d']},
  BlankScene: {...Blank, component: Blank.BlankScene, schema: Blank.blankSceneSchema},
  DeviceDemoScene: {...DeviceDemo, component: DeviceDemo.DeviceDemoScene, schema: DeviceDemo.deviceDemoSceneSchema},
  IsoScene: {...Iso, component: Iso.IsoScene, schema: Iso.isoSceneSchema},
  // <promoted-scenes> (the backend adds promoted agent-made scenes above this line)
  ...stagingCatalog,
};
// Unknown props are errors, not silently dropped: a typo like "titel" must fail validation
// so the planner/agent sees it and fixes the JSON.
const strict = (schema: ZodType): ZodType => (schema instanceof ZodObject ? schema.strict() : schema);
export const sceneCatalog: Record<string, SceneEntry> = Object.fromEntries(
  Object.entries(baseCatalog).map(([name, entry]) => [name, {...entry, schema: strict(entry.schema)}]),
);

export const registry = Object.fromEntries(Object.entries(sceneCatalog).map(([name, entry]) => [name, entry.component]));
