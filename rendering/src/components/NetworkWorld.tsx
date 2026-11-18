import {useMemo} from 'react';
import {useCurrentFrame, useVideoConfig} from 'remotion';
import * as THREE from 'three';
import {PAPER} from '../iso/iso';
import {Movers, type Flow3DEffect} from './three/effects';
import {makeLook, type V3} from './three/parts';
import type {NetworkLayout, Point3} from './networkLayout';

export const Cable: React.FC<{points: Point3[]; start: number; drawFrames: number; packetFrames: number; color: string; effect?: Flow3DEffect; size?: number}> = ({points, start, drawFrames, packetFrames, color, effect = 'packet', size = 0.06}) => {
  const frame = useCurrentFrame();
  const {fps} = useVideoConfig();
  const curve = useMemo(() => new THREE.CatmullRomCurve3(points.map(p => new THREE.Vector3(...p)), false, 'centripetal'), [points]);
  const progress = Math.max(0, Math.min(1, (frame - start) / drawFrames));
  const drawn = useMemo(() => {
    const pts = Array.from({length: 33}, (_, i) => curve.getPoint(i / 32 * Math.max(progress, 0.0001)));
    return new THREE.CatmullRomCurve3(pts);
  }, [curve, progress]);
  const elapsed = frame - start - drawFrames;
  return <>
    <mesh><tubeGeometry args={[curve, 48, 0.025, 6, false]}/><meshStandardMaterial color="#385167"/></mesh>
    {progress > 0 && <mesh><tubeGeometry args={[drawn, 48, 0.033, 6, false]}/><meshBasicMaterial color={color}/></mesh>}
    {elapsed >= 0 && <Movers look={makeLook('active', elapsed / fps, color)} path={points as V3[]} effect={effect} count={effect === 'current' ? 8 : 1} r={size} speed={fps / packetFrames} color={effect === 'packet' ? '#fff2af' : undefined}/>}
  </>;
};
export const StudioLights = () => <>
  <ambientLight intensity={0.9}/><directionalLight position={[1, 5, 8]} intensity={2.4}/>
  <directionalLight position={[-5, 7, -3]} intensity={1.8} color="#8cc9ff"/>
</>;
export const NetworkWorld: React.FC<{layout: NetworkLayout; startAt: number; stagger: number; drawFrames: number; packetFrames: number; accent: string; room?: boolean; effect?: Flow3DEffect}> = ({layout, startAt, stagger, drawFrames, packetFrames, accent, room = false, effect = 'packet'}) => {
  return <group>
    <mesh position={[0, -0.12, 0]}><boxGeometry args={[11, 0.15, 7.5]}/><meshBasicMaterial color={PAPER.track}/></mesh>
    {room && <>
      <mesh position={[0, 0.6, -3.7]}><boxGeometry args={[11, 1.4, 0.1]}/><meshBasicMaterial color="#d9cbbd"/></mesh>
      <mesh position={[-5.45, 0.6, 0]}><boxGeometry args={[0.1, 1.4, 7.5]}/><meshBasicMaterial color="#e2d6c7"/></mesh>
    </>}
    {layout.paths.map((points, i) => <Cable key={i} points={points} start={startAt + i * stagger} drawFrames={drawFrames} packetFrames={packetFrames} color={accent} effect={effect}/>)}
  </group>;
};
