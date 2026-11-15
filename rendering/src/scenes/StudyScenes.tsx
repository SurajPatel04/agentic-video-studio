import {useCurrentFrame} from 'remotion';
import {z} from 'zod';
import {ThreeCanvas} from '@remotion/three';
import {InfrastructureObject} from '../components/InfrastructureObject';
import {StudioLights} from '../components/NetworkWorld';
import {StudyFrame} from '../components/StudyFrame';
const nonnegative=z.number().int().nonnegative();
const reveal=(frame:number,at:number)=>Math.max(0,Math.min(1,(frame-at)/15));
export const definitionSceneSchema=z.object({term:z.string().default('Local Area Network'),abbreviation:z.string().default('LAN'),meaning:z.string().default('A network that connects devices within a limited area, such as a home, school, or office.'),detail:z.string().default('Think: nearby devices sharing a connection.'),revealAt:nonnegative.default(20)});
export const DefinitionScene: React.FC<z.input<typeof definitionSceneSchema>>=(input)=>{
 const p=definitionSceneSchema.parse(input);const f=useCurrentFrame();
 return <StudyFrame title={p.term} eyebrow="DEFINITION / THE CORE IDEA" footer={p.detail}>
  <div style={{display:'flex',gap:65,alignItems:'center',height:'100%'}}>
   <div style={{fontSize:100,fontWeight:750,color:'#76d3ed',padding:55,background:'#16334a',borderRadius:24}}>{p.abbreviation}</div>
   <p style={{fontSize:43,lineHeight:1.45,maxWidth:900,opacity:reveal(f,p.revealAt)}}>{p.meaning}</p>
  </div>
 </StudyFrame>;
};
export const exampleCardSceneSchema=z.object({title:z.string().default('Home Wi-Fi is a LAN'),example:z.string().default('Your phone, laptop, and printer connect through the home router.'),takeaway:z.string().default('One small area. Several connected devices.'),kind:z.enum(['router','computer','laptop','server','building']).default('router')});
export const ExampleCardScene: React.FC<z.input<typeof exampleCardSceneSchema>>=(input)=>{
 const p=exampleCardSceneSchema.parse(input);const f=useCurrentFrame();
 return <StudyFrame title={p.title} eyebrow="REAL-LIFE EXAMPLE" footer={p.takeaway}>
  <div style={{display:'flex',alignItems:'center',gap:60,border:'1px solid #34536b',background:'#11273a',borderRadius:24,opacity:reveal(f,0)}}>
   <ThreeCanvas width={500} height={500} camera={{position:[0,2,5],fov:45}}><StudioLights/><group position={[0,-0.8,0]} rotation={[0,-0.3,0]}><InfrastructureObject kind={p.kind} color="#507b95" opacity={1}/></group></ThreeCanvas>
   <p style={{fontSize:42,lineHeight:1.4,maxWidth:730,paddingRight:35}}>{p.example}</p>
  </div>
 </StudyFrame>;
};
export const stepsSceneSchema=z.object({title:z.string().default('How a message moves'),steps:z.array(z.string()).min(2).max(6).default(['Create the message','Split into packets','Forward across the network','Reassemble at the destination']),startAt:nonnegative.default(10),stagger:nonnegative.default(30)});
export const StepsScene: React.FC<z.input<typeof stepsSceneSchema>>=(input)=>{
 const p=stepsSceneSchema.parse(input);const f=useCurrentFrame();
 return <StudyFrame title={p.title} eyebrow="PROCESS / STEP BY STEP">
  <div style={{display:'flex',flexDirection:'column',gap:10}}>{p.steps.map((s,i)=><div key={i} style={{opacity:reveal(f,p.startAt+i*p.stagger),display:'flex',alignItems:'center',gap:28}}>
   <div style={{width:65,textAlign:'center',fontSize:29,color:'#78d6ee'}}>{i+1}</div>
   <div style={{flex:1,padding:'18px 28px',background:'#173148',borderRadius:12,fontSize:29}}>{s}</div>
   <span style={{width:50,color:'#88b8cc',fontSize:27}}>{i<p.steps.length-1?'↓':'✓'}</span>
  </div>)}</div>
 </StudyFrame>;
};
export const quizSceneSchema=z.object({question:z.string().default('Which network typically spans a city?'),options:z.array(z.string()).length(4).default(['LAN','MAN','WAN','PAN']),correctIndex:z.number().int().min(0).max(3).default(1),answerAt:nonnegative.default(120),explanation:z.string().default('A MAN connects sites across a metropolitan area.')});
export const QuizScene: React.FC<z.input<typeof quizSceneSchema>>=(input)=>{
 const p=quizSceneSchema.parse(input);const f=useCurrentFrame();const answered=f>=p.answerAt;
 return <StudyFrame title={p.question} eyebrow="QUICK CHECK / CHOOSE AN ANSWER" footer={answered?p.explanation:'Pause the video and choose A, B, C, or D.'}>
  <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:24,marginTop:40}}>{p.options.map((o,i)=><div key={i} style={{padding:'42px 30px',fontSize:36,border:`2px solid ${answered&&i===p.correctIndex?'#74e3b6':'#38566e'}`,borderRadius:18,background:answered&&i===p.correctIndex?'#16463d':'#142b40',opacity:answered&&i!==p.correctIndex?0.45:1}}><span style={{color:'#8faabe',marginRight:30}}>{'ABCD'[i]}</span>{o}{answered&&i===p.correctIndex?'  ✓':''}</div>)}</div>
 </StudyFrame>;
};
export const summarySceneSchema=z.object({title:z.string().default('Three networks. Three scales.'),points:z.array(z.string()).min(1).max(6).default(['LAN connects nearby devices.','MAN connects sites across a city.','WAN connects networks across large distances.']),startAt:nonnegative.default(10),stagger:nonnegative.default(25)});
export const SummaryScene: React.FC<z.input<typeof summarySceneSchema>>=(input)=>{
 const p=summarySceneSchema.parse(input);const f=useCurrentFrame();
 return <StudyFrame title={p.title} eyebrow="RECAP / TAKE THESE WITH YOU">
  <div style={{display:'flex',flexDirection:'column',gap:20,marginTop:25}}>{p.points.map((point,i)=><div key={i} style={{opacity:reveal(f,p.startAt+i*p.stagger),padding:'22px 30px',fontSize:34,background:'#142d40',borderRadius:14,display:'flex',gap:26}}><span style={{color:'#71e3af'}}>✓</span>{point}</div>)}</div>
 </StudyFrame>;
};
