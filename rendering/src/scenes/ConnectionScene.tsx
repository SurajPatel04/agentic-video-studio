import {ThreeCanvas} from '@remotion/three';
import type {FC} from 'react';
import {useMemo} from 'react';
import {AbsoluteFill, interpolate, spring, useCurrentFrame, useVideoConfig} from 'remotion';
import * as THREE from 'three';
import {z} from 'zod';
import {entrance} from '../animation';
import {Device, deviceKindSchema, deviceStateSchema, type DeviceState} from '../components/Device';
import {PaperDeviceArt} from '../components/PaperDeviceArt';
import {PAPER} from '../iso/iso';
import {Pointer, pointerSchema} from '../components/Pointer';
import {Flow3D, Waves3D} from '../components/three/effects';
import {makeLook, type V3} from '../components/three/parts';
import {FlowPath, SignalWaves} from '../effects/flow';
import {useTheme, useUnit} from '../theme';

const frame = z.number().int().nonnegative();
const linkEffects = ['packet', 'current', 'light', 'bits', 'waves', 'none'] as const;

export const connectionSceneSchema = z.object({
  mode: z.enum(['2d', '3d']).default('2d'),
  title: z.string().optional(),
  caption: z.string().optional(),
  devices: z
    .array(
      z.object({
        kind: deviceKindSchema,
        label: z.string().max(30).optional(),
        state: deviceStateSchema.default('on'),
        color: z.string().optional(), // 2D icon / 3D body colour
        glow: z.string().optional(), // glow / screen / LED colour
        x: z.number().min(0).max(100).optional(), // 2D position (% of frame); default: evenly in a row
        y: z.number().min(0).max(100).optional(),
        appearAt: frame.optional(),
      }).strict(),
    )
    .min(2)
    .max(6)
    .default([
      {kind: 'phone', label: 'Phone', state: 'on'},
      {kind: 'router', label: 'Router', state: 'active'},
      {kind: 'server', label: 'Server', state: 'on'},
    ]),
  links: z
    .array(
      z.object({
        from: z.number().int().nonnegative(),
        to: z.number().int().nonnegative(),
        effect: z.enum(linkEffects).default('packet'), // waves = wireless (no cable)
        label: z.string().max(24).optional(),
        color: z.string().optional(),
        count: z.number().int().min(1).max(40).optional(),
        trip: z.number().min(0.2).max(30).default(1.6), // seconds per trip
        reverse: z.boolean().default(false),
        bend: z.number().min(-1).max(1).default(0), // 2D curve
        startAt: frame.optional(), // default: once both devices are in
        stopAt: frame.optional(),
      }).strict(),
    )
    .default([
      {from: 0, to: 1, effect: 'waves', trip: 1.6, reverse: false, bend: 0, label: 'Wi-Fi'},
      {from: 1, to: 2, effect: 'packet', trip: 1.6, reverse: false, bend: 0, label: 'data'},
    ]),
  changes: z.array(z.object({index: z.number().int().nonnegative(), at: frame, state: deviceStateSchema}).strict()).default([]),
  size: z.number().min(60).max(400).optional(), // 2D tile size; 3D scale is automatic
  startAt: frame.default(6),
  stagger: frame.default(8),
  tilt: z.number().min(0).max(1).default(0.35), // 3D camera height
  pointer: pointerSchema.optional(),
});

export const description =
  'Devices (any of 65 kinds, 2D icons or isometric paper art) joined by animated links: packets, electric current, fibre light, binary bits or wireless waves. Link labels, device state changes at frames. Good for "how data/current travels from A to B".';
export const tags = ['network', 'connection', 'packet', 'current', 'fibre', 'wireless', 'wifi', 'circuit', '3d', '2d', 'devices'];

type Parsed = z.output<typeof connectionSceneSchema>;

/* Presets registered as their own scenes (same props, different defaults). */
const shape = connectionSceneSchema.shape;
export const circuitSceneSchema = connectionSceneSchema.extend({
  title: shape.title.default('A simple circuit'),
  caption: shape.caption.default('Current flows from the battery, through the switch, to the bulb.'),
  devices: shape.devices.unwrap().default([
    {kind: 'battery', label: 'Battery', state: 'on'},
    {kind: 'power', label: 'Switch', state: 'off'},
    {kind: 'bulb', label: 'Bulb', state: 'off'},
  ]),
  links: shape.links.unwrap().default([
    {from: 0, to: 1, effect: 'current', trip: 1.6, reverse: false, bend: 0, startAt: 50},
    {from: 1, to: 2, effect: 'current', trip: 1.6, reverse: false, bend: 0, startAt: 50},
  ]),
  changes: shape.changes.unwrap().default([{index: 1, at: 45, state: 'active'}, {index: 2, at: 55, state: 'active'}]),
});
export const wirelessSceneSchema = connectionSceneSchema.extend({
  title: shape.title.default('Wireless: data on radio waves'),
  caption: shape.caption.default('No cable: the router sends radio waves the phone can pick up.'),
  devices: shape.devices.unwrap().default([
    {kind: 'router', label: 'Router', state: 'active'},
    {kind: 'phone', label: 'Phone', state: 'on'},
  ]),
  links: shape.links.unwrap().default([{from: 0, to: 1, effect: 'waves', trip: 1.6, reverse: false, bend: 0, label: 'Wi-Fi'}]),
});
export const circuitDescription = 'Electric circuit: battery → switch → bulb (any devices) with current flowing along copper wires; the switch and bulb turn on at frames. 2D or 3D.';
export const wirelessDescription = 'Wireless link: router → phone (any devices) with radio waves travelling between them. 2D or 3D.';

const useStates = (p: Parsed) => {
  const f = useCurrentFrame();
  const changes = [...p.changes].sort((a, b) => a.at - b.at);
  return p.devices.map((d, i) => {
    let s: DeviceState = d.state;
    for (const c of changes) if (c.index === i && f >= c.at) s = c.state;
    return s;
  });
};

const appearOf = (p: Parsed, i: number) => p.devices[i].appearAt ?? p.startAt + i * p.stagger;
const linkStart = (p: Parsed, l: Parsed['links'][number]) => l.startAt ?? Math.max(appearOf(p, l.from), appearOf(p, l.to)) + 14;

/* ------------------------------------------------------------------------- 2D */

const Connection2D: FC<{p: Parsed}> = ({p}) => {
  const u = useUnit();
  const states = useStates(p);
  const n = p.devices.length;
  const size = p.size ?? (n <= 3 ? 190 : n === 4 ? 160 : 140);
  const pos = p.devices.map((d, i) => ({x: d.x ?? (n === 1 ? 50 : 14 + (72 * i) / (n - 1)), y: d.y ?? 54}));
  const inset = size * 0.62;
  return (
    <AbsoluteFill>
      {p.links.map((l, i) => {
        if (!pos[l.from] || !pos[l.to]) return null;
        const startAt = linkStart(p, l);
        const off = states[l.from] === 'off' || states[l.to] === 'off';
        return l.effect === 'waves' ? (
          <SignalWaves key={i} at={pos[l.reverse ? l.to : l.from]} toward={pos[l.reverse ? l.from : l.to]} inset={inset} spread={46} maxHeight={size * 1.3}
            count={l.count ?? 4} speed={1 / l.trip * 1.4} color={l.color} startAt={startAt} stopAt={off ? 0 : l.stopAt} />
        ) : (
          <FlowPath key={i} points={[pos[l.from], pos[l.to]]} effect={l.effect} label={l.label} color={l.color} count={l.count} trip={l.trip}
            reverse={l.reverse} bend={l.bend} inset={inset} startAt={startAt} stopAt={off ? startAt : l.stopAt} width={6} />
        );
      })}
      {p.links.map((l, i) => {
        // wireless links get their label here (FlowPath labels itself)
        if (l.effect !== 'waves' || !l.label || !pos[l.from] || !pos[l.to]) return null;
        return <LinkLabel key={`w${i}`} x={(pos[l.from].x + pos[l.to].x) / 2} y={(pos[l.from].y + pos[l.to].y) / 2 - 7} at={linkStart(p, l)} text={l.label} />;
      })}
      {p.devices.map((d, i) => (
        <div key={i} style={{position: 'absolute', left: `${pos[i].x}%`, top: `${pos[i].y}%`, transform: `translate(-50%, ${(-size / 2) * u}px)`}}>
          <Device kind={d.kind} label={d.label} state={states[i]} color={d.color} glow={d.glow} size={size} appearAt={appearOf(p, i)} />
        </div>
      ))}
    </AbsoluteFill>
  );
};

const LinkLabel: FC<{x: number; y: number; at: number; text: string}> = ({x, y, at, text}) => {
  const f = useCurrentFrame();
  const u = useUnit();
  const o = interpolate(f, [at, at + 10], [0, 1], {extrapolateLeft: 'clamp', extrapolateRight: 'clamp'});
  return (
    <div style={{position: 'absolute', left: `${x}%`, top: `${y}%`, transform: 'translate(-50%, -50%)', opacity: o, padding: `${5 * u}px ${14 * u}px`,
      borderRadius: 10 * u, background: PAPER.card, border: `1px solid ${PAPER.track}`, color: PAPER.ink, fontSize: 26 * u, fontWeight: 600, whiteSpace: 'nowrap'}}>
      {text}
    </div>
  );
};

/* ------------------------------------------------------------------------- 3D */

const SPACING = 2.7;

const Connection3D: FC<{p: Parsed}> = ({p}) => {
  const f = useCurrentFrame();
  const {fps, width: W, height: H} = useVideoConfig();
  const theme = useTheme();
  const u = useUnit();
  const states = useStates(p);
  const n = p.devices.length;
  const xs = p.devices.map((_, i) => (i - (n - 1) / 2) * SPACING);
  const span = (n - 1) * SPACING + 2;
  const fov = 32;
  const halfH = Math.tan(((fov / 2) * Math.PI) / 180);
  const camZ = Math.max(5.2, (span / 2 / (halfH * (W / H))) * 1.08);
  const camY = 1.2 + p.tilt * 3;
  const aimY = 0.55;

  const camera = new THREE.PerspectiveCamera(fov, W / H, 0.1, 100);
  camera.position.set(0, camY, camZ);
  camera.lookAt(0, aimY, 0);
  camera.updateMatrixWorld();
  const project = (v: V3) => {
    const q = new THREE.Vector3(...v).project(camera);
    return {x: ((q.x + 1) / 2) * 100, y: ((1 - q.y) / 2) * 100};
  };

  const cablePath = (a: number, b: number, k: number): V3[] => {
    const dir = Math.sign(xs[b] - xs[a]) || 1;
    const z = 0.55 + 0.35 * (Math.abs(b - a) - 1) + k * 0.12;
    return [[xs[a] + dir * 0.75, 0.14, 0.25], [xs[a] + dir * 1.0, 0.03, z], [xs[b] - dir * 1.0, 0.03, z], [xs[b] - dir * 0.75, 0.14, 0.25]];
  };
  const paths = useMemo(() => p.links.map((l, i) => (xs[l.from] === undefined || xs[l.to] === undefined ? null : cablePath(l.from, l.to, i))),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [JSON.stringify(p.links), n]);

  return (
    <AbsoluteFill>
      <ThreeCanvas width={W} height={H} camera={camera} gl={{antialias: true}}>
        <ambientLight intensity={1.7} />
        {p.links.map((l, i) => {
          const path = paths[i];
          if (!path) return null;
          const startAt = linkStart(p, l);
          const off = states[l.from] === 'off' || states[l.to] === 'off' || (l.stopAt !== undefined && f >= l.stopAt);
          const shown = f >= startAt;
          const look = makeLook(off ? 'off' : 'active', Math.max(0, f - startAt) / fps, l.color ?? theme.accent);
          if (l.effect === 'waves') {
            const [a, b] = l.reverse ? [l.to, l.from] : [l.from, l.to];
            return shown ? (
              <Waves3D key={i} look={look} p={[xs[a], 0.9, 0]} yaw={xs[b] > xs[a] ? 0 : Math.PI} spread={Math.PI / 3}
                reach={Math.abs(xs[b] - xs[a]) - 0.7} count={l.count ?? 4} speed={1.4 / l.trip} color={l.color} />
            ) : null;
          }
          const route = l.reverse ? [...path].reverse() : path;
          const effect = l.effect === 'bits' ? 'packet' : l.effect === 'none' ? 'dot' : l.effect;
          return shown ? (
            <Flow3D key={i} look={look} path={route} effect={effect} count={l.effect === 'none' ? 0 : l.count} speed={1 / l.trip}
              color={l.color} cableR={l.effect === 'light' ? 0.03 : 0.035} />
          ) : null;
        })}
      </ThreeCanvas>
      {p.devices.map((d, i) => {
        const local = f - appearOf(p, i);
        const pop = spring({frame: local, fps, config: {damping: 14}});
        const shake = states[i] === 'error' ? Math.sin(local * 1.6) * 4 * u * Math.max(0, 1 - (local % fps) / 12) : 0;
        const at = project([xs[i], 0, 0]);
        const top = project([xs[i], 1.78, 0]);
        const h = (at.y - top.y) * H / 100;
        const cx = at.x * W / 100 + shake;
        const by = at.y * H / 100;
        return (
          <div key={i} style={{position: 'absolute', inset: 0, opacity: Math.min(1, pop), pointerEvents: 'none'}}>
            <PaperDeviceArt kind={d.kind} cx={cx} by={by} w={h * 1.26 * Math.max(0.01, pop)} h={h * Math.max(0.01, pop)}
              u={u} state={states[i]} color={d.color} glow={d.glow} time={Math.max(0, local) / fps}/>
            {d.label ? <span style={{position: 'absolute', left: cx, top: by + 14 * u,
              transform: 'translateX(-50%)', maxWidth: W / n, textAlign: 'center', overflowWrap: 'anywhere',
              fontSize: Math.min(30 * u, W / n / 5), fontWeight: 600, color: states[i] === 'off' ? theme.muted : theme.text}}>{d.label}</span> : null}
          </div>
        );
      })}
      {p.links.map((l, i) => {
        if (!l.label || !paths[i]) return null;
        const mid: V3 = l.effect === 'waves' ? [(xs[l.from] + xs[l.to]) / 2, 1.55, 0] : [(xs[l.from] + xs[l.to]) / 2, 0.35, paths[i]![1][2]];
        const at = project(mid);
        return <LinkLabel key={`l${i}`} x={at.x} y={at.y} at={linkStart(p, l)} text={l.label} />;
      })}
    </AbsoluteFill>
  );
};

/* ---------------------------------------------------------------------- scene */

export const ConnectionScene: FC<z.input<typeof connectionSceneSchema>> = (input) => {
  const p = connectionSceneSchema.parse(input);
  const f = useCurrentFrame();
  const {fps} = useVideoConfig();
  const theme = useTheme();
  const u = useUnit();
  return (
    <AbsoluteFill>
      {p.mode === '3d' ? <Connection3D p={p} /> : <Connection2D p={p} />}
      {p.title ? (
        <h2 style={{position: 'absolute', top: 70 * u, width: '100%', margin: 0, fontSize: 72 * u, fontWeight: 800, color: theme.text, textAlign: 'center',
          ...entrance('fade-up', f, fps, u)}}>{p.title}</h2>
      ) : null}
      {p.caption ? (
        <p style={{position: 'absolute', bottom: 70 * u, width: '100%', margin: 0, fontSize: 38 * u, color: theme.muted, textAlign: 'center',
          ...entrance('fade-up', f - 30, fps, u)}}>{p.caption}</p>
      ) : null}
      {p.pointer ? <Pointer {...p.pointer} /> : null}
    </AbsoluteFill>
  );
};
