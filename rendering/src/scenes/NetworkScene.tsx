import {ThreeCanvas} from '@remotion/three';
import {z} from 'zod';
import {StudyFrame} from '../components/StudyFrame';
import {NetworkWorld, StudioLights} from '../components/NetworkWorld';
import {useTheme} from '../theme';

export const networkSceneSchema = z.object({
  title: z.string().default('A local network. Every device connected.'),
  topology: z.enum(['star', 'bus', 'ring', 'mesh']).default('star'),
  devices: z.array(z.enum(['computer', 'router', 'server', 'laptop'])).min(3).max(8).default(['router', 'computer', 'computer', 'server', 'laptop']),
  startAt: z.number().int().nonnegative().default(20),
  stagger: z.number().int().nonnegative().default(3),
  drawFrames: z.number().int().positive().default(24),
  packetFrames: z.number().int().positive().default(60),
  caption: z.string().optional(),
});
export const description = 'A 3D LAN with star, bus, ring, or mesh cables and frame-driven packet traffic.';
export const tags = ['network', 'LAN', 'topology', 'packets'];
export type NetworkSceneProps = z.input<typeof networkSceneSchema>;
const explanations = {
  star: 'Star • Each device has a separate cable to the central device.',
  bus: 'Bus • Devices share one backbone cable.',
  ring: 'Ring • Each device connects to two neighbors, forming a loop.',
  mesh: 'Full mesh • Every device has a direct link to every other device.',
};
export const NetworkScene: React.FC<NetworkSceneProps> = (input) => {
  const p = networkSceneSchema.parse(input);
  const theme = useTheme();
  return <StudyFrame title={p.title} eyebrow={`LAN / ${p.topology.toUpperCase()} TOPOLOGY`} footer={p.caption ?? explanations[p.topology]}>
    <ThreeCanvas width={1440} height={575} orthographic camera={{position: [0, 8, 10], zoom: 105}}>
      <StudioLights/>
      <NetworkWorld topology={p.topology} kinds={p.devices} startAt={p.startAt} stagger={p.stagger} drawFrames={p.drawFrames} packetFrames={p.packetFrames} accent={theme.accent}/>
    </ThreeCanvas>
    <div style={{position: 'absolute', top: 12, right: 0, border: '1px solid #355269', borderRadius: 12, padding: '12px 20px', fontSize: 19, color: '#c5dce9', background: '#102236'}}>● Moving light = data packet</div>
  </StudyFrame>;
};
