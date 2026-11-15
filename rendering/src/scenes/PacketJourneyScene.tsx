import {ThreeCanvas} from '@remotion/three';
import {useCurrentFrame} from 'remotion';
import {z} from 'zod';
import {InfrastructureObject} from '../components/InfrastructureObject';
import {StudioLights} from '../components/NetworkWorld';
import {StudyFrame} from '../components/StudyFrame';
export const packetJourneySceneSchema = z.object({
  title: z.string().default('Follow one packet to its destination'),
  stops: z.array(z.object({label: z.string(), detail: z.string(), kind: z.enum(['laptop','router','server','computer','internet'])})).min(2).max(6).default([
    {label:'Laptop',kind:'laptop',detail:'Your device creates data and sends it to the local gateway.'},
    {label:'Router',kind:'router',detail:'The gateway forwards the packet beyond your local network.'},
    {label:'ISP',kind:'server',detail:'Your internet service provider carries the packet toward its destination.'},
    {label:'Internet',kind:'internet',detail:'Routers across interconnected networks forward the packet.'},
    {label:'Server',kind:'server',detail:'The destination receives the packet and can send a response.'},
  ]),
  startAt: z.number().int().nonnegative().default(20),
  travelFrames: z.number().int().positive().default(35),
  holdFrames: z.number().int().positive().default(25),
});
export const description = 'Follow a single packet through labeled devices, an ISP, the internet, and a server.';
export const tags = ['packet', 'routing', 'internet', 'journey'];
export const PacketJourneyScene: React.FC<z.input<typeof packetJourneySceneSchema>> = (input) => {
  const p=packetJourneySceneSchema.parse(input); const frame=useCurrentFrame();
  const time=Math.max(0,frame-p.startAt); const segment=p.travelFrames+p.holdFrames;
  const hop=Math.min(p.stops.length-1,Math.floor(time/segment));
  const progress=Math.min(1,Math.max(0,(time%segment-p.holdFrames)/p.travelFrames));
  const packetIndex=Math.min(p.stops.length-1,hop+progress);
  const x=(i:number)=>-5+i*10/(p.stops.length-1);
  return <StudyFrame title={p.title} eyebrow="PACKET JOURNEY / ONE HOP AT A TIME" footer="A simplified route: actual packets can traverse many intermediate routers.">
    <ThreeCanvas width={1440} height={375} orthographic camera={{position:[0,3,12],zoom:100}}>
      <StudioLights/>
      <mesh position={[0,-0.65,0.8]}><boxGeometry args={[10,0.035,0.035]}/><meshBasicMaterial color="#43748c"/></mesh>
      {p.stops.map((stop,i)=><group key={i} position={[x(i),-0.7,0]} scale={0.55}>
        {stop.kind==='internet'?<mesh position={[0,1.2,0]}><sphereGeometry args={[1,24,16]}/><meshStandardMaterial color="#61c5e9" wireframe/></mesh>:<InfrastructureObject kind={stop.kind} color="#577b95" opacity={1}/>}
      </group>)}
      {frame>=p.startAt&&<mesh position={[x(packetIndex),-0.45,1]}><boxGeometry args={[0.18,0.18,0.18]}/><meshBasicMaterial color="#ffe29b"/></mesh>}
    </ThreeCanvas>
    <div style={{display:'flex',justifyContent:'space-between',margin:'0 105px',fontSize:23}}>{p.stops.map((s,i)=><span key={i} style={{color:i===hop?'#ffe29b':'#99b5c9'}}>{s.label}</span>)}</div>
    <div style={{marginTop:38,padding:'22px 30px',background:'#193149',borderLeft:'4px solid #ffe29b',fontSize:27,borderRadius:8}}><strong>{hop+1}. {p.stops[hop].label}</strong><span style={{color:'#b9ccdc'}}> — {p.stops[hop].detail}</span></div>
  </StudyFrame>;
};
