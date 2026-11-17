/**
 * Building blocks for procedural 3D devices: realistic materials, rounded boxes, cylinders,
 * capsules, rods, cables, screens and LEDs. Everything is static or driven by `look.t`
 * (scene time in seconds from useCurrentFrame), never by real time.
 */
import type {FC, ReactNode} from 'react';
import {useMemo} from 'react';
import * as THREE from 'three';
import {RoundedBoxGeometry} from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import type {DeviceState} from '../Device';

export type V3 = [number, number, number];

/* ------------------------------------------------------------------ look (state) */

/** Everything a model needs to react to the device state. */
export type Look = {
  state: DeviceState;
  t: number; // seconds since the device appeared
  accent: string;
  body?: string; // optional body colour override from JSON
  screen: string;
  screenGlow: number;
};

export const makeLook = (state: DeviceState, t: number, accent: string, body?: string): Look => {
  const pulse = 0.5 + 0.5 * Math.sin(t * Math.PI * 2);
  switch (state) {
    case 'off':
      return {state, t, accent, body, screen: '#05070a', screenGlow: 0};
    case 'error':
      return {state, t, accent, body, screen: '#ef4444', screenGlow: 0.6 + 0.6 * pulse};
    case 'active':
      return {state, t, accent, body, screen: accent, screenGlow: 1 + 0.5 * pulse};
    case 'on':
    default:
      return {state, t, accent, body, screen: accent, screenGlow: 0.9};
  }
};

/** LED colour + brightness for a given blink phase (0..1 offsets LEDs from each other). */
export const ledLight = (look: Look, phase = 0, color = '#4ade80'): {color: string; glow: number} => {
  if (look.state === 'off') return {color: '#2a2f36', glow: 0};
  if (look.state === 'error') return {color: '#ef4444', glow: Math.sin(look.t * 6) > 0 ? 3 : 0.3};
  if (look.state === 'active') {
    return {color, glow: Math.sin(look.t * 14 + phase * 9.7) > -0.2 ? 3 : 0.3};
  }
  return {color, glow: 2.2};
};

/* -------------------------------------------------------------------- materials */

export type MatKind = 'plastic' | 'gloss' | 'paint' | 'metal' | 'brushed' | 'rubber' | 'glass' | 'tint' | 'glow' | 'matte';
export type MatProps = {color: string; mat?: MatKind; glow?: number; opacity?: number};

export const Mat: FC<MatProps> = ({color, mat = 'plastic', glow = 0, opacity = 1}) => {
  const transparent = opacity < 1;
  switch (mat) {
    case 'gloss':
      return <meshPhysicalMaterial color={color} roughness={0.22} clearcoat={1} clearcoatRoughness={0.08} transparent={transparent} opacity={opacity} />;
    case 'paint':
      return <meshPhysicalMaterial color={color} metalness={0.38} roughness={0.45} clearcoat={0.8} clearcoatRoughness={0.2} envMapIntensity={0.8} transparent={transparent} opacity={opacity} />;
    case 'metal':
      return <meshPhysicalMaterial color={color} metalness={1} roughness={0.22} transparent={transparent} opacity={opacity} />;
    case 'brushed':
      return <meshPhysicalMaterial color={color} metalness={0.85} roughness={0.42} transparent={transparent} opacity={opacity} />;
    case 'rubber':
      return <meshStandardMaterial color={color} roughness={0.95} transparent={transparent} opacity={opacity} />;
    case 'matte':
      return <meshStandardMaterial color={color} roughness={0.85} transparent={transparent} opacity={opacity} />;
    case 'glass':
      return <meshPhysicalMaterial color={color} roughness={0.04} metalness={0} clearcoat={1} transparent opacity={Math.min(opacity, 0.35)} depthWrite={false} />;
    case 'tint':
      return <meshPhysicalMaterial color={color} roughness={0.03} metalness={0.08} clearcoat={1} clearcoatRoughness={0.02} envMapIntensity={1.55} transparent opacity={Math.min(opacity, 0.72)} depthWrite={false} />;
    case 'glow':
      return <meshStandardMaterial color={color} emissive={color} emissiveIntensity={glow} toneMapped={false} transparent={transparent} opacity={opacity} />;
    case 'plastic':
    default:
      return <meshPhysicalMaterial color={color} roughness={0.48} clearcoat={0.35} clearcoatRoughness={0.4} transparent={transparent} opacity={opacity} />;
  }
};

/* ---------------------------------------------------------------- shared geometry */

const geoCache = new Map<string, THREE.BufferGeometry>();
const cached = <T extends THREE.BufferGeometry>(key: string, make: () => T): T => {
  let g = geoCache.get(key) as T | undefined;
  if (!g) {
    g = make();
    geoCache.set(key, g);
  }
  return g;
};

type Place = {p?: V3; rot?: V3; scale?: V3 | number};
type Prim = Place & MatProps;

/** Rounded box. `r` is the corner radius (clamped to fit). */
export const RBox: FC<Prim & {s: V3; r?: number}> = ({s, r = 0.03, p, rot, scale, ...m}) => {
  const radius = Math.max(0.001, Math.min(r, Math.min(...s) / 2 - 0.0005));
  const geo = cached(`rb:${s.join(',')}:${radius}`, () => new RoundedBoxGeometry(s[0], s[1], s[2], 4, radius));
  return (
    <mesh geometry={geo} position={p} rotation={rot} scale={scale}>
      <Mat {...m} />
    </mesh>
  );
};

/** Cylinder along Y. Set rTop for a cone/taper. */
export const Cyl: FC<Prim & {r: number; h: number; rTop?: number; seg?: number}> = ({r, h, rTop, seg = 40, p, rot, scale, ...m}) => (
  <mesh position={p} rotation={rot} scale={scale}>
    <cylinderGeometry args={[rTop ?? r, r, h, seg]} />
    <Mat {...m} />
  </mesh>
);

/** Sphere, optionally only part of it (theta = vertical range from the top). */
export const Sph: FC<Prim & {r: number; theta?: number}> = ({r, theta = Math.PI, p, rot, scale, ...m}) => (
  <mesh position={p} rotation={rot} scale={scale}>
    <sphereGeometry args={[r, 48, 32, 0, Math.PI * 2, 0, theta]} />
    <Mat {...m} />
  </mesh>
);

/** Torus (ring). `arc` < 2π gives a partial ring. */
export const Tor: FC<Prim & {r: number; tube: number; arc?: number}> = ({r, tube, arc = Math.PI * 2, p, rot, scale, ...m}) => (
  <mesh position={p} rotation={rot} scale={scale}>
    <torusGeometry args={[r, tube, 16, 64, arc]} />
    <Mat {...m} />
  </mesh>
);

/** Capsule along Y. */
export const Cap: FC<Prim & {r: number; len: number}> = ({r, len, p, rot, scale, ...m}) => (
  <mesh position={p} rotation={rot} scale={scale}>
    <capsuleGeometry args={[r, len, 8, 24]} />
    <Mat {...m} />
  </mesh>
);

/** Thin cylinder between two points (legs, antennas, struts). */
export const Rod: FC<MatProps & {from: V3; to: V3; r?: number}> = ({from, to, r = 0.02, ...m}) => {
  const {pos, quat, len} = useMemo(() => {
    const a = new THREE.Vector3(...from);
    const b = new THREE.Vector3(...to);
    const dir = b.clone().sub(a);
    return {
      pos: a.clone().add(b).multiplyScalar(0.5),
      quat: new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.clone().normalize()),
      len: dir.length(),
    };
  }, [from, to]);
  return (
    <mesh position={pos} quaternion={quat}>
      <cylinderGeometry args={[r, r, len, 16]} />
      <Mat {...m} />
    </mesh>
  );
};

/** Smooth cable through points. */
export const Tube: FC<MatProps & {points: V3[]; r?: number}> = ({points, r = 0.025, ...m}) => {
  const geo = useMemo(
    () => new THREE.TubeGeometry(new THREE.CatmullRomCurve3(points.map((q) => new THREE.Vector3(...q))), 96, r, 12, false),
    [points, r],
  );
  return (
    <mesh geometry={geo}>
      <Mat {...m} />
    </mesh>
  );
};

/** Extruded 2D outline (roofs, shields, bolts). Points are [x, y]; extruded along +z by depth. */
export const Extrude: FC<Prim & {shape: [number, number][]; depth: number; bevel?: number}> = ({shape, depth, bevel = 0.02, p, rot, scale, ...m}) => {
  const geo = useMemo(() => {
    const s = new THREE.Shape(shape.map(([x, y]) => new THREE.Vector2(x, y)));
    const g = new THREE.ExtrudeGeometry(s, {depth, bevelEnabled: bevel > 0, bevelSize: bevel, bevelThickness: bevel, bevelSegments: 3});
    g.translate(0, 0, -depth / 2);
    return g;
  }, [shape, depth, bevel]);
  return (
    <mesh geometry={geo} position={p} rotation={rot} scale={scale}>
      <Mat {...m} />
    </mesh>
  );
};

/** Glowing LED dot. */
export const Led: FC<{p: V3; look: Look; phase?: number; color?: string; r?: number}> = ({p, look, phase = 0, color, r = 0.025}) => {
  const l = ledLight(look, phase, color);
  return <Sph p={p} r={r} color={l.color} mat={l.glow > 0 ? 'glow' : 'plastic'} glow={l.glow} />;
};

/** Display surface facing +z with simple UI content when lit. */
export const Screen: FC<{p: V3; w: number; h: number; look: Look; rot?: V3; content?: boolean}> = ({p, w, h, look, rot, content = true}) => {
  const lit = look.screenGlow > 0;
  return (
    <group position={p} rotation={rot}>
      <mesh>
        <planeGeometry args={[w, h]} />
        {lit ? (
          <meshStandardMaterial color="#0b1220" emissive={look.screen} emissiveIntensity={look.screenGlow * 0.35} toneMapped={false} />
        ) : (
          <meshPhysicalMaterial color="#05070a" roughness={0.08} clearcoat={1} />
        )}
      </mesh>
      {lit && content
        ? [0.3, 0.1, -0.1, -0.28].map((y, i) => (
            <mesh key={i} position={[(-w / 2) * 0.82 + (w * (i === 0 ? 0.5 : 0.62)) / 2 * 0.82, y * h, 0.002]}>
              <planeGeometry args={[w * (i === 0 ? 0.5 : 0.62) * 0.82, h * (i === 0 ? 0.09 : 0.05)]} />
              <meshBasicMaterial color="#ffffff" transparent opacity={i === 0 ? 0.85 : 0.45} toneMapped={false} />
            </mesh>
          ))
        : null}
    </group>
  );
};

/** Group helper with optional position/rotation/scale. */
export const G: FC<Place & {children: ReactNode}> = ({p, rot, scale, children}) => (
  <group position={p} rotation={rot} scale={scale}>
    {children}
  </group>
);

/** Common colours. */
export const C = {
  black: '#0d0f12',
  graphite: '#2a2f36',
  dark: '#1a1e24',
  silver: '#c4c9d0',
  white: '#eceef1',
  offwhite: '#dfe2e6',
  gold: '#d4a63a',
  pcb: '#1f5d3b',
  brick: '#b4533d',
  skin: '#f0c7a2',
};
