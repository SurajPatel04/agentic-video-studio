import {useVideoConfig} from 'remotion';
import {z} from 'zod';
import {LectureBoard, lectureColors, useLectureTiming} from '../components/LectureBoard';
import {PAPER} from '../iso/iso';
import {useUnit} from '../theme';
import {fraction} from './paperStage';

const axis = z.object({label:z.string().max(36), low:z.string().max(25), high:z.string().max(25)}).strict();
const placement = z.object({x:fraction, y:fraction.optional(), at:fraction}).strict();
const marker = placement.extend({label:z.string().min(1).max(42), moves:z.array(placement).max(6).default([])});
const defaultQuadrants = ['Schedule it', 'Do it now', 'Drop it', 'Delegate it'];

export const matrixSceneSchema = z.object({
  title:z.string().min(1).max(78).default('Decide what to do first'),
  subtitle:z.string().max(90).optional(),
  mode:z.enum(['quadrant','spectrum']).default('quadrant'),
  xAxis:axis.default({label:'Urgency',low:'Less urgent',high:'More urgent'}),
  yAxis:axis.optional(),
  quadrants:z.array(z.string().min(1).max(34)).length(4).optional(),
  markers:z.array(marker).max(8).default([
    {label:'Plan next week',x:0.22,y:0.72,at:0.15,moves:[]},
    {label:'Submit today’s work',x:0.76,y:0.79,at:0.40,moves:[]},
    {label:'Forward a routine request',x:0.80,y:0.26,at:0.65,moves:[]},
  ]),
}).strict().superRefine((p, ctx) => {
  p.markers.forEach((m, i) => m.moves.forEach((move, j) => {
    if (move.at <= (j ? m.moves[j - 1].at : m.at)) ctx.addIssue({
      code:'custom',path:['markers',i,'moves',j,'at'],message:'Move after the marker appears and order moves by time.',
    });
  }));
});

export const description = 'A labeled 2×2 quadrant or one-axis spectrum. Choose mode, axis labels and endpoints. Quadrant labels run top left, top right, bottom left, bottom right. Place timed markers with normalized x (left to right) and y (bottom to top); optional moves reposition a marker on cue. Use for urgent vs important, tone, media bias, or sorting decisions.';
export const tags = ['quadrant', '2x2', 'matrix', 'spectrum', 'scale', 'slider', 'sorting', 'urgency', 'importance', 'bias', 'formal', 'informal'];

export function MatrixScene(input: z.input<typeof matrixSceneSchema>) {
  const p = matrixSceneSchema.parse(input);
  const {width,height} = useVideoConfig();
  const portrait = width < height;
  const u = useUnit(), timing = useLectureTiming();
  const quadrant = p.mode === 'quadrant';
  const yAxis = p.yAxis ?? {label:'Importance',low:'Less important',high:'More important'};
  return <LectureBoard title={p.title} subtitle={p.subtitle}>
    <div style={{display:'grid', width:'100%', maxWidth:1500 * u, alignSelf:'center',
      gridTemplateColumns:portrait ? '1fr' : 'minmax(0, 2.5fr) minmax(0, 1fr)', gap:38 * u, alignItems:'center'}}>
      <div style={{padding:`${30 * u}px 0 0 ${(quadrant ? 48 : 8) * u}px`, position:'relative', minWidth:0}}>
        {quadrant ? <div style={{position:'absolute', left:0, top:35 * u, bottom:48 * u, display:'flex',
          writingMode:'vertical-rl', transform:'rotate(180deg)', alignItems:'center', justifyContent:'space-between',
          fontSize:20 * u, color:PAPER.inkSoft}}>
          <span>{yAxis.low}</span><strong>{yAxis.label}</strong><span>{yAxis.high}</span>
        </div> : null}
        <div style={{height:(quadrant ? (portrait ? 690 : 480) : 234) * u, position:'relative',
          border:`${2 * u}px solid ${PAPER.inkSoft}`, borderRadius:17 * u, background:PAPER.card, overflow:'hidden'}}>
          {quadrant ? <div style={{position:'absolute',inset:0,display:'grid',gridTemplate:'1fr 1fr / 1fr 1fr',gap:2 * u,background:PAPER.inkSoft}}>
            {(p.quadrants ?? defaultQuadrants).map((label,i) => <div key={i}
              style={{background:lectureColors[i].fill,padding:`${15 * u}px ${18 * u}px`,fontSize:23 * u,fontWeight:750,color:lectureColors[i].ink}}>{label}</div>)}
          </div> : <div style={{position:'absolute',left:'5%',right:'5%',top:'50%',height:5 * u,borderRadius:5 * u,
            background:'linear-gradient(90deg, #745294, #d5c6bc, #2f775e)'}}/>}
          {p.markers.map((m,i) => {
            let x = m.x, y = m.y ?? 0.5;
            for (const move of m.moves) {
              const t = timing.progress(move.at);
              x += (move.x - x) * t;
              if (move.y !== undefined) y += (move.y - y) * t;
            }
            const color = lectureColors[i % lectureColors.length];
            return <div key={i} style={{position:'absolute',left:`${5 + 90 * x}%`,
              top:quadrant ? `${7 + 86 * (1-y)}%` : '50%', transform:'translate(-50%, -50%)',
              opacity:timing.progress(m.at), display:'grid', placeItems:'center', width:44 * u,height:44 * u,
              borderRadius:'50%', background:color.ink,color:'white', border:`${2 * u}px solid white`,
              fontSize:22 * u,fontWeight:750}}>{i+1}</div>;
          })}
        </div>
        <div style={{display:'flex',justifyContent:'space-between',gap:10 * u,marginTop:14 * u,color:PAPER.inkSoft,fontSize:21 * u}}>
          <span>{p.xAxis.low}</span><strong>{p.xAxis.label}</strong><span>{p.xAxis.high}</span>
        </div>
      </div>
      <div style={{display:'grid', gridTemplateColumns:portrait && p.markers.length > 4 ? '1fr 1fr' : '1fr', rowGap:13 * u}}>
        {p.markers.map((m,i)=><div key={i} style={{display:'flex',gap:12 * u,alignItems:'center',minHeight:40 * u,
          opacity:timing.progress(m.at),fontSize:24 * u,lineHeight:1.2}}>
          <span style={{background:lectureColors[i % lectureColors.length].ink,color:'white',width:34 * u,height:34 * u,
            flex:'0 0 auto',display:'grid',placeItems:'center',borderRadius:'50%',fontWeight:750}}>{i+1}</span>
          <span>{m.label}</span></div>)}
      </div>
    </div>
  </LectureBoard>;
}
