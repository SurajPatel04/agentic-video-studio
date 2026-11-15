import {useMemo} from 'react';
import {useCurrentFrame} from 'remotion';
import * as THREE from 'three';
import {InfrastructureObject, type ObjectKind} from './InfrastructureObject';
import {networkLayout, type Point3, type Topology} from './networkLayout';

export const Cable: React.FC<{points: Point3[]; start: number; drawFrames: number; packetFrames: number; color: string}> = ({points, start, drawFrames, packetFrames, color}) => {
  const frame = useCurrentFrame();
  const curve = useMemo(() => new THREE.CatmullRomCurve3(points.map(p => new THREE.Vector3(...p)), false, 'centripetal'), [points]);
  const progress = Math.max(0, Math.min(1, (frame - start) / drawFrames));
  const drawn = useMemo(() => {
    const pts = Array.from({length: 33}, (_, i) => curve.getPoint(i / 32 * Math.max(progress, 0.0001)));
    return new THREE.CatmullRomCurve3(pts);
  }, [curve, progress]);
  const elapsed = frame - start - drawFrames;
  const packet = curve.getPoint(((Math.max(0, elapsed) % packetFrames) / packetFrames));
  return <>
    <mesh><tubeGeometry args={[curve, 48, 0.025, 6, false]}/><meshStandardMaterial color="#385167"/></mesh>
    {progress > 0 && <mesh><tubeGeometry args={[drawn, 48, 0.033, 6, false]}/><meshBasicMaterial color={color}/></mesh>}
    {elapsed >= 0 && <mesh position={packet}><sphereGeometry args={[0.09, 12, 12]}/><meshBasicMaterial color="#fff2af"/></mesh>}
  </>;
};
export const StudioLights = () => <>
  <ambientLight intensity={0.9}/><directionalLight position={[1, 5, 8]} intensity={2.4}/>
  <directionalLight position={[-5, 7, -3]} intensity={1.8} color="#8cc9ff"/>
</>;
export const NetworkWorld: React.FC<{topology: Topology; kinds: ObjectKind[]; startAt: number; stagger: number; drawFrames: number; packetFrames: number; accent: string; room?: boolean}> = ({topology, kinds, startAt, stagger, drawFrames, packetFrames, accent, room = false}) => {
  const frame = useCurrentFrame();
  const layout = useMemo(() => networkLayout(topology, kinds.length), [topology, kinds.length]);
  return <group>
    <mesh position={[0, -0.12, 0]}><boxGeometry args={[11, 0.15, 7.5]}/><meshStandardMaterial color="#172b3e" roughness={0.65}/></mesh>
    {room && <>
      <mesh position={[0, 0.6, -3.7]}><boxGeometry args={[11, 1.4, 0.1]}/><meshStandardMaterial color="#3a4e60" transparent opacity={0.6}/></mesh>
      <mesh position={[-5.45, 0.6, 0]}><boxGeometry args={[0.1, 1.4, 7.5]}/><meshStandardMaterial color="#3a4e60" transparent opacity={0.6}/></mesh>
    </>}
    {layout.paths.map((points, i) => <Cable key={i} points={points} start={startAt + i * stagger} drawFrames={drawFrames} packetFrames={packetFrames} color={accent}/>)}
    {layout.positions.map((p, i) => {
      const growth = Math.max(0, Math.min(1, (frame - i * 3) / 18));
      return <group key={i} position={p} scale={[0.55, 0.55 * Math.max(0.001, growth), 0.55]} rotation={[0, -0.15, 0]}>
        <InfrastructureObject kind={kinds[i]} color="#4c7188" opacity={growth}/>
      </group>;
    })}
  </group>;
};
