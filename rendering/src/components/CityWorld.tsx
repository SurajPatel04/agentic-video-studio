import {useMemo} from 'react';
import {PAPER} from '../iso/iso';
import {Cable} from './NetworkWorld';
import type {Point3} from './networkLayout';

export const citySites = (count: number): Point3[] => Array.from({length: count}, (_, i) => {
  const angle = i / count * Math.PI * 2;
  return [Math.cos(angle) * 6, 0.09, Math.sin(angle) * 6];
});

export const cityKinds = ['building', 'office', 'building', 'hospital', 'school', 'factory'] as const;

export const CityWorld: React.FC<{startAt: number; drawFrames: number; packetFrames: number; color: string; positions: Point3[]}> = ({startAt, drawFrames, packetFrames, color, positions}) => {
  const ring = useMemo(() => positions.map((p, i) => [p, positions[(i + 1) % positions.length]]), [positions]);
  return <group>
    <mesh position={[0, -0.16, 0]}><boxGeometry args={[20, 0.25, 20]}/><meshBasicMaterial color={PAPER.track}/></mesh>
    {[-8, -4, 0, 4, 8].map(n => <group key={n}>
      <mesh position={[n, -0.02, 0]}><boxGeometry args={[0.6, 0.025, 20]}/><meshBasicMaterial color="#ccbdb0"/></mesh>
      <mesh position={[0, -0.02, n]}><boxGeometry args={[20, 0.025, 0.6]}/><meshBasicMaterial color="#ccbdb0"/></mesh>
    </group>)}
    {ring.map((points, i) => <Cable key={i} points={points} start={startAt + i * drawFrames} drawFrames={drawFrames} packetFrames={packetFrames} color={color} effect="light" size={0.1}/>)}
  </group>;
};
