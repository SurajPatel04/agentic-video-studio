import {createContext, useContext, useId} from 'react';
import {AbsoluteFill, interpolate, spring, useCurrentFrame, useVideoConfig} from 'remotion';
import {z} from 'zod';
import {Sfx, sfxNames} from '../audio';
import {useSceneLength, useUnit} from '../theme';
import {ISO_COLORS, isoColorNames, mix, PAPER, project, shade, type IsoColor, type Pt, C30, S30} from '../iso/iso';
import {IsoBox, IsoPerson, IsoShadow, Note, noteSize, StatusPill, Tag} from '../iso/shapes';
import {cueFields, newsCycleRemaining, ObjectCues} from '../iso/ObjectCues';
import {TableCard, tableSchema, users} from '../database/table';
import {LookupBadge, lookupState, badgeSchema} from '../iso/LookupBadge';
import {IsoLink} from '../iso/link';
import {BroadcastWaves, shareHops, unitInterval, type LinkMedia} from '../iso/MediaFlow';
import {along, bendPoint, curve, sample} from '../iso/curve';
import {IsoArt, Road, iconByName, type ArtKind} from '../iso/objects';
import {GENERAL_KINDS} from '../iso/general';
import {COMMUNICATION_KINDS} from '../iso/communication';
import {AI_KINDS} from '../iso/ai';
import {MEDIA_KINDS} from '../iso/media';
import {AUDIO_KINDS} from '../iso/audio';
import {ROAD_KINDS, isRoadKind} from '../iso/roads';

/* ----------------------------------------------------------------------------- kinds */

type Kind = {shape: 'art' | 'people' | 'slab' | 'person'; size: [number, number, number]; color: IsoColor};
const GENERAL_PRESETS = Object.fromEntries(Object.entries(GENERAL_KINDS).map(([kind, value]) => [kind, {shape: 'art', size: [...value.size], color: value.color}])) as Record<keyof typeof GENERAL_KINDS, Kind>;
const ROAD_PRESETS = Object.fromEntries(Object.entries(ROAD_KINDS).map(([kind, value]) => [kind, {shape: 'slab', size: [...value.size], color: value.color}])) as Record<keyof typeof ROAD_KINDS, Kind>;
const COMMUNICATION_PRESETS = Object.fromEntries(Object.entries(COMMUNICATION_KINDS).map(([kind, value]) => [kind, {shape: 'art', size: [...value.size], color: value.color}])) as Record<keyof typeof COMMUNICATION_KINDS, Kind>;
const AI_PRESETS = Object.fromEntries(Object.entries(AI_KINDS).map(([kind, value]) => [kind, {shape: 'art', size: [...value.size], color: value.color}])) as Record<keyof typeof AI_KINDS, Kind>;
const AUDIO_PRESETS = Object.fromEntries(Object.entries(AUDIO_KINDS).map(([kind, value]) => [kind, {shape: 'art', size: [...value.size], color: value.color}])) as Record<keyof typeof AUDIO_KINDS, Kind>;
export const KINDS = {
  ...COMMUNICATION_PRESETS,
  ...AI_PRESETS,
  ...AUDIO_PRESETS,
  ...Object.fromEntries(Object.entries(MEDIA_KINDS).map(([kind,v])=>[kind,{shape:'art',size:[...v.size],color:v.color}])) as Record<keyof typeof MEDIA_KINDS,Kind>,
  ...ROAD_PRESETS,
  ...GENERAL_PRESETS,
  server: {shape: 'art', size: [1.5, 1.5, 2.3], color: 'lavender'},
  table: {shape: 'art', size: [3.6, 0.5, 2.0], color: 'cream'},
  database: {shape: 'art', size: [1.9, 1.9, 1.7], color: 'mint'},
  storage: {shape: 'art', size: [1.7, 1.7, 1.1], color: 'slate'},
  cache: {shape: 'art', size: [1.6, 1.6, 0.8], color: 'butter'},
  cloud: {shape: 'art', size: [2.4, 2.4, 1.2], color: 'sky'},
  loadbalancer: {shape: 'art', size: [2.2, 2.2, 0.75], color: 'teal'},
  router: {shape: 'art', size: [1.9, 1.3, 0.5], color: 'teal'},
  api: {shape: 'art', size: [1.7, 1.7, 0.8], color: 'peach'},
  queue: {shape: 'art', size: [3.2, 1.2, 0.75], color: 'butter'},
  client: {shape: 'art', size: [2, 1, 1.8], color: 'peach'},
  laptop: {shape: 'art', size: [1.9, 1.4, 1.2], color: 'slate'},
  phone: {shape: 'art', size: [0.9, 0.9, 1.6], color: 'rose'},
  cpu: {shape: 'art', size: [1.6, 1.6, 0.3], color: 'slate'},
  memory: {shape: 'art', size: [2.6, 0.5, 0.75], color: 'mint'},
  globe: {shape: 'art', size: [2, 2, 1.8], color: 'sky'},
  lock: {shape: 'art', size: [1.3, 0.7, 1], color: 'coral'},
  file: {shape: 'art', size: [1.2, 0.8, 1.6], color: 'cream'},
  code: {shape: 'art', size: [2.2, 0.8, 1.5], color: 'lavender'},
  box: {shape: 'art', size: [1.5, 1.5, 1.1], color: 'peach'},
  // everyday / media objects
  tile: {shape: 'art', size: [1.7, 0.4, 1.7], color: 'cream'}, // upright card showing any "icon"
  tv: {shape: 'art', size: [2.4, 1, 2.1], color: 'peach'},
  radio: {shape: 'art', size: [2.1, 0.9, 1.3], color: 'butter'},
  newspaper: {shape: 'art', size: [2.2, 1.6, 0.3], color: 'cream'},
  tower: {shape: 'art', size: [1.4, 1.4, 3.8], color: 'slate'},
  satellite: {shape: 'art', size: [3, 1, 1], color: 'slate'},
  building: {shape: 'art', size: [2, 2, 3], color: 'lavender'},
  book: {shape: 'art', size: [1.8, 1.3, 0.45], color: 'coral'},
  mic: {shape: 'art', size: [0.9, 0.9, 2.2], color: 'slate'},
  camera: {shape: 'art', size: [1.8, 1, 1.2], color: 'slate'},
  billboard: {shape: 'art', size: [3.2, 0.6, 2.8], color: 'cream'},
  // medical / healthcare objects
  hospital: {shape: 'art', size: [2.4, 2.2, 3.2], color: 'cream'},
  doctor: {shape: 'art', size: [1.2, 1.2, 2.4], color: 'sky'},
  bed: {shape: 'art', size: [2.8, 1.6, 1], color: 'slate'},
  ambulance: {shape: 'art', size: [2.8, 1.5, 1.8], color: 'cream'},
  pill: {shape: 'art', size: [1, 1, 1.8], color: 'butter'},
  syringe: {shape: 'art', size: [2.6, 0.6, 0.7], color: 'sky'},
  heartmonitor: {shape: 'art', size: [2.2, 0.9, 2], color: 'slate'},
  microscope: {shape: 'art', size: [1.6, 1.4, 2.4], color: 'slate'},
  testtubes: {shape: 'art', size: [2, 1.2, 1.8], color: 'mint'},
  dna: {shape: 'art', size: [1.4, 1, 2.8], color: 'lavender'},
  // school / education objects
  school: {shape: 'art', size: [3.8, 2.6, 2.4], color: 'cream'},
  teacher: {shape: 'art', size: [3.2, 1.4, 2.4], color: 'sky'},
  desk: {shape: 'art', size: [2.4, 1.6, 1.2], color: 'butter'},
  bookshelf: {shape: 'art', size: [2.2, 0.8, 3], color: 'peach'},
  gradcap: {shape: 'art', size: [1.8, 1.8, 1.2], color: 'slate'},
  backpack: {shape: 'art', size: [1.4, 1, 1.8], color: 'coral'},
  standglobe: {shape: 'art', size: [1.8, 1.8, 2.8], color: 'sky'},
  certificate: {shape: 'art', size: [2.4, 0.4, 1.6], color: 'cream'},
  notebook: {shape: 'art', size: [2.4, 1.6, 0.4], color: 'mint'},
  // finance / money objects
  bank: {shape: 'art', size: [3.2, 2.4, 2.6], color: 'cream'},
  coins: {shape: 'art', size: [1.4, 1.4, 1.6], color: 'butter'},
  wallet: {shape: 'art', size: [2, 1.4, 0.7], color: 'coral'},
  creditcard: {shape: 'art', size: [2.2, 1.4, 0.1], color: 'lavender'},
  atm: {shape: 'art', size: [1.5, 1, 2.8], color: 'slate'},
  safe: {shape: 'art', size: [2, 1.6, 2], color: 'slate'},
  piggybank: {shape: 'art', size: [2, 1.4, 1.6], color: 'rose'},
  cash: {shape: 'art', size: [2.2, 1.4, 0.6], color: 'mint'},
  stockchart: {shape: 'art', size: [3.2, 0.8, 2.4], color: 'cream'},
  calculator: {shape: 'art', size: [1.4, 2, 0.16], color: 'butter'},
  receipt: {shape: 'art', size: [1.2, 0.3, 2.4], color: 'cream'},
  // retail / business objects
  shop: {shape: 'art', size: [3.2, 2, 2.8], color: 'cream'},
  shoppingcart: {shape: 'art', size: [2, 1.4, 1.8], color: 'sky'},
  conveyor: {shape: 'art', size: [3.4, 1.6, 1.6], color: 'slate'},
  register: {shape: 'art', size: [2.4, 1.5, 1.8], color: 'peach'},
  warehouse: {shape: 'art', size: [2.6, 1, 3.2], color: 'slate'},
  pricetag: {shape: 'art', size: [1.8, 0.6, 1.8], color: 'butter'},
  shoppingbag: {shape: 'art', size: [1.6, 1, 2], color: 'coral'},
  factory: {shape: 'art', size: [3.2, 2, 2.8], color: 'slate'},
  officedesk: {shape: 'art', size: [2.8, 1.6, 1.5], color: 'butter'},
  handshake: {shape: 'art', size: [2.4, 1.4, 1.2], color: 'lavender'},
  meetingtable: {shape: 'art', size: [3.4, 2.4, 1], color: 'cream'},
  // transport / logistics objects
  car: {shape: 'art', size: [2.8, 1.5, 1.5], color: 'coral'},
  truck: {shape: 'art', size: [3.4, 1.6, 2], color: 'sky'},
  bus: {shape: 'art', size: [4, 1.6, 2], color: 'butter'},
  train: {shape: 'art', size: [4, 1.6, 1.8], color: 'lavender'},
  airplane: {shape: 'art', size: [4, 2.6, 0.9], color: 'sky'},
  ship: {shape: 'art', size: [4, 1.8, 1.8], color: 'slate'},
  bicycle: {shape: 'art', size: [2.4, 1.4, 1.4], color: 'teal'},
  trafficlight: {shape: 'art', size: [0.8, 0.8, 2.6], color: 'slate'},
  fuelpump: {shape: 'art', size: [1.6, 1.2, 2.4], color: 'coral'},
  mappin: {shape: 'art', size: [1.6, 0.5, 2.4], color: 'coral'},
  // journalism / newsroom objects
  reporter: {shape: 'art', size: [1.2, 1.2, 2.4], color: 'sky'},
  editor: {shape: 'art', size: [1.8, 1.2, 2.2], color: 'lavender'},
  interview: {shape: 'art', size: [3.6, 1.6, 2.2], color: 'peach'},
  presspass: {shape: 'art', size: [1.4, 0.4, 1.8], color: 'butter'},
  recorder: {shape: 'art', size: [1.4, 1.15, 1.5], color: 'slate'},
  newsdesk: {shape: 'art', size: [3.2, 1.6, 1.4], color: 'butter'},
  newshub: {shape: 'art', size: [3.4, 2.4, 2.6], color: 'lavender'},
  sourcedocs: {shape: 'art', size: [2, 1.4, 0.5], color: 'cream'},
  user: {shape: 'person', size: [0.8, 0.8, 1], color: 'sky'},
  people: {shape: 'people', size: [0, 0, 1], color: 'sky'},
  platform: {shape: 'slab', size: [6, 2.4, 0.28], color: 'cream'},
} satisfies Record<string, Kind>;
export const isoKinds = Object.keys(KINDS) as [keyof typeof KINDS, ...(keyof typeof KINDS)[]];
const PERSON_COLORS = ['#9fc4ec', '#f4c178', '#c9b6ec', '#9ed3a8', '#f2a37d', '#f3b9c6'];

/* ---------------------------------------------------------------------------- schema */

const fraction = z.number().min(0).max(1); // of the scene's length (scenes stretch to fit the narration)
const objectSchema = z.object({
  table: tableSchema.optional(),
  lookup: lookupState.optional(),
  badge: badgeSchema.optional(),
  id: z.string().min(1),
  kind: z.enum(isoKinds).default('box'),
  label: z.string().max(24).optional(),
  at: z.tuple([z.number().min(-20).max(30), z.number().min(-20).max(30)]), // grid position [x, y]
  z: z.number().min(0).max(8).optional(), // height above the ground (e.g. on a platform: 0.3)
  size: z.tuple([z.number().min(0.2).max(30), z.number().min(0.2).max(30), z.number().min(0.1).max(6)]).optional(), // [w, d, h]
  color: z.enum(isoColorNames).optional(),
  count: z.number().int().min(1).max(60).optional(), // people
  status: z.number().min(0).max(100).optional(), // shows a ⚙ ▬ 59% pill
  appearAt: fraction.optional(), // default: objects drop in one after another in the first third
  enter: z.enum(['drop', 'none']).default('drop'), // none: reveal settled at appearAt, or from the start
  ghost: z.boolean().default(false), // keeps its place in the layout but is not drawn (continuations)
  highlight: z.boolean().default(false), // starts highlighted (carried over from the previous scene)
  design: z.string().max(64).regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/).optional(),
  faces: z.array(z.object({
    fill: z.union([z.enum(isoColorNames), z.literal('ink')]),
    shade: z.number().min(-0.5).max(0.6).default(0), // lighter (> 0) or darker (< 0), like built-in faces
    points: z.array(z.tuple([z.number().int().min(2).max(98), z.number().int().min(2).max(98)])).min(3).max(32),
  })).min(2).max(48).optional(),
  // icon shown by kind "tile" (any Lucide icon name: "megaphone", "graduation-cap", "thumbs-up", ...)
  icon: z.string().max(40).refine((n) => iconByName(n) !== undefined, {message: 'unknown icon name; use a Lucide icon such as "megaphone", "users", "message-circle", "graduation-cap"'}).optional(),
}).strict().refine(ob => !ob.design || ob.kind === 'tile', {path: ['kind'], message: 'custom designs use kind tile'});

const linkSchema = z.object({
  from: z.string(),
  to: z.string(),
  label: z.string().max(22).optional(),
  flow: z.enum(['dots', 'people', 'car', 'key', 'coin', 'wave', 'none']).default('dots'), // what travels along the arrow
  via: z.string().min(1).optional(),
  noise: z.boolean().optional(),
  transform: z.literal('clean').optional(),
  drop: z.boolean().optional(),
  replyAfter: z.number().gt(0).lt(1).optional(), // fraction of visible link time spent on the request
  returnLabel: z.string().max(22).optional(),
  bidirectional: z.boolean().optional(), // a return lane from the target to the source
  dashed: z.boolean().default(false),
  appearAt: fraction.optional(), // default: when both ends have landed
  enter: z.enum(['draw', 'none']).default('draw'), // carried links are already drawn; an explicit cue starts a new connection
}).strict();

type DiagramLink = z.output<typeof linkSchema>;
function linkLegs(links: DiagramLink[]): DiagramLink[] {
  return links.flatMap(link => link.via ? [
    {...link, to:link.via, via:undefined, bidirectional:false, returnLabel:undefined, replyAfter:undefined},
    {...link, from:link.via, via:undefined},
  ] : [link]);
}

// Planners often write a synonym or an icon name as the kind ("users", "microphone", "printer"):
// map synonyms to the real kind, and any other Lucide icon name to a tile showing that icon.
const KIND_ALIASES: Record<string, string> = {
  'parliament-building':'parliament','ballot-box':'ballotbox','campaign-rally':'campaignrally','public-meeting':'publicmeeting','protest-placard':'protestplacard','government-information-office':'governmentoffice','government-office':'governmentoffice',

  'press-release':'pressrelease','press-release-document':'pressrelease','podium-with-microphones':'podium','press-conference':'pressconference','media-kit':'mediakit','crisis-response-centre':'crisiscentre','crisis-response-center':'crisiscentre',crisiscenter:'crisiscentre',

  'studio-camera': 'studiocamera',
  'tripod-camera': 'studiocamera',
  'anchor-desk': 'newsdesk',
  'anchordesk': 'newsdesk',
  'studio-lights': 'studiolights',
  'control-room-monitors': 'controlmonitors',
  'outside-broadcast-van': 'obvan',
  'ob-van': 'obvan',
  'cinema-projector': 'cinemaprojector',
  'cinema-screen': 'cinemascreen',
  'film-reel': 'filmreel',
  'editing-timeline': 'editingtimeline',
  'theatre-stage': 'theatrestage',
  'theater-stage': 'theatrestage',
  'social-post': 'socialpost',
  'scrolling-feed': 'scrollingfeed',
  'video-player': 'videoplayer',
  'livestream-window': 'livestream',
  'share': 'repost',
  'share-repost': 'repost',
  'product-display': 'productdisplay',
  'campaign-board': 'campaignboard',
  'sponsored-post': 'sponsoredpost',
  'ad-placement': 'adplacement',
  'subscription': 'paywall',
  'subscription-paywall': 'paywall',
  'advertiser-publisher-payment-flow': 'adpayment',
  'payment-flow': 'adpayment',

  message: 'envelope', 'message-envelope': 'envelope', 'sender-station': 'sender', 'receiver-station': 'receiver',
  'feedback-loop': 'feedback', feedbackloop: 'feedback', interference: 'noise', 'noise-interference': 'noise',
  home: 'house', 'bar-chart': 'chart', 'chart-bar': 'chart', barchart: 'chart',
  'pie-chart': 'piechart', 'chart-pie': 'piechart', 'chat-bubble': 'chatbubble', chat: 'chatbubble', 'message-circle': 'chatbubble',
  'sun-and-cloud': 'weather', 'partly-cloudy': 'weather', bulb: 'lightbulb', 'light-bulb': 'lightbulb',
  cog: 'gear', search: 'magnifier', 'magnifying-glass': 'magnifier', 'warning-sign': 'warning',
  'check-badge': 'checkmark', check: 'checkmark', 'cross-badge': 'cross', 'x-badge': 'cross',
  cook: 'chef', 'construction-worker': 'worker', 'police-officer': 'police',
  users: 'people', crowd: 'people', audience: 'people', group: 'people', persons: 'people', team: 'people',
  person: 'user', human: 'user', man: 'user', woman: 'user', reporter: 'user', editor: 'user', student: 'user',
  microphone: 'mic', television: 'tv', monitor: 'client', computer: 'client', desktop: 'client', screen: 'client',
  // medical synonyms (aliases only apply to names that are not real kinds)
  'patient-bed': 'bed', patientbed: 'bed', hospitalbed: 'bed', 'hospital-bed': 'bed', patient: 'user',
  'pill-bottle': 'pill', pillbottle: 'pill', medicine: 'pill', medication: 'pill',
  'heart-monitor': 'heartmonitor', ecg: 'heartmonitor', ekg: 'heartmonitor', pulse: 'heartmonitor',
  testtube: 'testtubes', 'test-tube': 'testtubes', 'testtube-rack': 'testtubes', tubes: 'testtubes',
  helix: 'dna', genes: 'dna', genome: 'dna', surgeon: 'doctor', nurse: 'doctor',
  // school synonyms (aliases only apply to names that are not real kinds)
  schoolhouse: 'school', 'white-board': 'teacher', whiteboard: 'teacher', blackboard: 'teacher', chalkboard: 'teacher', professor: 'teacher', instructor: 'teacher',
  'student-desk': 'desk', studentdesk: 'desk', 'classroom-desk': 'desk', 'school-desk': 'desk',
  bookcase: 'bookshelf', shelf: 'bookshelf',
  'graduation-cap': 'gradcap', graduationcap: 'gradcap', mortarboard: 'gradcap', 'graduation-hat': 'gradcap',
  rucksack: 'backpack', schoolbag: 'backpack',
  'globe-stand': 'standglobe', 'globe-on-a-stand': 'standglobe', globestand: 'standglobe',
  diploma: 'certificate', scroll: 'certificate', award: 'certificate',
  pencil: 'notebook', 'pencil-and-notebook': 'notebook', pencilnotebook: 'notebook', 'notebook-and-pencil': 'notebook', notepad: 'notebook',
  // finance synonyms (aliases only apply to names that are not real kinds)
  'bank-building': 'bank', 'coin-stack': 'coins', coinstack: 'coins', 'stack-of-coins': 'coins',
  'credit-card': 'creditcard', 'atm-machine': 'atm', 'cash-machine': 'atm',
  vault: 'safe', 'safe-box': 'safe', 'piggy-bank': 'piggybank', pig: 'piggybank',
  'cash-bundle': 'cash', banknotes: 'cash', bills: 'cash', money: 'cash',
  'stock-chart': 'stockchart', 'chart-board': 'stockchart', 'rising-chart': 'stockchart', stocks: 'stockchart',
  'pocket-calculator': 'calculator', 'sales-receipt': 'receipt', bill: 'receipt', invoice: 'receipt',
  // retail / business synonyms
  'store-front': 'shop', store: 'shop', market: 'shop', boutique: 'shop',
  cart: 'shoppingcart', trolley: 'shoppingcart',
  'conveyor-belt': 'conveyor', 'delivery-package': 'conveyor',
  'cash-register': 'register', checkout: 'register', 'checkout-counter': 'register',
  'storage-shelves': 'warehouse', 'price-label': 'pricetag',
  'shopping-bag': 'shoppingbag', tote: 'shoppingbag', plant: 'factory',
  'office-workstation': 'officedesk', workstation: 'officedesk', 'hand-shake': 'handshake', 'shaking-hands': 'handshake',
  'conference-table': 'meetingtable', 'boardroom-table': 'meetingtable',
  // transport / logistics synonyms
  vehicle: 'car', automobile: 'car', sedan: 'car',
  lorry: 'truck', 'delivery-truck': 'truck',
  street: 'twolane', lane: 'singlelane', 'single-lane': 'singlelane', 'single-lane-road': 'singlelane',
  'two-lane': 'twolane', 'two-lane-road': 'twolane', 'four-lane': 'fourlane', 'four-lane-road': 'fourlane',
  motorway: 'highway', freeway: 'highway', 'divided-highway': 'highway',
  coach: 'bus', 'school-bus': 'bus',
  railway: 'train', locomotive: 'train',
  plane: 'airplane', aircraft: 'airplane',
  boat: 'ship', vessel: 'ship',
  bike: 'bicycle', cycle: 'bicycle',
  'traffic-signal': 'trafficlight', stoplight: 'trafficlight',
  'gas-pump': 'fuelpump', 'petrol-pump': 'fuelpump', 'gas-station': 'fuelpump',
  'map-pin': 'mappin', pin: 'mappin', location: 'mappin', 'location-pin': 'mappin',
  // journalism / newsroom synonyms
  journalist: 'reporter', correspondent: 'reporter', newsreader: 'reporter',
  'news-editor': 'editor', copyeditor: 'editor', proofreader: 'editor',
  'interview-setup': 'interview', 'press-pass': 'presspass', badge: 'presspass', credentials: 'presspass',
  'voice-recorder': 'recorder', 'tape-recorder': 'recorder',
  'newsroom-desk': 'newsdesk', 'news-desk': 'newsdesk',
  'news-agency': 'newshub', 'agency-hub': 'newshub', 'press-agency': 'newshub',
  'source-documents': 'sourcedocs', 'source-docs': 'sourcedocs', documents: 'sourcedocs', dossier: 'sourcedocs',
  // AI and emerging-media synonyms
  'ai-label': 'aigeneratedlabel', 'ai-generated': 'aigeneratedlabel', aigenerated: 'aigeneratedlabel',
  'ai-content-label': 'aigeneratedlabel', 'ai-generated-content': 'aigeneratedlabel', 'content-label': 'aigeneratedlabel',
  'synthetic-voice': 'aivoice', syntheticvoice: 'aivoice', voiceclone: 'aivoice', 'voice-clone': 'aivoice', 'cloned-voice': 'aivoice',
  'ai-voice': 'aivoice', 'speech-synthesis': 'aivoice', tts: 'aivoice', 'text-to-speech': 'aivoice', 'voice-ai': 'aivoice',
  'altered-image': 'alteredimage', 'altered-image-comparison': 'alteredimage', 'image-comparison': 'alteredimage', imagecompare: 'alteredimage',
  'edited-photo': 'alteredimage', 'photo-edit': 'alteredimage', deepfake: 'alteredimage', 'before-after-photo': 'alteredimage',
  'recommendation-system': 'recommendation', recommendations: 'recommendation', recommender: 'recommendation',
  'algorithm-feed': 'recommendation', feed: 'recommendation', 'suggested-content': 'recommendation',
  'verification-panel': 'verified', verification: 'verified', provenance: 'verified', 'provenance-panel': 'verified', authenticity: 'verified',
  'fact-check': 'verified', 'fact-checked': 'verified', 'content-credentials': 'verified', 'metadata-panel': 'verified', verify: 'verified',
  // radio, audio and podcast synonyms
  headphone: 'headphones', headset: 'headphones', 'ear-cups': 'headphones', 'over-ear-headphones': 'headphones',
  mixer: 'mixingconsole', 'mixing-desk': 'mixingconsole', 'mixer-console': 'mixingconsole', 'sound-board': 'mixingconsole',
  soundboard: 'mixingconsole', 'audio-console': 'mixingconsole', 'audio-mixer': 'mixingconsole',
  'boom-mic': 'boommic', 'boom-microphone': 'boommic', 'mic-boom': 'boommic', 'shotgun-mic': 'boommic', 'boom-arm': 'boommic',
  loudspeaker: 'speaker', 'studio-monitor': 'speaker', 'monitor-speaker': 'speaker', 'audio-speaker': 'speaker', hifi: 'speaker',
  'audio-recorder': 'audiorecorder', 'field-recorder': 'audiorecorder', 'digital-recorder': 'audiorecorder',
  'sound-recorder': 'audiorecorder', dictaphone: 'audiorecorder',
  podcast: 'podcastbooth', 'podcast-studio': 'podcastbooth', 'podcast-room': 'podcastbooth',
  'recording-booth': 'podcastbooth', 'studio-booth': 'podcastbooth', booth: 'podcastbooth',
  smartphone: 'phone', mobile: 'phone', 'cell-tower': 'tower', 'radio-tower': 'tower', antenna: 'tower', mast: 'tower',
  document: 'file', paper: 'newspaper', news: 'newspaper', magazine: 'newspaper', office: 'building', company: 'building',
  studio: 'building', newsroom: 'building', advert: 'billboard', ad: 'billboard', poster: 'billboard',
  package: 'box', parcel: 'box', chip: 'cpu', db: 'database', disk: 'storage', earth: 'globe', world: 'globe', padlock: 'lock',
  'load-balancer': 'loadbalancer', balancer: 'loadbalancer', stage: 'platform',
};
const fixKind = (raw: unknown) => {
  if (!raw || typeof raw !== 'object') return raw;
  const o = raw as Record<string, unknown>;
  if (typeof o.kind !== 'string' || o.kind in KINDS) return raw;
  const k = o.kind.trim().toLowerCase().replace(/[\s_]+/g, '-');
  if (k in KINDS) return {...o, kind: k};
  if (KIND_ALIASES[k]) return {...o, kind: KIND_ALIASES[k]};
  if (iconByName(k)) return {...o, kind: 'tile', icon: o.icon ?? k};
  return raw; // unknown: the enum error lists the real kinds
};

const stepSchema = z.object({
  ...cueFields,
  reply: z.string().regex(/^[^→]+→[^→]+$/).optional(),
  lookup: lookupState.optional(),
  badge: badgeSchema.optional(),
  at: fraction, // when, as a fraction of the scene (0.5 = halfway through the narration)
  target: z.string(), // object id
  status: z.number().min(0).max(100).optional(), // animate the pill to this value
  highlight: z.boolean().optional(), // lift + glow (false to stop)
  label: z.string().max(24).optional(),
  color: z.enum(isoColorNames).optional(),
  hide: z.boolean().optional(),
  note: z.string().max(80).optional(), // speech bubble above the target (one note on screen at a time)
  focus: z.boolean().optional(), // camera moves in on the target (false: back out)
  // sound for this moment; default picks one from what happens (hide: remove, overload: alert,
  // highlight: chime, focus: rise, note: blip); "none" = silent
  sound: z.union([z.enum(sfxNames), z.literal('none')]).optional(),
}).strict();

// The default example (also the preview): a crowd on a platform sending requests to two servers.
const EXAMPLE_OBJECTS: z.output<typeof objectSchema>[] = [
  {id: 'stage', kind: 'platform', at: [0, 0], size: [8, 2.6, 0.3], enter: 'drop', ghost: false, highlight: false},
  {id: 'users', kind: 'people', at: [1.6, 0.35], z: 0.3, count: 22, label: 'Users', enter: 'drop', ghost: false, highlight: false},
  {id: 'a', kind: 'server', label: 'Server A', at: [4.4, -5], status: 59, enter: 'drop', ghost: false, highlight: false},
  {id: 'b', kind: 'server', label: 'Server B', at: [9.6, -3.2], status: 59, enter: 'drop', ghost: false, highlight: false},
];
const EXAMPLE_LINKS: z.output<typeof linkSchema>[] = [
  {from: 'users', to: 'a', flow: 'dots', dashed: false, enter: 'draw'},
  {from: 'users', to: 'b', flow: 'dots', dashed: false, enter: 'draw'},
];
const EXAMPLE_STEPS: z.output<typeof stepSchema>[] = [
  {at: 0.45, target: 'a', status: 94, note: 'Server A is almost full'},
  {at: 0.7, target: 'b', highlight: true, status: 72, note: 'New requests go to B'},
];

export const isoSceneSchema = z.object({
  eyebrow: z.string().max(40).optional(),
  title: z.string().max(80).optional(),
  subtitle: z.string().max(140).optional(),
  objects: z.array(z.preprocess(fixKind, objectSchema)).max(24).default(() => EXAMPLE_OBJECTS),
  links: z.array(linkSchema).max(30).default(() => EXAMPLE_LINKS),
  steps: z.array(stepSchema).max(40).default(() => EXAMPLE_STEPS),
  points: z.array(z.string().max(70)).max(4).optional(), // short note cards beside the diagram
  exampleLines: z.array(z.object({
    text: z.string().min(1).max(72), at: fraction,
  }).strict()).min(1).max(4).optional(),
  zoom: z.number().min(0.5).max(1.6).default(1),
  sound: z.boolean().default(true),
  continued: z.boolean().optional(), // set by the backend: this scene continues the previous picture
  continue: z.boolean().optional(), // planner shorthand, expanded by the backend before rendering
  remove: z.array(z.string()).optional(), // with continue: ids to drop from the previous picture
}).strict().superRefine((p, ctx) => {
  p.exampleLines?.forEach((line, i, lines) => {
    if ((i === 0 && line.at !== 0) || (i > 0 && line.at < lines[i - 1].at)) {
      ctx.addIssue({code: 'custom', path: ['exampleLines', i, 'at'],
        message: 'Start the written example at frame zero and reveal later lines in reading order.'});
    }
  });
  const ids = new Set<string>();
  p.objects.forEach((o, i) => {
    if (ids.has(o.id)) ctx.addIssue({code: 'custom', path: ['objects', i, 'id'], message: `duplicate id "${o.id}"`});
    ids.add(o.id);
  });
  p.links.forEach((l, i) => {
    for (const k of ['from', 'to', 'via'] as const) {
      const id = l[k];
      if (id !== undefined && !ids.has(id)) ctx.addIssue({code: 'custom', path: ['links', i, k], message: `no object with id "${id}"`});
    }
    if (l.via && (l.via === l.from || l.via === l.to || l.from === l.to)) {
      ctx.addIssue({code:'custom',path:['links',i,'via'],message:'Use three distinct objects for a two-step link.'});
    }
  });
  const legs = linkLegs(p.links);
  p.steps.forEach((s, i) => {
    if (s.reply) {
      const [sender, recipient] = s.reply.split('→').map(id => id.trim());
      if (sender !== s.target || !legs.some(link => link.from === recipient && link.to === sender))
        ctx.addIssue({code:'custom', path:['steps',i,'reply'], message:'Reply must start at the step target and reverse an existing request link.'});
    }
    if (!ids.has(s.target)) ctx.addIssue({code: 'custom', path: ['steps', i, 'target'], message: `no object with id "${s.target}"`});
  });
  // objects must not cover each other on screen (status pills need room above, too)
  const solid = p.objects.map((o, i) => ({o, i, g: geometry(o)})).filter(({o, g}) => g.shape !== 'slab' && !o.ghost);
  const rects = solid.map(({o, g}) => {
    const r = rectOf(outline(g, 1, {x: 0, y: 0}));
    return o.status !== undefined || p.steps.some((s) => s.target === o.id && s.status !== undefined) ? {...r, t: r.t - 0.75} : r;
  });
  for (let a = 0; a < solid.length; a++) for (let b = a + 1; b < solid.length; b++) {
    const share = overlapArea(rects[a], rects[b]) / Math.min(area(rects[a]), area(rects[b]));
    if (share > 0.25) ctx.addIssue({code: 'custom', path: ['objects', solid[b].i, 'at'],
      message: `"${solid[b].o.id}" covers "${solid[a].o.id}" on screen (${Math.round(share * 100)}% overlap); move them at least 3 grid units further apart (a screen-horizontal row is [0,0], [3.5,-3.5], [7,-7]; a column is [0,0], [2.5,2.5])`});
  }
});

export const description =
  'Place kind table with table:{name,columns,rows,indexed?,locked?,duplicateKey?} next to a database to show the actual records. ' +
  'Timed steps support timer, count, meter, progress, ttl, retry, queue, think, react, say and mood. A reply step such as cache→app returns on an existing request link. Links can clean or drop packets and carry keys or coins. ' +
  'Use badge on objects or timed steps for animated lookup, worker, access or health states. Use none to clear, or {icon,text,tone} for a custom Lucide badge. ' +
  'Media badges cover broadcast, editorial review, verification, attribution, embargo and signal loss. Change embargo to released in a timed step to open the lock. ' +
  'Media steps can animate reach, engage, compare (saw it vs understood it), rating, revenue, trust, cycle, sentiment and survey. Sentiment is [positive,neutral,negative] and must total 100. ' +
  'Media links support flow:"wave", via:"leader", noise:true and dashed feedback. Timed spread uses outgoing links up to depth; gate uses a link into and out of the editor. ' +
  'Use frame:[before,after], agenda ordered by coverage priority, bubble, race with rumour and correction speeds, attention, opinion:{from,to}, split:[a,b], or headline updates. Target people for crowd changes. ' +
  'Show both sides of race and compare together, distinguish attention or sharing from belief, and identify illustrative statistics as example numbers in narration. ' +
  'Use links[].bidirectional=true for two-way traffic. Label the outbound arrow with label and the reverse arrow with returnLabel. Set replyAfter (e.g. 0.5) to play them in sequence. ' +
  'Isometric "paper" diagram: 3D-looking servers, databases, caches, clouds, people, medical objects (hospital, ' +
  'doctor, patient bed, ambulance, pill bottle, syringe, heart monitor, microscope, test tubes, DNA), school objects ' +
  '(school, teacher with whiteboard, student desk, bookshelf, graduation cap, backpack, globe on a stand, certificate, ' +
  'pencil and notebook), finance objects (bank, coin stack, wallet, credit card, ATM, safe, piggy bank, cash bundle, ' +
  'stock chart board, calculator, receipt), retail and business objects (shop, shopping cart, delivery parcel on a ' +
  'conveyor, cash register, warehouse, price tag, shopping bag, factory, office desk, handshake, meeting table) and ' +
  'transport objects (car, truck, road, bus, train, airplane, ship, bicycle, traffic light, fuel pump, map pin), all ' +
  'plus everyday objects (house, tree, clock, animated bar and pie charts, chat bubble, sun, weather, trophy, flag, ' +
  'lightbulb, gear, magnifier, warning, checkmark, cross) and role figures (chef, worker, police). AI and emerging ' +
  'media objects include an AI-generated-content label, synthetic voice, altered-image comparison, recommendation ' +
  'Politics and public affairs: parliament, ballotbox, campaignrally, publicmeeting, protestplacard, governmentoffice. ' +
  'Public relations: pressrelease, podium, pressconference, spokesperson, mediakit, crisiscentre. ' +
  'TV and film: studiocamera, teleprompter, studiolights, controlmonitors, obvan, clapperboard, cinemaprojector, cinemascreen, filmreel, storyboard, editingtimeline, theatrestage. Digital: socialpost, scrollingfeed, videoplayer, livestream, comments, repost, notification, hashtag. Advertising: productdisplay, campaignboard, sponsoredpost, adplacement, paywall, adpayment. ' +
  'system and verified-content panel. Radio, audio and podcast objects include headphones, a mixing console, a boom ' +
  'microphone, a studio speaker, a field recorder and a podcast booth. Clocks and gears turn, charts grow, ECG traces pulse, ambulance lights ' +
  'flash, and links support car flow. All objects are dropping in and animating on a paper grid. Communication ' +
  'fundamentals include envelope, sender, receiver, encoder, decoder, feedback loop and noise interference. Steps ' +
  '(timed as a fraction of the narration) change loads (⚙ 59% pills), highlight, add notes and move the camera. Use for ' +
  'systems, architecture, flows, networking, scaling, how-things-work, healthcare, education, finance, retail, logistics, ' +
  'journalism, newsrooms, AI, synthetic media, misinformation and media literacy. With no objects it is a paper title ' +
  'card (title, subtitle, points).';
export const tags = ['isometric', 'iso', 'diagram', 'architecture', 'system design', 'server', 'database', 'cache',
  'load balancer', 'scaling', 'cloud', 'users', 'flow', 'paper', '3d', 'infographic',
  'medical', 'healthcare', 'hospital', 'doctor', 'patient', 'ambulance', 'medicine', 'dna', 'science',
  'education', 'school', 'teacher', 'student', 'classroom', 'books', 'graduation', 'backpack',
  'finance', 'money', 'bank', 'coins', 'wallet', 'credit card', 'atm', 'safe', 'piggy bank', 'cash', 'stocks', 'chart',
  'retail', 'business', 'shop', 'cart', 'conveyor', 'warehouse', 'factory', 'office', 'meeting', 'handshake',
  'transport', 'logistics', 'car', 'truck', 'road', 'bus', 'train', 'airplane', 'ship', 'bicycle', 'map pin',
  'journalism', 'news', 'newsroom', 'reporter', 'editor', 'interview', 'press pass', 'recorder', 'documents',
  'ai', 'artificial intelligence', 'generated content', 'synthetic media', 'deepfake', 'synthetic voice',
  'recommendation', 'algorithm', 'verification', 'verified', 'provenance', 'ai voice', 'misinformation', 'media literacy',
  'radio', 'audio', 'podcast', 'podcasting', 'headphones', 'mixing console', 'mixer', 'boom mic', 'microphone',
  'speaker', 'loudspeaker', 'audio recorder', 'field recorder', 'recording studio', 'booth', 'on air'];

type Props = z.infer<typeof isoSceneSchema>;
type Obj = Props['objects'][number];

/* --------------------------------------------------------------------------- helpers */

type Box3 = {x: number; y: number; z: number; w: number; d: number; h: number; shape: Kind['shape']; kind: Kind};

const geometry = (o: Obj): Box3 => {
  const kind = KINDS[o.kind] as Kind;
  let [w, d, h] = o.size ?? kind.size;
  if (kind.shape === 'people') {
    const n = o.count ?? 12, cols = Math.ceil(Math.sqrt(n * 1.6));
    w = cols * 0.62;
    d = Math.ceil(n / cols) * 0.62;
    h = 1;
  }
  return {x: o.at[0], y: o.at[1], z: o.z ?? 0, w, d, h, shape: kind.shape, kind};
};

const crowd = (g: Box3, n: number) => {
  const cols = Math.ceil(Math.sqrt(n * 1.6));
  return Array.from({length: n}, (_, i) => ({gx: g.x + 0.31 + (i % cols) * 0.62, gy: g.y + 0.31 + Math.floor(i / cols) * 0.62, i}))
    .sort((a, b) => a.gx + a.gy - (b.gx + b.gy));
};

/** Screen outline of an object (polygon) for tile size T, origin o; z = its current height. */
const outline = (g: Box3, T: number, o: Pt, zz = g.z): Pt[] => {
  const P = (a: number, b: number, c: number) => project(a, b, c, T, o);
  const {x, y, w, d, h} = g;
  if (g.kind === KINDS.table) {
    const center = P(x + w / 2, y + d / 2, zz + h / 2);
    const halfWidth = (w + d) * C30 * T / 2;
    const halfHeight = h * T / 2;
    return [{x:center.x-halfWidth,y:center.y-halfHeight},{x:center.x+halfWidth,y:center.y-halfHeight},
      {x:center.x+halfWidth,y:center.y+halfHeight},{x:center.x-halfWidth,y:center.y+halfHeight}];
  }
  if (false) {
    const r = Math.min(w, d) / 2, c0 = P(x + w / 2, y + d / 2, zz), c1 = P(x + w / 2, y + d / 2, zz + h);
    const rx = Math.SQRT2 * r * C30 * T, ry = Math.SQRT2 * r * S30 * T;
    const top = Array.from({length: 9}, (_, k) => {const t = Math.PI + (Math.PI * k) / 8; return {x: c1.x + rx * Math.cos(t), y: c1.y + ry * Math.sin(t)};});
    const bot = Array.from({length: 9}, (_, k) => {const t = (Math.PI * k) / 8; return {x: c0.x + rx * Math.cos(t), y: c0.y + ry * Math.sin(t)};});
    return [...top, ...bot];
  }
  if (g.shape === 'people' || g.shape === 'person') {
    const pts = [P(x, y, zz), P(x + w, y, zz), P(x + w, y + d, zz), P(x, y + d, zz), P(x, y, zz + 1.1), P(x + w, y, zz + 1.1)];
    const xs = pts.map((q) => q.x), ys = pts.map((q) => q.y);
    const [l, r, t, b] = [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)];
    return [{x: l, y: t}, {x: r, y: t}, {x: r, y: b}, {x: l, y: b}];
  }
  return [P(x, y, zz + h), P(x + w, y, zz + h), P(x + w, y, zz), P(x + w, y + d, zz), P(x, y + d, zz), P(x, y + d, zz + h)];
};

type Rect = {l: number; t: number; r: number; b: number};
const rectOf = (pts: Pt[]): Rect => ({l: Math.min(...pts.map((q) => q.x)), r: Math.max(...pts.map((q) => q.x)), t: Math.min(...pts.map((q) => q.y)), b: Math.max(...pts.map((q) => q.y))});
const overlapArea = (a: Rect, b: Rect) => Math.max(0, Math.min(a.r, b.r) - Math.max(a.l, b.l)) * Math.max(0, Math.min(a.b, b.b) - Math.max(a.t, b.t));
const area = (a: Rect) => (a.r - a.l) * (a.b - a.t);

/** Where the segment from `from` (inside) to `to` leaves polygon `poly` (the point nearest `to`). */
const exitPoint = (polyPts: Pt[], from: Pt, to: Pt): Pt => {
  let best: Pt | null = null, bestT = -1;
  for (let i = 0; i < polyPts.length; i++) {
    const a = polyPts[i], b = polyPts[(i + 1) % polyPts.length];
    const dx = to.x - from.x, dy = to.y - from.y, ex = b.x - a.x, ey = b.y - a.y;
    const den = dx * ey - dy * ex;
    if (Math.abs(den) < 1e-9) continue;
    const t = ((a.x - from.x) * ey - (a.y - from.y) * ex) / den, v = ((a.x - from.x) * dy - (a.y - from.y) * dx) / den;
    if (t >= 0 && t <= 1 && v >= 0 && v <= 1 && t > bestT) {bestT = t; best = {x: from.x + dx * t, y: from.y + dy * t};}
  }
  return best ?? from;
};

/** Push apart objects that cover each other on screen (status pills count as part of the object),
 *  so a plan never shows overlaps even when its positions are a little too close. */
const separate = (input: Box3[], tall: boolean[], ids: string[]): Box3[] => {
  const gs = input.map((g) => ({...g}));
  const pad = 0.22;
  const rect = (i: number) => {
    const r = rectOf(outline(gs[i], 1, {x: 0, y: 0}));
    return {l: r.l - pad, r: r.r + pad, t: r.t - pad - (tall[i] ? 0.7 : 0), b: r.b + pad + 0.5}; // + room for the label underneath
  };
  for (let it = 0; it < 120; it++) {
    let moved = false;
    // fixed order (by id): a continued scene lists objects in another order but must get the same layout
    const order = gs.map((_, i) => i).sort((x, y) => (ids[x] < ids[y] ? -1 : ids[x] > ids[y] ? 1 : 0));
    for (let ai = 0; ai < order.length; ai++) for (let bi = ai + 1; bi < order.length; bi++) {
      const a = order[ai], b = order[bi];
      if (gs[a].shape === 'slab' || gs[b].shape === 'slab') continue;
      const ra = rect(a), rb = rect(b);
      const ox = Math.min(ra.r, rb.r) - Math.max(ra.l, rb.l), oy = Math.min(ra.b, rb.b) - Math.max(ra.t, rb.t);
      if (ox <= 0 || oy <= 0) continue;
      const cax = (ra.l + ra.r) / 2, cbx = (rb.l + rb.r) / 2, cay = (ra.t + ra.b) / 2, cby = (rb.t + rb.b) / 2;
      // move along the cheaper screen axis, half each
      const [dx, dy] = ox < oy ? [(cbx >= cax ? 1 : -1) * (ox / 2 + 0.02), 0] : [0, (cby >= cay ? 1 : -1) * (oy / 2 + 0.02)];
      const gx = (dx / C30 + dy / S30) / 2, gy = (dy / S30 - dx / C30) / 2;
      gs[b].x += gx; gs[b].y += gy; gs[a].x -= gx; gs[a].y -= gy;
      moved = true;
    }
    if (!moved) break;
  }
  return gs;
};

/** Value of a property that steps change over time, with a spring between values. */
const track = <T,>(initial: T, changes: {f: number; v: T}[], frame: number, fps: number, blend: (a: T, b: T, t: number) => T): T => {
  let value = initial;
  for (const c of changes) {
    if (frame < c.f) break;
    const t = spring({frame: frame - c.f, fps, config: {damping: 18, stiffness: 90}});
    value = blend(value, c.v, Math.min(1, t));
  }
  return value;
};
const num = (a: number, b: number, t: number) => a + (b - a) * t;

/* ----------------------------------------------------------------------------- scene */

/** When set, IsoScene draws only its diagram inside this box (no paper, grid or title): used by ScreenScene's split view. */
export const IsoRegion = createContext<{left: number; right: number; top: number} | null>(null);

export const IsoScene: React.FC<z.input<typeof isoSceneSchema>> = (input) => {
  const region = useContext(IsoRegion);
  const stageId = useId();
  const p = isoSceneSchema.parse(input);
  const links = linkLegs(p.links);
  const f = useCurrentFrame();
  const {fps, width: W, height: H} = useVideoConfig();
  const len = useSceneLength();
  const u = useUnit();
  const sw = 3 * u;

  const hasTitle = !region && Boolean(p.title || p.eyebrow);
  const example = !region && p.objects.length ? p.exampleLines : undefined;
  const stacked = Boolean(example && W <= H);
  const cards = region || example ? [] : p.points ?? [];
  const onlyCard = !region && p.objects.length === 0;

  // ---------- layout: fit every object (+ room for pills/notes) into the free area
  const tall = p.objects.map(() => true); // pill room for every object, so the layout depends only on positions (continued scenes match)
  const geos = separate(p.objects.map(geometry), tall, p.objects.map((ob) => ob.id));
  const headingBottom = region ? region.top : hasTitle ? (p.subtitle ? 250 : 205) * u : 80 * u;
  const top = stacked ? headingBottom + 320 * u : headingBottom;
  const bottom = H - 200 * u; // captions live below
  const right = region ? region.right : cards.length ? W - 600 * u : W - 90 * u;
  const left = region ? region.left : example && !stacked ? W * 0.46 : 90 * u;
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  geos.forEach((g, i) => {
    for (const [a, b] of [[g.x, g.y], [g.x + g.w, g.y], [g.x + g.w, g.y + g.d], [g.x, g.y + g.d]]) {
      for (const c of [g.z, g.z + g.h]) {
        const q = project(a, b, c, 1);
        minX = Math.min(minX, q.x); maxX = Math.max(maxX, q.x); minY = Math.min(minY, q.y); maxY = Math.max(maxY, q.y + (g.shape !== 'slab' && c === g.z ? 0.55 : 0)); // label room for every object: layout must not depend on labels
      }
    }
  });
  const room = 95 * u; // pills and notes above the tallest object
  const T = geos.length
    ? Math.min((right - left) / Math.max(0.1, maxX - minX), (bottom - top - room) / Math.max(0.1, maxY - minY), 120 * u) * p.zoom
    : 80 * u;
  const centre = {x: (left + right) / 2, y: (top + room + bottom) / 2};
  const o: Pt = geos.length ? {x: centre.x - ((minX + maxX) / 2) * T, y: centre.y - ((minY + maxY) / 2) * T} : {x: W / 2, y: H / 2};
  const P = (x: number, y: number, z2: number) => project(x, y, z2, T, o);

  // ---------- timing
  const byId = Object.fromEntries(p.objects.map((ob, i) => [ob.id, i]));
  const fresh = p.objects.filter((ob) => ob.enter === 'drop' && !ob.ghost);
  const startOf = p.objects.map((ob) => ob.enter === 'none' ? -1000
    : example && ob.appearAt !== undefined ? Math.round(ob.appearAt * len) - 12
    : Math.round((ob.appearAt ?? 0.03 + Math.max(0, fresh.indexOf(ob)) * Math.min(0.065, 0.3 / Math.max(1, fresh.length))) * len));
  // A motionless object is already settled when its cue makes it visible.
  const revealAt = p.objects.map((ob, i) => ob.enter === 'none' && ob.appearAt !== undefined
    ? Math.round(ob.appearAt * len) : startOf[i]);
  const stepsFor = (id: string) => p.steps.filter((s) => s.target === id).map((s) => ({...s, f: Math.round(s.at * len)})).sort((a, b) => a.f - b.f);

  const state = p.objects.map((ob, i) => {
    const s = stepsFor(ob.id);
    const drop = spring({frame: f - startOf[i], fps, config: {damping: 11, stiffness: 150, mass: 0.7}});
    const shown = !ob.ghost && f >= revealAt[i];
    const hide = track(0, s.filter((x) => x.hide !== undefined).map((x) => ({f: x.f, v: x.hide ? 1 : 0})), f, fps, num);
    const hl = track(ob.highlight ? 1 : 0, s.filter((x) => x.highlight !== undefined).map((x) => ({f: x.f, v: x.highlight ? 1 : 0})), f, fps, num);
    const status = ob.status === undefined && !s.some((x) => x.status !== undefined) ? undefined
      : track(ob.status ?? 0, s.filter((x) => x.status !== undefined).map((x) => ({f: x.f, v: x.status as number})), f, fps, num);
    const base = ISO_COLORS[ob.color ?? (KINDS[ob.kind] as Kind).color];
    const color = track(base, s.filter((x) => x.color).map((x) => ({f: x.f, v: ISO_COLORS[x.color as IsoColor]})), f, fps, mix);
    const label = [...s].reverse().find((x) => x.label !== undefined && f >= x.f)?.label ?? ob.label;
    const hot = status !== undefined && status >= 88 ? 0.5 + 0.5 * Math.sin(f / 4) : 0;
    const pill = spring({frame: f - startOf[i] - 14, fps, config: {damping: 12}});
    const activeSteps = s.filter(step => step.f <= f).reverse();
    const [lookupStep, previousLookupStep] = activeSteps.filter(step => step.badge !== undefined || step.lookup !== undefined);
    const cycleStep = activeSteps.find(step => step.cycle);
    const attention = activeSteps.find(step => step.attention !== undefined);
    const opinion = activeSteps.find(step => step.opinion);
    const split = activeSteps.find(step => step.split);
    const bubble = activeSteps.find(step => step.bubble !== undefined);
    return {shown, drop, hide, hl, status, color, label, hot, pill,
      attention, opinion, split, bubble,
      gate:activeSteps.find(step => step.gate),
      race:activeSteps.find(step => step.race),
      lookup: lookupStep?.badge ?? lookupStep?.lookup ?? ob.badge ?? ob.lookup,
      previousLookup: previousLookupStep?.badge ?? previousLookupStep?.lookup ?? ob.badge ?? ob.lookup,
      lookupFrame: lookupStep?.f ?? Math.max(0, startOf[i]),
      cycleOpacity: cycleStep ? 0.2 + 0.8 * Math.min(1, newsCycleRemaining(cycleStep, f, fps) * 4) : 1};
  });
  const landed = (i: number) => Math.max(revealAt[i], startOf[i] + 12);

  // notes: only the latest one is on screen
  const notes = p.steps.filter((s) => s.note).map((s) => ({...s, f: Math.round(s.at * len)})).filter((s) => f >= s.f).sort((a, b) => a.f - b.f);
  const note = notes[notes.length - 1];
  const noteScale = note ? spring({frame: f - note.f, fps, config: {damping: 13}}) : 0;

  // camera: slow push-in, plus focus steps
  const foc = p.steps.filter((s) => s.focus !== undefined).map((s) => ({...s, f: Math.round(s.at * len)})).sort((a, b) => a.f - b.f);
  const lastFocus = [...foc].reverse().find((s) => f >= s.f && s.focus);
  const focusAmt = track(0, foc.map((s) => ({f: s.f, v: s.focus ? 1 : 0})), f, fps, num);
  const anchor = (i: number, lift = 0.5) => {
    const g = geos[i];
    return P(g.x + g.w / 2, g.y + g.d / 2, g.z + g.h * lift);
  };
  const fp = lastFocus && byId[lastFocus.target] !== undefined ? anchor(byId[lastFocus.target], 0.6) : centre;
  const push = 1; // no drift: a continued scene must match the previous one exactly
  const zoom = push * (1 + 0.22 * focusAmt);
  const F = {x: centre.x + (fp.x - centre.x) * focusAmt, y: centre.y + (fp.y - centre.y) * focusAmt};
  const camera = `translate(${centre.x} ${centre.y}) scale(${zoom}) translate(${-F.x} ${-F.y})`;
  const stageTop = region ? region.top : stacked || (hasTitle && !onlyCard) ? top - 55 * u : 0;
  const clipLeft = example && !stacked ? left : 0;
  const stageLeft = region?.left ?? clipLeft;
  const stageRight = region?.right ?? (cards.length ? right : W);
  const cueBounds = {
    left: F.x + (stageLeft + 18 * u - centre.x) / zoom,
    right: F.x + (stageRight - 18 * u - centre.x) / zoom,
    top: F.y + (stageTop + 12 * u - centre.y) / zoom,
    bottom: F.y + (H - 170 * u - centre.y) / zoom,
  };
  const outside = (r: Rect) => Math.max(0, cueBounds.left - r.l) + Math.max(0, r.r - cueBounds.right)
    + Math.max(0, cueBounds.top - r.t) + Math.max(0, r.b - cueBounds.bottom);

  // ---------- draw order: platforms first, then links, then everything else back-to-front
  const order = p.objects.map((_, i) => i).sort((a, b) => {
    const ga = geos[a], gb = geos[b];
    const slabA = ga.shape === 'slab' ? -1 : 0, slabB = gb.shape === 'slab' ? -1 : 0;
    if (slabA !== slabB) return slabA - slabB;
    return ga.x + ga.w / 2 + ga.y + ga.d / 2 + ga.z * 0.1 - (gb.x + gb.w / 2 + gb.y + gb.d / 2 + gb.z * 0.1);
  });
  const slabs = order.filter((i) => geos[i].shape === 'slab'), rest = order.filter((i) => geos[i].shape !== 'slab');

  const renderObject = (i: number) => {
    const ob = p.objects[i], g = geos[i], s = state[i];
    if (!s.shown || s.hide >= 0.99) return null;
    const slab = g.shape === 'slab';
    const dz = slab ? (1 - s.drop) * -0.4 : Math.max(-0.08, (1 - s.drop) * 3.2);
    const lift = 0.28 * s.hl + 0.05 * s.hl * Math.sin(f / 7);
    const zz = g.z + dz + lift;
    const opacity = Math.min(1, (f - startOf[i]) / 6) * (1 - s.hide);
    const glow = s.hl > 0.02 ? `drop-shadow(0 0 ${14 * u * s.hl}px ${PAPER.glow})` : s.hot > 0 ? `drop-shadow(0 0 ${10 * u * s.hot}px rgba(229,96,79,0.85))` : undefined;
    const color = s.hot > 0 ? mix(s.color, ISO_COLORS.coral, 0.35 * s.hot) : s.color;
    const fs = Math.max(18 * u, Math.min(28 * u, T * 0.24));
    const sh = <IsoShadow x={g.x} y={g.y} w={g.w} d={g.d} opacity={opacity * Math.min(1, s.drop) * (slab ? 0.6 : 1)} T={T} o={o} sw={sw} />;

    let body: React.ReactNode = null, topAt: Pt;
    if (g.shape === 'art' || g.shape === 'slab') {
      body = slab
        ? isRoadKind(ob.kind)
          ? <Road kind={ob.kind} id={`${ob.id}-${i}`} g={g} zz={zz} color={color} T={T} o={o} sw={sw} />
          : <IsoBox id={`${ob.id}-${i}`} x={g.x} y={g.y} z={zz} w={g.w} d={g.d} h={g.h} color={color} T={T} o={o} sw={sw} radius={T * 0.45} />
        : <IsoArt kind={ob.kind as ArtKind} id={`${ob.id}-${i}`} g={g} zz={zz} color={color} T={T} o={o} sw={sw} icon={ob.icon} time={Math.max(0, f - Math.max(0, startOf[i])) / fps} highlight={s.hl} />;
      const r = rectOf(outline({...g, z: zz}, T, o));
      if (ob.faces?.length && ob.design) {
        body = <svg x={r.l} y={r.t} width={r.r-r.l} height={r.b-r.t} viewBox="0 0 100 100">
          {ob.faces.map((face, j) => <polygon key={j} points={face.points.map(pt => pt.join(',')).join(' ')}
            fill={face.fill === 'ink' ? PAPER.ink : shade(ISO_COLORS[face.fill], face.shade)}
            stroke={PAPER.ink} strokeWidth={1.8} strokeLinejoin="round" />)}
        </svg>;
      } else if (ob.kind === 'table') {
        const data = ob.table ?? users;
        body = <TableCard table={data} x={r.l} y={r.t} w={r.r-r.l} h={r.b-r.t}/>;
      }
      topAt = {x: (r.l + r.r) / 2, y: r.t};
    } else if (g.shape === 'person') {
      const at = P(g.x + g.w / 2, g.y + g.d / 2, zz);
      body = <IsoPerson at={at} size={T * 0.55} color={color} sw={sw} opacity={opacity} />;
      topAt = {x: at.x, y: at.y - T * 1.45};
    } else {
      // people: each one pops in a frame after the other
      const people = crowd(g, ob.count ?? 12);
      const byPosition = [...people].sort((a,b) => (a.gx-a.gy)-(b.gx-b.gy));
      const sourceIndex = links.find(link => link.to === ob.id);
      const facing = sourceIndex && anchor(byId[sourceIndex.from]).x > anchor(i).x ? 1 : -1;
      const positions = new Map(byPosition.map((person,rank) => [person.i,rank]));
      const splitProgress = s.split ? unitInterval((f-s.split.f)/fps) : 0;
      const opinion = s.opinion?.opinion;
      const opinionShare = opinion ? num(opinion.from,opinion.to,unitInterval((f-s.opinion!.f)/(1.2*fps))) : undefined;
      body = people.map(({gx, gy, i: k}) => {
        const t = spring({frame: f - startOf[i] - k * 1.3, fps, config: {damping: 11, stiffness: 160}});
        if (f < startOf[i] + k * 1.3) return null;
        const at = P(gx, gy, g.z + Math.max(0, (1 - t) * 1.2) + lift);
        const rank = positions.get(k)!;
        const groupA = rank < Math.round(people.length*(s.split?.split?.[0] ?? 0)/100);
        const direction = groupA ? -1 : 1;
        const baseColor = PERSON_COLORS[k % PERSON_COLORS.length];
        const crowdColor = opinionShare === undefined ? baseColor
          : mix('#c4b1df','#84c8a1',unitInterval(people.length*opinionShare/100-rank));
        const turn = s.attention?.attention === undefined ? undefined :
          facing*(k < Math.round(people.length*s.attention.attention/100) ? 1 : -1)*unitInterval((f-s.attention.f)/(0.45*fps));
        return <IsoPerson key={k} at={{x:at.x+direction*splitProgress*T*0.2,y:at.y}} size={T * 0.3}
          color={mix(crowdColor,groupA ? '#9ec4ee' : '#e9ac8d',splitProgress)} facing={turn}
          sw={sw * 0.9} scale={Math.min(1.05, t)} opacity={1 - s.hide} />;
      });
      topAt = P(g.x + g.w / 2, g.y + g.d / 2, g.z + 1.1);
    }
    // label: under the object, on a paper halo so lines behind it never cut through the text
    const box = rectOf(outline({...g, z: g.z}, T, o));
    const labelAt = {x: (box.l + box.r) / 2, y: box.b + fs * 1.25};
    const labelIn = Math.min(1, Math.max(0, (f - startOf[i] - 8) / 8));
    return (
      <g key={ob.id} opacity={g.shape === 'people' ? 1 : opacity} style={glow ? {filter: glow} : undefined}>
        {s.bubble?.bubble && <ellipse cx={(box.l+box.r)/2} cy={(box.t+box.b)/2} rx={(box.r-box.l)/2+24*u}
          ry={(box.b-box.t)/2+16*u} fill="#cfdef6" fillOpacity={0.44} stroke="#7889ba"
          strokeWidth={3*u} strokeDasharray={`${8*u} ${4*u}`} opacity={unitInterval((f-s.bubble.f)/(0.5*fps))*(1-s.hide)}/>}
        <g opacity={s.cycleOpacity}>
          {ob.kind !== 'table' && (g.shape === 'art' || slab) ? sh : null}
          {body}
        </g>
        {s.label && !slab ? (
          <text x={labelAt.x} y={labelAt.y} textAnchor="middle" fontFamily={PAPER.font} fontWeight={700} fontSize={fs} fill={PAPER.ink}
            stroke={PAPER.bg} strokeWidth={fs * 0.32} paintOrder="stroke" strokeLinejoin="round" opacity={labelIn}>{s.label}</text>
        ) : null}
        <ObjectCues steps={stepsFor(ob.id)} frame={f} fps={fps} x={topAt.x}
          y={topAt.y - (s.status !== undefined ? 64*u : 0) - (s.lookup && s.lookup !== 'none' ? 64*u : 0) - 48*u}
          u={u} cx={(box.l+box.r)/2} cy={(box.t+box.b)/2} rx={(box.r-box.l)/2+16*u} ry={(box.b-box.t)/2+12*u}
          bounds={cueBounds}/>
        {s.lookup && s.lookup !== 'none' ? <LookupBadge state={s.lookup} previous={s.previousLookup} x={topAt.x}
          y={topAt.y - (s.status !== undefined ? 100 : 48) * u} u={u} seconds={(f - s.lookupFrame) / fps} bounds={cueBounds} /> : null}
        {s.status !== undefined ? <StatusPill at={{x: topAt.x, y: topAt.y - 12 * u}} value={s.status} u={u} scale={s.pill * (1 - s.hide)} /> : null}
      </g>
    );
  };

  // object labels (so arrow labels can keep clear of them) and arrow labels placed so far
  const fsLabel = Math.max(18 * u, Math.min(28 * u, T * 0.24));
  const labelRects: Rect[] = p.objects.flatMap((ob, i) => {
    if (!ob.label || !state[i].shown || geos[i].shape === 'slab') return [];
    const r = rectOf(outline(geos[i], T, o)), cx = (r.l + r.r) / 2, y = r.b + fsLabel * 1.25;
    const w = ob.label.length * fsLabel * 0.62;
    return [{l: cx - w / 2, r: cx + w / 2, t: y - fsLabel, b: y + fsLabel * 0.3}];
  });
  const placedTags: Rect[] = [];

  // links
  /** Frame a link starts drawing. A new link between objects already on screen (continued scene) draws early on. */
  const linkStart = (l: Props['links'][number]) => {
    const ia = byId[l.from], ib = byId[l.to];
    const endpointsReady = Math.max(landed(ia), landed(ib));
    if (l.appearAt !== undefined) return Math.max(Math.round(l.appearAt * len), endpointsReady);
    if (l.enter === 'none') return endpointsReady;
    const after = endpointsReady + 4;
    return after < 0 ? Math.round(0.08 * len) : after;
  };
  const viaDelays = new Map<number,number>();
  const viaLegs = new Set<number>();
  let legIndex = 0;
  for (const link of p.links) {
    if (link.via) {
      if (link.enter !== 'none' || link.appearAt !== undefined) {
        viaDelays.set(legIndex+1,Math.max(0,linkStart(links[legIndex]))+18+Math.round(fps*0.85));
        viaLegs.add(legIndex);
        viaLegs.add(legIndex+1);
      }
      legIndex++;
    }
    legIndex++;
  }
  const legStart = (link:DiagramLink,index:number) => Math.max(linkStart(link),viaDelays.get(index) ?? -Infinity);
  const shareTiming = new Map<number,number>();
  for (const step of p.steps) {
    if (!step.spread) continue;
    const route = shareHops(links,step.target,step.spread.depth);
    const ready = Math.max(Math.round(step.at*len), ...[...route.keys()].map(index => legStart(links[index],index)+18));
    for (const [index,hop] of route) {
      const start = ready+Math.round(hop*fps*0.9);
      const previous = shareTiming.get(index);
      if (previous === undefined || (start<=f && (previous>f || start>previous))) shareTiming.set(index,start);
    }
  }
  const waveSources = new Map<number,{radius:number;start:number}>();
  links.forEach((link,index) => {
    const from = byId[link.from], to = byId[link.to], start = Math.max(0,legStart(link,index));
    if (link.flow !== 'wave' || f<start || !state[from].shown || !state[to].shown || state[from].hide>=0.99 || state[to].hide>=0.99) return;
    const a = anchor(from), b = anchor(to);
    const prior = waveSources.get(from);
    waveSources.set(from,{radius:Math.max(prior?.radius ?? 0,Math.hypot(a.x-b.x,a.y-b.y)+40*u),start:Math.min(prior?.start ?? start,start)});
  });
  const renderLink = (l: Props['links'][number], k: number, labelOnly = false) => {
    const ia = byId[l.from], ib = byId[l.to];
    if (ia === undefined || ib === undefined) return null;
    const start = legStart(l,k);
    if (f < start || !state[ia].shown || !state[ib].shown) return null;
    const ca = anchor(ia, geos[ia].shape === 'people' ? 0.9 : 0.5), cb = anchor(ib, 0.45);
    // bend: a gentle curve by default; more when that steers around other objects; a link that
    // comes back the other way (response) bends to the other side
    // every object of the picture counts, ghosts too: scenes of one chain then bend each arrow the same way
    const blockers = geos.map((gg, j) => (j === ia || j === ib || gg.shape === 'slab' ? null : rectOf(outline(gg, T, o)))).filter(Boolean) as Rect[];
    const side = -1; // -1 bulges up for a left-to-right link
    const options = [0.13, 0.28, 0.42].flatMap((m) => [side * m, -side * m]);
    const hits = (c: Pt) => sample(curve(ca, c, cb), 24).filter((q) => blockers.some((r) => q.x > r.l && q.x < r.r && q.y > r.t && q.y < r.b)).length;
    const bend = options.reduce((best, m) => (hits(bendPoint(ca, cb, m)) < hits(bendPoint(ca, cb, best)) ? m : best), options[0]);
    const c0 = bendPoint(ca, cb, bend);
    const ea = exitPoint(outline(geos[ia], T, o), ca, c0), eb = exitPoint(outline(geos[ib], T, o), cb, c0);
    const towards = (q: Pt, to: Pt, d: number) => {const L = Math.hypot(to.x - q.x, to.y - q.y) || 1; return {x: q.x + ((to.x - q.x) / L) * d, y: q.y + ((to.y - q.y) / L) * d};};
    const a = towards(ea, c0, 10 * u), b = towards(eb, c0, 14 * u);
    const k2 = curve(a, bendPoint(a, b, bend), b);
    const visibleStart = Math.max(start, 0);
    const reply = stepsFor(l.to).find(step => step.reply?.split('→').map(id => id.trim()).join('→') === l.to+'→'+l.from);
    const twoWay = l.bidirectional || !!reply;
    const switchFrame = reply ? reply.f : l.bidirectional && l.replyAfter !== undefined
      ? visibleStart + Math.max(1, Math.round((len - visibleStart) * l.replyAfter))
      : undefined;
    const activeLane = switchFrame === undefined ? undefined : f < switchFrame ? 'request' : 'reply';
    const phaseStart = activeLane === 'reply' ? switchFrame! : start;
    const phaseEnd = activeLane === 'request' ? switchFrame! : len;
    // On the lecture board, give the viewer time to follow the line from source to target.
    const strokeFrames = example ? Math.round(fps * 0.95) : 18;
    const drawFrames = activeLane ? Math.max(1, Math.min(strokeFrames, Math.floor((phaseEnd - Math.max(0, phaseStart)) / 3))) : strokeFrames;
    const prog = interpolate(f - phaseStart, [0, drawFrames], [0, 1], {extrapolateLeft: 'clamp', extrapolateRight: 'clamp', easing: (t) => example ? t : 1 - Math.pow(1 - t, 3)});
    const fade = 1 - Math.max(state[ia].hide, state[ib].hide);
    if (labelOnly) {
      // Older plans may use a single “request / reply” caption for both lanes.
      const legacyPair = twoWay && !l.returnLabel ? l.label?.match(/^(request)\s*\/\s*(reply|response)$/i) : null;
      const outbound = legacyPair?.[1] ?? l.label ?? (reply ? 'Request' : undefined);
      const inbound = twoWay ? l.returnLabel ?? legacyPair?.[2] ?? (reply ? 'Reply' : undefined) : undefined;
      return <g key={`label-${k}`} opacity={fade}>{[outbound, inbound].map((text, lane) => {
        if (!text || (activeLane === 'request' && lane === 1)) return null;
        const labelUnit = twoWay ? u * 1.4 : u;
        const tw = (text.length * 20 * 0.62 + 26) * labelUnit, th = 36 * labelUnit;
        const obstacles = [...geos.flatMap((gg, j) => gg.shape === 'slab' || !state[j].shown ? [] : [rectOf(outline(gg, T, o))]),
          ...labelRects, ...placedTags];
        const requestSide = activeLane ? (b.x >= a.x ? -1 : 1) : 1;
        const sides = twoWay ? [lane === 0 ? requestSide : -requestSide] : [-1, 1];
        const spots = [0.5, 0.38, 0.62, 0.28, 0.72].flatMap(t => sides.map(side => {
          const {p, angle} = along(k2, t);
          const gap = (twoWay ? 34 : 10) * u + Math.abs(Math.sin(angle)) * tw / 2 + Math.abs(Math.cos(angle)) * th / 2;
          return {x: p.x - side * Math.sin(angle) * gap, y: p.y + side * Math.cos(angle) * gap};
        }));
        const box = (p: Pt) => ({l: p.x - tw / 2, r: p.x + tw / 2, t: p.y - th / 2, b: p.y + th / 2});
        const cost = (p: Pt) => obstacles.reduce((sum, rect) => sum + overlapArea(rect, box(p)), 0) + outside(box(p)) * th * 40;
        const at = spots.reduce((best, p) => cost(p) < cost(best) - 1 ? p : best);
        placedTags.push(box(at));
        return <Tag key={lane} opacity={lane === 0 && activeLane === 'reply' ? 1 : prog} at={at} text={text} u={labelUnit} fill={twoWay ? (lane === 0 ? '#ded4f0' : '#c9e8d9') : undefined} />;
      })}</g>;
    }
    const receiver = state[ib], sender = state[ia];
    const timing = shareTiming.get(k);
    const incoming = (id:string) => links.findIndex(link => link.to === id && link.flow !== 'none' && !link.dashed);
    const outgoing = (id:string) => links.findIndex(link => link.from === id && link.flow !== 'none' && !link.dashed);
    const gateOut = sender.gate && outgoing(l.from) === k ? sender.gate : undefined;
    const gateIn = receiver.gate && incoming(l.to) === k ? receiver.gate : undefined;
    const gate = gateIn ?? gateOut;
    const seconds = (startFrame:number) => Math.max(0,(f-Math.max(startFrame,phaseStart+drawFrames))/fps);
    let media: LinkMedia | undefined;
    if (receiver.bubble?.bubble && l.flow !== 'none' && !l.dashed) media = {bounce:seconds(receiver.bubble.f)};
    else if (sender.race?.race && l.flow !== 'none' && !l.dashed) media = {race:{rates:sender.race.race,seconds:seconds(sender.race.f)}};
    else if (gate?.gate) {
      const other = gateIn ? outgoing(l.to) : incoming(l.from);
      const starts = other<0 ? gate.f : Math.max(gate.f,legStart(links[other],other)+18);
      media = {gate:{counts:gate.gate,seconds:seconds(starts),entering:!!gateIn}};
    }
    else if (timing !== undefined) media = {share:(f-Math.max(timing,phaseStart+drawFrames))/fps};
    else if (viaLegs.has(k) && l.flow !== 'wave' && l.flow !== 'none') media = {share:seconds(phaseStart+drawFrames)};
    return (
      <g key={`link-${k}`} opacity={fade}>
        <IsoLink k={k2} progress={prog} phase={f - phaseStart - drawFrames} activeLane={activeLane} u={u} sw={sw} T={T} flow={l.flow} clean={!!l.transform} drop={l.drop} bidirectional={twoWay} dashed={l.dashed} seed={k * 2}
          media={media} noise={l.noise} fps={fps}/>
      </g>
    );
  };

  // ---------- paper + grid
  const g0 = geos.length ? o : {x: W / 2, y: H / 2};
  const gT = (geos.length ? T : 80 * u) / 2;
  const gridLines: string[] = [];
  for (let k = -60; k <= 60; k++) {
    const a1 = project(k, -60, 0, gT, g0), a2 = project(k, 60, 0, gT, g0);
    const b1 = project(-60, k, 0, gT, g0), b2 = project(60, k, 0, gT, g0);
    gridLines.push(`M${a1.x},${a1.y}L${a2.x},${a2.y}M${b1.x},${b1.y}L${b2.x},${b2.y}`);
  }
  const gridIn = p.continued ? 1 : interpolate(f, [0, 12], [0, 1], {extrapolateRight: 'clamp'});
  const titleIn = p.continued ? 1 : spring({frame: f - 2, fps, config: {damping: 200}}); // same picture: title already there


  // sounds follow what happens: objects land, late links connect, steps pick a sound from their change
  const sounds: {sound: string; at: number; volume: number}[] = [];
  p.objects.forEach((ob, i) => {
    if (ob.enter === 'none' || ob.ghost) return;
    const shape = (KINDS[ob.kind] as Kind).shape;
    if (shape === 'slab') return;
    sounds.push({sound: shape === 'people' || shape === 'person' ? 'pop' : 'drop', at: startOf[i] + 9, volume: 0.28});
  });
  links.forEach((l,index) => {
    const at = legStart(l,index);
    if (l.noise && !p.objects[byId[l.from]].ghost && !p.objects[byId[l.to]].ghost) {
      sounds.push({sound:'radio-static', at:Math.max(0,at+18), volume:0.26});
    } else if (at > 0 && (l.appearAt !== undefined || p.continued)) sounds.push({sound: 'connect', at, volume: 0.2});
  });
  const statusNow: Record<string, number | undefined> = Object.fromEntries(p.objects.map((o) => [o.id, o.status]));
  [...p.steps].sort((a, b) => a.at - b.at).forEach((st) => {
    const before = statusNow[st.target];
    if (st.status !== undefined) statusNow[st.target] = st.status;
    const overload = st.status !== undefined && st.status >= 88 && (before ?? 0) < 88;
    const auto = st.hide ? 'remove' : overload ? 'alert' : (st.highlight || (st.badge ?? st.lookup) === 'found') ? 'chime' : st.focus ? 'rise' : st.note ? 'blip' : undefined;
    const badge = st.badge;
    let mediaSound: string | undefined;
    if (badge === 'approved' || badge === 'rejected' || badge === 'false') mediaSound = 'desk-stamp';
    else if (badge === 'onair' || badge === 'offrecord' || badge === 'live') mediaSound = 'mic-switch';
    else if (badge === 'nosignal') mediaSound = 'radio-static';
    else if (badge === 'published' || badge === 'correction' || st.headline || st.agenda) mediaSound = 'page-turn';
    const sound = st.sound ?? mediaSound ?? auto;
    if (!sound || sound === 'none') return;
    const volume = sound === 'alert' ? 0.22 : sound === 'rise' ? 0.25 : sound === 'blip' ? 0.2 : sound === 'chime' ? 0.22 : 0.3;
    sounds.push({sound, at: Math.round(st.at * len), volume});
  });

  return (
    <AbsoluteFill style={{background: region ? 'transparent' : `radial-gradient(ellipse at 50% 45%, ${PAPER.bgCenter} 0%, ${PAPER.bg} 70%)`, fontFamily: PAPER.sans}}>
      <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} style={{position: 'absolute', inset: 0}}>
        {region ? null : <path d={gridLines.join('')} stroke={PAPER.grid} strokeWidth={1.2 * u} fill="none" opacity={gridIn} />}
        <defs><clipPath id={stageId}><rect x={clipLeft} y={stageTop} width={W - clipLeft} height={H} /></clipPath></defs>
        <g clipPath={`url(#${stageId})`}><g transform={camera}>
          {slabs.map(renderObject)}
          {[...waveSources].map(([index,{start,radius}]) => <BroadcastWaves key={index} origin={anchor(index)} radius={radius} seconds={(f-start)/fps} u={u}/>)}
          {links.map((l, k) => renderLink(l, k))}
          {rest.map(renderObject)}
          {links.map((l, k) => renderLink(l, k, true))}
          {note && byId[note.target] !== undefined && state[byId[note.target]].shown ? (() => {
            const i = byId[note.target], g = geos[i];
            const box = rectOf(outline(g, T, o));
            const pillRoom = state[i].status !== undefined ? 66 * u : 0;
            const {w: nw, h: nh} = noteSize(note.note ?? '', u);
            const others = geos.map((gg, j) => (j === i || gg.shape === 'slab' || !state[j].shown ? null : rectOf(outline(gg, T, o)))).filter(Boolean) as Rect[];
            const cx = (box.l + box.r) / 2, cy = (box.t + box.b) / 2;
            const others2 = [...others, ...geos.map((gg, j) => (j !== i && state[j].shown && state[j].status !== undefined ? (() => {const r = rectOf(outline(gg, T, o)); return {l: r.l, r: r.r, t: r.t - 70 * u, b: r.t};})() : null)).filter(Boolean) as Rect[]];
            // above, slid inward so it stays on screen near the frame edge (the pointer still lands on the object)
            const ax = Math.max(cueBounds.left + nw / 2, Math.min(cx, cueBounds.right - nw / 2));
            const options = [
              {side: 'above' as const, at: {x: cx, y: box.t - pillRoom}, r: {l: cx - nw / 2, r: cx + nw / 2, t: box.t - pillRoom - nh - 16 * u, b: box.t - pillRoom}},
              {side: 'above' as const, at: {x: ax, y: box.t - pillRoom}, r: {l: ax - nw / 2, r: ax + nw / 2, t: box.t - pillRoom - nh - 16 * u, b: box.t - pillRoom}},
              {side: 'right' as const, at: {x: box.r, y: cy}, r: {l: box.r + 16 * u, r: box.r + 16 * u + nw, t: cy - nh / 2, b: cy + nh / 2}},
              {side: 'left' as const, at: {x: box.l, y: cy}, r: {l: box.l - 16 * u - nw, r: box.l - 16 * u, t: cy - nh / 2, b: cy + nh / 2}},
              {side: 'right' as const, at: {x: box.r - 10 * u, y: box.t + 20 * u}, r: {l: box.r + 6 * u, r: box.r + 6 * u + nw, t: box.t + 20 * u - nh / 2, b: box.t + 20 * u + nh / 2}},
              {side: 'left' as const, at: {x: box.l + 10 * u, y: box.t + 20 * u}, r: {l: box.l - 6 * u - nw, r: box.l - 6 * u, t: box.t + 20 * u - nh / 2, b: box.t + 20 * u + nh / 2}},
            ];
            // text over text is the worst overlap: link labels ("data", "resource") and object names count double
            const texts = [...placedTags, ...labelRects];
            const cost = (r: Rect) => others2.reduce((acc, x) => acc + overlapArea(x, r), 0) + 2 * texts.reduce((acc, x) => acc + overlapArea(x, r), 0)
              + outside(r) * nh * 40; // off-screen is worse than touching
            const pick = options.reduce((best, c) => (cost(c.r) < cost(best.r) - 1 ? c : best), options[0]);
            return <Note at={pick.at} side={pick.side} tipOffset={cx - pick.at.x} text={note.note ?? ''} u={u} scale={Math.min(1, noteScale)} />;
          })() : null}
        </g></g>
      </svg>

      {hasTitle && !onlyCard ? (
        <div style={{position: 'absolute', left: 90 * u, top: 64 * u, right: 90 * u, opacity: titleIn, transform: `translateY(${(1 - titleIn) * 18 * u}px)`}}>
          {p.eyebrow ? <div style={{fontFamily: PAPER.font, fontWeight: 700, fontSize: 22 * u, letterSpacing: 3 * u, color: '#8a6fd1', textTransform: 'uppercase'}}>{p.eyebrow}</div> : null}
          {p.title ? <div style={{fontSize: 56 * u, fontWeight: 800, color: PAPER.ink, letterSpacing: -1 * u, marginTop: 6 * u}}>{p.title}</div> : null}
          {p.subtitle ? <div style={{fontSize: 28 * u, color: PAPER.inkSoft, marginTop: 8 * u, maxWidth: 1300 * u}}>{p.subtitle}</div> : null}
        </div>
      ) : null}

      {example ? (
        <div style={{position: 'absolute', left: 80 * u, top: stacked ? headingBottom : top,
          width: stacked ? W - 160 * u : left - 110 * u,
          height: stacked ? 310 * u : bottom - top, display: 'flex', flexDirection: 'column',
          justifyContent: 'center', gap: (stacked ? 8 : 20) * u, color: PAPER.ink}}>
          {example.map((line, i) => (
            <div key={i} style={{visibility: f >= Math.round(line.at * len) ? 'visible' : 'hidden',
              borderLeft: `${4 * u}px solid ${ISO_COLORS.lavender}`, padding: `0 ${20 * u}px`,
              fontSize: (stacked ? 29 : 40) * u, lineHeight: 1.2, fontWeight: 600, overflowWrap: 'anywhere'}}>
              {line.text}
            </div>
          ))}
        </div>
      ) : null}
      {onlyCard ? (
        <div style={{position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: `0 ${140 * u}px ${160 * u}px`, textAlign: 'center'}}>
          {p.eyebrow ? <div style={{fontFamily: PAPER.font, fontWeight: 700, fontSize: 26 * u, letterSpacing: 4 * u, color: '#8a6fd1', textTransform: 'uppercase', opacity: titleIn}}>{p.eyebrow}</div> : null}
          {p.title ? <div style={{fontSize: 88 * u, fontWeight: 800, color: PAPER.ink, letterSpacing: -2 * u, lineHeight: 1.08, marginTop: 14 * u, opacity: titleIn, transform: `translateY(${(1 - titleIn) * 24 * u}px)`}}>{p.title}</div> : null}
          {p.subtitle ? <div style={{fontSize: 34 * u, color: PAPER.inkSoft, marginTop: 22 * u, maxWidth: 1300 * u, opacity: spring({frame: f - 10, fps, config: {damping: 200}})}}>{p.subtitle}</div> : null}
          {cards.length ? (
            <div style={{display: 'flex', gap: 28 * u, marginTop: 56 * u}}>
              {cards.map((c, k) => <PaperCard key={k} text={c} k={k} at={Math.round((0.15 + k * 0.12) * len)} u={u} width={(1500 * u) / cards.length - 28 * u} />)}
            </div>
          ) : null}
        </div>
      ) : cards.length ? (
        <div style={{position: 'absolute', right: 90 * u, top: top + 10 * u, width: 470 * u, display: 'flex', flexDirection: 'column', gap: 22 * u}}>
          {cards.map((c, k) => <PaperCard key={k} text={c} k={k} at={Math.round((0.12 + k * 0.14) * len)} u={u} />)}
        </div>
      ) : null}

      {p.sound ? sounds.map((c, k) => <Sfx key={`s${k}`} sound={c.sound} at={c.at} volume={c.volume} />) : null}
    </AbsoluteFill>
  );
};

const CARD_TABS = [ISO_COLORS.lavender, ISO_COLORS.mint, ISO_COLORS.peach, ISO_COLORS.sky];

const PaperCard: React.FC<{text: string; k: number; at: number; u: number; width?: number}> = ({text, k, at, u, width}) => {
  const f = useCurrentFrame();
  const {fps} = useVideoConfig();
  const t = spring({frame: f - at, fps, config: {damping: 13}});
  if (f < at) return null;
  return (
    <div style={{
      width, position: 'relative', background: PAPER.card, border: `${2.6 * u}px solid ${PAPER.ink}`, borderRadius: 18 * u,
      padding: `${20 * u}px ${24 * u}px ${20 * u}px ${36 * u}px`, boxShadow: `${5 * u}px ${6 * u}px 0 ${PAPER.shadow}`,
      fontSize: 28 * u, fontWeight: 600, color: PAPER.ink, textAlign: 'left', lineHeight: 1.3,
      opacity: Math.min(1, t * 1.5), transform: `translateY(${(1 - t) * 30 * u}px) scale(${0.92 + 0.08 * Math.min(1, t)})`,
    }}>
      <div style={{position: 'absolute', left: 12 * u, top: 16 * u, bottom: 16 * u, width: 10 * u, borderRadius: 5 * u, background: CARD_TABS[k % CARD_TABS.length], border: `${2 * u}px solid ${PAPER.ink}`}} />
      {text}
    </div>
  );
};
