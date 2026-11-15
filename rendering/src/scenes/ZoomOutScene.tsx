import {useThree} from '@react-three/fiber';
import {ThreeCanvas} from '@remotion/three';
import {AbsoluteFill, Sequence, useCurrentFrame, useVideoConfig} from 'remotion';
import {z} from 'zod';
import {CityWorld} from '../components/CityWorld';
import {NetworkWorld, StudioLights} from '../components/NetworkWorld';
import {GlobeScene} from './GlobeScene';
import {useTheme} from '../theme';

export const zoomOutSceneSchema = z.object({
  title: z.string().default('From your room to the world'),
  lanLabel: z.string().default('LAN • One room'),
  manLabel: z.string().default('MAN • One city'),
  wanLabel: z.string().default('WAN • Across the world'),
  cityAt: z.number().int().positive().default(90),
  globeAt: z.number().int().positive().default(210),
  transitionFrames: z.number().int().positive().default(45),
}).refine(p => p.globeAt >= p.cityAt + p.transitionFrames, {message: 'globeAt must follow the city transition', path: ['globeAt']});
export const description = 'A continuous 3D pullback from a room LAN to a city MAN, then a matched dissolve into the satellite WAN globe.';
export const tags = ['zoom', 'LAN', 'MAN', 'WAN', 'scale'];
const INDIA_CITY = [{name: 'India', lat: 22, lon: 79}];
const INDIA_HIGHLIGHT = ['India'];
const WAN_ROUTES = [{from: 'India', to: 'Japan'}, {from: 'India', to: 'United Kingdom'}];
const ease = (n: number) => {const p = Math.max(0, Math.min(1, n)); return p * p * (3 - 2 * p);};
const PullbackCamera: React.FC<{distance: number}> = ({distance}) => {
  const camera = useThree(s => s.camera);
  camera.position.set(0, distance * 0.8, distance); camera.lookAt(0, 0, 0); camera.updateMatrixWorld();
  return null;
};
export const ZoomOutScene: React.FC<z.input<typeof zoomOutSceneSchema>> = (input) => {
  const p = zoomOutSceneSchema.parse(input); const frame = useCurrentFrame(); const {width, height} = useVideoConfig(); const theme = useTheme();
  const cityProgress = ease((frame - p.cityAt) / p.transitionFrames);
  const globeProgress = ease((frame - p.globeAt) / p.transitionFrames);
  const distance = 5 + cityProgress * 24 + globeProgress * 35;
  const label = frame < p.cityAt ? p.lanLabel : frame < p.globeAt ? p.manLabel : p.wanLabel;
  const unit = Math.min(width / 1600, height / 900);
  return <AbsoluteFill style={{background: '#060f1d'}}>
    <AbsoluteFill style={{opacity: 1 - globeProgress}}>
      <ThreeCanvas width={width} height={height} camera={{position: [0, 4, 5], fov: 45}}>
        <PullbackCamera distance={distance}/><StudioLights/>
        {cityProgress > 0 && <CityWorld startAt={p.cityAt} drawFrames={9} packetFrames={35} buildingCount={6} color={theme.accent} centerGap/>}
        <group scale={0.35}><NetworkWorld topology="star" kinds={['router', 'computer', 'laptop', 'server']} startAt={8} stagger={2} drawFrames={15} packetFrames={35} accent={theme.accent} room/></group>
      </ThreeCanvas>
    </AbsoluteFill>
    {frame >= p.globeAt && <Sequence from={p.globeAt} layout="none">
      <AbsoluteFill style={{opacity: globeProgress, transform: `scale(${1.5 - globeProgress * 0.5})`}}>
        <GlobeScene camera="overview" cities={INDIA_CITY} highlightCountries={INDIA_HIGHLIGHT} routes={WAN_ROUTES} cameraDistance={6.5} spinSpeed={0.025} startAt={15} showLabels={false}/>
      </AbsoluteFill>
    </Sequence>}
    <div style={{position: 'absolute', left: 80 * unit, top: 60 * unit, right: 80 * unit, fontSize: 48 * unit, color: theme.text, fontWeight: 650}}>{p.title}</div>
    <div style={{position: 'absolute', bottom: 60 * unit, left: 80 * unit, fontSize: 34 * unit, color: theme.accent, background: '#0e2135ee', padding: `${20 * unit}px ${30 * unit}px`, borderRadius: 14 * unit}}>{label}</div>
    <div style={{position: 'absolute', right: 80 * unit, bottom: 78 * unit, color: '#99b3c7', fontSize: 20 * unit}}>LAN → MAN → WAN</div>
  </AbsoluteFill>;
};
