import {useCurrentFrame} from 'remotion';
import {z} from 'zod';
import {useSceneLength} from '../theme';
import {IsoPerson} from '../iso/shapes';
import {JournalismStage,IsoProp,Caption,Label,Crowd,reveal} from './journalismStage';
export const mediaTheorySceneSchema=z.object({title:z.string().max(70).optional(),mode:z.enum(['communication','agenda','two-step','gratifications']).default('communication'),message:z.string().min(2).max(16).default('STORM'),headline:z.string().max(45).default('The city’s new public park')}).strict();
export const description='Four isometric media theory animations: communication sends text through noise and returns feedback (a feedback extension to Shannon–Weaver); agenda grows a headline across days and audience attention; two-step flow fans media out through opinion leaders; gratifications lets people choose news, entertainment or social media. Illustrative teaching examples.';
export const tags=['communication','Shannon Weaver','noise','feedback','agenda setting','two step flow','opinion leaders','uses and gratifications','media theory'];
export const MediaTheoryScene:React.FC<z.input<typeof mediaTheorySceneSchema>>=(input)=>{
 const p=mediaTheorySceneSchema.parse(input),t=useCurrentFrame()/Math.max(1,useSceneLength()-1),titles={communication:'A message travels through noise',agenda:'Repeated coverage shapes attention','two-step':'Media reaches people through opinion leaders',gratifications:'Different people, different media needs'};
 const arrow=(x:number,y:number,x2:number,y2:number,at:number)=><path d={`M${x} ${y} L${x+(x2-x)*reveal(t,at,.18)} ${y+(y2-y)*reveal(t,at,.18)}`} stroke="#b196c4" strokeWidth="4" fill="none"/>;
 return <JournalismStage title={p.title??titles[p.mode]} eyebrow="MEDIA THEORY / MADE VISIBLE">
 {p.mode==='communication'?<>
 <IsoProp kind="sender" x={240} y={430} w={260} h={260} id="model-sender"/><IsoProp kind="noise" x={810} y={290} w={210} h={180} id="model-noise"/><IsoProp kind="receiver" x={1350} y={430} w={260} h={260} id="model-receiver"/>
 {arrow(390,370,1200,370,.1)}<g transform={`translate(${380+820*reveal(t,.15,.48)} 320)`}><rect x="-95" y="-30" width="190" height="60" rx="10" fill="#fffaf1" stroke="#b79acb"/><text textAnchor="middle" y="8" fontSize="27" fontWeight="700">{t>.4?p.message.slice(0,2)+'#'+p.message.slice(3):p.message}</text></g>
 <Label x={240} y={490} text="Sender / encoder"/><Label x={1350} y={490} text="Decoder / receiver"/><Label x={810} y={80} text="Channel noise"/>
 <path d="M1270 520 Q800 690 330 520" fill="none" stroke="#8bbca4" strokeWidth="3" strokeDasharray="10 7" opacity={reveal(t,.73)}/><text x="800" y="620" textAnchor="middle" fontSize="22" opacity={reveal(t,.73)}>Feedback: “Please repeat that message.”</text>
 </>:p.mode==='agenda'?<>
 <IsoProp kind="tv" x={270} y={430} w={300} h={280} id="agenda-tv"/><Crowd x={1260} y={380} react={t>.65}/>
 <text x="800" y="190" textAnchor="middle" fontSize="25" fontWeight="700">DAY {Math.min(5,1+Math.floor(t*5))}</text>
 <foreignObject x="470" y="250" width="650" height="200"><div style={{fontSize:26+30*reveal(t,.1,.75),fontWeight:800,textAlign:'center',lineHeight:1.16}}>{p.headline}</div></foreignObject>
 <rect x="490" y="500" width="600" height="28" rx="14" fill="#dfd4c3"/><rect x="490" y="500" width={600*reveal(t,.2,.7)} height="28" rx="14" fill="#ba9cd0"/><Label x={800} y={580} text={`Audience attention: ${Math.round(100*reveal(t,.2,.7))}%`} detail="Illustrative attention, not agreement"/>
 </>:p.mode==='two-step'?<>
 <IsoProp kind="tv" x={230} y={420} w={260} h={260} id="two-step-media"/><Label x={230} y={485} text="Media"/>
 {[230,490].map((y,i)=><g key={i}>{arrow(370,350,740,y,.1)}<ellipse cx="770" cy={y} rx="65" ry="30" fill="#efdbac"/><IsoPerson at={{x:770,y}} size={45} color="#ceb0e2" sw={2}/><Label x={770} y={y+60} text={`Opinion leader ${i+1}`}/>{[0,1,2].map(j=><g key={j}>{arrow(830,y,1240,y-75+j*90,.4+j*.07)}<g opacity={reveal(t,.4+j*.07)}><IsoPerson at={{x:1270,y:y-75+j*90}} size={30} color="#b7d5c7" sw={2}/></g></g>)}</g>)}
 </>:<>
 {(['newspaper','tv','phone'] as const).map((kind,i)=>{const x=330+i*470;return <g key={kind}><IsoPerson at={{x,y:560}} size={48} color={['#d1b9e4','#e5c18b','#a8cbbb'][i]} sw={2}/>{arrow(x,465,x,340,.18+i*.13)}<IsoProp kind={kind} x={x} y={310} w={230} h={230} id={`need-${i}`} opacity={reveal(t,.18+i*.13)}/><Label x={x} y={70} text={['Stay informed','Be entertained','Connect with others'][i]}/><Label x={x} y={625} text={['News','Fun','Social connection'][i]}/></g>;})}
 </>}
 <Caption progress={t} step="MEDIA THEORY" text={{communication:'Noise can alter meaning. Feedback is shown as an added return loop.',agenda:'Repeated prominence can influence which issues people think about.','two-step':'Opinion leaders interpret media and share it with their networks.',gratifications:'People actively select media to meet different needs.'}[p.mode]}/>
 </JournalismStage>;
};
