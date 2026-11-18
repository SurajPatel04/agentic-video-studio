import {AbsoluteFill, useCurrentFrame, useVideoConfig} from 'remotion';
import {z} from 'zod';
import {entrance} from '../animation';
import {Device, deviceKindSchema, deviceStateSchema} from '../components/Device';
import {useTheme, useUnit} from '../theme';

const frame = z.number().int().nonnegative();

export const deviceGridSceneSchema = z.object({
  title: z.string().optional(),
  caption: z.string().optional(),
  devices: z
    .array(
      z.object({
        kind: deviceKindSchema,
        label: z.string().max(30).optional(),
        state: deviceStateSchema.default('on'),
        color: z.string().optional(), // icon colour for this device
        glow: z.string().optional(), // glow / ring colour for this device
        appearAt: frame.optional(), // overrides startAt + i * stagger
      }).strict(),
    )
    .min(1)
    .max(12)
    .default([
      {kind: 'keyboard', label: 'Keyboard', state: 'on'},
      {kind: 'mouse', label: 'Mouse', state: 'on'},
      {kind: 'computer', label: 'Computer', state: 'active'},
      {kind: 'tv', label: 'TV', state: 'off'},
      {kind: 'router', label: 'Router', state: 'active'},
      {kind: 'phone', label: 'Phone', state: 'on'},
    ]),
  // Change a device's state at a frame, e.g. the TV turns on at 60.
  changes: z
    .array(z.object({index: z.number().int().nonnegative(), at: frame, state: deviceStateSchema}).strict())
    .default([{index: 3, at: 75, state: 'active'}]),
  columns: z.number().int().min(1).max(6).optional(), // default: up to 4 per row
  size: z.number().min(60).max(260).default(150),
  startAt: frame.default(10),
  stagger: frame.default(8),
  showLabels: z.boolean().default(true),
});

export const description =
  'A grid of devices (keyboard, mouse, TV, router, phone, server, ...) that pop in; each can be off/on/active/error and change state at given frames.';
export const tags = ['devices', 'hardware', 'icons', 'computer', 'network', 'electronics'];

export const DeviceGridScene: React.FC<z.input<typeof deviceGridSceneSchema>> = (input) => {
  const p = deviceGridSceneSchema.parse(input);
  const f = useCurrentFrame();
  const {fps, width, height} = useVideoConfig();
  const theme = useTheme();
  const u = useUnit();
  const portrait = height > width;
  const columns = Math.min(p.devices.length, p.columns ?? (portrait ? 3 : 4));
  const gap = portrait ? 36 : 90;
  const size = portrait ? Math.min(p.size, (width / u - 180 - (columns - 1) * gap) / columns) : p.size;

  const stateAt = (i: number) => {
    let s = p.devices[i].state;
    for (const c of [...p.changes].sort((a, b) => a.at - b.at)) if (c.index === i && f >= c.at) s = c.state;
    return s;
  };

  return (
    <AbsoluteFill style={{padding: 90 * u, gap: 50 * u, justifyContent: 'center', alignItems: 'center'}}>
      {p.title ? (
        <h2 style={{margin: 0, fontSize: 76 * u, fontWeight: 800, color: theme.text, ...entrance('fade-up', f, fps, u)}}>
          {p.title}
        </h2>
      ) : null}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: `repeat(${columns}, auto)`,
          columnGap: gap * u,
          rowGap: 60 * u,
          justifyContent: 'center',
        }}
      >
        {p.devices.map((d, i) => (
          <Device
            key={i}
            kind={d.kind}
            label={p.showLabels ? d.label : undefined}
            state={stateAt(i)}
            color={d.color}
            glow={d.glow}
            size={size}
            appearAt={d.appearAt ?? p.startAt + i * p.stagger}
          />
        ))}
      </div>
      {p.caption ? (
        <p style={{margin: 0, fontSize: 40 * u, color: theme.muted, ...entrance('fade-up', f - 30, fps, u)}}>{p.caption}</p>
      ) : null}
    </AbsoluteFill>
  );
};
