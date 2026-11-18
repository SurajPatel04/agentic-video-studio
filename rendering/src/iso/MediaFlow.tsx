import {z} from 'zod';
import {FileText, Funnel} from 'lucide-react';
import {along, type Curve} from './curve';
import {PAPER, type Pt} from './iso';
import {fittedPaperText} from './textFit';

const percent = z.number().min(0).max(100);
const storyCount = z.number().int().min(0).max(20);
const headline = z.string().trim().min(1).max(70);
const topic = z.string().trim().min(1).max(26);
export const mediaFlowFields = {
  spread: z.object({depth:z.number().int().min(1).max(6)}).strict().optional(),
  gate: z.object({pass:storyCount, drop:storyCount}).strict()
    .refine(({pass,drop}) => pass+drop > 0, 'Add at least one story').optional(),
  frame: z.tuple([headline,headline]).optional(),
  agenda: z.array(topic).min(2).max(5)
    .refine(topics => new Set(topics).size === topics.length, 'Use distinct agenda topics').optional(),
  bubble: z.boolean().optional(),
  race: z.object({rumour:z.number().min(0.25).max(6), correction:z.number().min(0.25).max(6)}).strict().optional(),
  attention: percent.optional(),
  opinion: z.object({from:percent,to:percent}).strict().optional(),
  split: z.tuple([percent,percent]).refine(([a,b]) => Math.abs(a+b-100) < 0.0001, 'Audience split must total 100').optional(),
  headline: headline.optional(),
};

const schema = z.object(mediaFlowFields);
export type MediaFlowStep = z.output<typeof schema>;
export const rumourInk = '#ad4544';
export const correctionInk = '#34724e';
export const unitInterval = (value:number) => Math.min(1,Math.max(0,value));

type Edge = {from:string;to:string};
/** Walk each recipient once, so cycles in the diagram cannot restart the ripple. */
export function shareHops(links:Edge[], source:string, depth:number) {
  const visited = new Set([source]);
  let frontier = new Set([source]);
  const hops = new Map<number,number>();
  for (let hop=0; hop<depth && frontier.size; hop++) {
    const next = new Set<string>();
    links.forEach((link,index) => {
      if (!frontier.has(link.from) || visited.has(link.to)) return;
      if (next.has(link.to)) return;
      hops.set(index,hop);
      next.add(link.to);
    });
    next.forEach(id => visited.add(id));
    frontier = next;
  }
  return hops;
}

export function BroadcastWaves({origin, radius, seconds, u}: {origin:Pt;radius:number;seconds:number;u:number}) {
  return <g fill="none" stroke="#765eaa" strokeWidth={3*u}>
    {[0,0.45,0.9].map(delay => {
      const phase = seconds-delay;
      if (phase <= 0) return null;
      const progress = (phase%1.65)/1.65;
      return <circle key={delay} cx={origin.x} cy={origin.y} r={Math.max(1,radius*progress)}
        opacity={0.48*Math.sin(Math.PI*progress)}/>;
    })}
  </g>;
}

type Gate = NonNullable<MediaFlowStep['gate']>;
type Race = NonNullable<MediaFlowStep['race']>;
export type LinkMedia = {
  share?:number;
  gate?:{counts:Gate;seconds:number;entering:boolean};
  race?:{rates:Race;seconds:number};
  bounce?:number;
};
export function LinkMediaMotion({k,u,media}: {k:Curve;u:number;media:LinkMedia}) {
  const packet = (key:string, t:number, color:string, offset=0, lift=0, opacity=1, story=false) => {
    const {p,angle} = along(k,t);
    return <g key={key} opacity={opacity} transform={`translate(${p.x-Math.sin(angle)*offset*u} ${p.y+Math.cos(angle)*offset*u+lift*u}) scale(${u})`}>
      {story ? <FileText x={-16} y={-16} width={32} height={32} fill={color} color={PAPER.ink}/> :
        <circle r={8} fill={color} stroke={PAPER.ink} strokeWidth={2}/>}
    </g>;
  };
  if (media.bounce !== undefined) {
    const t = (media.bounce%1.45)/1.45;
    const position = t<0.6 ? 0.91*t/0.6 : 0.91-0.38*(t-0.6)/0.4;
    return <>{packet('bounce',position,'#edab94',0,-24*Math.max(0,t-0.6),unitInterval((1-t)*5))}</>;
  }
  if (media.race) {
    const {rates,seconds} = media.race;
    return <>{(['rumour','correction'] as const).flatMap((name,lane) =>
      [0,1,2].map((index) => {
        const t = seconds*rates[name]*0.5-index/3;
        if (t<0) return null;
        const p = t%1;
        return packet(`${name}-${index}`,p,lane ? '#80cb96' : '#ed8b83',lane ? 13 : -13,0,unitInterval(Math.min(p,1-p)*12));
      }))}</>;
  }
  if (media.gate) {
    const {counts,seconds,entering} = media.gate;
    const total = counts.pass+counts.drop;
    const elapsed = seconds;
    return <>{Array.from({length:total},(_,index) => {
      const passed = index<counts.pass;
      const t = (elapsed-index*0.34-(entering ? 0 : 0.68))/0.68;
      if (t<0 || t>1 || (!entering && !passed)) return null;
      const falling = entering && !passed ? unitInterval((t-0.7)/0.3) : 0;
      return packet(String(index),entering && !passed ? Math.min(t,0.82) : t,passed ? '#b8e4c6' : '#f5b2a6',
        0,falling**2*66,1-falling,true);
    })}</>;
  }
  if (media.share !== undefined && media.share >= 0 && media.share <= 0.85) {
    const t = media.share/0.85;
    return <>{packet('share',t,'#ddd0f3',0,0,unitInterval(Math.min(t,1-t)*10),true)}</>;
  }
  return null;
}

export function LinkNoise({k,u,seconds}: {k:Curve;u:number;seconds:number}) {
  const tick = Math.floor(seconds*12);
  const {p} = along(k,0.5);
  return <g fill="#a84e47" stroke="#a84e47">
    {Array.from({length:16},(_,i) => {
      const {p,angle} = along(k,0.31+i*0.023);
      const offset = ((tick*17+i*23)%31-15)*u;
      return <circle key={i} cx={p.x-Math.sin(angle)*offset} cy={p.y+Math.cos(angle)*offset}
        r={(2+(tick+i)%3)*u} opacity={0.55}/>;
    })}
    <text x={p.x} y={p.y+32*u} textAnchor="middle" stroke={PAPER.bg} strokeWidth={5*u}
      paintOrder="stroke" fontFamily={PAPER.font} fontWeight={700} fontSize={21*u}>{tick%2 ? 'M#SS?GE' : 'ME%%A_E'}</text>
  </g>;
}

export function StoryPanel({frame,headline,previous,seconds}: {
  frame?:[string,string];headline?:string;previous?:string;seconds:number;
}) {
  const flip = unitInterval((seconds-(frame ? 1.2 : 0))/0.55);
  const before = frame?.[0] ?? previous;
  const after = frame?.[1] ?? headline ?? '';
  const text = before && flip<0.5 ? before : after;
  const scale = before && flip>0 && flip<1 ? Math.max(0.03,Math.abs(Math.cos(Math.PI*flip))) : 1;
  return <g fontFamily={PAPER.sans} fontWeight={700} fill={PAPER.ink}>
    <rect x={-193} y={17} width={31} height={29} rx={4} fill="#c7e1ec" stroke={PAPER.ink}/>
    <circle cx={-172} cy={24} r={3} fill="#e6ac5c"/>
    <path d="M-191 42 l9-11 7 7 5-5 6 9Z" fill="#659179"/>
    <text x={-150} y={28} fontSize={16}>{frame ? 'Same photo' : 'Headline'}</text>
    <g transform={`translate(0 53) scale(1 ${scale})`}>
      <text x={-150} y={8} fontSize={fittedPaperText(text,344,27,700)}>{text}</text>
    </g>
  </g>;
}

export function AgendaPanel({topics,previous,seconds}: {topics:string[];previous?:string[];seconds:number}) {
  const progress = unitInterval(seconds/0.85);
  const switching = !!previous && progress < 0.5;
  const order = switching ? previous : topics;
  const opacity = previous ? Math.abs(progress*2-1) : 1;
  return <g fontFamily={PAPER.sans} fontWeight={700} fill={PAPER.ink}>
    <text x={-190} y={26} fontSize={20}>Coverage priority</text>
    {order.slice(0,topics.length).map((topic,rank) => {
      const length = 142-rank*20;
      return <g key={topic} transform={`translate(${previous ? (1-opacity)*(switching ? -12 : 12) : 0} ${36+rank*34})`} opacity={opacity}>
        <rect x={-194} width={388} height={30} rx={7} fill={PAPER.card} stroke={PAPER.track}/>
        <text x={-181} y={21} fontSize={fittedPaperText(topic,170,18,700)}>{topic}</text>
        <rect x={26} y={8} width={length*(previous ? 1 : progress)} height={14} rx={5} fill="#b8a2df"/>
      </g>;
    })}
  </g>;
}

export const GateIcon = Funnel;
