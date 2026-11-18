import {useCurrentFrame} from 'remotion';
import {z} from 'zod';
import {useSceneLength} from '../theme';
import {JournalismStage,IsoProp,Label,Caption} from './journalismStage';
export const signalHomesSceneSchema=z.object({title:z.string().max(70).default('One broadcast reaches many homes'),homes:z.array(z.string().max(20)).min(2).max(4).default(['Oak Street','Park Avenue','Hill Road'])}).strict();
export const description='Isometric broadcast tower emits expanding wave rings. Home televisions and radios light up in sequence when the first wave reaches them.';
export const tags=['broadcast','signal','tower','waves','homes','radio','television'];
export const SignalHomesScene:React.FC<z.input<typeof signalHomesSceneSchema>>=(input)=>{
 const p=signalHomesSceneSchema.parse(input),t=useCurrentFrame()/Math.max(1,useSceneLength()-1),radius=Math.max(0,(t-.12)/.72)*1250;
 return <JournalismStage title={p.title} eyebrow="BROADCAST / SIGNAL COVERAGE">
 {[0,1,2].map(i=><ellipse key={i} cx="220" cy="420" rx={Math.max(0,radius-i*240)} ry={Math.max(0,radius-i*240)*.22} fill="none" stroke="#b59ace" strokeWidth="3" opacity={.65-i*.15}/>)}
 <IsoProp kind="tower" x={220} y={460} w={220} h={350} id="broadcast-tower"/><Label x={220} y={520} text="Broadcast tower"/>
 {p.homes.map((name,i)=>{const x=590+i*750/(p.homes.length-1),on=radius>=x-220;return <g key={i}><IsoProp kind="house" x={x} y={390} w={220} h={240} id={`signal-house-${i}`} color={on?'#c6dcbc':'#d8d4df'}/><IsoProp kind={i%2?'radio':'tv'} x={x} y={535} w={160} h={130} id={`receiver-${i}`} color={on?'#f0cf83':'#a4a9b4'}/>{on?<ellipse cx={x} cy="500" rx="95" ry="65" fill="#f4d477" opacity=".18"/>:null}<Label x={x} y={590} text={name} detail={on?'Receiving broadcast':'Waiting for signal'}/></g>;})}
 <Caption progress={t} step="SIGNAL COVERAGE" text="Each receiver switches on as the expanding signal reaches it."/>
 </JournalismStage>;
};
