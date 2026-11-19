import {useId} from 'react';
import {useVideoConfig} from 'remotion';
import {z} from 'zod';
import {LectureBoard, lectureColors, useLectureTiming} from '../components/LectureBoard';
import {PAPER} from '../iso/iso';
import {fraction} from './paperStage';

const concept=z.object({
  id:z.string().min(1).max(24),label:z.string().min(1).max(42),at:fraction.default(0),
  position:z.tuple([fraction,fraction]).optional(),
}).strict();
const relation=z.object({
  from:z.string().min(1),to:z.string().min(1),label:z.string().max(25).optional(),at:fraction.default(0),
}).strict();

export const conceptMapSceneSchema=z.object({
  title:z.string().max(78).default('Three questions for media literacy'),
  center:z.string().max(24).optional(),
  nodes:z.array(concept).min(2).max(8).default([
    {id:'media',label:'Media literacy',at:0},
    {id:'source',label:'Who made it?',at:0.22},
    {id:'evidence',label:'What supports it?',at:0.45},
    {id:'audience',label:'Who is it for?',at:0.66},
  ]),
  links:z.array(relation).max(12).optional(),
}).strict().superRefine((p,ctx)=>{
  const ids=new Set(p.nodes.map(node=>node.id));
  if (ids.size!==p.nodes.length) ctx.addIssue({code:'custom',path:['nodes'],message:'Give each concept a unique ID.'});
  if (p.center && !ids.has(p.center)) ctx.addIssue({code:'custom',path:['center'],message:'Choose an existing concept as the center.'});
  const pairs=new Set<string>();
  p.links?.forEach((link,i)=>{
    const pair=JSON.stringify([link.from,link.to].sort());
    if (!ids.has(link.from) || !ids.has(link.to) || link.from===link.to || pairs.has(pair)) ctx.addIssue({
      code:'custom',path:['links',i],message:'Use one relationship per pair of distinct, existing concepts.',
    });
    pairs.add(pair);
  });
});

export const description='A centered mind map or concept map with gradually revealed concepts and labeled relationships. Omit links for radial branches from the center. Supply links to show how ideas relate, and optional normalized positions for a custom arrangement.';
export const tags=['mind map','concept map','relationship','branching','overview','recap','brainstorming','ideas'];

type Point = {x: number; y: number};
type Box = Point & {w: number; h: number};
const overlaps = (a: Box, b: Box, gap = 10) =>
  Math.abs(a.x - b.x) < (a.w + b.w) / 2 + gap && Math.abs(a.y - b.y) < (a.h + b.h) / 2 + gap;

function anchor(box: Box, toward: Point) {
  const dx = toward.x - box.x, dy = toward.y - box.y;
  const t = Math.min(0.5, (box.w / 2 + 6) / Math.abs(dx), (box.h / 2 + 6) / Math.abs(dy));
  return {x: box.x + dx * t, y: box.y + dy * t};
}

export function ConceptMapScene(input: z.input<typeof conceptMapSceneSchema>) {
  const p = conceptMapSceneSchema.parse(input);
  const timing = useLectureTiming();
  const {width, height} = useVideoConfig();
  const portrait = width < height;
  const arrowId = useId();
  const W = portrait ? 880 : 1440, H = portrait ? 1100 : 655;
  const center = p.center ?? p.nodes[0].id;
  const others = p.nodes.filter(node => node.id !== center);
  const positions = new Map(p.nodes.map(node => {
    const angle = -Math.PI / 2 + (others.indexOf(node) + 0.5) * 2 * Math.PI / others.length;
    const main = node.id === center;
    const position = node.position ?? (main ? [0.5, 0.5] : [0.5 + 0.49 * Math.cos(angle), 0.5 + 0.49 * Math.sin(angle)]);
    return [node.id, {x: 150 + (W - 300) * position[0], y: 64 + (H - 148) * position[1],
      w: main ? 253 : 222, h: main ? 94 : 74, at: node.at}];
  }));
  const occupied: Box[] = [...positions.values()];
  const links = p.links ?? others.map(node => ({from: center, to: node.id, at: 0, label: undefined}));
  const routes = links.map(link => {
    const from = positions.get(link.from)!, to = positions.get(link.to)!;
    const start = anchor(from, to), end = anchor(to, from);
    const dx = end.x - start.x, dy = end.y - start.y, span = Math.hypot(dx, dy) || 1;
    const labelWidth = (link.label?.length ?? 0) * 12 + 22;
    const clearance = (Math.abs(dy) * labelWidth / 2 + Math.abs(dx) * 15) / span + 8;
    // Check all cards, including ones that have yet to appear, so labels never move between cues.
    const spots = [0.5, 0.36, 0.64].flatMap(t => [clearance, -clearance, clearance + 18, -clearance - 18].map(offset => ({
      x: start.x + t * dx - offset * dy / span, y: start.y + t * dy + offset * dx / span,
      w: labelWidth, h: 30,
    })));
    const label = link.label ? spots.find(box => box.x - box.w / 2 >= 0 && box.x + box.w / 2 <= W &&
      box.y - box.h / 2 >= 0 && box.y + box.h / 2 <= H && occupied.every(item => !overlaps(item, box))) : undefined;
    if (label) occupied.push(label);
    return {link, start, end, label, at: Math.max(from.at, to.at, link.at)};
  });
  const legend = routes.filter(route => route.link.label && !route.label);
  const labels = new Map(p.nodes.map(node => [node.id, node.label]));
  return <LectureBoard title={p.title}>
    <div style={{width:'100%', minWidth:0, display:'flex', flexDirection:'column', justifyContent:'center'}}>
      <svg width="100%" viewBox={`0 0 ${W} ${H}`} style={{minHeight:0, flex:'1 1 auto'}} aria-label={p.title} role="img">
        <defs><marker id={arrowId} viewBox="0 0 8 8" refX="7" refY="4" markerWidth="5" markerHeight="5" orient="auto">
          <path d="M 0 0 L 8 4 L 0 8 Z" fill="#806c9a"/>
        </marker></defs>
        {routes.map(({link,start,end,label,at}) => {
          const strength = timing.progress(at, 0.42);
          if (!strength) return null;
          return <g key={`${link.from}-${link.to}`}>
            <line x1={start.x} y1={start.y} x2={start.x + (end.x - start.x) * strength}
              y2={start.y + (end.y - start.y) * strength} stroke="#806c9a" strokeWidth={2.8}
              markerEnd={p.links ? `url(#${arrowId})` : undefined}/>
            {label && link.label ? <g opacity={Math.max(0, (strength - 0.36) / 0.64)}>
              <rect x={label.x-label.w/2} y={label.y-label.h/2} width={label.w} height={label.h} rx={8}
                fill={PAPER.card} stroke={PAPER.track}/>
              <text x={label.x} y={label.y} fill={PAPER.ink} textAnchor="middle" dominantBaseline="central"
                fontSize={21} fontWeight={700}>{link.label}</text>
            </g> : null}
          </g>;
        })}
        {p.nodes.map((node,i) => {
          const box = positions.get(node.id)!;
          const main = node.id === center;
          const tone = lectureColors[i % lectureColors.length];
          const strength = timing.progress(node.at, 0.42);
          return <foreignObject key={node.id} x={box.x-box.w/2} y={box.y-box.h/2} width={box.w} height={box.h}
            opacity={strength}>
            <div style={{boxSizing:'border-box', height:'100%', display:'grid', placeItems:'center', padding:'7px 12px',
              border:`2px solid ${tone.ink}`, borderRadius:14, textAlign:'center', overflowWrap:'anywhere',
              fontSize:main ? 30 : 24, fontWeight:750, lineHeight:1.08, color:tone.ink,
              background:main ? tone.fill : PAPER.card}}>{node.label}</div>
          </foreignObject>;
        })}
      </svg>
      {legend.length ? <div style={{display:'flex',flexWrap:'wrap',justifyContent:'center',gap:'4px 20px',
        color:PAPER.inkSoft,fontSize:'clamp(12px, 1.4vmin, 22px)'}}>
        {legend.map(({link,at}) => <span key={`${link.from}-${link.to}`} style={{opacity:timing.progress(at, 0.42)}}>
          {labels.get(link.from)} → {link.label} → {labels.get(link.to)}
        </span>)}
      </div> : null}
    </div>
  </LectureBoard>;
}
