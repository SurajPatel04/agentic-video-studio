import {AbsoluteFill, useCurrentFrame, useVideoConfig} from 'remotion';
import {z} from 'zod';
import {entrance} from '../animation';
import {device3DKindSchema, deviceStateSchema} from '../components/Device';
import {Device3D} from '../components/Device3D';
import {Pointer, pointerSchema} from '../components/Pointer';
import {useTheme, useUnit} from '../theme';

const frame = z.number().int().nonnegative();

export const device3DSceneSchema = z.object({
  title: z.string().optional(),
  caption: z.string().optional(),
  // Up to 8: each 3D device uses its own WebGL view.
  devices: z
    .array(
      z.object({
        kind: device3DKindSchema,
        label: z.string().max(30).optional(),
        state: deviceStateSchema.default('on'),
        color: z.string().optional(), // body colour
        glow: z.string().optional(), // screen / LED / light colour for this device
        appearAt: frame.optional(),
      }).strict(),
    )
    .min(1)
    .max(8)
    .default([
      {kind: 'mouse', label: 'Mouse', state: 'on'},
      {kind: 'keyboard', label: 'Keyboard', state: 'on'},
      {kind: 'computer', label: 'Computer', state: 'active'},
      {kind: 'tv', label: 'Smart TV', state: 'off'},
    ]),
  changes: z.array(z.object({index: z.number().int().nonnegative(), at: frame, state: deviceStateSchema}).strict()).default([]),
  columns: z.number().int().min(1).max(4).optional(),
  size: z.number().min(160).max(900).optional(), // default depends on how many devices
  motion: z.enum(['sway', 'spin', 'still']).default('sway'), // sway keeps the front visible
  spin: z.number().min(-3).max(3).default(0.35), // sway/spin speed
  tilt: z.number().min(0).max(1).default(0.35),
  startAt: frame.default(8),
  stagger: frame.default(8),
  pointer: pointerSchema.optional(),
});

export const description =
  'Realistic 3D devices (mouse, keyboard, TV, router, phone, server, bulb, car, ... any of 65 kinds) on a turntable with labels; states off/on/active/error, state changes at frames, and an optional mouse pointer that moves and clicks.';
export const tags = ['3d', 'devices', 'hardware', 'computer', 'network', 'electronics', 'pointer', 'mouse'];

export const Device3DScene: React.FC<z.input<typeof device3DSceneSchema>> = (input) => {
  const p = device3DSceneSchema.parse(input);
  const f = useCurrentFrame();
  const {fps} = useVideoConfig();
  const theme = useTheme();
  const u = useUnit();
  const n = p.devices.length;
  const columns = p.columns ?? Math.min(4, n);
  const size = p.size ?? (n === 1 ? 640 : n === 2 ? 520 : n <= 4 ? 380 : 330);

  const stateAt = (i: number) => {
    let s = p.devices[i].state;
    for (const c of [...p.changes].sort((a, b) => a.at - b.at)) if (c.index === i && f >= c.at) s = c.state;
    return s;
  };

  return (
    <AbsoluteFill>
      <AbsoluteFill style={{padding: 70 * u, gap: 26 * u, justifyContent: 'center', alignItems: 'center'}}>
        {p.title ? (
          <h2 style={{margin: 0, fontSize: 72 * u, fontWeight: 800, color: theme.text, textAlign: 'center', ...entrance('fade-up', f, fps, u)}}>{p.title}</h2>
        ) : null}
        <div style={{display: 'grid', gridTemplateColumns: `repeat(${columns}, auto)`, columnGap: 30 * u, rowGap: 10 * u, justifyContent: 'center'}}>
          {p.devices.map((d, i) => (
            <Device3D
              key={i}
              kind={d.kind}
              label={d.label}
              state={stateAt(i)}
              color={d.color}
              glow={d.glow}
              size={size}
              motion={p.motion}
              spin={p.spin}
              tilt={p.tilt}
              yaw={-0.45 + ((i % 3) - 1) * 0.2}
              appearAt={d.appearAt ?? p.startAt + i * p.stagger}
            />
          ))}
        </div>
        {p.caption ? (
          <p style={{margin: 0, fontSize: 38 * u, color: theme.muted, textAlign: 'center', ...entrance('fade-up', f - 30, fps, u)}}>{p.caption}</p>
        ) : null}
      </AbsoluteFill>
      {p.pointer ? <Pointer {...p.pointer} /> : null}
    </AbsoluteFill>
  );
};
