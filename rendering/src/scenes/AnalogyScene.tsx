import {Img, useVideoConfig} from 'remotion';
import {z} from 'zod';
import {LectureBoard, lectureColors, useLectureTiming} from '../components/LectureBoard';
import {resolveImageSource} from '../components/imageSource';
import {PAPER} from '../iso/iso';
import {useUnit} from '../theme';
import {fraction, Icon} from './paperStage';

const illustration = z.object({label:z.string().min(1).max(42),icon:z.string().max(48).optional(),
  image:z.string().max(500).optional()}).strict();
const pair = z.object({left:z.string().min(1).max(47),right:z.string().min(1).max(47),
  explanation:z.string().min(1).max(125),at:fraction}).strict();

export const analogySceneSchema = z.object({
  title:z.string().max(78).default('An API request is like ordering from a menu'),
  familiar:illustration.default({label:'At a café',icon:'coffee'}),
  subject:illustration.default({label:'Using an API',icon:'plug'}),
  pairs:z.array(pair).min(1).max(4).default([
    {left:'Order name',right:'Request path',explanation:'Both tell the recipient what you are asking for.',at:0.16},
    {left:'The café fills the order',right:'The server handles the request',explanation:'The recipient does the work and sends something back.',at:0.45},
  ]),
  limitation:z.object({text:z.string().min(1).max(125),at:fraction}).strict().optional(),
}).strict().superRefine((p,ctx) => {
  p.pairs.forEach((value,i)=>{
    if (i && value.at <= p.pairs[i-1].at) ctx.addIssue({code:'custom',path:['pairs',i,'at'],message:'Order the matching pairs by narration cue.'});
  });
  if (p.limitation && p.limitation.at <= p.pairs[p.pairs.length - 1].at) ctx.addIssue({
    code:'custom',path:['limitation','at'],message:'Explain where the analogy ends after revealing the pairs.',
  });
});

export const description = 'Pair a familiar situation with a new idea. Use illustration labels, icons or images, and reveal each matching pair with shared emphasis when it is explained. An optional final cue shows where the analogy breaks down.';
export const tags = ['analogy', 'metaphor', 'mapping', 'cross-domain', 'introductory', 'familiar example', 'comparison'];

export function AnalogyScene(input: z.input<typeof analogySceneSchema>) {
  const p=analogySceneSchema.parse(input);
  const u=useUnit(),timing=useLectureTiming();
  const {width,height}=useVideoConfig();
  const portrait=width<height;
  const active=p.pairs.filter(pair=>timing.cueFrame(pair.at)<=timing.frame).at(-1);
  const limit=p.limitation && timing.cueFrame(p.limitation.at)<=timing.frame ? p.limitation : undefined;
  const tone=lectureColors[0];
  const columns='minmax(0,1fr) minmax(0,0.1fr) minmax(0,1fr)';
  return <LectureBoard title={p.title}>
    <div style={{width:'100%',maxWidth:1320*u,display:'grid',gap:11*u,alignSelf:'center'}}>
      <div style={{display:'grid',gridTemplateColumns:columns}}>
        {[p.familiar,p.subject].map((panel,i)=>{
          const color=lectureColors[i];
          const src=resolveImageSource(panel.image ?? '');
          return <div key={i} style={{gridColumn:i ? 3 : 1,display:'flex',flexDirection:'column',alignItems:'center',
            justifyContent:'center',gap:13*u,background:color.fill,color:color.ink,borderRadius:15*u,
            minHeight:(portrait?175:156)*u,padding:12*u,textAlign:'center'}}>
            {src ? <Img src={src} alt={panel.label} style={{width:'100%',height:(portrait?180:126)*u,objectFit:'contain'}}/> :
              panel.icon ? <Icon name={panel.icon} size={65*u} color={color.ink}/> : null}
            <strong style={{fontSize:32*u,lineHeight:1.15}}>{panel.label}</strong>
          </div>;
        })}
      </div>
      {p.pairs.map((pair,i)=>{
        const selected=active===pair && !limit;
        const color=lectureColors[i%lectureColors.length];
        return <div key={i} style={{display:'grid',gridTemplateColumns:columns,alignItems:'stretch',opacity:timing.progress(pair.at)}}>
          {[pair.left,pair.right].map((label,j)=><div key={j} style={{gridColumn:j ? 3 : 1,gridRow:1,
            background:selected?color.fill:PAPER.card,color:selected?color.ink:PAPER.ink,
            border:`1px solid ${selected?color.ink:PAPER.track}`,borderRadius:9*u,
            display:'grid',placeItems:'center',minHeight:59*u,fontSize:25*u,fontWeight:selected?750:550,
            lineHeight:1.15,textAlign:'center',padding:`${8*u}px ${10*u}px`}}>{label}</div>)}
          <div aria-hidden style={{gridColumn:2,gridRow:1,alignSelf:'center',textAlign:'center',fontSize:32*u,
            color:selected?color.ink:PAPER.inkSoft}}>↔</div>
        </div>;
      })}
      <div style={{minHeight:82*u,textAlign:'center',padding:`${8*u}px 0`,fontSize:25*u,lineHeight:1.22,
        fontWeight:650,color:limit?tone.ink:PAPER.ink}}>{limit?.text ?? active?.explanation}</div>
    </div>
  </LectureBoard>;
}
