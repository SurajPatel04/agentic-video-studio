import {useCurrentFrame} from 'remotion';
import {z} from 'zod';
import {useSceneLength} from '../theme';
import {IsoPerson} from '../iso/shapes';
import {JournalismStage,Island,Caption,Label} from './journalismStage';
export const spreadSceneSchema=z.object({title:z.string().max(70).default('How a post spreads through a network'),mode:z.enum(['viral','race']).default('viral'),post:z.string().max(55).default('A post shared with friends'),correctionDelay:z.number().min(.1).max(.45).default(.23),correctionSpeed:z.number().min(.5).max(2).default(.72)}).strict();
export const description='A post spreads from one person to friends to friends of friends, with wave activation and unique reach counts. Race mode overlays fast red misinformation and a delayed green correction on the same network. Counts are illustrative, and people can receive both messages; green receipt does not imply belief changed.';
export const tags=['viral','spread','social network','fake news','fact check','correction','reach','race'];
export const SpreadScene:React.FC<z.input<typeof spreadSceneSchema>>=(input)=>{
 const p=spreadSceneSchema.parse(input),t=useCurrentFrame()/Math.max(1,useSceneLength()-1);
 const nodes=Array.from({length:31},(_,i)=>{const level=Math.floor(Math.log2(i+1)),slot=i-(2**level-1),count=2**level;return {x:170+level*275,y:160+(slot+.5)*450/count,at:.08+level*.14+(slot/count)*.07};});
 const red=nodes.filter(n=>t>=n.at).length,green=nodes.filter(n=>t>=p.correctionDelay+n.at/p.correctionSpeed).length;
 return <JournalismStage title={p.title} eyebrow="SOCIAL MEDIA / NETWORK DIFFUSION">
 {nodes.slice(1).map((n,j)=>{const parent=nodes[Math.floor(j/2)],seen=t>=n.at,fixed=p.mode==='race'&&t>=p.correctionDelay+n.at/p.correctionSpeed;return <g key={j}><path d={`M${parent.x} ${parent.y} L${n.x} ${n.y}`} stroke={seen?(p.mode==='race'?'#d77b72':'#9a88bf'):'#d7cfc4'} strokeWidth="3"/>{fixed?<path d={`M${parent.x} ${parent.y+6} L${n.x} ${n.y+6}`} stroke="#65a68c" strokeWidth="3"/>:null}</g>;})}
 {nodes.map((n,i)=>{const seen=t>=n.at,fixed=p.mode==='race'&&t>=p.correctionDelay+n.at/p.correctionSpeed;return <g key={i}><Island x={n.x} y={n.y-3} w={28} d={28} id={`spread-${i}`} color={fixed?'#bddcca':seen?(p.mode==='race'?'#efc4bb':'#d6c5ea'):'#e3ddd3'}/><IsoPerson at={{x:n.x,y:n.y+8}} size={i===0?29:i>14?11:18} sw={1.5} color={fixed?'#7ab89c':seen?(p.mode==='race'?'#db8b7a':'#ad94d1'):'#cac7cc'}/>{fixed?<circle cx={n.x+17} cy={n.y-33} r="5" fill="#4e9d7a"/>:null}</g>;})}
 <Label x={300} y={76} text={p.post}/><Label x={1000} y={76} text={p.mode==='race'?`False post: ${red} / 31    Correction: ${green} / 31`:`Reach: ${red} / 31 people`}/>
 <Caption progress={t} step={p.mode==='race'?'CORRECTION RACE':'VIRAL SPREAD'} text={p.mode==='race'?'Illustrative reach: receiving a correction does not mean believing it.':'One post reaches friends, then their friends, in successive waves.'}/>
 </JournalismStage>;
};
