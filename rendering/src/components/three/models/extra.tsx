/**
 * 3D models for: modem, hub, coaxial, fibre, undersea-cable, isp, resistor, capacitor,
 * motherboard, hacker. Same rules as the other models: grounded at y = 0, facing +z,
 * about 1.6 units wide, animated only from `look.t`.
 */
import type {FC} from 'react';
import {C, Cap, Cyl, G, Led, type Look, RBox, Rod, Sph, Tor, Tube, type V3} from '../parts';
import {LaptopModel, SpeakerModel} from './computers';
import {FieldLines3D, Movers, Waves3D} from '../effects';

/** Glowing dots / light / current along a path (shared 3D effect). */
const Pulses = Movers;

type M = FC<{look: Look}>;
const on = (look: Look) => look.state !== 'off';
const glowMat = (look: Look) => (on(look) ? ('glow' as const) : ('plastic' as const));
const stateColor = (look: Look) => (look.state === 'error' ? '#ef4444' : look.accent);
const COPPER = '#c27a43';

/* ---------------------------------------------------------------------- modem */

const MODEM_CABLE: V3[] = [[0.35, 0.22, -0.43], [0.4, 0.2, -0.65], [0.7, 0.04, -0.8], [0.95, 0.04, -0.55]];

/** Cable modem: white box, front status lights, coax cable out of the back. */
export const ModemModel: M = ({look}) => (
  <group>
    <RBox p={[0, 0.28, 0]} s={[1.3, 0.5, 0.85]} r={0.08} color={look.body ?? C.white} mat="gloss" />
    <RBox p={[0, 0.28, 0.43]} s={[1.18, 0.2, 0.02]} r={0.02} color="#0d1117" mat="gloss" />
    {['Power', 'DS', 'US', 'Online', 'Link'].map((_, i) => (
      <Led key={i} p={[-0.4 + i * 0.2, 0.28, 0.445]} look={look} phase={i} r={0.02} color={i === 0 ? '#ffffff' : i === 3 ? look.accent : '#4ade80'} />
    ))}
    {Array.from({length: 8}, (_, i) => (
      <RBox key={i} p={[-0.42 + i * 0.12, 0.532, -0.1]} s={[0.05, 0.006, 0.45]} r={0.002} color="#b8bec6" />
    ))}
    {/* coax F-connector + cable */}
    <Cyl p={[0.35, 0.22, -0.44]} r={0.05} h={0.06} rot={[Math.PI / 2, 0, 0]} color={C.gold} mat="metal" />
    <Tube points={MODEM_CABLE} r={0.035} color={C.black} mat="rubber" />
    <Pulses look={look} path={MODEM_CABLE} count={2} r={0.045} />
    {[-0.5, 0.5].map((x) => (
      <RBox key={x} p={[x, 0.02, 0]} s={[0.12, 0.04, 0.6]} r={0.015} color={C.graphite} mat="rubber" />
    ))}
  </group>
);

/* ------------------------------------------------------------------------ hub */

const HUB_COLORS = ['#2b6cdf', '#eab308', '#22c55e', '#f97316'];
const HUB_CABLES: V3[][] = [-0.3, -0.1, 0.1, 0.3].map((x, i) => [
  [x, 0.14, -0.32], [x * 1.3, 0.1, -0.5], [x * 3.2, 0.03, -0.75], [(i - 1.5) * 0.55, 0.03, -1.05],
]);

/** Hub: small box, every port lights up together (it repeats data to all ports). */
export const HubModel: M = ({look}) => {
  const sync = look.state === 'active' ? (Math.sin(look.t * 10) > 0 ? 3 : 0.4) : look.state === 'off' ? 0 : look.state === 'error' ? (Math.sin(look.t * 6) > 0 ? 3 : 0.3) : 2;
  return (
    <group position={[0, 0, 0.3]} scale={1.3}>
      <RBox p={[0, 0.14, 0]} s={[1.0, 0.24, 0.64]} r={0.04} color={look.body ?? '#9aa3ad'} mat="plastic" />
      <RBox p={[0, 0.14, 0.322]} s={[0.92, 0.14, 0.01]} r={0.01} color="#20252c" />
      {[0, 1, 2, 3].map((i) => (
        <Sph key={i} p={[-0.3 + i * 0.2, 0.14, 0.33]} r={0.022} color={look.state === 'error' ? '#ef4444' : '#4ade80'} mat={sync > 0 ? 'glow' : 'plastic'} glow={sync} />
      ))}
      <Led p={[0.42, 0.14, 0.33]} look={look} r={0.018} color="#ffffff" />
      {HUB_CABLES.map((pts, i) => (
        <group key={i}>
          <RBox p={pts[0]} s={[0.11, 0.08, 0.06]} r={0.015} color="#dfe8f0" mat="glass" opacity={0.8} />
          <Tube points={pts} r={0.03} color={HUB_COLORS[i]} mat="rubber" />
          {/* the same data goes out on every cable at the same time */}
          <Pulses look={look} path={pts} count={1} r={0.042} color={look.state === 'error' ? '#ef4444' : look.accent} />
        </group>
      ))}
    </group>
  );
};

/* -------------------------------------------------------------------- coaxial */

const alongX: V3 = [0, 0, Math.PI / 2];
/** Cylinder lying along X from x0 to x1. */
const XCyl: FC<{x0: number; x1: number; r: number; y: number; color: string; mat?: 'plastic' | 'metal' | 'brushed' | 'rubber' | 'gloss' | 'glow'; glow?: number}> = ({x0, x1, r, y, ...m}) => (
  <Cyl p={[(x0 + x1) / 2, y, 0]} r={r} h={x1 - x0} rot={alongX} {...m} />
);

/** Coaxial cable cut-away: jacket, copper braid, white insulator, copper core. */
export const CoaxModel: M = ({look}) => {
  const y = 0.32;
  const core = look.state === 'off' ? 0 : look.state === 'active' ? 1.2 + Math.sin(look.t * 8) * 0.8 : 1;
  return (
    <group position={[-0.05, 0, 0]}>
      <XCyl x0={-0.85} x1={0.05} r={0.22} y={y} color={look.body ?? '#15181d'} mat="rubber" />
      <XCyl x0={0.05} x1={0.35} r={0.185} y={y} color="#9a6a3a" mat="brushed" />
      {Array.from({length: 10}, (_, i) => (
        <Tor key={i} p={[0.07 + i * 0.03, y, 0]} r={0.185} tube={0.008} rot={[0, Math.PI / 2, 0]} color={COPPER} mat="metal" />
      ))}
      <XCyl x0={0.35} x1={0.62} r={0.13} y={y} color="#f2f2ee" mat="gloss" />
      <XCyl x0={0.35} x1={0.95} r={0.035} y={y} color={COPPER} mat="metal" />
      {core > 0 ? <XCyl x0={0.62} x1={0.955} r={0.02} y={y} color={stateColor(look)} mat="glow" glow={core} /> : null}
      {look.state === 'active' ? (
        <Tor p={[0.96, y, 0]} r={0.05 + ((look.t * 1.5) % 1) * 0.2} tube={0.008} rot={[0, Math.PI / 2, 0]} color={look.accent} mat="glow" glow={2 * (1 - ((look.t * 1.5) % 1))} />
      ) : null}
    </group>
  );
};

/* ---------------------------------------------------------------------- fibre */

const FIBRE_TIPS: [number, number][] = [[0.42, 0], [0.26, 0.22], [0.08, -0.2], [-0.08, 0.3], [-0.2, -0.05], [0.18, -0.38], [-0.3, 0.2]];
const FIBRE_STRANDS: V3[][] = FIBRE_TIPS.map(([dy, dz]) => [[-0.1, 0.45, 0], [0.25, 0.45 + dy * 0.35, dz * 0.35], [0.8, 0.45 + dy, dz]]);

/** Fibre-optic cable: jacket opens into glass strands, light at every tip. */
export const FibreModel: M = ({look}) => (
  <group>
    <XCyl x0={-0.85} x1={-0.25} r={0.08} y={0.45} color={look.body ?? '#f59e0b'} mat="rubber" />
    <Cyl p={[-0.17, 0.45, 0]} r={0.06} rTop={0.1} h={0.16} rot={alongX} color={C.dark} mat="rubber" />
    {FIBRE_STRANDS.map((pts, i) => (
      <group key={i}>
        <Tube points={pts} r={0.012} color={on(look) ? stateColor(look) : '#cfe8ff'} mat={on(look) ? 'glow' : 'glass'} />
        <Sph p={pts[2]} r={0.03} color={on(look) ? stateColor(look) : '#9fb3c8'} mat={on(look) ? 'glow' : 'glass'}
          glow={look.state === 'active' ? 2 + Math.sin(look.t * 9 + i) * 1.5 : 2.5} />
        <Movers look={look} path={pts} effect="light" count={1} r={0.018} offset={i * 0.17} />
      </group>
    ))}
  </group>
);

/* ------------------------------------------------------------- undersea cable */

const SEA_CABLE: V3[] = [[-0.72, 0.62, 0.1], [-0.56, 0.6, 0.1], [-0.46, 0.2, 0.1], [-0.2, 0.135, 0.14], [0.2, 0.135, 0.06], [0.46, 0.2, 0.1], [0.56, 0.6, 0.1], [0.72, 0.62, 0.1]];

/** Undersea cable: two coasts, cable along the sea floor (with a repeater), water above. */
export const UnderseaCableModel: M = ({look}) => (
  <group>
    <RBox p={[0, 0.06, 0]} s={[1.7, 0.12, 0.9]} r={0.02} color="#c2a878" mat="matte" />
    {[-1, 1].map((s) => (
      <group key={s}>
        <RBox p={[s * 0.7, 0.33, 0]} s={[0.3, 0.54, 0.9]} r={0.02} color="#7b6a4f" mat="matte" />
        <RBox p={[s * 0.7, 0.61, 0]} s={[0.3, 0.04, 0.9]} r={0.015} color="#4f7a3c" mat="matte" />
        {/* cable landing station */}
        <RBox p={[s * 0.72, 0.71, -0.18]} s={[0.2, 0.16, 0.2]} r={0.015} color={C.offwhite} mat="plastic" />
        <Led p={[s * 0.72, 0.73, -0.075]} look={look} r={0.015} phase={s} />
      </group>
    ))}
    <RBox p={[0, 0.34, 0]} s={[1.1, 0.44, 0.88]} r={0.01} color="#1e6fb8" mat="glass" />
    {Array.from({length: 7}, (_, i) => (
      <Cap key={i} p={[-0.48 + i * 0.16, 0.565 + Math.sin(look.t * 2 + i) * 0.008, 0]} r={0.012} len={0.84} rot={[Math.PI / 2, 0, 0]} color="#7cc4f5" mat="tint" />
    ))}
    <Tube points={SEA_CABLE} r={0.028} color={look.body ?? C.black} mat="rubber" />
    <Cap p={[0, 0.14, 0.1]} r={0.05} len={0.12} rot={alongX} color={C.silver} mat="metal" />
    <Movers look={look} path={SEA_CABLE} effect="light" count={2} r={0.032} />
  </group>
);

/* ------------------------------------------------------------------------ isp */

const ISP_LINK: V3[] = [[-0.02, 0.9, -0.1], [0.25, 0.95, -0.12], [0.5, 0.95, -0.1]];
const MAST_LEGS: [V3, V3][] = [0, (Math.PI * 2) / 3, (Math.PI * 4) / 3].map((a) => [
  [0.58 + Math.sin(a) * 0.17, 0, Math.cos(a) * 0.17], [0.58 + Math.sin(a) * 0.03, 1.5, Math.cos(a) * 0.03],
]);

/** Internet service provider: office with a lit sign, and a transmission mast with signal. */
export const IspModel: M = ({look}) => {
  const sign = look.state === 'off' ? 0 : look.state === 'active' ? 1.6 + Math.sin(look.t * 5) * 0.6 : 1.6;
  const beacon = look.state === 'off' ? 0 : Math.sin(look.t * 4) > 0 ? 3 : 0.2;
  return (
    <group>
      <RBox p={[-0.32, 0.55, 0]} s={[0.84, 1.1, 0.72]} r={0.02} color={look.body ?? '#3c5a78'} mat="gloss" />
      <RBox p={[-0.32, 1.12, 0]} s={[0.88, 0.05, 0.76]} r={0.01} color={C.silver} mat="brushed" />
      <RBox p={[-0.32, 0.96, 0.365]} s={[0.66, 0.14, 0.02]} r={0.02} color={stateColor(look)} mat={sign > 0 ? 'glow' : 'plastic'} glow={sign} />
      {Array.from({length: 3}, (_, r) =>
        Array.from({length: 4}, (_, c) => {
          const lit = on(look) && (r * 5 + c * 3) % 4 < 3;
          return <RBox key={`${r}-${c}`} p={[-0.6 + c * 0.19, 0.3 + r * 0.2, 0.365]} s={[0.12, 0.12, 0.02]} r={0.006}
            color={lit ? '#ffd58a' : '#22344a'} mat={lit ? 'glow' : 'gloss'} glow={0.9} />;
        }),
      )}
      <RBox p={[-0.32, 0.1, 0.37]} s={[0.22, 0.2, 0.02]} r={0.01} color="#0e1824" mat="glass" />
      {/* transmission mast */}
      {MAST_LEGS.map((l, i) => <Rod key={i} from={l[0]} to={l[1]} r={0.018} color="#9aa3ad" mat="metal" />)}
      {[0.3, 0.65, 1.0].map((y) => (
        <Tor key={y} p={[0.58, y, 0]} r={0.17 - (y / 1.5) * 0.14} tube={0.008} rot={[Math.PI / 2, 0, 0]} color="#9aa3ad" mat="metal" />
      ))}
      <Sph p={[0.58, 1.18, 0.07]} r={0.13} theta={0.95} rot={[Math.PI / 2, 0, 0]} color={C.offwhite} />
      <Rod from={[0.58, 1.5, 0]} to={[0.58, 1.66, 0]} r={0.01} color="#9aa3ad" mat="metal" />
      <Sph p={[0.58, 1.68, 0]} r={0.03} color="#ef4444" mat={beacon > 0 ? 'glow' : 'plastic'} glow={beacon} />
      {[0.14, 0.26, 0.38].map((r, i) => {
        const wave = look.state === 'active' ? 0.35 + 0.65 * Math.max(0, Math.sin(look.t * 5 - i * 1.2)) : 1;
        return (
          <Tor key={r} p={[0.58, 1.6, 0]} r={r} tube={0.018} arc={Math.PI / 2} rot={[0, 0, Math.PI / 4]}
            color={stateColor(look)} mat={glowMat(look)} glow={look.screenGlow * 2 * wave} opacity={on(look) ? 1 : 0.4} />
        );
      })}
      <Tube points={ISP_LINK} r={0.02} color={C.black} mat="rubber" />
    </group>
  );
};

/* ------------------------------------------------------------------ electronics */

const Board: FC = () => <RBox p={[0, 0.02, 0]} s={[1.7, 0.04, 0.8]} r={0.015} color={C.pcb} mat="gloss" />;
const Pad: FC<{x: number; z?: number}> = ({x, z = 0}) => <Cyl p={[x, 0.043, z]} r={0.05} h={0.01} color={C.gold} mat="metal" />;

const RESISTOR_PATH: V3[] = [[-0.72, 0.05, 0], [-0.72, 0.5, 0], [-0.5, 0.52, 0], [0, 0.52, 0], [0.5, 0.52, 0], [0.72, 0.5, 0], [0.72, 0.05, 0]];
const RESISTOR_BANDS = [[-0.17, '#6b3e1f'], [-0.07, '#111111'], [0.03, '#c0392b'], [0.17, C.gold]] as const;

/** Resistor on a circuit board: colour bands, bent leads, current flowing through. */
export const ResistorModel: M = ({look}) => {
  const hot = look.state === 'error' ? 0.8 + Math.sin(look.t * 6) * 0.5 : 0;
  return (
    <group>
      <Board />
      <Pad x={-0.72} />
      <Pad x={0.72} />
      {([[-0.72, -0.42], [0.72, 0.42]] as const).map(([x, x2]) => (
        <group key={x}>
          <Rod from={[x, 0.04, 0]} to={[x, 0.52, 0]} r={0.018} color={C.silver} mat="metal" />
          <Rod from={[x, 0.52, 0]} to={[x2, 0.52, 0]} r={0.018} color={C.silver} mat="metal" />
          <Sph p={[x, 0.52, 0]} r={0.018} color={C.silver} mat="metal" />
        </group>
      ))}
      <Cap p={[0, 0.52, 0]} r={0.15} len={0.55} rot={alongX} color={hot ? '#ff7a3d' : look.body ?? '#d9c39a'} mat={hot ? 'glow' : 'gloss'} glow={hot} />
      {[-1, 1].map((s) => (
        <Sph key={s} p={[s * 0.27, 0.52, 0]} r={0.17} scale={[0.75, 1, 1]} color={hot ? '#ff7a3d' : look.body ?? '#d9c39a'} mat={hot ? 'glow' : 'gloss'} glow={hot} />
      ))}
      {RESISTOR_BANDS.map(([x, color]) => (
        <Cyl key={x} p={[x, 0.52, 0]} r={x === 0.17 ? 0.166 : 0.153} h={0.05} rot={alongX} color={color} mat={color === C.gold ? 'metal' : 'gloss'} />
      ))}
      <Movers look={look} path={RESISTOR_PATH} effect="current" count={9} r={0.034} />
    </group>
  );
};

/** Electrolytic capacitor: can with polarity stripe, vented top, two legs; the top bulges on error. */
export const CapacitorModel: M = ({look}) => {
  const charge = look.state === 'off' ? 0 : look.state === 'active' ? 0.5 + 0.5 * Math.sin(look.t * 3) : look.state === 'error' ? 0 : 1;
  const can = look.body ?? '#1f3f8a';
  return (
    <group>
      <Board />
      <Pad x={-0.1} />
      <Pad x={0.1} />
      <Rod from={[-0.1, 0.04, 0]} to={[-0.1, 0.3, 0]} r={0.016} color={C.silver} mat="metal" />
      <Rod from={[0.1, 0.04, 0]} to={[0.1, 0.3, 0]} r={0.016} color={C.silver} mat="metal" />
      <Cyl p={[0, 0.32, 0]} r={0.29} h={0.05} color={C.dark} mat="rubber" />
      <Cyl p={[0, 0.88, 0]} r={0.32} h={1.08} seg={64} color={can} mat="gloss" />
      <Tor p={[0, 0.4, 0]} r={0.315} tube={0.012} rot={[Math.PI / 2, 0, 0]} color={can} mat="gloss" />
      {/* polarity stripe with minus signs */}
      <RBox p={[0.2, 0.86, 0.245]} rot={[0, 0.68, 0]} s={[0.15, 0.96, 0.012]} r={0.004} color="#cdd5e0" mat="gloss" />
      {[0.55, 0.78, 1.01, 1.24].map((y) => (
        <RBox key={y} p={[0.205, y, 0.255]} rot={[0, 0.68, 0]} s={[0.07, 0.018, 0.006]} r={0.003} color={can} />
      ))}
      <Cyl p={[0, 1.425, 0]} r={0.3} h={0.02} color={C.silver} mat="metal" />
      {look.state === 'error' ? (
        <Sph p={[0, 1.43, 0]} r={0.29} theta={Math.PI / 2} scale={[1, 0.35, 1]} color={C.silver} mat="metal" />
      ) : (
        <>
          <RBox p={[0, 1.437, 0]} s={[0.4, 0.006, 0.025]} r={0.003} rot={[0, 0.5, 0]} color="#7d8590" />
          <RBox p={[0, 1.437, 0]} s={[0.4, 0.006, 0.025]} r={0.003} rot={[0, -1.07, 0]} color="#7d8590" />
        </>
      )}
      {/* charge ring */}
      <Tor p={[0, 1.36, 0]} r={0.325} tube={0.014} rot={[Math.PI / 2, 0, 0]} color={stateColor(look)}
        mat={charge > 0 || look.state === 'error' ? 'glow' : 'plastic'} glow={look.state === 'error' ? 1.5 + Math.sin(look.t * 6) : charge * 2.4} />
    </group>
  );
};

const TRACES: [V3, V3][] = [
  [[0.1, 0.027, 0.0], [0.1, 0.027, 0.3]], [[0.1, 0.027, 0.3], [-0.2, 0.027, 0.3]],
  [[0.28, 0.027, -0.2], [0.42, 0.027, -0.2]], [[-0.08, 0.027, -0.2], [-0.5, 0.027, -0.2]],
  [[0.35, 0.027, 0.24], [0.35, 0.027, 0.1]], [[-0.5, 0.027, 0.1], [-0.2, 0.027, 0.1]],
];

/** Motherboard: CPU socket, RAM slots, PCIe slots, chipset, I/O block, glowing traces. */
export const MotherboardModel: M = ({look}) => {
  const trace = look.state === 'off' ? 0 : look.state === 'active' ? 0.6 + 0.6 * Math.max(0, Math.sin(look.t * 6)) : 0.7;
  return (
    <group position={[0, 0.38, 0]} rotation={[0.62, 0.3, 0]}>
      <RBox s={[1.5, 0.045, 1.25]} r={0.015} color={look.body ?? '#1e4d36'} mat="gloss" />
      {/* traces */}
      {TRACES.map(([a, b], i) => (
        <Rod key={i} from={a} to={b} r={0.006} color={trace > 0 ? stateColor(look) : '#2f6b4c'} mat={trace > 0 ? 'glow' : 'plastic'} glow={trace} />
      ))}
      {/* CPU socket + chip */}
      <RBox p={[0.1, 0.05, -0.2]} s={[0.38, 0.05, 0.38]} r={0.01} color="#d5d9de" mat="brushed" />
      <RBox p={[0.1, 0.085, -0.2]} s={[0.26, 0.03, 0.26]} r={0.02} color={C.silver} mat="metal" />
      {/* RAM slots with sticks */}
      {[0, 1, 2, 3].map((i) => (
        <group key={i}>
          <RBox p={[0.48 + i * 0.06, 0.05, -0.2]} s={[0.035, 0.05, 0.75]} r={0.008} color={i % 2 ? '#111' : '#2b6cdf'} />
          {i % 2 === 0 ? <RBox p={[0.48 + i * 0.06, 0.13, -0.2]} s={[0.02, 0.14, 0.7]} r={0.005} color="#2b2f36" mat="brushed" /> : null}
        </group>
      ))}
      {/* PCIe slots */}
      {[0.28, 0.46].map((z) => <RBox key={z} p={[-0.25, 0.045, z]} s={[0.8, 0.04, 0.045]} r={0.008} color="#111" />)}
      {/* chipset heatsink */}
      <RBox p={[0.4, 0.06, 0.35]} s={[0.24, 0.07, 0.24]} r={0.02} color={C.silver} mat="brushed" />
      <RBox p={[0.4, 0.097, 0.35]} s={[0.16, 0.004, 0.03]} r={0.002} color={stateColor(look)} mat={glowMat(look)} glow={look.screenGlow * 1.2} />
      {/* rear I/O block + power connector */}
      <RBox p={[-0.62, 0.12, -0.32]} s={[0.16, 0.2, 0.52]} r={0.015} color={C.silver} mat="brushed" />
      {[-0.48, -0.38, -0.28, -0.18].map((z) => <RBox key={z} p={[-0.7, 0.12, z]} s={[0.01, 0.05, 0.06]} r={0.004} color="#111" />)}
      <RBox p={[0.7, 0.06, 0.05]} s={[0.06, 0.07, 0.36]} r={0.008} color={C.offwhite} />
      {/* capacitors around the socket */}
      {[[-0.15, -0.42], [-0.15, -0.32], [-0.15, -0.08], [0.35, -0.45], [0.35, 0.02]].map(([x, z]) => (
        <Cyl key={`${x}${z}`} p={[x, 0.065, z]} r={0.028} h={0.08} color="#1f2937" mat="gloss" />
      ))}
      <Led p={[0.62, 0.035, 0.52]} look={look} r={0.018} />
    </group>
  );
};

/* --------------------------------------------------------------------- hacker */

/** Hacker represented by a terminal workstation, without a human figure. */
export const HackerModel: M = ({look}) => {
  const lit = on(look);
  const accent = look.state === 'error' ? '#ef4444' : '#4ade80';
  const cursor = look.state !== 'active' || Math.floor(look.t * 2) % 2 === 0;
  return (
    <group>
      <LaptopModel look={{...look, state: 'off', screenGlow: 0, body: look.body ?? '#343e4b'}} />
      {/* Match the laptop hinge so terminal graphics stay attached while turning. */}
      <G p={[0, 0.06, -0.29]} rot={[-0.26, 0, 0]}>
        <Sph p={[0, 0.967, 0.023]} r={0.012} color="#080c12" mat="gloss" />
        {lit ? <G p={[0, 0, 0.024]}>
          <RBox p={[0, 0.88, 0]} s={[1.29, 0.07, 0.004]} r={0.005} color="#1d2b35" mat="matte" />
          {['#ef7878', '#e9bf65', '#69c391'].map((color, i) => <Sph key={color} p={[-0.59 + i * 0.045, 0.88, 0.005]} r={0.011} color={color} mat="glow" glow={0.3} />)}
          {/* Terminal prompt, code rows, and a blinking insertion cursor. */}
          <Tube points={[[-0.59, 0.77, 0], [-0.555, 0.745, 0], [-0.59, 0.72, 0]]} r={0.008} color={accent} mat="glow" glow={0.7} />
          <RBox p={[-0.50, 0.72, 0]} s={[0.045, 0.009, 0.004]} r={0.002} color={accent} mat="glow" glow={0.7} />
          {[0.66, 0.59, 0.52, 0.45, 0.38, 0.31].map((y, i) => <G key={y}>
            <RBox p={[-0.59, y, 0]} s={[0.024, 0.013, 0.004]} r={0.002} color="#547381" />
            {[0, 1, 2].map((j) => <RBox key={j} p={[-0.49 + j * 0.17 + (i % 2) * 0.025, y, 0]}
              s={[0.09 + ((i + j) % 3) * 0.022, 0.013, 0.004]} r={0.003}
              color={j === 0 ? '#79b6d2' : accent} mat="glow" glow={0.35} />)}
          </G>)}
          {cursor ? <RBox p={[-0.52, 0.21, 0]} s={[0.035, 0.035, 0.004]} r={0.002} color={accent} mat="glow" glow={0.7} /> : null}
          {/* An open padlock makes the cybersecurity theme readable at small sizes. */}
          <RBox p={[0.39, 0.52, 0]} s={[0.35, 0.49, 0.004]} r={0.015} color="#15232d" />
          <Tor p={[0.39, 0.60, 0.01]} r={0.077} tube={0.013} arc={Math.PI} color={accent} mat="glow" glow={0.5} />
          <RBox p={[0.313, 0.556, 0.01]} s={[0.026, 0.09, 0.014]} r={0.007} color={accent} mat="glow" glow={0.5} />
          <RBox p={[0.39, 0.48, 0.012]} s={[0.20, 0.155, 0.015]} r={0.018} color={accent} mat="glow" glow={0.4} />
          <Sph p={[0.39, 0.49, 0.023]} r={0.021} scale={[1, 1, 0.2]} color="#10241b" />
          <RBox p={[0.39, 0.461, 0.023]} s={[0.013, 0.035, 0.004]} r={0.003} color="#10241b" />
        </G> : null}
      </G>
      <Led p={[0.60, 0.065, 0.62]} look={look} color={accent} r={0.009} />
    </group>
  );
};

/* ------------------------------------------------------------- lock / magnet */

/** Padlock: open when off, closed when on; active = glowing keyhole, error = red alarm. */
export const LockModel: M = ({look}) => {
  const open = look.state === 'off' ? 1 : 0;
  const alarm = look.state === 'error' ? 0.8 + Math.sin(look.t * 8) * 0.6 : 0;
  const key = look.state === 'active' ? 1.6 + Math.sin(look.t * 5) * 1 : look.state === 'on' ? 1 : 0;
  const lift = open * 0.28;
  return (
    <group position={[0, 0, 0]}>
      <G p={[0, lift, 0]} rot={[0, open * 0.6, 0]}>
        <G p={[-0.24, 0, 0]}>
          <Tor p={[0.24, 0.98, 0]} r={0.24} tube={0.055} arc={Math.PI} color={C.silver} mat="metal" />
          <Cyl p={[0, 0.86, 0]} r={0.055} h={0.24} color={C.silver} mat="metal" />
          <Cyl p={[0.48, 0.86 + open * 0.05, 0]} r={0.055} h={0.24 - open * 0.1} color={C.silver} mat="metal" />
        </G>
      </G>
      <RBox p={[0, 0.42, 0]} s={[0.8, 0.72, 0.34]} r={0.1} color={alarm ? '#ef4444' : look.body ?? '#d4a63a'} mat={alarm ? 'glow' : 'paint'} glow={alarm} />
      <Cyl p={[0, 0.48, 0.172]} r={0.07} h={0.02} rot={[Math.PI / 2, 0, 0]} color={key ? stateColor(look) : '#1a1206'} mat={key ? 'glow' : 'plastic'} glow={key} />
      <RBox p={[0, 0.36, 0.172]} s={[0.05, 0.16, 0.02]} r={0.01} color={key ? stateColor(look) : '#1a1206'} mat={key ? 'glow' : 'plastic'} glow={key} />
      {look.state === 'active' ? (
        <Tor p={[0, 0.48, 0.18]} r={0.1 + ((look.t * 1.2) % 1) * 0.3} tube={0.01} color={look.accent} mat="glow" glow={2 * (1 - ((look.t * 1.2) % 1))} />
      ) : null}
    </group>
  );
};

/** Bar magnet (N red / S blue) with 3D field lines flowing from N to S when on. */
export const MagnetModel: M = ({look}) => (
  <group>
    <RBox p={[-0.3, 0.75, 0]} s={[0.6, 0.26, 0.26]} r={0.03} color="#dc2626" mat="paint" />
    <RBox p={[0.3, 0.75, 0]} s={[0.6, 0.26, 0.26]} r={0.03} color="#2563eb" mat="paint" />
    <RBox p={[-0.48, 0.75, 0.131]} s={[0.12, 0.14, 0.004]} r={0.004} color="#fff" mat="plastic" />
    <RBox p={[0.48, 0.75, 0.131]} s={[0.12, 0.14, 0.004]} r={0.004} color="#fff" mat="plastic" />
    <FieldLines3D look={look} p={[0, 0.75, 0]} a={0.6} levels={3} planes={2} maxHeight={0.6} />
  </group>
);

/** Speaker that sends sound waves out of the front when active. */
export const SpeakerSoundModel: M = ({look}) => (
  <group>
    <SpeakerModel look={look} />
    {look.state === 'active' ? <Waves3D look={look} p={[0, 0.5, 0.42]} spread={Math.PI * 2} reach={0.75} count={3} thickness={0.018} /> : null}
  </group>
);
