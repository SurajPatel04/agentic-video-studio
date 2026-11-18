import {z} from 'zod';
import {PAPER} from './iso';
import {iconByName} from './objects';

export const lookupState = z.enum(['checking', 'found', 'miss', 'offline', 'recovered', 'none']);
const tone = z.enum(['neutral','good','warn','bad','info','purple']);
const palette = {
  neutral: ['#e9e7e4','#52515a'], good: ['#d6efda','#316c48'], warn: ['#fae9c2','#78551c'],
  bad: ['#f7d4cb','#993832'], info: ['#d9e9fb','#305c90'], purple: ['#e8def7','#654788'],
};
const statusPresets = {
  checking: ['Checking','search','purple'], found: ['Found','check','good'], miss: ['Cache miss','x','neutral'],
  offline: ['Offline','unplug','bad'], online: ['Back online','circle','good'], loading: ['Loading','loader-circle','info'],
  queued: ['Queued','layers','purple'], processing: ['Processing','settings','info'], done: ['Done','check','good'],
  error: ['Error','circle-alert','bad'], blocked: ['Blocked','shield-x','bad'], locked: ['Locked','lock','neutral'],
  unlocked: ['Unlocked','lock-open','good'], waiting: ['Waiting','clock','neutral'], stale: ['Stale','hourglass','warn'],
  fresh: ['Fresh','sparkles','good'], verified: ['Verified','badge-check','info'], warning: ['Warning','triangle-alert','warn'],
} as const;
const mediaPresets = {
  onair: ['ON AIR','radio','bad'], live: ['LIVE','circle','bad'], breaking: ['Breaking','rss','bad'],
  draft: ['Draft','file-text','neutral'], review: ['Editing','search','purple'],
  approved: ['Approved','check','good'], rejected: ['Spiked','x','bad'], published: ['Published','newspaper','info'],
  factcheck: ['Fact-checking','search','purple'], false: ['False','x','bad'],
  misleading: ['Misleading','triangle-alert','warn'], correction: ['Corrected','pencil','info'],
  sponsored: ['Sponsored','tag','neutral'], aigenerated: ['AI','sparkles','purple'],
  trending: ['Trending','flame','warn'], embargo: ['Embargo','lock','warn'],
  released: ['Released','lock-open','good'], offrecord: ['Off the record','mic-off','neutral'],
  nosignal: ['No signal','wifi-off','bad'],
} as const;
const presets = {...statusPresets, ...mediaPresets};
const statusNames = z.enum([...(Object.keys(statusPresets) as (keyof typeof statusPresets)[]), 'none' as const]);
const mediaNames = z.enum(Object.keys(mediaPresets) as (keyof typeof mediaPresets)[]);
export const badgeSchema = z.union([statusNames, mediaNames, z.object({
  icon: z.string().min(1).max(40).refine(name => !!iconByName(name), 'Use a Lucide icon name'),
  text: z.string().trim().min(1).max(30), tone: tone.default('neutral'),
}).strict()]);

export function LookupBadge({state, previous, x, y, u, seconds, bounds}: {
  state: Exclude<z.output<typeof badgeSchema>, 'none'> | 'recovered';
  previous?: z.output<typeof badgeSchema> | 'recovered'; x: number; y: number; u: number; seconds: number;
  bounds?: {left:number; right:number};
}) {
  const name = state === 'recovered' ? 'online' : state;
  const custom = typeof name === 'object';
  const [label, icon, color] = custom ? [name.text, name.icon, name.tone] : presets[name];
  const [fill, ink] = palette[color];
  const Icon = iconByName(icon)!;
  const oldLabel = name === 'correction' && previous && previous !== 'none'
    ? typeof previous === 'object' ? previous.text : presets[previous === 'recovered' ? 'online' : previous][0]
    : '';
  const width = 82 + Math.max(Array.from(label).length, Array.from(oldLabel).length) * 18;
  const reveal = Math.min(1, Math.max(0, seconds / 0.22));
  const slide = Math.min(1, seconds / 0.38);
  const beat = Math.sin(Math.PI * Math.min(1, seconds / 0.48));
  const shake = name === 'offline' || name === 'error' || name === 'false' ? 7 * Math.sin(seconds * 50) * Math.exp(-seconds * 7) : 0;
  const dx = name === 'blocked' ? -10 * beat : name === 'breaking' ? -85 * (1 - slide) ** 2 : shake;
  const stamp = name === 'approved' || name === 'rejected' || name === 'false';
  const dy = stamp ? -26 * (1 - reveal) + (name === 'rejected' ? 12 * beat : 0)
    : name === 'miss' ? -10 * (1 - reveal) : name === 'queued' ? -8 * beat : 0;
  const pop = custom || name === 'found' || name === 'done' || name === 'verified' || name === 'online' || name === 'published' || name === 'aigenerated';
  const pulse = (1 + Math.sin(seconds * 5)) / 2;
  const scale = u * (stamp ? 1 + 0.35 * (1 - reveal) : pop ? 1 + 0.12 * beat : name === 'onair' ? 1 + 0.045 * pulse : 1);
  const blink = (name === 'warning' || name === 'misleading') && seconds < 0.8 ? 1 - 0.55 * Math.sin(Math.PI * seconds / 0.4) ** 2
    : name === 'nosignal' ? 0.65 + 0.35 * Math.sin(seconds * 11) ** 2 : 1;
  const rotate = name === 'processing' ? seconds * 95 : name === 'loading' ? seconds * 240 : 0;
  const sweep = name === 'checking' || name === 'review' || name === 'factcheck'
    ? `translate(${4 * Math.cos(seconds * 6)} ${4 * Math.sin(seconds * 6)})` : '';
  const opening = name === 'unlocked' || name === 'released';
  const halfWidth = width * scale / 2;
  const center = bounds ? Math.max(bounds.left+halfWidth, Math.min(x,bounds.right-halfWidth)) : x;
  return <g transform={`translate(${center + dx * u},${y + dy * u}) scale(${scale})`} opacity={reveal * blink}>
    {name === 'onair' && <rect x={-width / 2 - 6} y={-33} width={width + 12} height={66} rx={26} fill="#ed7363" opacity={0.18 + 0.22 * pulse}/>}
    <rect x={-width / 2} y={-27} width={width} height={54} rx={name === 'breaking' ? 6 : 22} fill={name === 'stale' ? PAPER.card : fill} stroke={ink} strokeWidth={2.5}/>
    {(name === 'stale' || name === 'error') && <rect x={-width / 2 + 2} y={-25} width={width - 4} height={50} rx={20}
      fill={name === 'stale' ? fill : '#ff785e'} opacity={name === 'stale' ? Math.min(1, seconds / 0.8) : beat}/>}
    <g transform={`translate(${-width / 2 + 32},0) ${sweep} rotate(${rotate})`} fill="none" stroke={ink} strokeWidth={3.5} strokeLinecap="round">
      {name === 'locked' || name === 'embargo' || opening ? <>
        <path d="M-8 0 v-8 a8 8 0 0 1 16 0 v8" transform={`rotate(${-35 * (opening ? reveal : 1 - reveal)} -8 0)`}/>
        <rect x={-12} y={-1} width={24} height={17} rx={3} fill={fill}/>
      </> : name === 'waiting' ? <>
        <circle r={14}/><path d="M0 -10 V0 L6 3" transform={`rotate(${seconds * 90})`}/>
      </> : name === 'online' || name === 'live' ? <circle r={9} fill={ink} opacity={name === 'live' && seconds % 1 >= 0.65 ? 0.23 : 1}/> :
        <g transform={name === 'fresh' ? `scale(${1 + 0.25 * Math.sin(seconds * 7) * Math.exp(-seconds)})` : undefined}
          opacity={name === 'trending' ? 0.55 + 0.45 * Math.sin(seconds * 13) ** 2 : 1}>
          <Icon x={-16} y={-16} width={32} height={32} color={ink} strokeWidth={2.7}/>
          {name === 'factcheck' && <text x={-4} y={4} fill={ink} stroke="none" fontSize={13} fontWeight={700}>?</text>}
        </g>}
    </g>
    {name === 'correction' ? <svg x={-width / 2 + 58} y={-22} width={width - 66} height={44} overflow="hidden"
      fontSize={29} fontFamily={PAPER.font} fontWeight={700} fill={ink}>
      {oldLabel && slide < 1 && <text y={32 - 44 * slide}>{oldLabel}</text>}
      <text y={32 + 44 * (1 - slide)}>{label}</text>
    </svg> : <text x={-width / 2 + 58} y={10} fontSize={29} fontFamily={PAPER.font} fontWeight={700} fill={ink}>{label}</text>}
  </g>;
}
