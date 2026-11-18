import {useCurrentFrame} from 'remotion';
import {z} from 'zod';
import {useSceneLength} from '../theme';
import {clamp01} from './paperStage';
import {JournalismStage,IsoProp,Caption,Label} from './journalismStage';
export const radioTuningSceneSchema=z.object({title:z.string().max(70).default('Finding a clear radio station'),station:z.string().max(24).default('Community Radio'),frequency:z.number().min(88).max(108).default(98.4)}).strict();
export const description='Isometric radio with animated tuning dial and frequency scale. Jagged static waveform settles into a clean wave as the station locks. Visual static representation; no generated audio.';
export const tags=['radio','tuning','frequency','static','broadcast','waveform'];
export const RadioTuningScene:React.FC<z.input<typeof radioTuningSceneSchema>>=(input)=>{
 const p=radioTuningSceneSchema.parse(input),f=useCurrentFrame(),t=f/Math.max(1,useSceneLength()-1),lock=clamp01((t-.52)/.18),q=clamp01(t/.65),freq=88+(p.frequency-88)*q;
 const wave=Array.from({length:260},(_,i)=>{const clean=Math.sin(i*.16-f*.1)*35,noise=(Math.sin(i*19+f*2)+Math.sin(i*7-f*3))*36;return `${i?'L':'M'}${830+i*2.1} ${300+clean*lock+noise*(1-lock)}`;}).join(' ');
 return <JournalismStage title={p.title} eyebrow="RADIO / TUNE INTO THE SIGNAL">
 <IsoProp kind="radio" x={410} y={480} w={600} h={420} id="tuning-radio"/>
 <Label x={410} y={560} text={lock===1?p.station:'Searching the FM band'} detail={`${freq.toFixed(1)} MHz`}/>
 <g transform="translate(680 480)"><ellipse rx="66" ry="25" cy="12" fill="#ad9c80"/><circle r="58" fill="#f3dfb4" stroke="#49414c" strokeWidth="3"/><path d="M0 -40 V-19" stroke="#544857" strokeWidth="6" transform={`rotate(${-120+q*240})`}/><text y="92" textAnchor="middle" fontSize="19">TUNING</text></g>
 <rect x="800" y="180" width="610" height="240" rx="18" fill="#e5e0ec" stroke="#8c7d9e" strokeWidth="2"/><path d="M830 300 H1380" stroke="#b9aeca"/><path d={wave} fill="none" stroke={lock===1?'#579b81':'#9d79b7'} strokeWidth="3"/>
 <Label x={1100} y={470} text={lock===1?'STATION LOCKED':'STATIC / SEARCHING'}/>
 <path d="M825 550 H1390" stroke="#8b7c70" strokeWidth="3"/>{[88,92,96,100,104,108].map(v=><g key={v}><path d={`M${825+(v-88)*28.25} 540 v20`} stroke="#8b7c70"/><text x={825+(v-88)*28.25} y="590" textAnchor="middle" fontSize="18">{v}</text></g>)}<path d={`M${825+(freq-88)*28.25} 520 v54`} stroke="#d47c49" strokeWidth="5"/>
 <Caption progress={t} step="RADIO TUNING" text={lock===1?'The receiver locks onto the station and the signal becomes clear.':'Turn the dial to select the station’s carrier frequency.'}/>
 </JournalismStage>;
};
