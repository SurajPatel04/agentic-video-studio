import {useMemo} from 'react';
import {InfrastructureObject} from './InfrastructureObject';
import {Cable} from './NetworkWorld';
import type {Point3} from './networkLayout';

export const CityWorld: React.FC<{startAt: number; drawFrames: number; packetFrames: number; color: string; buildingCount: number; centerGap?: boolean}> = ({startAt, drawFrames, packetFrames, color, buildingCount, centerGap = false}) => {
  const positions = useMemo(() => Array.from({length: buildingCount}, (_, i): Point3 => {
    const a = i / buildingCount * Math.PI * 2;
    return [Math.cos(a) * 6, 0.09, Math.sin(a) * 6];
  }), [buildingCount]);
  const ring = useMemo(() => positions.map((p, i) => [p, positions[(i + 1) % positions.length]]), [positions]);
  return <group>
    <mesh position={[0, -0.16, 0]}><boxGeometry args={[20, 0.25, 20]}/><meshStandardMaterial color="#183144"/></mesh>
    {[-8, -4, 0, 4, 8].map(n => <group key={n}>
      <mesh position={[n, -0.02, 0]}><boxGeometry args={[0.6, 0.025, 20]}/><meshStandardMaterial color="#0b1c2c"/></mesh>
      <mesh position={[0, -0.02, n]}><boxGeometry args={[20, 0.025, 0.6]}/><meshStandardMaterial color="#0b1c2c"/></mesh>
    </group>)}
    {ring.map((points, i) => <Cable key={i} points={points} start={startAt + i * drawFrames} drawFrames={drawFrames} packetFrames={packetFrames} color={color} effect="light" size={0.1}/>)}
    {positions.map(([x, , z], i) => <group key={i} position={[x, 0, z]} scale={[1.1, 0.9 + (i % 3) * 0.3, 1.1]}>
      <InfrastructureObject kind={(['building', 'office', 'building', 'hospital', 'school', 'factory'] as const)[i % 6]} color={i % 2 ? '#476878' : undefined}/>
    </group>)}
    {!centerGap && <group scale={[1.4, 1.5, 1.4]}><InfrastructureObject kind="building" color="#57788c"/></group>}
  </group>;
};
