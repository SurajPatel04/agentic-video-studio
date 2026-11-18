import {ThreeCanvas} from '@remotion/three';
import {z} from 'zod';
import {OrthographicCamera} from 'three';
import {WorldIcons, type WorldIcon} from '../components/WorldIcons';
import {CityWorld, citySites, cityKinds} from '../components/CityWorld';
import {StudioLights} from '../components/NetworkWorld';
import {StudyFrame} from '../components/StudyFrame';
import {useTheme} from '../theme';

export const cityNetworkSceneSchema = z.object({
  title: z.string().default('One city. A connected fibre ring.'),
  buildingCount: z.number().int().min(3).max(10).default(6),
  startAt: z.number().int().nonnegative().default(15),
  drawFrames: z.number().int().positive().default(10),
  packetFrames: z.number().int().positive().default(40),
  caption: z.string().default('MAN • A metropolitan area network connects sites across a city.'),
});
export const description = 'An overhead 3D city connected by a progressively illuminated fibre ring.';
export const tags = ['MAN', 'city', 'fibre', 'ring'];
export const CityNetworkScene: React.FC<z.input<typeof cityNetworkSceneSchema>> = (input) => {
  const p = cityNetworkSceneSchema.parse(input); const theme = useTheme();
  const width = 1440, height = 575;
  const camera = new OrthographicCamera(-width / 2, width / 2, height / 2, -height / 2, 0.1, 1000);
  camera.position.set(0, 20, 16);
  camera.lookAt(0, 0, 0);
  camera.zoom = 29;
  camera.updateProjectionMatrix();
  camera.updateMatrixWorld();
  const positions = citySites(p.buildingCount);
  const icons: WorldIcon[] = positions.map((position, i) => ({kind: cityKinds[i % cityKinds.length], position, size: 3.9 + i % 3 * 0.6}));
  icons.push({kind: 'building', position: [0, 0, 0], size: 5});
  return <StudyFrame title={p.title} eyebrow="MAN / METROPOLITAN AREA NETWORK" footer={p.caption}>
    <ThreeCanvas width={width} height={height} camera={camera}>
      <StudioLights/><CityWorld {...p} positions={positions} color={theme.accent}/>
    </ThreeCanvas>
    <WorldIcons camera={camera} width={width} height={height} icons={icons}/>
  </StudyFrame>;
};
