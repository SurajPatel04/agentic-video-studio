import {z} from 'zod';
import {LearningBoard, LearningCard, useLearningLayout} from '../components/LearningBoard';
import {lectureColors} from '../components/LectureBoard';
import {RAGScene} from './RAGScene';
import {fraction} from './paperStage';

const stage=z.object({
  label:z.string().min(1).max(37), detail:z.string().min(1).max(156),
  evidence:z.string().max(130).optional(), at:fraction,
}).strict();
const mode=z.enum(['lifecycle','rag','tools','reliability']);
const stageExamples:Record<z.infer<typeof mode>,{title:string;steps:z.output<typeof stage>[]}>={
  lifecycle:{title:'When does a language model change its weights?',steps:[
    {at:0,label:'Pretraining',detail:'Learn to predict tokens from a large collection of training examples.',evidence:'Weights update from prediction errors.'},
    {at:0.24,label:'Fine-tuning',detail:'Continue training with selected examples for a task or style.',evidence:'This stage also updates weights.'},
    {at:0.52,label:'Inference',detail:'Use the trained model and the current prompt to generate an answer.',evidence:'The prompt changes the input. Model weights stay fixed for generation.'},
  ]},
  rag:{title:'Answer a question with a retrieved passage',steps:[
    {at:0,label:'Question',detail:'When does the library close on Friday?'},
    {at:0.22,label:'Retrieve',detail:'Find a relevant passage from the library’s sample schedule.',evidence:'[1] Friday hours: 9 a.m. to 6 p.m.'},
    {at:0.46,label:'Supply context',detail:'Give the model the question and passage [1].',evidence:'The retrieved schedule is part of this request.'},
    {at:0.7,label:'Answer with evidence',detail:'The library closes at 6 p.m. on Friday. [1]',evidence:'Passage [1] explicitly gives the Friday closing time.'},
  ]},
  tools:{title:'Use a tool result to answer a question',steps:[
    {at:0,label:'Request',detail:'How many pages are in four 18-page booklets?'},
    {at:0.22,label:'Select a tool',detail:'The model chooses the calculator.',evidence:'multiply(4, 18)'},
    {at:0.46,label:'Receive result',detail:'The calculator returns 72.',evidence:'{ "result": 72 }'},
    {at:0.7,label:'Use the result',detail:'Four booklets contain 72 pages in total.'},
  ]},
  reliability:{title:'Check whether an answer is supported',steps:[
    {at:0,label:'Evidence available',detail:'The sample schedule says Friday closing time is 6 p.m. Saturday hours are missing.'},
    {at:0.23,label:'Supported',detail:'“The library closes at 6 p.m. on Friday.”',evidence:'The source explicitly gives the Friday closing time.'},
    {at:0.48,label:'Unsupported',detail:'“The library closes at 6 p.m. on Saturday.”',evidence:'The Friday entry gives no Saturday hours.'},
    {at:0.71,label:'Evidence is missing',detail:'“This schedule does not show Saturday hours.”',evidence:'Ask for the Saturday schedule to verify the answer.'},
  ]},
};
export const aiWorkflowSceneSchema=z.object({
  mode:mode.default('rag'),title:z.string().max(78).optional(),steps:z.array(stage).min(2).max(4).optional(),
}).strict().superRefine((p,ctx)=>{
  p.steps?.forEach((item,i)=>{
    if(i&&item.at<=p.steps![i-1].at) ctx.addIssue({code:'custom',path:['steps',i,'at'],message:'Reveal steps in narration order.'});
  });
});
export const description='Keep one board for an AI workflow. Mode lifecycle compares pretraining, fine-tuning and inference; rag traces question, retrieval, context and cited answer; tools traces tool selection and returned result; reliability compares grounded, unsupported and uncertain answers. Supply concrete steps and evidence.';
export const tags=['llm','pretraining','fine-tuning','inference','rag','retrieval augmented generation','grounding','tool calling','agents','ai reliability','hallucination','evaluation'];

export function AIWorkflowScene(input:z.input<typeof aiWorkflowSceneSchema>) {
  const p=aiWorkflowSceneSchema.parse(input),t=useLearningLayout();
  if(p.mode==='rag' && !p.steps) return <RAGScene title={p.title}/>;
  const preset=stageExamples[p.mode],steps=p.steps ?? preset.steps;
  return <LearningBoard title={p.title ?? preset.title}>
    <div style={{display:'grid',gridTemplateColumns:t.portrait?'1fr':'1fr 1fr',gap:14*t.u}}>
      {steps.map((s,i)=><LearningCard key={i} title={s.label} tint={lectureColors[i].fill} opacity={t.progress(s.at,0.4)}>
        <div>{s.detail}</div>
        {s.evidence?<div style={{fontSize:20*t.u,fontWeight:650,marginTop:10*t.u,color:lectureColors[i].ink}}>{s.evidence}</div>:null}
      </LearningCard>)}
    </div>
  </LearningBoard>;
}
