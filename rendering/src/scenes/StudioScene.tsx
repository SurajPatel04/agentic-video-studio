import type {FC} from 'react';
import {useCurrentFrame} from 'remotion';
import {z} from 'zod';
import {useSceneLength} from '../theme';
import {JournalismStage,Island,Caption,Label,BroadcastMonitor,AnchorSet,reveal} from './journalismStage';

export const studioSceneSchema = z.object({
  eyebrow: z.string().max(40).default('NEWS / LIVE BROADCAST'),
  title: z.string().max(70).default('From the studio to your living room'),
  channel: z.string().max(20).default('DAILY NEWS'),
  headline: z.string().max(65).default('New public park opens today'),
  anchorName: z.string().max(30).default('Evening bulletin'),
  cameraLabels: z.tuple([z.string().max(20),z.string().max(20)]).default(['Wide shot','Close-up']),
  liveAt: z.number().min(0.1).max(0.4).default(0.25),
  switchAt: z.number().min(0.45).max(0.7).default(0.55),
  homeAt: z.number().min(0.72).max(0.9).default(0.76),
}).strict();
export const description = 'A TV studio goes live: cameras face an anchor at a desk, ON AIR turns red, a control-room switcher cuts from camera 1 to camera 2, and the selected picture appears on televisions at home. Custom channel, headline, anchorName, cameraLabels and fractional liveAt/switchAt/homeAt timing.';
export const tags = ['news','journalism','tv','studio','broadcast','anchor','camera','control room','on air','television'];

export const StudioScene: FC<z.input<typeof studioSceneSchema>> = (input) => {
 const p=studioSceneSchema.parse(input),f=useCurrentFrame(),t=f/Math.max(1,useSceneLength()-1),live=t>=p.liveAt,cam=t>=p.switchAt?1:0,home=t>=p.homeAt;
 return <JournalismStage eyebrow={p.eyebrow} title={p.title}>
  <Island x={335} y={205} w={300} d={270} id="studio-floor" color="#d9cfe5"/>
  <path d="M100 205 L335 70 L620 234 V294 L335 130 L100 265Z" fill="#c7bcd9" stroke="#51485e" strokeWidth="2"/>
  <path d="M335 70 V130 L100 265 V205Z" fill="#e4daed" stroke="#51485e" strokeWidth="2"/>
  <g transform="matrix(1 .57 0 1 380 112)"><rect width="145" height="45" rx="5" fill={live?'#d85850':'#9d94a5'} stroke="#5d4c5b" strokeWidth="2"/><text x="72" y="30" textAnchor="middle" fill="#fffaf1" fontSize="23" fontWeight="800">ON AIR</text></g>
  <AnchorSet x={345} y={402} scale={1.2} id="studio-anchor"/>
  {[{x:145,y:420},{x:530,y:485}].map((pt,i)=><g key={i}>
   <path d={`M${pt.x} ${pt.y-18} V${pt.y+23} M${pt.x} ${pt.y-12} L${pt.x-30} ${pt.y+42} M${pt.x} ${pt.y-12} L${pt.x+30} ${pt.y+42}`} stroke="#625b70" strokeWidth="5" strokeLinecap="round"/>
   <g transform={`translate(${pt.x} ${pt.y-58})`}>
    <path d="M-45 -28 L-16 -46 L45 -12 L16 6Z" fill="#b4bdd0" stroke="#403c4c" strokeWidth="2"/>
    <path d="M-45 -28 L16 6 V45 L-45 11Z" fill="#7e8da5" stroke="#403c4c" strokeWidth="2"/>
    <path d="M16 6 L45 -12 V27 L16 45Z" fill="#59667c" stroke="#403c4c" strokeWidth="2"/>
    <path d="M27 1 L60 -18 L76 -9 V19 L43 37 L27 28Z" fill="#3f4656" stroke="#302d3a" strokeWidth="2"/>
    <path d="M60 -18 L76 -9 V19 L60 10Z" fill="#a2c6d8" stroke="#302d3a" strokeWidth="2"/>
    <path d="M-18 -39 V-59 L12 -42 V-25" fill="none" stroke="#403c4c" strokeWidth="6"/>
    <circle cx="-30" cy="-14" r="5" fill={live&&cam===i?'#ed6552':'#c8c2bf'}/>
   </g>
  </g>)}
  <Label x={150} y={490} text="CAM 01"/><Label x={535} y={554} text="CAM 02"/>
  <text x="320" y="580" textAnchor="middle" fontSize="21" fontWeight="600" fill="#766584">{p.anchorName}</text>
  <text x="850" y="52" fontSize="19" fontWeight="750" letterSpacing="4" fill="#9c7356">01 / CONTROL ROOM</text>
  {[0,1].map(i=><g key={i}><BroadcastMonitor x={815+i*355} y={90} w={290} active={live} close={i===1} channel={p.channel} headline={p.headline} id={`control-${i}`}/><g transform={`translate(${845+i*355} 386) matrix(1 .14 -.7 .4 0 0)`}><rect width="260" height="75" rx="8" fill="#b3acbc" stroke="#4e455c" strokeWidth="3"/>{[0,1,2,3,4].map(j=><rect key={j} x={15+j*47} y="14" width="35" height="28" rx="4" fill={live&&cam===i&&j===i?'#df6e58':'#e7decd'} stroke="#6c6373"/>)}</g><Label x={960+i*355} y={375} text={p.cameraLabels[i]}/>{live&&cam===i?<g><circle cx={800+i*355} cy="160" r="7" fill="#df6e58"/><text x={815+i*355} y="80" fontSize="15" fontWeight="800" fill="#c55d45">PROGRAM / SELECTED</text></g>:null}</g>)}
  <path d="M657 335 Q740 310 780 245" fill="none" stroke={live?'#ce8e50':'#cabca9'} strokeWidth="3" strokeDasharray="8 8" strokeDashoffset={live?-f%32:0}/>
  <g opacity={reveal(t,.12)}><text x="855" y="482" fontSize="19" fontWeight="750" letterSpacing="4" fill="#9c7356">02 / AT HOME</text><BroadcastMonitor x={930} y={500} w={195} active={home} close={cam===1} channel={p.channel} headline={p.headline} id="home-one"/><BroadcastMonitor x={1290} y={500} w={195} active={home} close={cam===1} channel={p.channel} headline={p.headline} id="home-two"/></g>
  <Caption progress={t} step={home?'04 / AUDIENCE':cam?'03 / CAMERA CUT':live?'02 / ON AIR':'01 / STANDBY'} text={!live?'The anchor and cameras are ready for the bulletin.':!home?`The director selects camera ${cam+1} for the live programme.`:'The selected picture reaches television screens at home.'}/>
 </JournalismStage>;
};
