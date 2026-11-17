import {ThreeCanvas} from '@remotion/three';
import {AbsoluteFill, useCurrentFrame, useVideoConfig} from 'remotion';
import {z} from 'zod';
import {InfrastructureObject} from '../components/InfrastructureObject';
import {deviceKindSchema} from '../components/Device';
import {useTheme} from '../theme';

const frameNumber = z.number().int().nonnegative();
export const infrastructureObjectSchema = z.object({
  kind: deviceKindSchema.default('building'), // any of the 65 device kinds
  label: z.string().max(40).optional(),
  size: z.enum(['small', 'medium', 'large']).default('medium'),
  scale: z.number().min(0.25).max(2).default(1),
  width: z.number().min(0.4).max(1.8).default(1),
  height: z.number().min(0.4).max(1.8).default(1),
  x: z.number().min(0).max(100).optional(),
  y: z.number().min(0).max(100).default(76),
  color: z.string().optional(), // body colour
  glow: z.string().optional(), // screen / LED colour
  delay: frameNumber.optional(),
  growFrames: z.number().int().min(1).optional(),
  disappearAt: frameNumber.optional(),
});
export const infrastructureSceneSchema = z.object({
  title: z.string().default('Infrastructure, built step by step'),
  caption: z.string().default('Buildings, servers, and devices — ready for your next explanation.'),
  preset: z.enum(['city', 'technology', 'mixed']).default('mixed'),
  objects: z.array(infrastructureObjectSchema).max(12).optional(),
  scale: z.number().min(0.25).max(1.5).default(1),
  stagger: frameNumber.default(10),
  growFrames: z.number().int().min(1).default(28),
  disappear: z.boolean().default(true),
  disappearAt: frameNumber.optional(),
  disappearFrames: z.number().int().min(1).default(22),
  showLabels: z.boolean().default(true),
  showPlatform: z.boolean().default(true),
  animation: z.enum(['grow', 'fade', 'none']).default('grow'),
});
export type InfrastructureSceneProps = z.input<typeof infrastructureSceneSchema>;
export const description = 'Buildings and technology objects grow from their base, hold, then disappear with configurable sizes and timing.';
export const tags = ['building', 'city', 'server', 'computer', 'laptop', 'router', 'infrastructure'];
const presets: Record<'city' | 'technology' | 'mixed', z.input<typeof infrastructureObjectSchema>[]> = {
  city: [
    {kind: 'building', label: 'Small office', size: 'small', color: '#426775'},
    {kind: 'building', label: 'Headquarters', size: 'large', color: '#3f6179'},
    {kind: 'building', label: 'Apartments', height: 1.2, color: '#536c7d'},
    {kind: 'building', label: 'Studio', size: 'small', width: 1.3, color: '#687b85'},
  ],
  technology: [
    {kind: 'server', label: 'Server rack'},
    {kind: 'computer', label: 'Desktop'},
    {kind: 'laptop', label: 'Laptop'},
    {kind: 'router', label: 'Router'},
  ],
  mixed: [
    {kind: 'building', label: 'Office', size: 'large', color: '#3f6179'},
    {kind: 'server', label: 'Server'},
    {kind: 'computer', label: 'Computer'},
    {kind: 'router', label: 'Network'},
  ],
};
const smooth = (value: number) => {
  const p = Math.max(0, Math.min(1, value));
  return p * p * (3 - 2 * p);
};

export const InfrastructureScene: React.FC<InfrastructureSceneProps> = (input) => {
  const props = infrastructureSceneSchema.parse(input);
  const frame = useCurrentFrame();
  const {width, height, durationInFrames} = useVideoConfig();
  const theme = useTheme();
  const objects = props.objects ?? presets[props.preset].map(o => infrastructureObjectSchema.parse(o));
  const exitStart = props.disappearAt ?? Math.max(0, durationInFrames - props.disappearFrames - 1);
  const u = Math.min(width / 1920, height / 1080);
  const canvasHeight = Math.round(height * 0.66);
  const worldWidth = 12.5 * width / height / (16 / 9);
  const slot = worldWidth * 0.9 / Math.max(1, objects.length);
  const states = objects.map((o, i) => {
    const start = o.delay ?? i * props.stagger;
    const grow = smooth((frame - start) / (o.growFrames ?? props.growFrames));
    const out = props.disappear ? smooth((frame - (o.disappearAt ?? exitStart)) / props.disappearFrames) : 0;
    const visibility = props.animation === 'none' ? (frame >= start ? 1 - out : 0) : grow * (1 - out);
    const size = {small: 0.72, medium: 1, large: 1.28}[o.size];
    const scale = size * o.scale * props.scale;
    const fit = Math.min(1, slot / (2.5 * scale * o.width), 4.2 / (3.2 * scale * o.height));
    return {o, visibility, scale: scale * fit, x: o.x === undefined ? -worldWidth * 0.45 + slot * (i + 0.5) : (o.x / 100 - 0.5) * worldWidth};
  });
  return <AbsoluteFill style={{background: 'radial-gradient(ellipse at 50% 45%, #263747 0%, #101a27 60%, #090f18 100%)'}}>
    <div style={{position: 'absolute', top: height * 0.075, left: width * 0.075, right: width * 0.075}}>
      <div style={{fontSize: 17 * u, letterSpacing: 5 * u, color: '#8fa9bc', marginBottom: 22 * u}}>INFRASTRUCTURE / {props.preset === 'city' ? 'ARCHITECTURE' : 'SYSTEMS'}</div>
      <div style={{fontSize: 58 * u, fontWeight: 600, color: theme.text, letterSpacing: -1.6 * u}}>{props.title}</div>
    </div>
    <div style={{position: 'absolute', top: height * 0.23, width, height: canvasHeight}}>
      <ThreeCanvas width={width} height={canvasHeight} shadows orthographic camera={{position: [0, 5.2, 13], zoom: width / worldWidth, near: 0.1, far: 100}} gl={{antialias: true, alpha: true}}>
        <ambientLight intensity={0.9}/>
        <directionalLight position={[1, 3, 9]} intensity={2.4} color="#e6efff"/>
        <hemisphereLight args={['#c5ddf5', '#18202b', 1.2]}/>
        <directionalLight position={[-5, 8, 6]} intensity={3.2} castShadow shadow-mapSize={[2048, 2048]} shadow-camera-left={-10} shadow-camera-right={10} shadow-camera-top={8} shadow-camera-bottom={-8} shadow-bias={-0.0002}/>
        <directionalLight position={[6, 4, -4]} intensity={2.5} color="#82b9e0"/>
        {props.showPlatform && <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -1.51, 0]} receiveShadow>
          <planeGeometry args={[200, 200]}/><shadowMaterial transparent opacity={0.35}/>
        </mesh>}
        {states.map(({o, visibility, scale, x}, i) => <group key={i} position={[x, -1.5 + (76 - o.y) * 0.05, 0]} rotation={[0, -0.35, 0]}>
          {props.showPlatform && <mesh position={[0, -0.05, 0]} receiveShadow>
            <boxGeometry args={[Math.min(slot * 0.93, 2.7), 0.09, 2.05]}/>
            <meshStandardMaterial color="#303d4b" metalness={0.5} roughness={0.4}/>
          </mesh>}
          {visibility > 0 && <group scale={[scale * o.width, scale * o.height * (props.animation === 'grow' ? Math.max(0.001, visibility) : 1), scale * o.width]}>
            <InfrastructureObject kind={o.kind} color={o.color} glow={o.glow} opacity={visibility}/>
          </group>}
        </group>)}
      </ThreeCanvas>
    </div>
    {props.showLabels && <div style={{position: 'absolute', top: height * 0.81, left: '5%', right: '5%', display: 'flex'}}>
      {states.map(({o, visibility}, i) => <div key={i} style={{flex: 1, textAlign: 'center', opacity: visibility, color: '#b9c8d4', fontSize: 23 * u, letterSpacing: 0.4 * u}}>{o.label ?? o.kind}</div>)}
    </div>}
    {props.caption ? <div style={{position: 'absolute', left: '7.5%', right: '7.5%', bottom: height * 0.065, borderTop: '1px solid #344353', paddingTop: 24 * u, fontSize: 22 * u, color: '#8296a8'}}>{props.caption}</div> : null}
  </AbsoluteFill>;
};

export const BuildingScene: React.FC<InfrastructureSceneProps> = (props) => <InfrastructureScene preset="city" title="A city takes shape" caption="Different sizes. One connected city." {...props}/>;
export const TechnologyScene: React.FC<InfrastructureSceneProps> = (props) => <InfrastructureScene preset="technology" title="The hardware behind the network" caption="Servers, computers, and routers working together." {...props}/>;
