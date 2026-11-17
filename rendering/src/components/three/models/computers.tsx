import type {FC} from 'react';
import {C, Cap, Cyl, G, Led, type Look, RBox, Screen, Sph, Tor, Tube} from '../parts';

type M = FC<{look: Look}>;
// All models: grounded at y = 0, front facing +z, about 1.6 units wide.

/* ----------------------------------------------------------------- computers */

export const MonitorModel: M = ({look}) => {
  const body = look.body ?? C.black;
  return (
    <group>
      <RBox p={[0, 0.02, 0.02]} s={[0.6, 0.035, 0.4]} r={0.015} color={C.silver} mat="brushed" />
      <RBox p={[0, 0.3, -0.1]} s={[0.12, 0.56, 0.05]} r={0.02} color={C.silver} mat="brushed" />
      <RBox p={[0, 0.88, 0]} s={[1.62, 0.96, 0.06]} r={0.03} color={body} mat="gloss" />
      <Screen p={[0, 0.9, 0.031]} w={1.54} h={0.86} look={look} />
      <Led p={[0.74, 0.43, 0.035]} look={look} r={0.012} color="#ffffff" />
    </group>
  );
};

export const ComputerModel: M = ({look}) => (
  <group>
    <G p={[-0.28, 0, 0.05]} scale={0.82}>
      <MonitorModel look={look} />
    </G>
    {/* tower PC */}
    <RBox p={[0.68, 0.46, -0.05]} s={[0.34, 0.92, 0.78]} r={0.03} color={look.body ?? C.dark} mat="gloss" />
    <RBox p={[0.68, 0.46, 0.345]} s={[0.3, 0.86, 0.01]} r={0.004} color="#11151a" mat="glass" opacity={0.6} />
    <Cyl p={[0.68, 0.84, 0.35]} r={0.035} h={0.02} rot={[Math.PI / 2, 0, 0]} color={C.silver} mat="metal" />
    {[0.25, 0.45, 0.65].map((y, i) => (
      <Led key={y} p={[0.6, y, 0.352]} look={look} phase={i} color={look.accent} r={0.018} />
    ))}
    {/* keyboard */}
    <RBox p={[-0.28, 0.025, 0.55]} s={[0.95, 0.04, 0.3]} r={0.015} color={C.graphite} />
  </group>
);

export const LaptopModel: M = ({look}) => {
  const body = look.body ?? C.silver;
  return (
    <group position={[0, 0, -0.15]}>
      <RBox p={[0, 0.035, 0.35]} s={[1.5, 0.055, 1.0]} r={0.025} color={body} mat="brushed" />
      {Array.from({length: 4}, (_, row) =>
        Array.from({length: 12}, (_, col) => (
          <RBox key={`${row}-${col}`} p={[-0.6 + col * 0.109, 0.066, 0.06 + row * 0.1]} s={[0.088, 0.012, 0.08]} r={0.008} color={C.dark} />
        )),
      )}
      <RBox p={[-0.0, 0.066, 0.46]} s={[0.55, 0.012, 0.08]} r={0.008} color={C.dark} />
      <RBox p={[0, 0.064, 0.66]} s={[0.5, 0.004, 0.26]} r={0.01} color="#aeb4bc" mat="brushed" />
      {/* lid hinged at the back edge, opened ~105° */}
      <group position={[0, 0.06, -0.14]} rotation={[-0.26, 0, 0]}>
        <RBox p={[0, 0.5, 0]} s={[1.5, 1.0, 0.035]} r={0.025} color={body} mat="brushed" />
        <Screen p={[0, 0.51, 0.019]} w={1.38} h={0.86} look={look} />
      </group>
    </group>
  );
};

export const PhoneModel: M = ({look}) => (
  <group rotation={[-0.12, 0, 0]}>
    <RBox p={[0, 0.78, 0]} s={[0.74, 1.52, 0.08]} r={0.1} color={look.body ?? C.black} mat="gloss" />
    <Screen p={[0, 0.78, 0.041]} w={0.66} h={1.4} look={look} />
    <RBox p={[0, 1.44, 0.043]} s={[0.18, 0.045, 0.004]} r={0.02} color={C.black} />
    <RBox p={[-0.18, 1.3, -0.05]} s={[0.26, 0.26, 0.03]} r={0.06} color="#20242b" mat="gloss" />
    <Cyl p={[-0.22, 1.34, -0.068]} r={0.045} h={0.02} rot={[Math.PI / 2, 0, 0]} color={C.black} mat="glass" />
    <Cyl p={[-0.14, 1.26, -0.068]} r={0.045} h={0.02} rot={[Math.PI / 2, 0, 0]} color={C.black} mat="glass" />
  </group>
);

export const TabletModel: M = ({look}) => (
  <group>
    <RBox p={[0, 0.25, -0.22]} s={[0.5, 0.5, 0.03]} r={0.01} rot={[0.5, 0, 0]} color={C.graphite} />
    <group position={[0, 0.06, 0]} rotation={[-0.25, 0, 0]}>
      <RBox p={[0, 0.55, 0]} s={[1.6, 1.08, 0.05]} r={0.07} color={look.body ?? C.graphite} mat="brushed" />
      <Screen p={[0, 0.55, 0.026]} w={1.48} h={0.96} look={look} />
    </group>
  </group>
);

export const SmartwatchModel: M = ({look}) => (
  <group>
    {[0.26, 1.28].map((y) => <G key={y} p={[0, y, -0.04]}>
      <RBox s={[0.38, 0.5, 0.07]} r={0.035} color="#222832" mat="rubber" />
      {[-0.12, 0.12].map((x) => <RBox key={x} p={[x, 0, 0.037]} s={[0.008, 0.43, 0.006]} r={0.002} color="#444b55" mat="matte" />)}
    </G>)}
    {[0.12, 0.20, 0.28, 0.36].map((y) => <RBox key={y} p={[0, y, 0]} s={[0.055, 0.025, 0.009]} r={0.01} color="#080c12" />)}
    <RBox p={[0, 1.44, -0.005]} s={[0.43, 0.075, 0.09]} r={0.018} color="#858e9b" mat="metal" />
    <RBox p={[0, 1.44, 0.045]} s={[0.32, 0.033, 0.012]} r={0.01} color="#222832" mat="rubber" />
    <RBox p={[0, 0.77, 0]} s={[0.65, 0.73, 0.20]} r={0.1} color={look.body ?? '#8b939e'} mat="brushed" />
    <RBox p={[0, 0.77, 0.106]} s={[0.59, 0.67, 0.035]} r={0.09} color="#060a10" mat="gloss" />
    {look.state !== 'off' ? <G p={[0, 0.79, 0.129]}>
      <Tor r={0.216} tube={0.009} color={look.screen} mat="glow" glow={look.screenGlow * 0.7} />
      {Array.from({length: 12}, (_, i) => {
        const a = i * Math.PI / 6;
        return <RBox key={i} p={[Math.sin(a) * 0.185, Math.cos(a) * 0.185, 0]} rot={[0, 0, -a]} s={[0.008, 0.024, 0.004]} r={0.002} color="#d9e1ea" />;
      })}
      <RBox p={[-0.038, 0.03, 0.008]} rot={[0, 0, 0.88]} s={[0.018, 0.12, 0.008]} r={0.006} color="#f1f5f9" />
      <RBox p={[0.055, 0.055, 0.01]} rot={[0, 0, -0.78]} s={[0.012, 0.17, 0.008]} r={0.005} color="#f1f5f9" />
      <Sph r={0.019} color={look.screen} mat="glow" glow={0.8} />
      <RBox p={[0, -0.27, 0]} s={[0.11, 0.012, 0.004]} r={0.004} color={look.screen} mat="glow" glow={0.7} />
    </G> : null}
    <Cyl p={[0.354, 0.87, 0]} r={0.055} h={0.065} rot={[0, 0, Math.PI / 2]} color="#a9b0b9" mat="metal" />
    {[0.333, 0.345, 0.357, 0.369].map((x) => <Tor key={x} p={[x, 0.87, 0]} r={0.055} tube={0.003} rot={[0, Math.PI / 2, 0]} color="#4c5560" mat="metal" />)}
    <RBox p={[0.333, 0.62, 0]} s={[0.025, 0.12, 0.065]} r={0.012} color="#848d98" mat="metal" />
  </group>
);

/* ------------------------------------------------------------ input / output */

/** Mouse surface height along its centre line, used for the button seam. */
const mouseH = (z: number) => 0.27 * Math.sqrt(Math.max(0, 1 - (z / 0.72) ** 2));

export const MouseModel: M = ({look}) => {
  const body = look.body ?? C.graphite;
  const seam = Array.from({length: 12}, (_, i) => {
    const z = -0.7 + i * 0.05;
    return [0, mouseH(z) + 0.003, z] as [number, number, number];
  });
  return (
    <group rotation={[0, Math.PI, 0]} scale={1.45}>
      {/* body: half-ellipsoid shell */}
      <Sph r={1} theta={Math.PI / 2} scale={[0.43, 0.27, 0.72]} color={body} mat="gloss" />
      <mesh rotation={[-Math.PI / 2, 0, 0]} scale={[0.43, 0.72, 1]} position={[0, 0.002, 0]}>
        <circleGeometry args={[1, 48]} />
        <meshStandardMaterial color={C.black} roughness={0.9} />
      </mesh>
      {/* left/right button seam and scroll wheel */}
      <Tube points={seam} r={0.006} color={C.black} mat="matte" />
      <Cyl p={[0, mouseH(-0.42) - 0.01, -0.42]} r={0.055} h={0.05} rot={[0, 0, Math.PI / 2]} color="#3a3f47" mat="rubber" />
      {/* side grips */}
      <Sph r={1} theta={Math.PI / 2} scale={[0.435, 0.13, 0.4]} p={[0, 0.001, 0.12]} color="#16191e" mat="rubber" />
      {/* RGB strip around the base */}
      <Tor r={1} tube={0.012} scale={[0.43, 0.72, 1]} rot={[Math.PI / 2, 0, 0]} p={[0, 0.02, 0]}
        color={look.state === 'off' ? '#22262c' : look.state === 'error' ? '#ef4444' : look.accent}
        mat={look.state === 'off' ? 'plastic' : 'glow'} glow={look.screenGlow * 2.2} />
      <Tube points={[[0, 0.05, -0.72], [0, 0.04, -0.95], [0.15, 0.02, -1.15]]} r={0.018} color={C.black} mat="rubber" />
    </group>
  );
};

export const KeyboardModel: M = ({look}) => {
  const rows = [14, 14, 13, 12];
  return (
    <group rotation={[0.25, 0, 0]} scale={1.1} position={[0, 0.1, 0]}>
      <RBox p={[0, 0.045, 0]} s={[1.86, 0.07, 0.66]} r={0.03} color={look.body ?? C.graphite} mat="brushed" />
      {/* backlight between the keys */}
      <mesh position={[0, 0.081, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[1.76, 0.58]} />
        <meshStandardMaterial color="#0b0d10" emissive={look.screen} emissiveIntensity={look.screenGlow * 0.9} toneMapped={false} />
      </mesh>
      {rows.map((n, row) => {
        const z = -0.21 + row * 0.12;
        const pitch = 1.7 / n;
        return Array.from({length: n}, (_, i) => (
          <RBox key={`${row}-${i}`} p={[-0.85 + pitch / 2 + i * pitch, 0.105, z]} s={[pitch - 0.02, 0.05, 0.098]} r={0.016} color="#23272e" />
        ));
      })}
      {/* bottom row with space bar */}
      {[-0.74, -0.6, -0.46].map((x) => (
        <RBox key={x} p={[x, 0.105, 0.27]} s={[0.12, 0.05, 0.098]} r={0.016} color="#23272e" />
      ))}
      <RBox p={[0, 0.105, 0.27]} s={[0.72, 0.05, 0.098]} r={0.016} color="#23272e" />
      {[0.48, 0.62, 0.76].map((x) => (
        <RBox key={x} p={[x, 0.105, 0.27]} s={[0.12, 0.05, 0.098]} r={0.016} color="#23272e" />
      ))}
    </group>
  );
};

export const TvModel: M = ({look}) => (
  <group>
    {[-0.72, 0.72].map((x) => (
      <RBox key={x} p={[x, 0.09, 0.02]} s={[0.05, 0.18, 0.34]} r={0.02} rot={[0, 0, x > 0 ? -0.25 : 0.25]} color={C.silver} mat="brushed" />
    ))}
    <RBox p={[0, 0.72, 0]} s={[1.86, 1.08, 0.05]} r={0.02} color={look.body ?? C.black} mat="gloss" />
    <Screen p={[0, 0.73, 0.026]} w={1.8} h={1.0} look={look} />
    <Led p={[0, 0.2, 0.03]} look={look} r={0.01} color="#ff4d4d" />
  </group>
);

export const PrinterModel: M = ({look}) => {
  const body = look.body ?? C.white;
  return (
    <group>
      <RBox p={[0, 0.3, 0]} s={[1.4, 0.56, 0.95]} r={0.05} color={body} />
      <RBox p={[0, 0.6, -0.03]} s={[1.36, 0.06, 0.86]} r={0.03} color={C.offwhite} />
      <group position={[0, 0.62, -0.42]} rotation={[-0.55, 0, 0]}>
        <RBox p={[0, 0.2, 0]} s={[1.0, 0.4, 0.02]} r={0.01} color={C.offwhite} />
        <RBox p={[0, 0.24, 0.02]} s={[0.84, 0.42, 0.006]} r={0.002} color="#ffffff" mat="matte" />
      </group>
      <RBox p={[0, 0.25, 0.475]} s={[1.0, 0.05, 0.02]} r={0.01} color={C.dark} />
      <RBox p={[0, 0.23, 0.62]} s={[0.8, 0.008, 0.3]} r={0.003} color="#ffffff" mat="matte" />
      <G p={[0.47, 0.48, 0.42]} rot={[-0.6, 0, 0]}>
        <RBox s={[0.36, 0.06, 0.2]} r={0.02} color={C.dark} />
        <Led p={[0.1, 0.035, 0]} look={look} r={0.015} />
      </G>
    </group>
  );
};

export const SpeakerModel: M = ({look}) => {
  const beat = look.state === 'active' ? 1 + 0.06 * Math.max(0, Math.sin(look.t * Math.PI * 4)) : 1;
  return (
    <group>
      <RBox p={[0, 0.72, 0]} s={[0.8, 1.44, 0.72]} r={0.05} color={look.body ?? '#2b2420'} mat="matte" />
      {[
        {y: 0.5, r: 0.28},
        {y: 1.12, r: 0.12},
      ].map(({y, r}) => (
        <G key={y} p={[0, y, 0.36]} scale={[1, 1, y < 1 ? beat : 1]}>
          <Tor r={r} tube={0.03} color={C.black} mat="rubber" />
          <Cyl p={[0, 0, -0.02]} r={r * 0.25} rTop={r} h={0.08} rot={[-Math.PI / 2, 0, 0]} color="#1b1d21" mat="matte" />
          <Sph p={[0, 0, 0.01]} r={r * 0.3} theta={Math.PI / 2} rot={[Math.PI / 2, 0, 0]} color={C.silver} mat="metal" />
        </G>
      ))}
      <Led p={[0, 0.12, 0.365]} look={look} r={0.015} color={look.accent} />
    </group>
  );
};

export const HeadphonesModel: M = ({look}) => {
  const body = look.body ?? C.graphite;
  return (
    <group position={[0, 0.05, 0]}>
      <Tor p={[0, 0.5, 0]} r={0.62} tube={0.05} arc={Math.PI} color={body} mat="gloss" />
      <Tor p={[0, 0.5, 0]} r={0.585} tube={0.035} arc={Math.PI * 0.7} rot={[0, 0, Math.PI * 0.15]} color="#3a3f47" mat="rubber" />
      {[-1, 1].map((side) => (
        <G key={side} p={[side * 0.64, 0.38, 0]}>
          <Cyl r={0.28} h={0.18} rot={[0, 0, Math.PI / 2]} color={body} mat="gloss" />
          <Tor p={[-side * 0.1, 0, 0]} r={0.2} tube={0.075} rot={[0, Math.PI / 2, 0]} color="#16181c" mat="rubber" />
          <Tor p={[side * 0.092, 0, 0]} r={0.2} tube={0.012} rot={[0, Math.PI / 2, 0]}
            color={look.accent} mat={look.state === 'off' ? 'plastic' : 'glow'} glow={look.screenGlow * 2} />
        </G>
      ))}
    </group>
  );
};

export const WebcamModel: M = ({look}) => (
  <group>
    <RBox p={[0, 0.03, 0]} s={[0.5, 0.06, 0.4]} r={0.025} color={C.dark} />
    <RBox p={[0, 0.42, -0.04]} s={[0.12, 0.74, 0.08]} r={0.03} color={C.dark} />
    <Cap p={[0, 0.9, 0]} r={0.2} len={0.55} rot={[0, 0, Math.PI / 2]} color={look.body ?? C.black} mat="gloss" />
    <Cyl p={[0, 0.9, 0.19]} r={0.13} h={0.04} rot={[Math.PI / 2, 0, 0]} color={C.silver} mat="metal" />
    <Cyl p={[0, 0.9, 0.21]} r={0.095} h={0.02} rot={[Math.PI / 2, 0, 0]} color="#0b1a33" mat="gloss" />
    <Sph p={[0.03, 0.93, 0.22]} r={0.025} color="#ffffff" mat="glow" glow={0.6} />
    <Led p={[0.28, 0.9, 0.17]} look={look} r={0.014} color="#4ade80" />
  </group>
);

export const CameraModel: M = ({look}) => (
  <group>
    <RBox p={[0, 0.42, 0]} s={[1.25, 0.72, 0.45]} r={0.07} color={look.body ?? C.black} mat="matte" />
    <RBox p={[-0.08, 0.84, -0.02]} s={[0.45, 0.2, 0.36]} r={0.05} color={C.black} mat="matte" />
    <RBox p={[-0.5, 0.42, 0.2]} s={[0.24, 0.66, 0.16]} r={0.08} color="#16181b" mat="rubber" />
    <Cyl p={[0.08, 0.4, 0.34]} r={0.3} h={0.26} rot={[Math.PI / 2, 0, 0]} color={C.black} mat="rubber" />
    <Cyl p={[0.08, 0.4, 0.48]} r={0.31} h={0.04} rot={[Math.PI / 2, 0, 0]} color={C.silver} mat="metal" />
    <Cyl p={[0.08, 0.4, 0.5]} r={0.22} h={0.01} rot={[Math.PI / 2, 0, 0]} color="#0c1c3a" mat="gloss" />
    <Cyl p={[0.45, 0.8, 0.1]} r={0.06} h={0.06} color="#c0392b" mat="gloss" />
    <Led p={[0.5, 0.62, 0.226]} look={look} r={0.015} color="#ff4d4d" />
  </group>
);

export const MicrophoneModel: M = ({look}) => (
  <group>
    <Cyl p={[0, 0.03, 0]} r={0.36} h={0.06} color={C.dark} mat="brushed" />
    <Cyl p={[0, 0.4, 0]} r={0.03} h={0.72} color={C.silver} mat="metal" />
    <Cap p={[0, 1.05, 0]} r={0.2} len={0.38} color={look.body ?? '#7c838c'} mat="brushed" />
    <Tor p={[0, 1.0, 0]} r={0.205} tube={0.02} rot={[Math.PI / 2, 0, 0]} color={C.black} mat="metal" />
    <Tor p={[0, 0.82, 0]} r={0.12} tube={0.025} rot={[Math.PI / 2, 0, 0]} color={C.black} mat="rubber" />
    <Led p={[0, 0.9, 0.2]} look={look} r={0.018} color="#ef4444" />
  </group>
);

export const GamepadModel: M = ({look}) => {
  const body = look.body ?? '#2b2f36';
  return (
    <group position={[0, 0.25, 0]} rotation={[0.55, 0, 0]}>
      <RBox s={[1.1, 0.2, 0.58]} r={0.09} color={body} mat="gloss" />
      {[-1, 1].map((s) => (
        <Sph key={s} p={[s * 0.45, -0.02, 0.24]} r={0.24} scale={[1, 0.6, 1.4]} color={body} mat="gloss" />
      ))}
      {[[-0.22, 0.04], [0.16, 0.2]].map(([x, z]) => (
        <G key={x} p={[x, 0.12, z]}>
          <Cyl r={0.07} h={0.08} color={C.black} mat="rubber" />
          <Cyl p={[0, 0.05, 0]} r={0.085} h={0.02} color="#1a1c20" mat="rubber" />
        </G>
      ))}
      <RBox p={[-0.38, 0.11, -0.08]} s={[0.16, 0.03, 0.05]} r={0.01} color={C.black} />
      <RBox p={[-0.38, 0.11, -0.08]} s={[0.05, 0.03, 0.16]} r={0.01} color={C.black} />
      {[
        [0.38, -0.16, '#22c55e'],
        [0.46, -0.08, '#ef4444'],
        [0.3, -0.08, '#3b82f6'],
        [0.38, 0.0, '#eab308'],
      ].map(([x, z, c]) => (
        <Sph key={c as string} p={[x as number, 0.1, z as number]} r={0.035} color={c as string} mat="gloss" />
      ))}
      <RBox p={[0, 0.105, -0.12]} s={[0.24, 0.01, 0.1]} r={0.02} color={look.accent} mat={look.state === 'off' ? 'plastic' : 'glow'} glow={look.screenGlow * 1.5} />
    </group>
  );
};
