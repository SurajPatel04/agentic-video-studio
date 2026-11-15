import {ThreeCanvas} from '@remotion/three';
import {z} from 'zod';
import {CityWorld} from '../components/CityWorld';
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
  return <StudyFrame title={p.title} eyebrow="MAN / METROPOLITAN AREA NETWORK" footer={p.caption}>
    <ThreeCanvas width={1440} height={575} orthographic camera={{position: [0, 20, 16], zoom: 29}}>
      <StudioLights/><CityWorld {...p} color={theme.accent}/>
    </ThreeCanvas>
  </StudyFrame>;
};
