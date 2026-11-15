import type {FC} from 'react';

export type ObjectKind = 'building' | 'server' | 'computer' | 'laptop' | 'router';
type Vec = [number, number, number];
type PartProps = {p: Vec; s: Vec; color: string; metal?: number; glow?: boolean; opacity: number};
const Part: FC<PartProps> = ({p, s, color, metal = 0.3, glow = false, opacity}) => <mesh position={p} castShadow receiveShadow>
  <boxGeometry args={s}/>
  <meshStandardMaterial color={color} metalness={metal * 0.65} roughness={metal > 0.5 ? 0.25 : 0.6} transparent={opacity < 1} opacity={opacity} emissive={glow ? color : '#000000'} emissiveIntensity={glow ? 0.55 : 0}/>
</mesh>;

/** Procedural 3D models, grounded at y=0. No network assets or time-based animation. */
export const InfrastructureObject: FC<{kind: ObjectKind; color: string; opacity: number}> = ({kind, color, opacity}) => {
  const box = (p: Vec, s: Vec, c: string, metal = 0.3, glow = false) => <Part p={p} s={s} color={c} metal={metal} glow={glow} opacity={opacity}/>;
  if (kind === 'building') return <group>
    {box([0, 1.5, 0], [1.32, 3, 1.05], '#303d47', 0.5)}
    {box([0, 0.07, 0], [1.65, 0.14, 1.4], '#a6a29a')}
    {box([0, 3.04, 0], [1.43, 0.1, 1.15], '#a6aeb1', 0.7)}
    {box([0.16, 3.16, -0.12], [0.65, 0.18, 0.52], '#6e787b', 0.7)}
    {Array.from({length: 9}, (_, row) => <group key={row}>
      {box([0, 0.23 + row * 0.31, 0], [1.39, 0.045, 1.12], '#87949a', 0.7)}
      {[0, 1, 2, 3].map(col => {
        const lit = (row * 5 + col * 3) % 7 < 2;
        return <group key={col}>
          {box([-0.49 + col * 0.325, 0.38 + row * 0.31, 0.534], [0.27, 0.245, 0.018], lit ? '#e7cc91' : color, 0.65, lit)}
          {box([0.67, 0.38 + row * 0.31, -0.39 + col * 0.26], [0.018, 0.245, 0.205], lit ? '#b8ced4' : color, 0.65, lit)}
        </group>;
      })}
    </group>)}
    {[-0.66, -0.33, 0, 0.33, 0.66].map(x => <group key={x}>{box([x, 1.5, 0.56], [0.025, 3, 0.035], '#adb7bc', 0.8)}</group>)}
    {box([0, 0.21, 0.59], [0.4, 0.39, 0.05], '#14222d', 0.6)}
    {box([0, 0.46, 0.74], [0.65, 0.04, 0.45], '#aab3b6', 0.8)}
  </group>;
  if (kind === 'server') return <group>
    {box([0, 1.45, 0], [1.26, 2.9, 1.05], '#171e27', 0.6)}
    {[-0.62, 0.62].map(x => <group key={x}>{box([x, 1.47, 0.56], [0.08, 2.94, 0.09], '#76818d', 0.8)}</group>)}
    {Array.from({length: 9}, (_, row) => <group key={row}>
      {box([0, 0.23 + row * 0.3, 0.565], [1.08, 0.255, 0.075], '#35414b', 0.8)}
      {Array.from({length: 8}, (_, col) => <group key={col}>{box([-0.38 + col * 0.095, 0.23 + row * 0.3, 0.61], [0.045, 0.16, 0.012], '#0c1017')}</group>)}
      {box([0.46, 0.25 + row * 0.3, 0.614], [0.035, 0.045, 0.015], '#64e7ac', 0, true)}
      {box([0.46, 0.17 + row * 0.3, 0.614], [0.035, 0.025, 0.015], color, 0, true)}
    </group>)}
    {box([0, 0.03, 0], [1.4, 0.06, 1.2], '#090f18')}
  </group>;
  if (kind === 'router') return <group>
    {box([0, 0.2, 0], [1.65, 0.28, 0.95], '#252e38', 0.5)}
    {box([0, 0.35, 0], [1.57, 0.025, 0.89], '#414d58', 0.7)}
    {[-0.65, 0.65].map(x => <group key={x} rotation={[0, 0, -x * 0.15]}>{box([x, 0.88, -0.3], [0.065, 1.18, 0.065], '#28323d')}</group>)}
    {Array.from({length: 12}, (_, i) => <group key={i}>{box([-0.55 + i * 0.1, 0.371, 0], [0.035, 0.012, 0.52], '#0e151e')}</group>)}
    {[0, 1, 2, 3].map(i => <group key={i}>{box([-0.5 + i * 0.15, 0.21, 0.482], [0.045, 0.035, 0.01], '#74ebc3', 0, true)}</group>)}
  </group>;
  const laptop = kind === 'laptop';
  const screenY = laptop ? 0.82 : 1.65;
  return <group>
    {box([0, screenY, -0.12], [2.05, 1.28, 0.09], '#9aa4ae', 0.85)}
    {box([0, screenY, -0.066], [1.96, 1.19, 0.025], '#080f19')}
    {box([0, screenY, -0.048], [1.85, 1.07, 0.01], '#132e45', 0.4, true)}
    {box([-0.7, screenY, -0.036], [0.27, 0.97, 0.008], '#1c4057')}
    {Array.from({length: 7}, (_, i) => <group key={i}>
      {box([-0.05 + (i % 2) * 0.1, screenY + 0.36 - i * 0.105, -0.028], [0.85 - (i % 3) * 0.16, 0.024, 0.008], i % 3 === 0 ? '#5ac5c9' : '#8197ad', 0, true)}
    </group>)}
    {!laptop && <>
      {box([0, 0.55, -0.12], [0.17, 0.95, 0.13], '#abb3bb', 0.85)}
      {box([0, 0.06, 0], [0.85, 0.07, 0.65], '#a1aab4', 0.8)}
    </>}
    {box([0, laptop ? 0.12 : 0.06, 0.42], [laptop ? 2.05 : 1.65, 0.08, laptop ? 1.25 : 0.6], '#8a969f', 0.8)}
    {Array.from({length: 5}, (_, row) => <group key={row}>
      {Array.from({length: 12}, (_, col) => <group key={col}>{box([-0.72 + col * 0.13, laptop ? 0.167 : 0.107, 0.18 + row * 0.085], [0.105, 0.015, 0.058], '#1a232d')}</group>)}
    </group>)}
    {laptop && box([0, 0.166, 0.84], [0.63, 0.008, 0.25], '#63717d', 0.65)}
  </group>;
};
