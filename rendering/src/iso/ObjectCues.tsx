import {z} from 'zod';
import {Clock, Coins, Eye, Heart, MessageCircle, Repeat2, ThumbsUp, Angry, RotateCw, Smile, Meh, Frown, Tv, CircleHelp} from 'lucide-react';
import {PAPER} from './iso';
import {fittedPaperText} from './textFit';
import {AgendaPanel, StoryPanel, mediaFlowFields, GateIcon, rumourInk, correctionInk} from './MediaFlow';

const percent = z.number().min(0).max(100);
const amount = z.number().int().min(1).max(1000);
const total = z.number().int().nonnegative();
const percentTarget = z.object({to:percent}).strict().optional();
export const cueFields = {
  ...mediaFlowFields,
  timer: z.object({to:z.number().nonnegative(), unit:z.string().max(10).default('ms')}).strict().optional(),
  count: z.object({to:z.number().int().nonnegative(), label:z.string().max(24)}).strict().optional(),
  meter: percent.optional(),
  progress: z.object({to:percent}).strict().optional(),
  ttl: z.object({seconds:z.number().positive()}).strict().optional(),
  retry: z.object({attempts:z.number().int().min(1).max(30), success:z.boolean()}).strict().optional(),
  queue: z.union([z.object({add:amount}).strict(),z.object({take:amount}).strict()]).optional(),
  think: z.enum(['?','…','!']).optional(),
  react: z.enum(['like','love','angry','question']).optional(),
  say: z.string().trim().min(1).max(48).optional(),
  mood: z.enum(['happy','neutral','upset']).optional(),
  reach: z.object({to:total}).strict().optional(),
  engage: z.object({likes:total.optional(), comments:total.optional(), shares:total.optional()})
    .strict().refine(value => Object.values(value).some(count => count !== undefined), 'Provide likes, comments, or shares').optional(),
  compare: z.object({reach:percent, understood:percent}).strict().optional(),
  rating: percentTarget,
  revenue: z.object({to:z.number().nonnegative().max(Number.MAX_SAFE_INTEGER), prefix:z.string().max(6).default('$')}).strict().optional(),
  trust: percentTarget,
  cycle: z.object({hours:z.number().positive().max(Number.MAX_SAFE_INTEGER), seconds:z.number().positive().default(3)}).strict().optional(),
  sentiment: z.tuple([percent, percent, percent])
    .refine(values => Math.abs(values.reduce((sum, value) => sum + value, 0) - 100) < 0.0001, 'Sentiment percentages must add to 100').optional(),
  survey: z.object({
    labels:z.array(z.string().trim().min(1).max(24)).min(1).max(5),
    values:z.array(z.number().nonnegative().max(Number.MAX_SAFE_INTEGER)).min(1).max(5),
  }).strict()
    .refine(value => value.labels.length === value.values.length, 'Provide one survey value per label')
    .refine(value => new Set(value.labels).size === value.labels.length, 'Survey labels must be unique').optional(),
};
const schema = z.object(cueFields);
type Cue = z.output<typeof schema> & {f:number};
const clamp = (x:number) => Math.min(1,Math.max(0,x));
const keys = (Object.keys(cueFields) as (keyof z.output<typeof schema>)[]).filter(key => key !== 'spread' && key !== 'bubble');
const mediaKeys = ['reach','engage','compare','rating','revenue','trust','cycle','sentiment','survey',
  'frame','agenda','headline','gate','race','attention','opinion','split'] as const;

// Replay numerical transitions up to this frame, including interrupted changes.
function reading(history:Cue[], value:(step:Cue) => number | undefined, frame:number, fps:number) {
  let from = 0, to = 0, start = 0;
  const at = (f:number) => from + (to-from)*clamp((f-start)/fps);
  for (const step of history) {
    const target = value(step);
    if (target === undefined) continue;
    from = at(step.f); to = target; start = step.f;
  }
  return at(frame);
}

export function newsCycleRemaining(step:{f:number; cycle?:Cue['cycle']}, frame:number, fps:number) {
  return step.cycle ? clamp(1 - (frame-step.f)/fps/step.cycle.seconds) : 1;
}

export function ObjectCues({steps, frame, fps, x, y, u, cx, cy, rx, ry, bounds}: {
  steps:Cue[]; frame:number; fps:number; x:number; y:number; u:number; cx:number; cy:number; rx:number; ry:number;
  bounds?: {left:number; right:number; top:number};
}) {
  const history = steps.filter(step => step.f <= frame);
  const cue = [...history].reverse().find(step => keys.some(key => step[key] !== undefined));
  if (!cue) return null;
  const seconds = (frame-cue.f)/fps;
  const read = (value:(step:Cue) => number | undefined) => reading(history, value, frame, fps);
  const formatted = (value:number) => value.toLocaleString('en-US', {maximumFractionDigits:2});
  const rows: React.ReactNode[] = [];
  let height = 0, widest = 0;
  function panel(width:number, size:number, content:React.ReactNode, fill = PAPER.card) {
    widest = Math.max(widest, width);
    const y = 26 - height - size;
    height += size + 8;
    rows.push(<g key={rows.length} transform={`translate(0,${y})`}>
      <rect x={-width/2} width={width} height={size} rx={20} fill={fill} stroke={PAPER.ink} strokeWidth={2}/>
      {content}
    </g>);
  }
  function row(text:string, graphic?:React.ReactNode, fill = PAPER.card) {
    const width = Math.max(100,Array.from(text).length*18 + (graphic ? 85 : 34));
    panel(width,52,<g transform="translate(0,26)">
      {graphic && <g transform={`translate(${-width/2+28},0)`}>{graphic}</g>}
      <text textAnchor="middle" x={graphic ? 18 : 0} y={9} fontSize={27} fontWeight={700} fontFamily={PAPER.font} fill={PAPER.ink}>{text}</text>
    </g>,fill);
  }
  function bars(title:string, items:{label:string; value:number; maximum:number; color:string; suffix?:string}[]) {
    const labelX = -204, barX = -32, barWidth = 126, valueX = 204;
    const gap = 16;
    const labelWidth = barX - labelX - gap;
    const valueWidth = valueX - barX - barWidth - gap;
    const width = 448;
    panel(width,44+items.length*34,<g fontFamily={PAPER.sans} fontWeight={700} fill={PAPER.ink}>
      <text x={labelX} y={27} fontSize={21}>{title}</text>
      {items.map(({label,value,maximum,color,suffix},index) => {
        const displayValue = formatted(value) + (suffix ?? '');
        return <g key={index} transform={`translate(0,${49+index*34})`}>
          <text x={labelX} y={8} fontSize={fittedPaperText(label,labelWidth,20,700)}>{label}</text>
          <rect x={barX} y={-8} width={barWidth} height={18} rx={6} fill={PAPER.track}/>
          <rect x={barX} y={-8} width={barWidth*clamp(value/maximum)} height={18} rx={6} fill={color}/>
          <text x={valueX} y={8} textAnchor="end" fontSize={fittedPaperText(displayValue,valueWidth,20,700)}>{displayValue}</text>
        </g>;
      })}
    </g>);
  }
  const icon = {x:-14,y:-14,width:28,height:28,color:PAPER.ink};
  if (cue.timer) row(`${+read(step => step.timer?.to).toFixed(1)} ${cue.timer.unit}`,<Clock {...icon}/>);
  if (cue.count) row(`${Math.round(read(step => step.count?.to)).toLocaleString('en-US')} ${cue.count.label}`);
  if (cue.meter !== undefined) {
    const load = read(step => step.meter);
    row(`${Math.round(load)}% load`,<><rect x={-18} y={-12} width={35} height={24} rx={4} fill={PAPER.track}/><rect x={-18} y={-12} width={35*load/100} height={24} rx={4} fill={load>=80 ? PAPER.bad : PAPER.good}/></>);
  }
  let ring: number | undefined;
  if (cue.progress) {ring = read(step => step.progress?.to)/100; row(`${Math.round(ring*100)}%`);}
  if (cue.ttl) {
    ring = clamp(1-seconds/cue.ttl.seconds);
    row(ring ? `TTL ${Math.ceil(cue.ttl.seconds-seconds)} s` : 'Stale',undefined,ring ? PAPER.card : '#fae9c2');
  }
  if (cue.retry) {
    const n = Math.floor(seconds)+1;
    row(n<=cue.retry.attempts ? `Retry ${n}/${cue.retry.attempts}` : cue.retry.success ? 'Succeeded' : 'Failed',
      <g transform={`rotate(${n<=cue.retry.attempts ? seconds*160 : 0})`}><RotateCw {...icon}/></g>);
  }
  if (cue.queue) {
    let from=0, to=0, start=0;
    const at = (f:number) => from+(to-from)*clamp((f-start)/fps);
    for (const s of history) if (s.queue) {
      from=at(s.f); start=s.f; to=Math.max(0,to+('add' in s.queue ? s.queue.add : -s.queue.take));
    }
    const n=Math.round(at(frame));
    row(`${n} queued`,<g>{Array.from({length:Math.min(6,n)},(_,i)=><rect key={i} x={-13} y={10-i*5} width={26} height={6} rx={2} stroke={PAPER.ink} fill="#c9b6ec"/>)}</g>);
  }
  if (cue.think || cue.say) {
    const thought = cue.think === '?' ? ['?','…','!'][Math.min(2,Math.floor(seconds))] : cue.think;
    row(cue.say ?? thought ?? '');
    rows.push(cue.say ? <path key="tail" d="M-16 25 l12 13 7 -13" fill={PAPER.card} stroke={PAPER.ink} strokeWidth={2}/> :
      <g key="thought" fill={PAPER.card} stroke={PAPER.ink}><circle cx={-8} cy={32} r={5}/><circle cx={-15} cy={43} r={3}/></g>);
  }
  if (cue.mood) {
    const Face = {happy:Smile,neutral:Meh,upset:Frown}[cue.mood];
    row(cue.mood,<Face {...icon}/>);
  }
  if (cue.reach) row(`${formatted(Math.round(read(step => step.reach?.to)))} reached`,<Eye {...icon}/>);
  if (cue.engage) {
    const engagement = {likes:Heart, comments:MessageCircle, shares:Repeat2};
    const counters = (['likes','comments','shares'] as const)
      .filter(key => cue.engage?.[key] !== undefined)
      .map(key => ({key, Icon:engagement[key], count:formatted(Math.round(read(step => step.engage?.[key])))}));
    const column = Math.max(136, ...counters.map(({count}) => count.length*13+20));
    const width = column*counters.length+24;
    panel(width,69,<g fontFamily={PAPER.sans} fill={PAPER.ink}>
      {counters.map(({key,Icon,count},index) => {
        const labelStart = -(24+key.length*9)/2;
        return <g key={key} transform={`translate(${(index+0.5)*column-width/2+12},0)`}>
          <Icon x={labelStart} y={11} width={20} height={20} color={PAPER.ink}/>
          <text x={labelStart+24} y={27} fontSize={18}>{key}</text>
          <text x={0} y={53} textAnchor="middle" fontSize={23} fontWeight={700}>{count}</text>
        </g>;
      })}
    </g>);
  }
  if (cue.compare) bars('Audience understanding', [
    {label:'Saw it',value:Math.round(read(step => step.compare?.reach)),maximum:100,color:'#8ab8ed',suffix:'%'},
    {label:'Understood it',value:Math.round(read(step => step.compare?.understood)),maximum:100,color:'#76b589',suffix:'%'},
  ]);
  if (cue.rating) row(`${Math.round(read(step => step.rating?.to))}% TV share`,<Tv {...icon}/>);
  if (cue.revenue) {
    const value = read(step => step.revenue?.to);
    const coins = Math.min(5,Math.ceil(5*value/Math.max(1,value,cue.revenue.to)));
    row(`${cue.revenue.prefix}${formatted(value)} ad revenue`,
      coins ? <g fill="#f6d58c" stroke="#815a1d" strokeWidth={1.5}>
        {Array.from({length:coins},(_,i) => <ellipse key={i} cy={10-i*5} rx={13} ry={4}/>)}
      </g> : <Coins {...icon}/>);
  }
  if (cue.trust) {
    const trust = read(step => step.trust?.to);
    row(`${Math.round(trust)}% trust`,<g fill="none" strokeWidth={3} strokeLinecap="round">
      <path d="M-15 7 a15 15 0 0 1 30 0" stroke={PAPER.track}/>
      <path d="M-15 7 a15 15 0 0 1 30 0" pathLength={100} strokeDasharray={`${trust} 100`} stroke={trust < 50 ? '#bd8435' : '#598c69'}/>
      <path d="M0 7 H12" transform={`rotate(${180+trust*1.8} 0 7)`} stroke={PAPER.ink}/>
    </g>);
  }
  if (cue.cycle) {
    ring = newsCycleRemaining(cue,frame,fps);
    row(ring ? `${formatted(Math.ceil(cue.cycle.hours*ring*100)/100)} h left` : 'Cycle ended',<Clock {...icon}/>);
  }
  if (cue.sentiment) {
    const segments = [
      {Face:Smile, color:'#76b589', label:'Positive'},
      {Face:Meh, color:'#d8c795', label:'Neutral'},
      {Face:Frown, color:'#e49589', label:'Negative'},
    ];
    const values = cue.sentiment.map((_,i) => read(step => step.sentiment?.[i]));
    let offset = -192;
    panel(420,120,<g fontFamily={PAPER.sans} fontWeight={700} fill={PAPER.ink}>
      <text x={-192} y={26} fontSize={21}>Audience sentiment</text>
      <rect x={-192} y={39} width={384} height={17} fill={PAPER.track}/>
      {segments.map(({color,label},i) => {
        const width = values[i]*3.84;
        const x = offset;
        offset += width;
        return <rect key={label} x={x} y={39} width={width} height={17} fill={color}/>;
      })}
      {segments.map(({Face,label},i) => <g key={label} transform={`translate(${(i-1)*128},66)`}>
        <Face x={-49} width={22} height={22} color={PAPER.ink}/>
        <text x={-21} y={16} fontSize={16}>{label}</text>
        <text y={43} textAnchor="middle" fontSize={19}>{Math.round(values[i])}%</text>
      </g>)}
    </g>);
  }
  if (cue.survey) {
    const values = cue.survey.labels.map(label => read(step => {
      const index = step.survey?.labels.indexOf(label);
      return index === undefined ? undefined : step.survey?.values[index];
    }));
    const maximum = Math.max(1, ...cue.survey.values, ...values);
    bars('Survey responses',cue.survey.labels.map((label,i) => ({label,value:Math.round(values[i]*100)/100,maximum,color:'#9e87ce'})));
  }
  if (cue.frame || cue.headline) {
    const previous = [...history].slice(0,history.lastIndexOf(cue)).reverse().find(step => step.headline || step.frame);
    panel(420,79,<StoryPanel frame={cue.frame} headline={cue.headline} previous={previous?.headline ?? previous?.frame?.[1]} seconds={seconds}/>);
  }
  if (cue.agenda) {
    const previous = [...history].slice(0,history.lastIndexOf(cue)).reverse().find(step => step.agenda)?.agenda;
    panel(420,42+cue.agenda.length*34,<AgendaPanel topics={cue.agenda} previous={previous} seconds={seconds}/>);
  }
  if (cue.gate) row(`${cue.gate.pass} pass · ${cue.gate.drop} dropped`,<GateIcon {...icon}/>);
  if (cue.attention !== undefined) row(`${Math.round(cue.attention)}% looking`,<Eye {...icon}/>);
  if (cue.opinion) row(`${Math.round(cue.opinion.from+(cue.opinion.to-cue.opinion.from)*clamp(seconds/1.2))}% favour`);
  if (cue.split) row(`Group A ${formatted(cue.split[0])}% · Group B ${formatted(cue.split[1])}%`);
  if (cue.race) panel(374,54,<g fontFamily={PAPER.sans} fontWeight={700} fontSize={21}>
    <circle cx={-152} cy={27} r={8} fill={rumourInk}/><text x={-135} y={34} fill={rumourInk}>Rumour</text>
    <circle cx={20} cy={27} r={8} fill={correctionInk}/><text x={37} y={34} fill={correctionInk}>Correction</text>
  </g>);
  const Reaction = cue.react && {like:ThumbsUp,love:Heart,angry:Angry,question:CircleHelp}[cue.react];
  const inset = bounds && mediaKeys.some(key => cue[key] !== undefined) ? bounds : undefined;
  const available = inset ? Math.max(0, y-inset.top) : Infinity;
  const verticalScale = Math.max(0.55*u, Math.min(u, available/Math.max(1,height-26)));
  const scale = inset ? Math.min(verticalScale,(inset.right-inset.left)/Math.max(1,widest)) : verticalScale;
  const halfWidth = widest*scale/2;
  const panelX = inset ? Math.max(inset.left+halfWidth, Math.min(x,inset.right-halfWidth)) : x;
  const panelY = inset ? Math.max(y,inset.top+(height-26)*scale) : y;
  return <>
    {ring !== undefined && <g fill="none" strokeWidth={7*u}><ellipse {...{cx,cy,rx,ry}} stroke={PAPER.track}/><ellipse {...{cx,cy,rx,ry}} pathLength={1} strokeDasharray={`${ring} 1`} stroke={cue.ttl || cue.cycle ? '#bd8435' : '#598c69'}/></g>}
    <g transform={`translate(${panelX} ${panelY}) scale(${scale})`}>{rows}
      {Reaction && seconds<2 && <g opacity={clamp((2-seconds)*2)} transform={`translate(0,${-seconds*42-height})`}><Reaction x={-24} y={-24} width={48} height={48} fill={cue.react==='like'?'#99c4f3':'#ef9c92'} stroke={PAPER.ink}/></g>}
    </g>
  </>;
}
