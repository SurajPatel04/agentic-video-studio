/**
 * Shared 3D motion effects (use inside any ThreeCanvas). Driven by `look` (state + time).
 *
 *   <Flow3D look={look} path={[[0,0.1,0], [1,0.1,0.4], [2,0.1,0]]} effect="packet" />   cable + moving things
 *   <Movers look={look} path={...} effect="current" />                                  only the moving things
 *   <Waves3D look={look} p={[0, 1, 0]} yaw={0} />                                       Wi-Fi / radio arcs
 *
 * Effects: packet (glowing box), current (many small dots), light (bright head + fading
 * trail, like fibre), dot (a few glowing dots). Off = nothing moves.
 */
import type {FC} from 'react';
import {useMemo} from 'react';
import * as THREE from 'three';
import {C, RBox, Sph, Tor, Tube, type Look, type V3} from './parts';

export const flow3DEffects = ['packet', 'current', 'light', 'dot'] as const;
export type Flow3DEffect = (typeof flow3DEffects)[number];

const stateColor = (look: Look) => (look.state === 'error' ? '#ef4444' : look.accent);
const DEFAULT_COUNT: Record<Flow3DEffect, number> = {packet: 2, current: 14, light: 1, dot: 3};

export type MoversProps = {
  look: Look;
  path: V3[];
  effect?: Flow3DEffect;
  count?: number;
  r?: number; // size of each mover (keep it bigger than the cable radius, or it hides inside)
  offset?: number; // 0..1 phase shift (so neighbouring paths don't move in step)
  color?: string;
  speed?: number; // trips per second (default depends on state)
};

/** Things travelling along a smooth path through `path`. */
export const Movers: FC<MoversProps> = ({look, path, effect = 'dot', count, r = 0.03, offset = 0, color, speed}) => {
  const curve = useMemo(() => new THREE.CatmullRomCurve3(path.map((q) => new THREE.Vector3(...q))), [path]);
  if (look.state === 'off') return null;
  const v = speed ?? (look.state === 'active' ? 0.7 : look.state === 'error' ? 0.15 : 0.3);
  const n = count ?? DEFAULT_COUNT[effect];
  const tint = color ?? (effect === 'current' ? (look.state === 'error' ? '#ef4444' : '#facc15') : stateColor(look));
  const at = (k: number): V3 => {
    const pt = curve.getPointAt(((k % 1) + 1) % 1);
    return [pt.x, pt.y, pt.z];
  };
  return (
    <>
      {Array.from({length: n}, (_, i) => {
        const k = (((look.t * v + i / n + offset) % 1) + 1) % 1;
        switch (effect) {
          case 'packet':
            return <RBox key={i} p={at(k)} s={[r * 4, r * 2.6, r * 2.6]} r={r * 0.6} color={tint} mat="glow" glow={2.2} />;
          case 'light':
            return (
              <group key={i}>
                <Sph p={at(k)} r={r * 1.3} color="#ffffff" mat="glow" glow={4} />
                {[1, 2, 3, 4, 5, 6].map((j) => (k - j * 0.015 > 0 ? (
                  <Sph key={j} p={at(k - j * 0.015)} r={r * (1.1 - j * 0.13)} color={tint} mat="glow" glow={3 - j * 0.4} opacity={1 - j * 0.13} />
                ) : null))}
              </group>
            );
          case 'current':
            return <Sph key={i} p={at(k)} r={r * 0.85} color={tint} mat="glow" glow={2.6} />;
          case 'dot':
          default:
            return <Sph key={i} p={at(k)} r={r} color={tint} mat="glow" glow={3} />;
        }
      })}
    </>
  );
};

export type Flow3DProps = MoversProps & {
  cable?: boolean;
  cableColor?: string;
  cableR?: number;
};

/** Cable (optional) with packets / current / light travelling along it. */
export const Flow3D: FC<Flow3DProps> = ({cable = true, cableColor, cableR = 0.035, ...m}) => {
  const effect = m.effect ?? 'dot';
  const defaultCable = effect === 'current' ? '#b87333' : effect === 'light' ? '#f59e0b' : C.black;
  return (
    <>
      {cable ? <Tube points={m.path} r={cableR} color={cableColor ?? defaultCable} mat={effect === 'current' ? 'metal' : 'rubber'} /> : null}
      <Movers r={cableR * 1.5} {...m} effect={effect} />
    </>
  );
};

export type Waves3DProps = {
  look: Look;
  p: V3; // source
  yaw?: number; // direction around the vertical axis (0 = +x, π/2 = toward the camera… -z)
  pitch?: number; // 0 = horizontal, π/2 = straight up
  spread?: number; // arc width in radians (2π = full rings)
  reach?: number; // how far the waves travel
  count?: number;
  thickness?: number;
  color?: string;
  speed?: number; // waves per second
};

/** Radio / Wi-Fi waves: arcs that grow from `p` and fade. */
export const Waves3D: FC<Waves3DProps> = ({look, p, yaw = 0, pitch = 0, spread = Math.PI / 2, reach = 1.2, count = 3, thickness = 0.022, color, speed}) => {
  if (look.state === 'off') return null;
  const v = speed ?? (look.state === 'active' ? 1.1 : look.state === 'error' ? 0.4 : 0.7);
  const tint = color ?? stateColor(look);
  return (
    <group position={p} rotation={[0, yaw, 0]}>
      {Array.from({length: count}, (_, i) => {
        const k = (look.t * v + i / count) % 1;
        const r = 0.08 + (reach - 0.08) * k;
        const fade = Math.min(1, k * 5) * (1 - k);
        return (
          <Tor key={i} r={r} tube={thickness} arc={spread} rot={[0, 0, pitch - spread / 2]} color={tint}
            mat="glow" glow={2.4 * fade + 0.01} opacity={Math.max(0.02, fade)} />
        );
      })}
    </group>
  );
};

export type FieldLines3DProps = {
  look: Look;
  p?: V3; // centre between the poles
  a?: number; // half the distance between the poles
  levels?: number; // loops per plane
  planes?: number; // planes around the axis
  maxHeight?: number;
  color?: string;
};

/** Magnetic / electric dipole field: loops from pole to pole in several planes, with dots flowing N → S. */
export const FieldLines3D: FC<FieldLines3DProps> = ({look, p = [0, 0, 0], a = 0.5, levels = 3, planes = 4, maxHeight = 0.6, color}) => {
  const lines = useMemo(() => {
    const out: V3[][] = [];
    for (let pl = 0; pl < planes; pl++) {
      const phi = (pl / planes) * Math.PI * 2; // first plane stands upright (textbook view)
      for (let k = 1; k <= levels; k++) {
        const h = (k / levels) * maxHeight;
        const pts: V3[] = [];
        for (let i = 0; i <= 24; i++) {
          const t = i / 24;
          const bx = (1 - t) ** 3 * -a + 3 * (1 - t) ** 2 * t * (-a - 0.7 * h) + 3 * (1 - t) * t ** 2 * (a + 0.7 * h) + t ** 3 * a;
          const by = 3 * (1 - t) ** 2 * t * 1.25 * h + 3 * (1 - t) * t ** 2 * 1.25 * h;
          pts.push([p[0] + bx, p[1] + by * Math.cos(phi), p[2] + by * Math.sin(phi)]);
        }
        out.push(pts);
      }
    }
    return out;
  }, [p, a, levels, planes, maxHeight]);
  if (look.state === 'off') return null;
  const tint = color ?? stateColor(look);
  return (
    <>
      {lines.map((pts, i) => (
        <group key={i}>
          <Tube points={pts} r={0.006} color={tint} mat="glow" glow={0.6} />
          <Movers look={look} path={pts} effect="dot" count={2} r={0.018} offset={i * 0.13} color={tint} />
        </group>
      ))}
    </>
  );
};
