import type {FC} from 'react';
import {Vector2, MeshStandardMaterial} from 'three';
import {MarchingCubes} from 'three/examples/jsm/objects/MarchingCubes.js';
import {C, Cyl, Extrude, G, Led, type Look, Mat, RBox, Rod, Sph, Tor, Tube, type V3} from '../parts';

type M = FC<{look: Look}>;
const on = (look: Look) => look.state !== 'off';
const glowMat = (look: Look) => (on(look) ? ('glow' as const) : ('plastic' as const));
const stateColor = (look: Look) => (look.state === 'error' ? '#ef4444' : look.accent);

/* -------------------------------------------------------------------- network */

export const RouterModel: M = ({look}) => (
  <group>
    <RBox p={[0, 0.14, 0]} s={[1.45, 0.22, 0.9]} r={0.06} color={look.body ?? C.black} mat="gloss" />
    {Array.from({length: 10}, (_, i) => (
      <RBox key={i} p={[-0.45 + i * 0.1, 0.252, -0.05]} s={[0.04, 0.006, 0.5]} r={0.002} color="#050608" />
    ))}
    {[-0.55, 0, 0.55].map((x, i) => (
      <G key={x} p={[x, 0.2, -0.42]} rot={[-0.12, 0, (i - 1) * -0.18]}>
        <Sph r={0.05} color={C.dark} />
        <RBox p={[0, 0.48, 0]} s={[0.08, 0.92, 0.04]} r={0.03} color={C.black} mat="gloss" />
      </G>
    ))}
    {[0, 1, 2, 3, 4].map((i) => (
      <Led key={i} p={[-0.3 + i * 0.15, 0.15, 0.452]} look={look} phase={i} color={i === 0 ? '#ffffff' : '#4ade80'} r={0.018} />
    ))}
  </group>
);

export const ServerModel: M = ({look}) => (
  <group>
    <RBox p={[0, 0.82, 0]} s={[0.92, 1.64, 0.9]} r={0.02} color={look.body ?? '#1b2028'} mat="brushed" />
    {Array.from({length: 6}, (_, i) => (
      <G key={i} p={[0, 0.2 + i * 0.25, 0.455]}>
        <RBox s={[0.84, 0.21, 0.02]} r={0.01} color="#2b323c" mat="brushed" />
        {[0, 1, 2, 3].map((b) => (
          <RBox key={b} p={[-0.3 + b * 0.15, 0, 0.012]} s={[0.12, 0.14, 0.008]} r={0.006} color="#11151b" />
        ))}
        <Led p={[0.3, 0.04, 0.015]} look={look} phase={i * 2} r={0.016} />
        <Led p={[0.36, 0.04, 0.015]} look={look} phase={i * 3 + 1} r={0.016} color={look.accent} />
      </G>
    ))}
  </group>
);

export const SwitchModel: M = ({look}) => (
  <group>
    <RBox p={[0, 0.13, 0]} s={[1.62, 0.2, 0.72]} r={0.02} color={look.body ?? '#2a3038'} mat="brushed" />
    {[-0.84, 0.84].map((x) => (
      <RBox key={x} p={[x, 0.13, 0.3]} s={[0.07, 0.2, 0.12]} r={0.01} color={C.silver} mat="metal" />
    ))}
    {Array.from({length: 12}, (_, i) => (
      <G key={i} p={[-0.62 + i * 0.105, 0.11, 0.36]}>
        <RBox s={[0.08, 0.07, 0.01]} r={0.005} color="#07090c" />
        <Led p={[0, 0.06, 0.005]} look={look} phase={i} r={0.011} />
      </G>
    ))}
  </group>
);

// Smooth revolved housing with a flat crown for the status diffuser.
const AP_PROFILE = [
  [0, 0.065], [0.57, 0.065], [0.65, 0.075], [0.693, 0.1],
  [0.715, 0.13], [0.72, 0.16], [0.709, 0.19], [0.683, 0.218],
  [0.64, 0.241], [0.57, 0.26], [0.48, 0.274], [0.39, 0.282],
  [0.30, 0.285], [0, 0.285],
].map(([r, y]) => new Vector2(r, y));

export const AccessPointModel: M = ({look}) => (
  <group>
    <Cyl p={[0, 0.035, 0]} r={0.58} h={0.06} seg={96} color="#303741" mat="rubber" />
    <Cyl p={[0, 0.07, 0]} r={0.672} h={0.035} seg={96} color={look.body ?? '#c8cfd7'} />
    <mesh>
      <latheGeometry args={[AP_PROFILE, 96]} />
      <Mat color={look.body ?? '#f1f3f6'} mat="plastic" />
    </mesh>
    <Tor p={[0, 0.097, 0]} r={0.684} tube={0.006} rot={[Math.PI / 2, 0, 0]} color="#929ca8" />
    {/* Seat the diffuser above the crown so the shell cannot obscure it. */}
    <Tor p={[0, 0.285, 0]} r={0.305} tube={0.022} rot={[Math.PI / 2, 0, 0]} color="#aebbc9" mat="matte" />
    <Tor p={[0, 0.296, 0]} r={0.305} tube={0.012} rot={[Math.PI / 2, 0, 0]}
      color={on(look) ? stateColor(look) : '#77828e'} mat={glowMat(look)} glow={look.screenGlow * 1.6} />
    <G p={[0, 0.289, 0.035]} rot={[-Math.PI / 2, 0, 0]}>
      {[0.07, 0.125].map((r) => (
        <Tor key={r} r={r} tube={0.006} arc={Math.PI / 2} rot={[0, 0, Math.PI / 4]} color="#9ba8b6" mat="matte" />
      ))}
      <Sph r={0.012} color="#9ba8b6" mat="matte" />
    </G>
    {/* Lower ventilation slots leave room for the rear service port. */}
    {Array.from({length: 28}, (_, i) => {
      const angle = (i / 28) * Math.PI * 2;
      if (Math.cos(angle) < -0.9) return null;
      return <RBox key={i} p={[Math.sin(angle) * 0.675, 0.075, Math.cos(angle) * 0.675]}
        rot={[0, angle, 0]} s={[0.032, 0.014, 0.012]} r={0.005} color="#3b444f" mat="matte" />;
    })}
    {/* Ethernet / PoE opening and eight gold contacts. */}
    <G p={[0, 0.125, -0.7]}>
      <RBox s={[0.235, 0.105, 0.026]} r={0.012} color="#a5adb8" mat="brushed" />
      <RBox p={[0, 0, -0.015]} s={[0.193, 0.073, 0.012]} r={0.005} color="#111923" mat="matte" />
      {Array.from({length: 8}, (_, i) => (
        <RBox key={i} p={[-0.07 + i * 0.02, 0.022, -0.023]} s={[0.008, 0.021, 0.006]} r={0.001} color={C.gold} mat="metal" />
      ))}
    </G>
  </group>
);

/** Wi-Fi: access point with signal arcs that ripple outward when active. */
export const WifiModel: M = ({look}) => (
  <group>
    <G scale={0.8}>
      <AccessPointModel look={look} />
    </G>
    {[0.3, 0.52, 0.74].map((r, i) => {
      const wave = look.state === 'active' ? 0.35 + 0.65 * Math.max(0, Math.sin(look.t * 5 - i * 1.2)) : 1;
      return (
        <Tor key={r} p={[0, 0.25, 0]} r={r} tube={0.035} arc={Math.PI / 2} rot={[0, 0, Math.PI / 4]}
          color={stateColor(look)} mat={glowMat(look)} glow={look.screenGlow * 2 * wave} opacity={on(look) ? 1 : 0.4} />
      );
    })}
  </group>
);

export const FirewallModel: M = ({look}) => (
  <group>
    {[0, 1, 2, 3, 4].map((row) =>
      [0, 1, 2, 3].map((col) => {
        const offset = row % 2 ? 0.19 : 0;
        const x = -0.57 + col * 0.38 + offset;
        if (x > 0.62) return null;
        return <RBox key={`${row}-${col}`} p={[x, 0.11 + row * 0.21, 0]} s={[0.36, 0.19, 0.3]} r={0.02} color={look.body ?? C.brick} mat="matte" />;
      }),
    )}
    <G p={[0, 0.55, 0.2]} scale={0.42}>
      <ShieldShape look={look} />
    </G>
  </group>
);

const SHIELD: [number, number][] = [
  [0, 1.4], [0.35, 1.3], [0.62, 1.25], [0.62, 0.75], [0.5, 0.4], [0.25, 0.15], [0, 0.02],
  [-0.25, 0.15], [-0.5, 0.4], [-0.62, 0.75], [-0.62, 1.25], [-0.35, 1.3],
];

const ShieldShape: M = ({look}) => (
  <group>
    <Extrude shape={SHIELD} depth={0.14} bevel={0.04} color={look.body ?? '#2f6fde'} mat="gloss" />
    <Extrude shape={SHIELD.map(([x, y]) => [x * 0.78, y * 0.8 + 0.15] as [number, number])} depth={0.05} p={[0, 0, 0.1]}
      color={stateColor(look)} mat={glowMat(look)} glow={look.screenGlow * 0.9} />
    {/* check mark */}
    <RBox p={[-0.12, 0.62, 0.16]} s={[0.1, 0.32, 0.06]} r={0.03} rot={[0, 0, 0.75]} color="#ffffff" />
    <RBox p={[0.12, 0.74, 0.16]} s={[0.1, 0.6, 0.06]} r={0.03} rot={[0, 0, -0.6]} color="#ffffff" />
  </group>
);

export const SecurityModel: M = ({look}) => (
  <G p={[0, 0.05, 0]} scale={1.05}>
    <ShieldShape look={look} />
  </G>
);

export const LoadBalancerModel: M = ({look}) => {
  const arrow = (from: V3, to: V3, k: number) => {
    const t = look.state === 'active' ? (look.t * 1.5 + k * 0.33) % 1 : -1;
    const dot: V3 = [from[0] + (to[0] - from[0]) * t, from[1] + (to[1] - from[1]) * t, from[2] + (to[2] - from[2]) * t];
    return (
      <group key={k}>
        <Rod from={from} to={to} r={0.025} color={stateColor(look)} mat={glowMat(look)} glow={look.screenGlow} />
        {t >= 0 ? <Sph p={dot} r={0.05} color="#fff3b0" mat="glow" glow={3} /> : null}
      </group>
    );
  };
  return (
    <group>
      <RBox p={[0, 0.3, 0]} s={[0.8, 0.4, 0.7]} r={0.04} color={look.body ?? '#2a3038'} mat="brushed" />
      {[0, 1, 2].map((i) => (
        <Led key={i} p={[-0.2 + i * 0.2, 0.3, 0.355]} look={look} phase={i} r={0.02} />
      ))}
      {arrow([-0.85, 0.3, 0], [-0.4, 0.3, 0], 0)}
      {[0.75, 0.3, -0.15].map((y, i) => arrow([0.4, 0.3, 0], [0.85, y, 0], i + 1))}
    </group>
  );
};

export const CellTowerModel: M = ({look}) => {
  const legs: [V3, V3][] = [
    [[-0.32, 0, -0.32], [-0.06, 1.55, -0.06]],
    [[0.32, 0, -0.32], [0.06, 1.55, -0.06]],
    [[-0.32, 0, 0.32], [-0.06, 1.55, 0.06]],
    [[0.32, 0, 0.32], [0.06, 1.55, 0.06]],
  ];
  const at = (leg: [V3, V3], k: number): V3 => leg[0].map((v, i) => v + (leg[1][i] - v) * k) as V3;
  const beacon = look.state === 'off' ? 0 : Math.sin(look.t * 4) > 0 ? 3 : 0.2;
  return (
    <group>
      {legs.map((l, i) => <Rod key={i} from={l[0]} to={l[1]} r={0.022} color="#9aa3ad" mat="metal" />)}
      {[0.15, 0.45, 0.75, 1.05].map((k) =>
        [[0, 1], [1, 3], [3, 2], [2, 0]].map(([a, b]) => (
          <Rod key={`${k}-${a}`} from={at(legs[a], k / 1.55)} to={at(legs[b], (k + 0.3) / 1.55)} r={0.01} color="#9aa3ad" mat="metal" />
        )),
      )}
      {[0, (Math.PI * 2) / 3, (Math.PI * 4) / 3].map((a) => (
        <RBox key={a} p={[Math.sin(a) * 0.18, 1.3, Math.cos(a) * 0.18]} rot={[0, a, 0]} s={[0.14, 0.42, 0.05]} r={0.02} color={C.offwhite} />
      ))}
      <Cyl p={[0, 1.62, 0]} r={0.015} h={0.15} color="#9aa3ad" mat="metal" />
      <Sph p={[0, 1.71, 0]} r={0.04} color="#ef4444" mat={beacon > 0 ? 'glow' : 'plastic'} glow={beacon} />
    </group>
  );
};

const DISH_PROFILE = Array.from({length: 20}, (_, i) => {
  const r = i / 19 * 0.23;
  return new Vector2(r, r * r * 1.5);
});

export const SatelliteModel: M = ({look}) => (
  <group position={[0, 0.87, 0]} rotation={[0.15, 0, 0.08]}>
    <RBox s={[0.45, 0.54, 0.45]} r={0.025} color={look.body ?? '#b88b37'} mat="metal" />
    {[-1, 1].map((side) => <group key={side}>
      <Rod from={[side * 0.22, 0, 0]} to={[side * 0.43, 0, 0]} r={0.025} color={C.silver} mat="metal" />
      <G p={[side * 0.76, 0, 0]} rot={[0.55, 0, 0]}>
        <RBox s={[0.65, 0.035, 0.57]} r={0.005} color="#8999ad" mat="metal" />
        {Array.from({length: 5}, (_, col) => Array.from({length: 4}, (_, row) => (
          <G key={`${col}-${row}`} p={[-0.25 + col * 0.125, 0.022, -0.21 + row * 0.14]}>
            <RBox s={[0.114, 0.009, 0.127]} r={0.005} color={(col + row) % 2 ? '#102c61' : '#183e78'} mat="gloss" />
            <RBox p={[0, 0.006, 0]} s={[0.003, 0.002, 0.12]} r={0.001} color="#8ba7cb" mat="metal" />
          </G>
        )))}
      </G>
      <RBox p={[side * 0.23, 0.05, 0]} s={[0.015, 0.31, 0.3]} r={0.003} color="#d2b05a" mat="metal" />
      <Cyl p={[side * 0.16, -0.31, -0.12]} r={0.048} rTop={0.025} h={0.1} color="#424b58" mat="metal" />
    </group>)}
    {[-0.16, 0, 0.16].map((x) => <RBox key={x} p={[x, 0, 0.231]} s={[0.006, 0.48, 0.006]} r={0.001} color="#e5c775" mat="metal" />)}
    <G p={[0, 0.1, 0.31]} rot={[Math.PI / 2, 0, 0]}>
      <mesh><latheGeometry args={[DISH_PROFILE, 64]} /><meshStandardMaterial color="#d4dce4" metalness={0.65} roughness={0.32} side={2} /></mesh>
      {[0, 2.094, 4.189].map((a) => <Rod key={a} from={[Math.cos(a) * 0.21, 0.066, Math.sin(a) * 0.21]} to={[0, 0.21, 0]} r={0.006} color={C.silver} mat="metal" />)}
      <Cyl p={[0, 0.21, 0]} r={0.027} h={0.05} color={C.gold} mat="metal" />
    </G>
    <Rod from={[0.14, 0.27, -0.12]} to={[0.14, 0.59, -0.12]} r={0.007} color={C.silver} mat="metal" />
    <Led p={[-0.15, 0.27, 0.16]} look={look} r={0.015} />
  </group>
);

// A fused metaball surface avoids the intersecting-spheres silhouette of the old cloud.
const cloudSurface = (() => {
  const material = new MeshStandardMaterial();
  const field = new MarchingCubes(40, material, false, false, 24000);
  field.isolation = 45;
  [[0.28, 0.42, 0.5, 0.7], [0.44, 0.5, 0.5, 1.1], [0.6, 0.46, 0.5, 0.85],
    [0.73, 0.4, 0.51, 0.6], [0.48, 0.65, 0.48, 0.8], [0.63, 0.59, 0.51, 0.65],
    [0.36, 0.4, 0.64, 0.55], [0.57, 0.4, 0.63, 0.65]].forEach(([x, y, z, strength]) => field.addBall(x, y, z, strength, 12));
  field.update();
  const geometry = field.geometry.clone();
  field.geometry.dispose();
  material.dispose();
  return geometry;
})();

export const CloudModel: M = ({look}) => (
  <mesh geometry={cloudSurface} dispose={null} position={[0, 0.63, 0]} scale={[1.15, 0.9, 0.9]}>
    <meshPhysicalMaterial color={look.body ?? '#e4eaf2'} roughness={1} sheen={0.4} sheenColor="#ffffff"
      emissive={look.state === 'error' ? '#b34747' : '#61738a'} emissiveIntensity={on(look) ? 0.035 : 0} />
  </mesh>
);

export const InternetModel: M = ({look}) => (
  <group position={[0, 0.78, 0]}>
    <group rotation={[0.35, look.t * 0.4, 0]}>
      <Sph r={0.68} color={look.body ?? '#1f5fa8'} mat="gloss" />
      {[-0.45, 0, 0.45].map((y) => (
        <Tor key={y} p={[0, y, 0]} r={Math.sqrt(0.69 ** 2 - y * y)} tube={0.008} rot={[Math.PI / 2, 0, 0]} color="#bfe3ff" mat="glow" glow={0.8} />
      ))}
      {[0, Math.PI / 3, (Math.PI * 2) / 3].map((a) => (
        <Tor key={a} r={0.69} tube={0.008} rot={[0, a, 0]} color="#bfe3ff" mat="glow" glow={0.8} />
      ))}
    </group>
    <Tor r={0.9} tube={0.012} rot={[Math.PI / 2.4, 0, 0.3]} color={stateColor(look)} mat={glowMat(look)} glow={look.screenGlow * 2} />
  </group>
);

export const DatabaseModel: M = ({look}) => (
  <group>
    {[0, 1, 2].map((i) => (
      <G key={i} p={[0, 0.2 + i * 0.42, 0]}>
        <Cyl r={0.55} h={0.36} seg={64} color={look.body ?? '#3a4350'} mat="brushed" />
        <Tor p={[0, -0.2, 0]} r={0.55} tube={0.018} rot={[Math.PI / 2, 0, 0]} color={stateColor(look)} mat={glowMat(look)}
          glow={look.screenGlow * (look.state === 'active' ? 1 + Math.sin(look.t * 6 - i) : 1.5)} />
        <Led p={[0.3, 0.05, 0.47]} look={look} phase={i} r={0.02} />
      </G>
    ))}
  </group>
);

export const DataCenterModel: M = ({look}) => (
  <group>
    {[-0.56, 0, 0.56].map((x, i) => (
      <G key={x} p={[x, 0, i === 1 ? 0.08 : 0]} scale={[0.58, 0.92, 0.7]}>
        <ServerModel look={{...look, t: look.t + i * 0.37}} />
      </G>
    ))}
  </group>
);

/* --------------------------------------------------------------- cables / ports */

export const EthernetModel: M = ({look}) => (
  <group position={[0, 0.55, 0]} rotation={[0.2, -0.5, 0]}>
    <RBox p={[0, 0, 0.18]} s={[0.3, 0.22, 0.42]} r={0.02} color="#dfe8f0" mat="glass" opacity={0.7} />
    {Array.from({length: 8}, (_, i) => (
      <RBox key={i} p={[-0.105 + i * 0.03, 0.09, 0.32]} s={[0.012, 0.02, 0.12]} r={0.002} color={C.gold} mat="metal" />
    ))}
    <RBox p={[0, 0.15, 0.1]} s={[0.12, 0.04, 0.3]} r={0.01} rot={[0.25, 0, 0]} color="#dfe8f0" mat="glass" opacity={0.7} />
    <RBox p={[0, 0, -0.1]} s={[0.32, 0.25, 0.2]} r={0.05} color={look.body ?? '#2b6cdf'} mat="rubber" />
    <Tube points={[[0, 0, -0.2], [0, -0.05, -0.5], [0.3, -0.35, -0.7], [0.6, -0.5, -0.5]]} r={0.06} color={look.body ?? '#2b6cdf'} mat="rubber" />
  </group>
);

const CABLE_COIL: V3[] = Array.from({length: 100}, (_, i) => {
  const a = i / 99 * Math.PI * 4.5;
  return [Math.cos(a) * 0.5, 0.085 + i / 99 * 0.16, Math.sin(a) * 0.38];
});
const CableConnector: FC<{p: V3; angle: number; color: string}> = ({p, angle, color}) => (
  <G p={p} rot={[0, angle, 0]}>
    <RBox s={[0.17, 0.14, 0.22]} r={0.025} color={color} mat="rubber" />
    {[-0.06, -0.02, 0.02].map((z) => <RBox key={z} p={[0, 0.071, z]} s={[0.14, 0.012, 0.013]} r={0.004} color="#242c35" mat="rubber" />)}
    <RBox p={[0, 0.005, 0.17]} s={[0.15, 0.12, 0.17]} r={0.012} color="#aab9c7" mat="metal" />
    <RBox p={[0, 0.005, 0.258]} s={[0.12, 0.085, 0.008]} r={0.003} color="#202a35" />
    {Array.from({length: 8}, (_, i) => <RBox key={i} p={[-0.049 + i * 0.014, 0.025, 0.264]} s={[0.007, 0.032, 0.004]} r={0.001} color={C.gold} mat="metal" />)}
    <RBox p={[0, 0.082, 0.135]} s={[0.07, 0.018, 0.19]} r={0.006} rot={[-0.1, 0, 0]} color="#c0cad3" />
  </G>
);

export const CableModel: M = ({look}) => {
  const color = look.body ?? '#293b51';
  return <group>
    <Tube points={CABLE_COIL} r={0.035} color={color} mat="rubber" />
    <Tube points={[CABLE_COIL[0], [0.73, 0.1, 0.1], [0.69, 0.1, 0.42]]} r={0.035} color={color} mat="rubber" />
    <Tube points={[CABLE_COIL[99], [-0.3, 0.25, 0.5], [-0.53, 0.12, 0.48]]} r={0.035} color={color} mat="rubber" />
    <CableConnector p={[0.69, 0.1, 0.52]} angle={0} color={color} />
    <CableConnector p={[-0.53, 0.12, 0.59]} angle={0} color={color} />
  </group>;
};

export const UsbModel: M = ({look}) => (
  <group position={[0, 0.5, 0]} rotation={[0.25, -0.6, 0]}>
    <RBox p={[0, 0, 0.32]} s={[0.3, 0.12, 0.34]} r={0.01} color={C.silver} mat="metal" />
    <RBox p={[0, -0.02, 0.33]} s={[0.24, 0.04, 0.3]} r={0.005} color="#1d5fd6" />
    <RBox p={[0, 0, 0]} s={[0.38, 0.2, 0.36]} r={0.06} color={look.body ?? C.black} mat="gloss" />
    <Led p={[0, 0.105, 0.05]} look={look} r={0.015} color={look.accent} />
    <Tube points={[[0, 0, -0.18], [0, -0.05, -0.5], [0.3, -0.35, -0.65], [0.6, -0.48, -0.4]]} r={0.04} color={C.black} mat="rubber" />
  </group>
);
