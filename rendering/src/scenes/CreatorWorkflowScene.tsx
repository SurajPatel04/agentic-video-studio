import {useCurrentFrame} from 'remotion';
import {z} from 'zod';
import {useSceneLength} from '../theme';
import {JournalismStage,IsoProp,Caption,Label,reveal} from './journalismStage';
export const creatorWorkflowSceneSchema=z.object({title:z.string().max(70).default('From an idea to a published video'),views:z.number().int().min(0).max(9999999).default(12500)}).strict();
export const description='Isometric creator workflow: shoot with a camera, arrange clips on an editing timeline with a moving playhead, upload with progress, then grow a view counter.';
export const tags=['creator','video','editing','timeline','upload','views','social media'];
export const CreatorWorkflowScene:React.FC<z.input<typeof creatorWorkflowSceneSchema>>=(input)=>{
 const p=creatorWorkflowSceneSchema.parse(input),t=useCurrentFrame()/Math.max(1,useSceneLength()-1),step=Math.min(3,Math.floor(t*4));
 return <JournalismStage title={p.title} eyebrow="CREATOR / SHOOT TO SHARE">
 {[230,610,1010,1390].map((x,i)=><g key={i} opacity={reveal(t,i*.18)}><IsoProp kind={(['camera','laptop','cloud','phone'] as const)[i]} x={x} y={370} w={245} h={240} id={`creator-${i}`} lift={step===i?8:0}/><Label x={x} y={435} text={['Shoot','Edit','Upload','Watch'][i]}/>{i<3?<path d={`M${x+135} 300 H${x+215}`} stroke="#bcaa92" strokeWidth="3" strokeDasharray="8 6"/>:null}</g>)}
 <g opacity={reveal(t,.2)} transform="translate(400 490)"><rect width="430" height="135" rx="12" fill="#ded9e8" stroke="#897a9b"/><text x="20" y="30" fontSize="18" fontWeight="700">EDITING TIMELINE</text>{[0,1,2,3].map(i=><g key={i}><rect x={20+i*96} y="48" width="88" height="38" rx="5" fill={['#b5cfda','#d4b8df','#ecd297','#b7d3bb'][i]}/><text x={28+i*96} y="73" fontSize="15">Clip {i+1}</text><rect x={20+i*96} y="94" width="88" height="14" fill="#a9c6bc"/></g>)}<path d={`M${20+380*reveal(t,.25,.22)} 40 V118`} stroke="#d55d50" strokeWidth="3"/></g>
 <g opacity={reveal(t,.5)}><rect x="885" y="505" width="250" height="16" rx="8" fill="#d8d1c7"/><rect x="885" y="505" width={250*reveal(t,.5,.22)} height="16" rx="8" fill="#99bea9"/><Label x={1010} y={570} text={`${Math.round(100*reveal(t,.5,.22))}% uploaded`}/></g>
 <g opacity={reveal(t,.73)}><Label x={1390} y={555} text={Math.round(p.views*reveal(t,.73,.24)).toLocaleString('en-US')} detail="illustrative views"/></g>
 <Caption progress={t} step={`0${step+1} / CREATOR`} text={['Capture the footage.','Trim and arrange clips, then preview the sequence.','Export the finished video and upload it.','The published video begins reaching viewers.'][step]}/>
 </JournalismStage>;
};
