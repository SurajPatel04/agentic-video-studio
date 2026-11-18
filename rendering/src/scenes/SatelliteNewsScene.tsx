import {useCurrentFrame} from 'remotion';
import {z} from 'zod';
import {useSceneLength} from '../theme';
import {clamp01} from './paperStage';
import {JournalismStage,IsoProp,Caption,Label} from './journalismStage';
export const satelliteNewsSceneSchema=z.object({title:z.string().max(70).default('News travels across continents'),from:z.string().max(24).default('Asia newsroom'),to:z.string().max(24).default('Europe newsroom'),delayMs:z.number().int().min(1).max(3000).default(250)}).strict();
export const description='Isometric globe and satellite relay news between continent-labelled newsrooms. An animated uplink then downlink follows the signal, with a configurable illustrative one-way delay timer (not a measured latency).';
export const tags=['satellite','news','globe','uplink','downlink','delay','broadcast'];
export const SatelliteNewsScene:React.FC<z.input<typeof satelliteNewsSceneSchema>>=(input)=>{
 const p=satelliteNewsSceneSchema.parse(input),t=useCurrentFrame()/Math.max(1,useSceneLength()-1),q=clamp01((t-.15)/.65),up=Math.min(1,q*2),down=Math.max(0,q*2-1);
 const path=(a:number,b:number,c:number,d:number,k:number)=>`M${a} ${b} L${a+(c-a)*k} ${b+(d-b)*k}`;
 return <JournalismStage title={p.title} eyebrow="GLOBAL NEWS / SATELLITE RELAY">
 <IsoProp kind="globe" x={800} y={605} w={530} h={410} id="news-globe"/>
 <path d="M355 420 L800 180 L1245 420" stroke="#c8bccd" strokeWidth="4" fill="none" strokeDasharray="9 9"/>
 <path d={path(355,420,800,180,up)} stroke="#c18c4c" strokeWidth="5" fill="none"/><path d={path(800,180,1245,420,down)} stroke="#77aa98" strokeWidth="5" fill="none"/>
 <IsoProp kind="satellite" x={800} y={195} w={300} h={165} id="news-satellite"/>
 <IsoProp kind="tower" x={330} y={540} w={165} h={260} id="uplink-tower"/><IsoProp kind="tower" x={1270} y={540} w={165} h={260} id="downlink-tower"/>
 <Label x={330} y={595} text={p.from} detail="UPLINK"/><Label x={1270} y={595} text={p.to} detail={q===1?'RECEIVED':'DOWNLINK'}/>
 <rect x="625" y="625" width="350" height="48" rx="12" fill="#f1dfbc"/><text x="800" y="656" textAnchor="middle" fontSize="22" fontWeight="700">{Math.round(q*p.delayMs)} ms / illustrative delay</text>
 <Caption progress={t} step="SATELLITE NEWS" text={q<.5?'The newsroom sends its signal up to the satellite.':q<1?'The satellite relays the signal to another continent.':'The receiving newsroom gets the report after the signal delay.'}/>
 </JournalismStage>;
};
