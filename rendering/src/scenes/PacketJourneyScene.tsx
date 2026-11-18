import {ThreeCanvas} from '@remotion/three';
import {useCurrentFrame} from 'remotion';
import {z} from 'zod';
import {OrthographicCamera, Vector3} from 'three';
import {WorldIcons} from '../components/WorldIcons';
import {PAPER} from '../iso/iso';
import {StudioLights} from '../components/NetworkWorld';
import {deviceKindSchema} from '../components/Device';
import {RBox} from '../components/three/parts';
import {StudyFrame} from '../components/StudyFrame';
export const packetJourneySceneSchema = z.object({
  title: z.string().default('Follow one packet to its destination'),
  stops: z.array(z.object({label: z.string(), detail: z.string(), kind: deviceKindSchema})).min(2).max(6).default([
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
  const width = 1440, height = 375;
  const camera = new OrthographicCamera(-width / 2, width / 2, height / 2, -height / 2, 0.1, 1000);
  camera.position.set(0, 3, 12);
  camera.lookAt(0, 0, 0);
  camera.zoom = 100;
  camera.updateProjectionMatrix();
  camera.updateMatrixWorld();
  return <StudyFrame title={p.title} eyebrow="PACKET JOURNEY / ONE HOP AT A TIME" footer="A simplified route: actual packets can traverse many intermediate routers.">
    <ThreeCanvas width={width} height={height} camera={camera}>
      <StudioLights/>
      <mesh position={[0,-0.65,0.8]}><boxGeometry args={[10,0.035,0.035]}/><meshBasicMaterial color="#43748c"/></mesh>
      {frame>=p.startAt&&<RBox p={[x(packetIndex),-0.45,1]} s={[0.26,0.18,0.18]} r={0.04} color="#ffe29b" mat="glow" glow={2.2}/>}
    </ThreeCanvas>
    <div style={{position: 'absolute', inset: '0 0 auto', width, height, pointerEvents: 'none'}}>
      <WorldIcons camera={camera} width={width} height={height} icons={p.stops.map((stop, i) => ({
        kind: stop.kind, position: [x(i), -0.7, 0], size: 1.65, state: i === hop ? 'active' : 'on',
      }))}/>
    </div>
    <div style={{position: 'relative', height: 32, fontSize: 23}}>{p.stops.map((stop, i) => {
      const anchor = new Vector3(x(i), -0.7, 0).project(camera);
      return <span key={i} style={{position: 'absolute', left: (anchor.x + 1) * width / 2, transform: 'translateX(-50%)',
        color: i === hop ? PAPER.ink : PAPER.inkSoft, textAlign: 'center', maxWidth: width / p.stops.length}}>{stop.label}</span>;
    })}</div>
    <div style={{marginTop:12,padding:'22px 30px',background:PAPER.card,borderLeft:`4px solid ${PAPER.warn}`,fontSize:27,borderRadius:8}}><strong>{hop+1}. {p.stops[hop].label}</strong><span style={{color:PAPER.inkSoft}}> — {p.stops[hop].detail}</span></div>
  </StudyFrame>;
};
