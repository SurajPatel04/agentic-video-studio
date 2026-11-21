import * as RAG from './scenes/RAGScene';
import {mlFoundations} from './scenes/MLFoundations';
import {llmMechanics} from './scenes/LLMMechanics';
import {computerLessons} from "./scenes/ComputerLessons";
import {mediaLessons} from "./scenes/MediaLessons";
import * as Neural from './scenes/NeuralNetworkScene';
import * as MLScatter from './scenes/MLScatterScene';
import * as AIWorkflow from './scenes/AIWorkflowScene';
import * as WorkedExample from './scenes/WorkedExampleScene';
import * as AnnotatedText from './scenes/AnnotatedTextScene';
import * as OutcomeComparison from './scenes/OutcomeComparisonScene';
import * as Layers from './scenes/LayersScene';
import * as Matrix from './scenes/MatrixScene';
import * as FactCheck from './scenes/FactCheckScene';
import * as CaseStudy from './scenes/CaseStudyScene';
import * as Profile from './scenes/ProfileScene';
import * as Analogy from './scenes/AnalogyScene';
import * as ConceptMap from './scenes/ConceptMapScene';
import * as GitGraph from './scenes/GitGraphScene';
import {algorithmLessons} from './scenes/AlgorithmLessons';
import {mathLessons} from './scenes/MathLessons';
import * as TransactionDB from './scenes/TransactionScene';
import * as SchemaDB from './scenes/SchemaScene';
import * as JoinDB from './scenes/JoinScene';
import * as TableDB from './scenes/TableScene';
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
import * as Draw from './scenes/DrawScene';
import * as Screen from './scenes/ScreenScene';
import * as Phone from './scenes/PhoneScene';
import * as Terminal from './scenes/TerminalScene';
import * as Editor from './scenes/EditorScene';
import * as Chat from './scenes/ChatScene';
import * as Form from './scenes/FormScene';
import * as Query from './scenes/QueryScene';
import * as Pipeline from './scenes/PipelineScene';
import * as Packet from './scenes/PacketScene';
import * as ArrayS from './scenes/ArrayScene';
import * as StackS from './scenes/StackScene';
import * as Hash from './scenes/HashScene';
import * as Tree from './scenes/TreeScene';
import * as Linked from './scenes/LinkedListScene';
import * as EventLoop from './scenes/EventLoopScene';
import * as Plot from './scenes/PlotScene';
import * as LiveChart from './scenes/LiveChartScene';

import * as NewsCycle from './scenes/NewsCycleScene';

import * as FrontPage from './scenes/FrontPageScene';

import * as PrintDelivery from './scenes/PrintDeliveryScene';

import * as Studio from './scenes/StudioScene';

import * as SignalHomes from './scenes/SignalHomesScene';
import * as RadioTuning from './scenes/RadioTuningScene';
import * as SatelliteNews from './scenes/SatelliteNewsScene';
import * as Feed from './scenes/FeedScene';
import * as Spread from './scenes/SpreadScene';
import * as CreatorWorkflow from './scenes/CreatorWorkflowScene';
import * as MediaTheory from './scenes/MediaTheoryScene';
import * as Race from './scenes/RaceScene';
import * as LiveDashboard from './scenes/LiveDashboardScene';
import * as MapTracking from './scenes/MapTrackingScene';
// A single contract for scene lookup, validation, and LLM discovery.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
/** `example`: props shown to the planner when the schema's defaults alone would be empty (checked by check:scenes). */
export type SceneEntry = {component: ComponentType<any>; schema: ZodType; description: string; tags: string[]; example?: Record<string, unknown>};
const baseCatalog: Record<string, SceneEntry> = {
  ...mlFoundations,
  RAGScene: {...RAG, component: RAG.RAGScene, schema: RAG.ragSceneSchema},
  NeuralNetworkScene: {...Neural, component: Neural.NeuralNetworkScene, schema: Neural.neuralNetworkSceneSchema},
  MLScatterScene: {...MLScatter, component: MLScatter.MLScatterScene, schema: MLScatter.mlScatterSceneSchema},
  ...llmMechanics,
  ...computerLessons,
  ...mediaLessons,
  AIWorkflowScene: {...AIWorkflow, component: AIWorkflow.AIWorkflowScene, schema: AIWorkflow.aiWorkflowSceneSchema},
  WorkedExampleScene: {...WorkedExample, component: WorkedExample.WorkedExampleScene, schema: WorkedExample.workedExampleSceneSchema},
  AnnotatedTextScene: {...AnnotatedText, component: AnnotatedText.AnnotatedTextScene, schema: AnnotatedText.annotatedTextSceneSchema},
  OutcomeComparisonScene: {...OutcomeComparison, component: OutcomeComparison.OutcomeComparisonScene, schema: OutcomeComparison.outcomeComparisonSceneSchema},
  LayersScene: {...Layers, component: Layers.LayersScene, schema: Layers.layersSceneSchema},
  MatrixScene: {...Matrix, component: Matrix.MatrixScene, schema: Matrix.matrixSceneSchema},
  FactCheckScene: {...FactCheck, component: FactCheck.FactCheckScene, schema: FactCheck.factCheckSceneSchema},
  CaseStudyScene: {...CaseStudy, component: CaseStudy.CaseStudyScene, schema: CaseStudy.caseStudySceneSchema},
  ProfileScene: {...Profile, component: Profile.ProfileScene, schema: Profile.profileSceneSchema},
  AnalogyScene: {...Analogy, component: Analogy.AnalogyScene, schema: Analogy.analogySceneSchema},
  ConceptMapScene: {...ConceptMap, component: ConceptMap.ConceptMapScene, schema: ConceptMap.conceptMapSceneSchema},
  GitGraphScene: {...GitGraph, component: GitGraph.GitGraphScene, schema: GitGraph.gitGraphSceneSchema},
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
  DrawScene: {...Draw, component: Draw.DrawScene, schema: Draw.drawSceneSchema},
  ScreenScene: {...Screen, component: Screen.ScreenScene, schema: Screen.screenSceneSchema},
  PhoneScene: {...Phone, component: Phone.PhoneScene, schema: Phone.phoneSceneSchema},
  TerminalScene: {...Terminal, component: Terminal.TerminalScene, schema: Terminal.terminalSceneSchema},
  EditorScene: {...Editor, component: Editor.EditorScene, schema: Editor.editorSceneSchema},
  ChatScene: {...Chat, component: Chat.ChatScene, schema: Chat.chatSceneSchema},
  FormScene: {...Form, component: Form.FormScene, schema: Form.formSceneSchema},
  QueryScene: {...Query, component: Query.QueryScene, schema: Query.querySceneSchema},
  PipelineScene: {...Pipeline, component: Pipeline.PipelineScene, schema: Pipeline.pipelineSceneSchema},
  PacketScene: {...Packet, component: Packet.PacketScene, schema: Packet.packetSceneSchema},
  ArrayScene: {...ArrayS, component: ArrayS.ArrayScene, schema: ArrayS.arraySceneSchema},
  StackScene: {...StackS, component: StackS.StackScene, schema: StackS.stackSceneSchema},
  HashScene: {...Hash, component: Hash.HashScene, schema: Hash.hashSceneSchema},
  TreeScene: {component: Tree.TreeScene, schema: Tree.treeSceneSchema, description: Tree.treeDescription, tags: Tree.treeTags},
  GraphScene: {component: Tree.GraphScene, schema: Tree.graphSceneSchema, description: Tree.graphDescription, tags: Tree.graphTags},
  LinkedListScene: {...Linked, component: Linked.LinkedListScene, schema: Linked.linkedListSceneSchema},
  EventLoopScene: {...EventLoop, component: EventLoop.EventLoopScene, schema: EventLoop.eventLoopSceneSchema},
  PlotScene: {...Plot, component: Plot.PlotScene, schema: Plot.plotSceneSchema},
  LiveChartScene: {...LiveChart, component: LiveChart.LiveChartScene, schema: LiveChart.liveChartSceneSchema},
  NewsCycleScene: {...NewsCycle, component: NewsCycle.NewsCycleScene, schema: NewsCycle.newsCycleSceneSchema},
  FrontPageScene: {...FrontPage, component: FrontPage.FrontPageScene, schema: FrontPage.frontPageSceneSchema},
  PrintDeliveryScene: {...PrintDelivery, component: PrintDelivery.PrintDeliveryScene, schema: PrintDelivery.printDeliverySceneSchema},
  StudioScene: {...Studio, component: Studio.StudioScene, schema: Studio.studioSceneSchema},
  SignalHomesScene: {...SignalHomes, component:SignalHomes.SignalHomesScene, schema:SignalHomes.signalHomesSceneSchema},
  RadioTuningScene: {...RadioTuning, component:RadioTuning.RadioTuningScene, schema:RadioTuning.radioTuningSceneSchema},
  SatelliteNewsScene: {...SatelliteNews, component:SatelliteNews.SatelliteNewsScene, schema:SatelliteNews.satelliteNewsSceneSchema},
  FeedScene: {...Feed,component:Feed.FeedScene,schema:Feed.feedSceneSchema},
  SpreadScene: {...Spread,component:Spread.SpreadScene,schema:Spread.spreadSceneSchema},
  CreatorWorkflowScene: {...CreatorWorkflow,component:CreatorWorkflow.CreatorWorkflowScene,schema:CreatorWorkflow.creatorWorkflowSceneSchema},
  MediaTheoryScene: {...MediaTheory,component:MediaTheory.MediaTheoryScene,schema:MediaTheory.mediaTheorySceneSchema},
  RaceScene: {...Race, component: Race.RaceScene, schema: Race.raceSceneSchema},
  LiveDashboardScene: {...LiveDashboard, component: LiveDashboard.LiveDashboardScene, schema: LiveDashboard.liveDashboardSceneSchema},
  MapTrackingScene: {...MapTracking, component: MapTracking.MapTrackingScene, schema: MapTracking.mapTrackingSceneSchema},
  TableScene: {...TableDB, component: TableDB.TableScene, schema: TableDB.tableSceneSchema},
  JoinScene: {...JoinDB, component: JoinDB.JoinScene, schema: JoinDB.joinSceneSchema},
  SchemaScene: {...SchemaDB, component: SchemaDB.SchemaScene, schema: SchemaDB.schemaSceneSchema},
  TransactionScene: {...TransactionDB, component: TransactionDB.TransactionScene, schema: TransactionDB.transactionSceneSchema},
  ...algorithmLessons,
  ...mathLessons,
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
