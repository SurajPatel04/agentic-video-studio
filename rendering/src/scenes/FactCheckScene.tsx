import {z} from 'zod';
import {LectureBoard, lectureColors, useLectureTiming} from '../components/LectureBoard';
import {PAPER} from '../iso/iso';
import {useUnit} from '../theme';
import {fraction} from './paperStage';

const evidence = z.object({
  finding:z.string().min(1).max(137),
  source:z.string().min(1).max(78),
  at:fraction,
}).strict();
const verdict = z.object({
  status:z.enum(['supported','contradicted','misleading','mixed','unverified']),
  reason:z.string().min(1).max(135),
  at:fraction,
}).strict();

export const factCheckSceneSchema = z.object({
  title:z.string().max(78).default('Check the claim against the source'),
  claim:z.string().min(1).max(160).default('“Every library branch opens on Sunday.”'),
  attribution:z.string().max(70).optional(),
  evidence:z.array(evidence).min(1).max(3).default([
    {finding:'The sample schedule lists three branches. Only Central has Sunday hours.',source:'Illustrative library schedule',at:0.34},
  ]),
  verdict:verdict.default({status:'contradicted',reason:'The schedule shows at least one branch closed on Sunday.',at:0.70}),
}).strict().superRefine((p, ctx) => {
  p.evidence.forEach((item,i) => {
    if (item.at >= p.verdict.at || (i > 0 && item.at < p.evidence[i-1].at)) {
      ctx.addIssue({code:'custom',path:['evidence',i,'at'],message:'Reveal ordered evidence before the verdict.'});
    }
  });
});

export const description = 'Hold a claim on screen, reveal source-attributed evidence, then stamp a supported, contradicted, misleading, mixed or unverified verdict with its reason. Use evidence the lesson actually has and label illustrative examples.';
export const tags = ['fact check', 'fact-checking', 'media literacy', 'claim', 'evidence', 'verdict', 'verification', 'misinformation', 'sources'];

const verdictStyle = {
  supported: lectureColors[1], contradicted: lectureColors[4], misleading: lectureColors[2],
  mixed: lectureColors[0], unverified: lectureColors[3],
};

export function FactCheckScene(input: z.input<typeof factCheckSceneSchema>) {
  const p = factCheckSceneSchema.parse(input);
  const u = useUnit(), timing = useLectureTiming();
  const tone = verdictStyle[p.verdict.status];
  const appear = timing.progress(p.verdict.at);
  return <LectureBoard title={p.title}>
    <div style={{display:'grid', width:'100%', maxWidth:1310*u, alignSelf:'center', gap:14*u}}>
      <div style={{borderLeft:`${5*u}px solid ${lectureColors[0].ink}`, background:lectureColors[0].fill,
        borderRadius:11*u,padding:`${18*u}px ${24*u}px`}}>
        <div style={{fontSize:19*u,fontWeight:800,color:lectureColors[0].ink}}>Claim</div>
        <div style={{marginTop:5*u,fontSize:34*u,fontWeight:720,lineHeight:1.16}}>{p.claim}</div>
        {p.attribution ? <div style={{fontSize:19*u,marginTop:7*u,color:PAPER.inkSoft}}>{p.attribution}</div> : null}
      </div>
      {p.evidence.map((item,i) => <div key={i} style={{opacity:timing.progress(item.at),background:PAPER.card,
        border:`1px solid ${PAPER.track}`, borderRadius:11*u, padding:`${13*u}px ${24*u}px`}}>
        <div style={{fontSize:25*u,fontWeight:630,lineHeight:1.2}}>{item.finding}</div>
        <div style={{fontSize:18*u,color:PAPER.inkSoft,marginTop:6*u}}>{item.source}</div>
      </div>)}
      <div style={{display:'flex',alignItems:'center',flexWrap:'wrap',gap:16*u,padding:`${11*u}px 0`,opacity:appear}}>
        <strong style={{display:'inline-block',border:`${3*u}px solid ${tone.ink}`,borderRadius:8*u,
          background:tone.fill,color:tone.ink,padding:`${7*u}px ${15*u}px`,fontSize:24*u,textTransform:'uppercase',
          transform:`rotate(${-7+4*appear}deg) scale(${0.93+0.07*appear})`}}>{p.verdict.status}</strong>
        <span style={{fontSize:24*u,flex:'1 1 300px',lineHeight:1.2,fontWeight:650}}>{p.verdict.reason}</span>
      </div>
    </div>
  </LectureBoard>;
}
