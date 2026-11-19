import {useVideoConfig} from 'remotion';
import {z} from 'zod';
import {LectureBoard, lectureColors, useLectureTiming} from '../components/LectureBoard';
import {PAPER} from '../iso/iso';
import {useUnit} from '../theme';
import {fraction} from './paperStage';

const stage = z.object({text:z.string().min(1).max(140),at:fraction}).strict();
const outcome = stage.extend({
  metrics:z.array(z.object({value:z.string().min(1).max(32),label:z.string().min(1).max(50)}).strict()).max(3).default([]),
  source:z.string().max(100).optional(),
});

export const caseStudySceneSchema = z.object({
  title:z.string().max(78).default('A simpler reminder for a library event'),
  context:z.string().max(90).optional(),
  goal:stage.default({text:'Help more people find the time and location of the free event.',at:0}),
  strategy:stage.default({text:'Put the time, location and signup link at the top of the reminder.',at:0.24}),
  result:outcome.default({text:'More recipients opened the signup page in this illustrative example.',
    metrics:[{value:'18 → 29',label:'Visits to the signup page'}],at:0.50}),
  lesson:stage.default({text:'Put what readers need to act on where they will see it first.',at:0.76}),
}).strict().superRefine((p,ctx) => {
  const keys = ['goal','strategy','result','lesson'] as const;
  keys.slice(1).forEach((key,i) => {
    if (p[key].at < p[keys[i]].at) ctx.addIssue({code:'custom',path:[key,'at'],message:'Reveal goal, strategy, result and lesson in order.'});
  });
});

export const description = 'A four-part case study board. Keep the goal, strategy, measured result and lesson in view as each is revealed. Supply optional metrics with units or comparison baselines, plus a source for real results.';
export const tags = ['case study', 'campaign', 'startup', 'strategy', 'outcome', 'measured result', 'history', 'impact'];

export function CaseStudyScene(input: z.input<typeof caseStudySceneSchema>) {
  const p = caseStudySceneSchema.parse(input);
  const u = useUnit(), timing = useLectureTiming();
  const {width,height} = useVideoConfig();
  const portrait = width < height;
  const parts = [{name:'Goal',stage:p.goal},{name:'Strategy',stage:p.strategy},
    {name:'Result',stage:p.result},{name:'Lesson',stage:p.lesson}];
  return <LectureBoard title={p.title} subtitle={p.context}>
    <div style={{width:'100%',maxWidth:1460*u,alignSelf:'center',display:'grid',
      gridTemplateColumns:portrait ? '1fr' : 'repeat(2,minmax(0,1fr))',gap:20*u}}>
      {parts.map(({name,stage},i) => {
        const tone=lectureColors[i];
        const appear=timing.progress(stage.at);
        return <section key={name} style={{opacity:appear,transform:`translateY(${(1-appear)*7*u}px)`,
          background:PAPER.card,border:`1px solid ${PAPER.track}`,borderTop:`${5*u}px solid ${tone.ink}`,
          minHeight:(portrait ? 212 : 208)*u,borderRadius:14*u,padding:`${18*u}px ${23*u}px`}}>
          <strong style={{fontSize:21*u,color:tone.ink}}>{name}</strong>
          <p style={{fontSize:26*u,lineHeight:1.24,margin:`${9*u}px 0 0`}}>{stage.text}</p>
          {name==='Result' ? <>
            <div style={{display:'flex',gap:14*u,marginTop:11*u,flexWrap:'wrap'}}>
              {p.result.metrics.map((metric,j)=><div key={j} style={{display:'grid',padding:`${6*u}px ${10*u}px`,
                borderRadius:8*u,background:tone.fill,color:tone.ink,maxWidth:'100%'}}>
                <strong style={{fontSize:31*u,lineHeight:1.1}}>{metric.value}</strong>
                <span style={{fontSize:17*u}}>{metric.label}</span>
              </div>)}
            </div>
            {p.result.source ? <div style={{marginTop:8*u,color:PAPER.inkSoft,fontSize:17*u}}>{p.result.source}</div> : null}
          </> : null}
        </section>;
      })}
    </div>
  </LectureBoard>;
}
