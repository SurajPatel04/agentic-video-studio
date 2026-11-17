import type {FC} from 'react';
import * as THREE from 'three';
import {C, Cap, Cyl, Extrude, G, Led, type Look, RBox, Rod, Sph, Tor, Tube} from '../parts';

type M = FC<{look: Look}>;
const on = (look: Look) => look.state !== 'off';
const stateColor = (look: Look) => (look.state === 'error' ? '#ef4444' : look.accent);
const WARM = '#ffd58a';

let glowTex: THREE.Texture | null = null;
/** Soft radial glow (white centre -> transparent edge), tinted by the sprite colour. */
const glowTexture = () => {
  if (!glowTex) {
    const c = document.createElement('canvas');
    c.width = c.height = 128;
    const ctx = c.getContext('2d')!;
    const g = ctx.createRadialGradient(64, 64, 0, 64, 64, 64);
    g.addColorStop(0, 'rgba(255,255,255,0.9)');
    g.addColorStop(0.35, 'rgba(255,255,255,0.35)');
    g.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 128, 128);
    glowTex = new THREE.CanvasTexture(c);
  }
  return glowTex;
};

/* ---------------------------------------------------------------- electronics */

export const CpuModel: M = ({look}) => (
  <group position={[0, 0.5, 0]} rotation={[0.58, 0.3, 0]}>
    <RBox s={[1.12, 0.065, 1.12]} r={0.018} color="#184b42" mat="matte" />
    <RBox p={[0, 0.055, 0]} s={[0.91, 0.04, 0.91]} r={0.035} color="#14191e" />
    <RBox p={[0, 0.105, 0]} s={[0.83, 0.09, 0.83]} r={0.035} color={look.body ?? '#bbc3cc'} mat="brushed" />
    {[-1, 1].map((side) => <group key={side}>
      {Array.from({length: 12}, (_, i) => <group key={i}>
        <Cyl p={[-0.49 + i * 0.089, -0.06, side * 0.48]} r={0.016} h={0.06} color={C.gold} mat="metal" />
        <Cyl p={[side * 0.48, -0.06, -0.49 + i * 0.089]} r={0.016} h={0.06} color={C.gold} mat="metal" />
      </group>)}
      {[0, 1, 2, 3, 4].map((i) => <RBox key={i} p={[side * 0.49, 0.043, -0.3 + i * 0.15]} s={[0.035, 0.025, 0.06]} r={0.003} color="#aa956a" mat="metal" />)}
    </group>)}
    {/* Laser-etched identification bars and package orientation marker. */}
    {[0.28, 0.21, 0.14].map((z, i) => <RBox key={z} p={[-0.1, 0.152, z]} s={[0.38 - i * 0.07, 0.002, 0.016]} r={0.001} color="#69737c" mat="matte" />)}
    <Sph p={[-0.48, 0.036, 0.48]} r={0.024} scale={[1, 0.1, 1]} color={C.gold} mat="metal" />
  </group>
);

export const RamModel: M = ({look}) => (
  <group position={[0, 0.08, 0]} rotation={[-0.12, 0.3, 0]}>
    {/* Two board sections leave a physical keyed notch along the contact edge. */}
    <RBox p={[0, 0.42, 0]} s={[1.65, 0.42, 0.045]} r={0.007} color={look.body ?? '#205449'} mat="matte" />
    <RBox p={[-0.39, 0.19, 0]} s={[0.87, 0.08, 0.045]} r={0.003} color={look.body ?? '#205449'} mat="matte" />
    <RBox p={[0.47, 0.19, 0]} s={[0.71, 0.08, 0.045]} r={0.003} color={look.body ?? '#205449'} mat="matte" />
    {[-1, 1].map((side) => <group key={side}>
      {Array.from({length: 32}, (_, i) => {
        const x = -0.79 + i * 0.051;
        if (x > 0.035 && x < 0.12) return null;
        return <RBox key={i} p={[x, 0.192, side * 0.025]} s={[0.033, 0.075, 0.006]} r={0.002} color={C.gold} mat="metal" />;
      })}
      {Array.from({length: 8}, (_, i) => <G key={i} p={[-0.7 + i * 0.2, 0.43, side * 0.038]}>
        <RBox s={[0.155, 0.23, 0.035]} r={0.009} color="#202329" mat="matte" />
        <RBox p={[0, 0.04, side * 0.019]} s={[0.083, 0.008, 0.003]} r={0.001} color="#778082" mat="matte" />
        {[-1, 1].map((edge) => <RBox key={edge} p={[0, edge * 0.13, 0]} s={[0.07, 0.018, 0.017]} r={0.002} color="#b7ac8f" mat="metal" />)}
      </G>)}
    </group>)}
    {[-0.77, 0.77].map((x) => <RBox key={x} p={[x, 0.59, 0.026]} s={[0.045, 0.026, 0.006]} r={0.004} color={C.gold} mat="metal" />)}
  </group>
);

export const StorageModel: M = ({look}) => (
  <group position={[0, 0.35, 0]} rotation={[0.7, -0.35, 0]}>
    <RBox s={[1.0, 0.1, 1.4]} r={0.03} color={look.body ?? '#3b414a'} mat="brushed" />
    <RBox p={[0, 0.052, 0.1]} s={[0.8, 0.004, 0.9]} r={0.01} color="#111418" />
    <RBox p={[0, 0.056, -0.15]} s={[0.6, 0.002, 0.2]} r={0.01} color={stateColor(look)} mat={on(look) ? 'glow' : 'plastic'} glow={look.screenGlow * 0.8} />
    <RBox p={[0.2, 0, -0.72]} s={[0.45, 0.06, 0.05]} r={0.005} color={C.black} />
    <Led p={[-0.4, 0.06, 0.6]} look={look} r={0.015} />
  </group>
);

const BatteryBody: FC<{look: Look; level: number}> = ({look, level}) => (
  <group>
    <Cyl p={[0, 0.55, 0]} r={0.28} h={1.0} seg={64} color={look.body ?? '#1d2229'} mat="gloss" />
    <Cyl p={[0, 0.82, 0]} r={0.285} h={0.3} seg={64} color={C.gold} mat="metal" />
    <Cyl p={[0, 1.08, 0]} r={0.1} h={0.06} color={C.silver} mat="metal" />
    <Cyl p={[0, 0.04, 0]} r={0.27} h={0.03} color={C.silver} mat="metal" />
    {/* charge window */}
    <RBox p={[0, 0.42, 0.27]} s={[0.12, 0.56, 0.03]} r={0.02} color="#0b0d10" />
    <RBox p={[0, 0.16 + (0.52 * level) / 2, 0.285]} s={[0.08, 0.52 * level, 0.02]} r={0.015}
      color={look.state === 'error' ? '#ef4444' : level < 0.25 ? '#f59e0b' : '#22c55e'} mat="glow" glow={on(look) ? 1.6 : 0.2} />
  </group>
);

export const BatteryModel: M = ({look}) => (
  <BatteryBody look={look} level={look.state === 'off' ? 0.1 : look.state === 'error' ? 0.15 : 0.85} />
);

const BOLT: [number, number][] = [[0.05, 0.5], [-0.2, 0.0], [-0.02, 0.0], [-0.1, -0.45], [0.2, 0.08], [0.02, 0.08]];

export const ChargingModel: M = ({look}) => {
  const level = look.state === 'off' ? 0.1 : (0.2 + ((look.t * 0.35) % 1) * 0.8);
  return (
    <group>
      <G p={[-0.3, 0, 0]}>
        <BatteryBody look={look} level={level} />
      </G>
      <Extrude shape={BOLT} depth={0.08} bevel={0.015} p={[0.42, 0.6, 0.1]} scale={1.1} color="#facc15" mat={on(look) ? 'glow' : 'plastic'} glow={1.8} />
      <Tube points={[[-0.3, 1.12, 0], [-0.3, 1.35, 0], [0.3, 1.3, -0.2], [0.75, 0.05, -0.3]]} r={0.025} color={C.black} mat="rubber" />
    </group>
  );
};

const BULB_PROFILE = new THREE.SplineCurve([
  [0.15, 0.37], [0.16, 0.48], [0.21, 0.61], [0.33, 0.76],
  [0.39, 0.94], [0.37, 1.10], [0.26, 1.24], [0.1, 1.31], [0, 1.32],
].map(([r, y]) => new THREE.Vector2(r, y))).getPoints(64);
const BULB_THREAD: [number, number, number][] = Array.from({length: 160}, (_, i) => {
  const a = i / 159 * Math.PI * 10;
  return [Math.cos(a) * 0.163, 0.12 + i / 159 * 0.25, Math.sin(a) * 0.163];
});
const FILAMENT: [number, number, number][] = Array.from({length: 100}, (_, i) => {
  const t = i / 99;
  return [-0.11 + t * 0.22, 0.92 + Math.sin(t * Math.PI * 24) * 0.014, Math.cos(t * Math.PI * 24) * 0.014];
});
export const BulbModel: M = ({look}) => {
  const lit = on(look);
  const flicker = look.state === 'error' ? (Math.sin(look.t * 23) > 0.3 ? 1 : 0.12) : 1;
  const glow = lit ? 2.5 * flicker : 0;
  return <group>
    <Cyl p={[0, 0.045, 0]} r={0.075} h={0.04} color="#81715a" mat="metal" />
    <Cyl p={[0, 0.09, 0]} r={0.12} rTop={0.16} h={0.06} color="#242932" mat="rubber" />
    <Cyl p={[0, 0.245, 0]} r={0.155} h={0.28} color={look.body ?? '#9b9fa5'} mat="brushed" />
    <Tube points={BULB_THREAD} r={0.017} color={look.body ?? '#c0c5cd'} mat="metal" />
    <Tor p={[0, 0.385, 0]} r={0.155} tube={0.014} rot={[Math.PI / 2, 0, 0]} color={C.silver} mat="metal" />
    <Cyl p={[0, 0.61, 0]} r={0.027} h={0.43} color="#c2d3dd" mat="glass" opacity={0.3} />
    {[-1, 1].map((side) => <Rod key={side} from={[side * 0.035, 0.43, 0]} to={[side * 0.11, 0.92, 0]} r={0.006} color="#747780" mat="metal" />)}
    <Tube points={FILAMENT} r={0.006} color={lit ? '#ffc16b' : '#5b5045'} mat={lit ? 'glow' : 'metal'} glow={glow * 2} />
    <mesh>
      <latheGeometry args={[BULB_PROFILE, 64]} />
      <meshPhysicalMaterial color="#e7f0f5" metalness={0.05} roughness={0.08} clearcoat={1}
        transparent opacity={0.18} side={THREE.DoubleSide} depthWrite={false}
        emissive={WARM} emissiveIntensity={glow * 0.045} />
    </mesh>
    {lit ? <>
      <sprite position={[0, 0.93, 0]} scale={[0.95, 0.95, 1]}>
        <spriteMaterial map={glowTexture()} color={WARM} transparent opacity={0.24 * flicker} depthWrite={false} toneMapped={false} />
      </sprite>
      <pointLight position={[0, 0.94, 0]} color={WARM} intensity={glow * 0.25} distance={2} />
    </> : null}
  </group>;
};

export const PlugModel: M = ({look}) => (
  <group position={[0, 0.45, 0]} rotation={[0.1, -0.5, 0]}>
    <RBox s={[0.5, 0.42, 0.34]} r={0.08} color={look.body ?? C.white} />
    {[-0.1, 0.1].map((x) => (
      <RBox key={x} p={[x, 0, 0.3]} s={[0.04, 0.12, 0.28]} r={0.01} color={C.silver} mat="metal" />
    ))}
    <Led p={[0, 0.16, 0.172]} look={look} r={0.018} color={look.accent} />
    <Tube points={[[0, 0, -0.17], [0, -0.1, -0.5], [0.3, -0.4, -0.6], [0.6, -0.44, -0.3]]} r={0.04} color={C.white} mat="rubber" />
  </group>
);

export const PowerModel: M = ({look}) => {
  const press = look.state === 'active' ? -0.02 * Math.max(0, Math.sin(look.t * Math.PI * 2)) : 0;
  const lit = on(look);
  return (
    <group position={[0, 0.25, 0]} rotation={[0.9, 0, 0]}>
      <Cyl r={0.62} h={0.14} seg={64} color={C.dark} mat="brushed" />
      <Cyl p={[0, 0.11 + press, 0]} r={0.46} h={0.1} seg={64} color={look.body ?? C.graphite} mat="gloss" />
      <Tor p={[0, 0.17 + press, 0]} r={0.2} tube={0.035} arc={Math.PI * 1.6} rot={[Math.PI / 2, 0, Math.PI * 0.7]}
        color={stateColor(look)} mat={lit ? 'glow' : 'plastic'} glow={look.screenGlow * 2} />
      <RBox p={[0, 0.17 + press, -0.16]} s={[0.07, 0.04, 0.2]} r={0.02} color={stateColor(look)} mat={lit ? 'glow' : 'plastic'} glow={look.screenGlow * 2} />
      <Tor p={[0, 0.07, 0]} r={0.54} tube={0.015} rot={[Math.PI / 2, 0, 0]} color={stateColor(look)} mat={lit ? 'glow' : 'plastic'} glow={look.screenGlow} />
    </group>
  );
};

/* --------------------------------------------------------------------- places */

/** Grid of windows on a facade facing +z; lit windows glow warm when the device is on. */
const Windows: FC<{look: Look; cols: number; rows: number; w: number; h: number; x0: number; y0: number; z: number; seed?: number}> = ({
  look, cols, rows, w, h, x0, y0, z, seed = 1,
}) => (
  <>
    {Array.from({length: rows}, (_, r) =>
      Array.from({length: cols}, (_, c) => {
        const litHere = on(look) && ((r * 7 + c * 3 + seed) % 5) < 3;
        return (
          <RBox key={`${r}-${c}`} p={[x0 + c * w * 1.6, y0 + r * h * 1.7, z]} s={[w, h, 0.02]} r={0.006}
            color={litHere ? WARM : '#22344a'} mat={litHere ? 'glow' : 'gloss'} glow={0.9} />
        );
      }),
    )}
  </>
);

const roof = (w: number, h: number): [number, number][] => [[-w / 2, 0], [w / 2, 0], [0, h]];

export const HouseModel: M = ({look}) => (
  <group>
    <RBox p={[0, 0.4, 0]} s={[1.1, 0.8, 0.9]} r={0.02} color={look.body ?? '#efe3cf'} mat="matte" />
    <Extrude shape={roof(1.32, 0.55)} depth={1.05} bevel={0.01} p={[0, 0.8, 0]} color="#9c3d2e" mat="matte" />
    <RBox p={[0.32, 1.2, -0.15]} s={[0.14, 0.4, 0.14]} r={0.01} color="#7a5a48" mat="matte" />
    <RBox p={[0, 0.24, 0.455]} s={[0.24, 0.46, 0.02]} r={0.02} color="#6b4a32" mat="matte" />
    <Sph p={[0.07, 0.24, 0.47]} r={0.015} color={C.gold} mat="metal" />
    <Windows look={look} cols={2} rows={1} w={0.22} h={0.2} x0={-0.38} y0={0.52} z={0.455} seed={2} />
  </group>
);

export const BuildingModel: M = ({look}) => (
  <group>
    <RBox p={[0, 0.82, 0]} s={[0.82, 1.64, 0.82]} r={0.02} color={look.body ?? '#35506b'} mat="gloss" />
    <RBox p={[0, 1.66, 0]} s={[0.86, 0.06, 0.86]} r={0.01} color={C.silver} mat="brushed" />
    <Windows look={look} cols={4} rows={8} w={0.12} h={0.1} x0={-0.29} y0={0.18} z={0.415} />
    <RBox p={[0, 0.1, 0.42]} s={[0.28, 0.2, 0.02]} r={0.01} color="#0e1824" mat="glass" />
  </group>
);

export const OfficeModel: M = ({look}) => (
  <group>
    <RBox p={[0, 0.42, 0]} s={[1.55, 0.84, 0.8]} r={0.02} color={look.body ?? '#4a6278'} mat="gloss" />
    {[0.28, 0.56, 0.84].map((y) => (
      <RBox key={y} p={[0, y, 0.405]} s={[1.56, 0.03, 0.02]} r={0.005} color={C.silver} mat="brushed" />
    ))}
    <Windows look={look} cols={8} rows={2} w={0.11} h={0.12} x0={-0.62} y0={0.36} z={0.405} seed={3} />
    <RBox p={[0, 0.14, 0.5]} s={[0.5, 0.03, 0.22]} r={0.01} color={C.silver} mat="brushed" />
    <RBox p={[0, 0.07, 0.41]} s={[0.3, 0.14, 0.02]} r={0.01} color="#0e1824" mat="glass" />
  </group>
);

export const SchoolModel: M = ({look}) => (
  <group>
    <RBox p={[0, 0.32, 0]} s={[1.5, 0.64, 0.72]} r={0.02} color={look.body ?? C.brick} mat="matte" />
    <RBox p={[0, 0.48, 0.1]} s={[0.5, 0.96, 0.72]} r={0.02} color={look.body ?? '#c4654b'} mat="matte" />
    <Extrude shape={roof(0.6, 0.3)} depth={0.76} bevel={0.01} p={[0, 0.96, 0.1]} color="#5b3a2c" mat="matte" />
    <Cyl p={[0, 0.78, 0.47]} r={0.11} h={0.03} rot={[Math.PI / 2, 0, 0]} color={C.white} />
    <RBox p={[0, 0.8, 0.49]} s={[0.012, 0.08, 0.01]} r={0.002} color={C.black} />
    <RBox p={[0.03, 0.78, 0.49]} s={[0.06, 0.012, 0.01]} r={0.002} color={C.black} />
    <RBox p={[0, 0.16, 0.465]} s={[0.2, 0.32, 0.02]} r={0.01} color="#3d2a1f" />
    <Windows look={look} cols={3} rows={2} w={0.14} h={0.12} x0={-0.68} y0={0.2} z={0.365} seed={4} />
    <Windows look={look} cols={3} rows={2} w={0.14} h={0.12} x0={0.37} y0={0.2} z={0.365} seed={1} />
    <Rod from={[0.62, 0.64, 0.2]} to={[0.62, 1.35, 0.2]} r={0.012} color={C.silver} mat="metal" />
    <RBox p={[0.74, 1.27, 0.2]} s={[0.22, 0.14, 0.01]} r={0.005} rot={[0, 0, Math.sin(look.t * 3) * 0.05]} color={look.accent} />
  </group>
);

export const HospitalModel: M = ({look}) => {
  const cross = look.state === 'off' ? 0 : look.state === 'active' ? 1.4 + Math.sin(look.t * 4) * 0.6 : 1.6;
  return (
    <group>
      <RBox p={[0, 0.5, 0]} s={[1.4, 1.0, 0.8]} r={0.02} color={look.body ?? '#f2f4f7'} mat="matte" />
      <RBox p={[0, 1.02, 0]} s={[1.44, 0.05, 0.84]} r={0.01} color="#c9d2dc" />
      <RBox p={[0, 0.78, 0.42]} s={[0.32, 0.1, 0.03]} r={0.01} color="#e11d48" mat={cross ? 'glow' : 'plastic'} glow={cross} />
      <RBox p={[0, 0.78, 0.42]} s={[0.1, 0.32, 0.03]} r={0.01} color="#e11d48" mat={cross ? 'glow' : 'plastic'} glow={cross} />
      <Windows look={look} cols={3} rows={2} w={0.13} h={0.12} x0={-0.6} y0={0.25} z={0.405} seed={2} />
      <Windows look={look} cols={3} rows={2} w={0.13} h={0.12} x0={0.28} y0={0.25} z={0.405} seed={5} />
      <RBox p={[0, 0.13, 0.41]} s={[0.3, 0.26, 0.02]} r={0.01} color="#0e1824" mat="glass" />
    </group>
  );
};

export const FactoryModel: M = ({look}) => (
  <group scale={0.88}>
    <RBox p={[0, 0.025, 0]} s={[1.65, 0.05, 1.0]} r={0.02} color="#515961" mat="matte" />
    <RBox p={[-0.1, 0.33, 0]} s={[1.3, 0.6, 0.8]} r={0.015} color={look.body ?? '#8b7770'} mat="matte" />
    {[-0.6, -0.17, 0.26].map((x) => <Extrude key={x} shape={[[0, 0], [0.43, 0], [0.43, 0.24]]} depth={0.83} bevel={0.008} p={[x, 0.63, 0]} color="#4e5962" mat="brushed" />)}
    <RBox p={[-0.22, 0.22, 0.412]} s={[0.36, 0.36, 0.025]} r={0.005} color="#404a52" mat="metal" />
    {Array.from({length: 7}, (_, i) => <RBox key={i} p={[-0.22, 0.08 + i * 0.045, 0.429]} s={[0.33, 0.008, 0.008]} r={0.001} color="#76818a" />)}
    <Windows look={look} cols={3} rows={1} w={0.12} h={0.12} x0={0.08} y0={0.41} z={0.405} seed={1} />
    <Windows look={look} cols={1} rows={2} w={0.14} h={0.1} x0={-0.63} y0={0.2} z={0.405} seed={2} />
    {[0.64, 0.32].map((x, i) => {
      const top = 1.32 - i * 0.19;
      return <G key={x} p={[x, 0, -0.24]}>
        <Cyl p={[0, top / 2, 0]} r={0.105} rTop={0.075} h={top} color="#9b948c" mat="matte" />
        {[0.83, 0.98, 1.13].map((y) => <Cyl key={y} p={[0, y - i * 0.19, 0]} r={0.085} h={0.065} color="#a85345" mat="matte" />)}
        <Tor p={[0, top, 0]} r={0.075} tube={0.014} rot={[Math.PI / 2, 0, 0]} color="#4b4846" mat="matte" />
        <Cyl p={[0, top - 0.005, 0]} r={0.061} h={0.008} color="#1c2025" mat="matte" />
        {on(look) ? Array.from({length: 9}, (_, k) => {
          const t = (look.t * 0.18 + k / 9 + i * 0.23) % 1;
          const r = 0.05 + t * 0.12;
          return <G key={k} p={[t * 0.34 + Math.sin(t * 8 + i) * 0.035, top + 0.03 + t * 0.43, t * 0.08]}>
            <sprite scale={[r * 3.5, r * 3, 1]}>
              <spriteMaterial map={glowTexture()} color={look.state === 'error' ? '#55565a' : '#8d9095'} transparent opacity={0.6 * Math.sin(Math.PI * t)} depthWrite={false} />
            </sprite>
            <sprite position={[r * 0.6, r * 0.2, 0.02]} scale={[r * 2.5, r * 2.5, 1]}>
              <spriteMaterial map={glowTexture()} color="#a0a2a5" transparent opacity={0.35 * Math.sin(Math.PI * t)} depthWrite={false} />
            </sprite>
          </G>;
        }) : null}
      </G>;
    })}
    <Tube points={[[-0.7, 0.2, -0.1], [-0.82, 0.2, -0.1], [-0.82, 0.55, -0.1], [-0.7, 0.55, -0.1]]} r={0.025} color="#9da4a9" mat="metal" />
  </group>
);

export const ShopModel: M = ({look}) => (
  <group>
    <RBox p={[0, 0.42, 0]} s={[1.2, 0.84, 0.8]} r={0.02} color={look.body ?? '#f1e7d6'} mat="matte" />
    <RBox p={[0, 0.3, 0.405]} s={[0.9, 0.42, 0.02]} r={0.01} color="#16273a" mat="glass" opacity={0.8} />
    {Array.from({length: 7}, (_, i) => (
      <RBox key={i} p={[-0.51 + i * 0.17, 0.62, 0.56]} s={[0.17, 0.02, 0.32]} r={0.004} rot={[0.45, 0, 0]} color={i % 2 ? '#ffffff' : '#e23d3d'} mat="matte" />
    ))}
    <RBox p={[0, 0.78, 0.42]} s={[0.7, 0.14, 0.04]} r={0.02} color={look.accent} mat={on(look) ? 'glow' : 'plastic'} glow={look.screenGlow * 0.9} />
    {on(look) ? <pointLight position={[0, 0.3, 0.8]} color={WARM} intensity={0.8} distance={2} /> : null}
  </group>
);

/* ------------------------------------------------------------- people / other */

const PERSON_TORSO = [
  [0, 0.07], [0.32, 0.07], [0.39, 0.1], [0.42, 0.18],
  [0.44, 0.40], [0.48, 0.60], [0.47, 0.69], [0.42, 0.77],
  [0.30, 0.84], [0.17, 0.89], [0.12, 0.9], [0, 0.9],
].map(([r, y]) => new THREE.Vector2(r, y));

/** A sculpted portrait bust, kept compact for single and grouped device views. */
const Person: FC<{look: Look; shirt: string}> = ({look, shirt}) => {
  const skin = '#c99070';
  const hair = '#29201d';
  // Frame-driven blink keeps video renders deterministic.
  const blink = look.state === 'active' && look.t % 4 > 3.82 ? 0.12 : 1;
  return (
    <group>
      <Cyl p={[0, 0.035, 0]} r={0.38} h={0.06} color="#26313f" mat="matte" />
      <mesh scale={[1, 1, 0.58]}>
        <latheGeometry args={[new THREE.SplineCurve(PERSON_TORSO).getPoints(80), 64]} />
        <meshPhysicalMaterial color={shirt} roughness={0.86} sheen={0.18} sheenColor={shirt} />
      </mesh>
      {/* Neck and tailored collar sit naturally between shoulders and jaw. */}
      <Cyl p={[0, 0.94, 0]} r={0.108} h={0.23} color={skin} mat="matte" />
      {[-1, 1].map((side) => (
        <Extrude key={side} shape={[[side * 0.025, 0.83], [side * 0.10, 0.945], [side * 0.21, 0.85], [side * 0.12, 0.75]]}
          depth={0.025} bevel={0.009} p={[0, 0, 0.14]} color={shirt} mat="matte" />
      ))}
      <RBox p={[0, 0.55, 0.269]} s={[0.018, 0.43, 0.012]} r={0.004} color={shirt} mat="matte" />
      {[0.43, 0.58, 0.72].map((y) => <Sph key={y} p={[0, y, 0.282]} r={0.009} color="#d2d8df" mat="matte" />)}
      {/* Oval cranium, narrower jaw, and ears replace the featureless sphere. */}
      <Sph p={[0, 1.23, 0]} r={1} scale={[0.222, 0.287, 0.205]} color={skin} mat="matte" />
      <Sph p={[0, 1.105, 0.028]} r={1} scale={[0.157, 0.135, 0.153]} color={skin} mat="matte" />
      {[-1, 1].map((side) => (
        <group key={side}>
          <Sph p={[side * 0.218, 1.215, 0]} r={1} scale={[0.041, 0.072, 0.036]} color={skin} mat="matte" />
          <Sph p={[side * 0.235, 1.215, 0.023]} r={1} scale={[0.017, 0.041, 0.012]} color="#a86f57" mat="matte" />
          <G p={[side * 0.083, 1.262, 0.18]} rot={[0, side * 0.22, 0]}>
            <Sph r={1} scale={[0.051, 0.032, 0.018]} color="#a66f55" mat="matte" />
            <G scale={[1, blink, 1]}>
              <Sph p={[0, 0, 0.01]} r={1} scale={[0.041, 0.019, 0.014]} color="#e7ded5" mat="matte" />
              <Sph p={[0, 0, 0.023]} r={0.015} scale={[1, 1, 0.35]} color="#4a392c" />
              <Sph p={[0, 0, 0.028]} r={0.007} scale={[1, 1, 0.4]} color="#14191e" />
              <Sph p={[-0.004, 0.005, 0.031]} r={0.003} color="#ffffff" />
            </G>
            <Tube points={[[-0.047, 0.043, 0], [-0.014, 0.05, 0.009], [0.02, 0.047, 0.009], [0.045, 0.035, 0]]} r={0.008} color={hair} mat="matte" />
          </G>
        </group>
      ))}
      <Sph p={[0, 1.224, 0.198]} r={1} scale={[0.027, 0.064, 0.033]} color={skin} mat="matte" />
      <Sph p={[0, 1.186, 0.224]} r={1} scale={[0.035, 0.027, 0.031]} color={skin} mat="matte" />
      <Tube points={[[-0.059, 1.115, 0.198], [-0.028, 1.108, 0.218], [0, 1.11, 0.224], [0.028, 1.108, 0.218], [0.059, 1.115, 0.198]]}
        r={0.005} color="#805044" mat="matte" />
      <Sph p={[0, 1.096, 0.209]} r={1} scale={[0.042, 0.009, 0.009]} color="#b77b66" mat="matte" />
      {/* Close-fitting hair cap and overlapping swept locks. */}
      <Sph p={[0, 1.255, -0.025]} r={1} theta={Math.PI * 0.48} scale={[0.23, 0.275, 0.213]} color={hair} mat="matte" />
      {[-1, 1].map((side) => <Sph key={side} p={[side * 0.198, 1.33, -0.01]} r={1} scale={[0.029, 0.105, 0.14]} color={hair} mat="matte" />)}
      {[0, 1, 2, 3, 4].map((i) => (
        <Sph key={i} p={[-0.14 + i * 0.064, 1.451 + Math.sin(i * 0.7) * 0.025, 0.085]}
          r={1} scale={[0.095, 0.047, 0.12]} rot={[0, -0.25, -0.27]} color={i % 2 ? '#322722' : hair} mat="matte" />
      ))}
      {look.state !== 'off' ? (
        <Tor p={[0, 0.045, 0]} r={0.383} tube={0.008} rot={[Math.PI / 2, 0, 0]} color={stateColor(look)} mat="glow" glow={look.screenGlow * 1.8} />
      ) : null}
    </group>
  );
};

export const UserModel: M = ({look}) => <Person look={look} shirt={look.body ?? look.accent} />;

export const UsersModel: M = ({look}) => (
  <group>
    <G p={[-0.55, 0, -0.25]} scale={0.8}>
      <Person look={look} shirt="#64748b" />
    </G>
    <G p={[0.55, 0, -0.25]} scale={0.8}>
      <Person look={look} shirt="#8b5cf6" />
    </G>
    <Person look={look} shirt={look.body ?? look.accent} />
  </group>
);

export const RobotModel: M = ({look}) => {
  const eyes = look.state === 'off' ? 0 : look.state === 'active' && Math.sin(look.t * 2.5) > 0.95 ? 0.2 : 2;
  const eyeColor = look.state === 'error' ? '#ef4444' : look.accent;
  const body = look.body ?? '#d6dbe1';
  return (
    <group>
      {[-0.18, 0.18].map((x) => (
        <RBox key={x} p={[x, 0.17, 0]} s={[0.16, 0.34, 0.22]} r={0.05} color="#5b636d" mat="brushed" />
      ))}
      <RBox p={[0, 0.62, 0]} s={[0.72, 0.58, 0.48]} r={0.1} color={body} mat="gloss" />
      <RBox p={[0, 0.64, 0.245]} s={[0.36, 0.22, 0.02]} r={0.03} color="#0e1218" />
      <Led p={[-0.1, 0.64, 0.26]} look={look} phase={0} r={0.02} color={look.accent} />
      <Led p={[0.0, 0.64, 0.26]} look={look} phase={1} r={0.02} />
      <Led p={[0.1, 0.64, 0.26]} look={look} phase={2} r={0.02} color="#facc15" />
      {[-1, 1].map((s) => (
        <Cap key={s} p={[s * 0.45, 0.62 + (look.state === 'active' && s > 0 ? 0.05 * Math.sin(look.t * 4) : 0), 0]} r={0.08} len={0.36}
          rot={[0, 0, s * 0.15]} color="#5b636d" mat="brushed" />
      ))}
      <RBox p={[0, 1.18, 0]} s={[0.58, 0.44, 0.46]} r={0.12} color={body} mat="gloss" />
      <RBox p={[0, 1.18, 0.226]} s={[0.46, 0.26, 0.02]} r={0.06} color="#0b0e13" mat="gloss" />
      {[-0.11, 0.11].map((x) => (
        <Sph key={x} p={[x, 1.19, 0.24]} r={0.045} color={eyes ? eyeColor : '#222'} mat={eyes ? 'glow' : 'plastic'} glow={eyes} />
      ))}
      <Rod from={[0, 1.4, 0]} to={[0, 1.58, 0]} r={0.015} color={C.silver} mat="metal" />
      <Sph p={[0, 1.6, 0]} r={0.045} color={stateColor(look)} mat={on(look) ? 'glow' : 'plastic'} glow={look.screenGlow * 2} />
    </group>
  );
};

export const DroneModel: M = ({look}) => {
  const spin = look.state === 'off' ? 0 : look.t * 40;
  const hover = look.state === 'off' ? 0 : 0.04 * Math.sin(look.t * 3);
  return (
    <group position={[0, 0.55 + hover, 0]}>
      <RBox s={[0.42, 0.14, 0.52]} r={0.06} color={look.body ?? C.graphite} mat="gloss" />
      {[[1, 1], [1, -1], [-1, 1], [-1, -1]].map(([sx, sz], i) => (
        <group key={i}>
          <Rod from={[0, 0, 0]} to={[sx * 0.55, 0.02, sz * 0.55]} r={0.028} color={C.graphite} />
          <Cyl p={[sx * 0.55, 0.05, sz * 0.55]} r={0.06} h={0.08} color={C.dark} mat="brushed" />
          <G p={[sx * 0.55, 0.1, sz * 0.55]} rot={[0, spin * (i % 2 ? 1 : -1), 0]}>
            <RBox s={[0.6, 0.008, 0.06]} r={0.003} color="#cfd5dc" opacity={look.state === 'off' ? 1 : 0.55} />
          </G>
          <Led p={[sx * 0.6, 0.0, sz * 0.6]} look={look} phase={i} r={0.02} color={sz > 0 ? '#22c55e' : '#ef4444'} />
          <Rod from={[sx * 0.15, -0.06, sz * 0.18]} to={[sx * 0.2, -0.45, sz * 0.24]} r={0.012} color={C.dark} />
        </group>
      ))}
      <Sph p={[0, -0.12, 0.2]} r={0.08} color={C.black} mat="gloss" />
      <Cyl p={[0, -0.12, 0.27]} r={0.035} h={0.02} rot={[Math.PI / 2, 0, 0]} color="#0c1c3a" mat="gloss" />
    </group>
  );
};
