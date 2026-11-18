import {AbsoluteFill, useCurrentFrame, useVideoConfig} from 'remotion';
import {z} from 'zod';
import {PaperDeviceArt} from '../components/PaperDeviceArt';
import {PAPER, ISO_COLORS} from '../iso/iso';
import {deviceKindSchema} from '../components/Device';
import {useTheme} from '../theme';

const frameNumber = z.number().int().nonnegative();
export const infrastructureObjectSchema = z.object({
  kind: deviceKindSchema.default('building'), // any of the 65 device kinds
  label: z.string().max(40).optional(),
  size: z.enum(['small', 'medium', 'large']).default('medium'),
  scale: z.number().min(0.25).max(2).default(1),
  width: z.number().min(0.4).max(1.8).default(1),
  height: z.number().min(0.4).max(1.8).default(1),
  x: z.number().min(0).max(100).optional(),
  y: z.number().min(0).max(100).default(76),
  color: z.string().optional(), // body colour
  glow: z.string().optional(), // screen / LED colour
  delay: frameNumber.optional(),
  growFrames: z.number().int().min(1).optional(),
  disappearAt: frameNumber.optional(),
});
export const infrastructureSceneSchema = z.object({
  title: z.string().default('Infrastructure, built step by step'),
  caption: z.string().default('Buildings, servers, and devices — ready for your next explanation.'),
  preset: z.enum(['city', 'technology', 'mixed']).default('mixed'),
  objects: z.array(infrastructureObjectSchema).max(12).optional(),
  scale: z.number().min(0.25).max(1.5).default(1),
  stagger: frameNumber.default(10),
  growFrames: z.number().int().min(1).default(28),
  disappear: z.boolean().default(true),
  disappearAt: frameNumber.optional(),
  disappearFrames: z.number().int().min(1).default(22),
  showLabels: z.boolean().default(true),
  showPlatform: z.boolean().default(true),
  animation: z.enum(['grow', 'fade', 'none']).default('grow'),
});
export type InfrastructureSceneProps = z.input<typeof infrastructureSceneSchema>;
export const description = 'Buildings and technology objects grow from their base, hold, then disappear with configurable sizes and timing.';
export const tags = ['building', 'city', 'server', 'computer', 'laptop', 'router', 'infrastructure'];
const presets: Record<'city' | 'technology' | 'mixed', z.input<typeof infrastructureObjectSchema>[]> = {
  city: [
    {kind: 'building', label: 'Small office', size: 'small', color: ISO_COLORS.sky},
    {kind: 'building', label: 'Headquarters', size: 'large', color: ISO_COLORS.lavender},
    {kind: 'building', label: 'Apartments', height: 1.2, color: ISO_COLORS.mint},
    {kind: 'building', label: 'Studio', size: 'small', width: 1.3, color: ISO_COLORS.peach},
  ],
  technology: [
    {kind: 'server', label: 'Server rack'},
    {kind: 'computer', label: 'Desktop'},
    {kind: 'laptop', label: 'Laptop'},
    {kind: 'router', label: 'Router'},
  ],
  mixed: [
    {kind: 'building', label: 'Office', size: 'large', color: ISO_COLORS.lavender},
    {kind: 'server', label: 'Server'},
    {kind: 'computer', label: 'Computer'},
    {kind: 'router', label: 'Network'},
  ],
};
const smooth = (value: number) => {
  const p = Math.max(0, Math.min(1, value));
  return p * p * (3 - 2 * p);
};

export const InfrastructureScene: React.FC<InfrastructureSceneProps> = (input) => {
  const props = infrastructureSceneSchema.parse(input);
  const frame = useCurrentFrame();
  const {width, height, durationInFrames, fps} = useVideoConfig();
  const theme = useTheme();
  const objects = props.objects ?? presets[props.preset].map(o => infrastructureObjectSchema.parse(o));
  const exitStart = props.disappearAt ?? Math.max(0, durationInFrames - props.disappearFrames - 1);
  const u = Math.min(width / 1920, height / 1080);
  const columns = width < height ? Math.min(4, Math.max(1, objects.length)) : Math.min(8, Math.max(1, objects.length));
  const rows = Math.max(1, Math.ceil(objects.length / columns));
  const slot = width * 0.86 / columns;
  const rowH = height * 0.52 / rows;
  const states = objects.map((o, i) => {
    const start = o.delay ?? i * props.stagger;
    const grow = smooth((frame - start) / (o.growFrames ?? props.growFrames));
    const out = props.disappear ? smooth((frame - (o.disappearAt ?? exitStart)) / props.disappearFrames) : 0;
    const visibility = props.animation === 'none' ? (frame >= start ? 1 - out : 0) : grow * (1 - out);
    const size = {small: 0.72, medium: 1, large: 1.28}[o.size];
    const scale = size * o.scale * props.scale;
    const w = Math.min(slot * 0.88, 265 * u * scale * o.width);
    const h = Math.min(rowH * 0.72, 340 * u * scale * o.height);
    const row = Math.floor(i / columns);
    const count = Math.min(columns, objects.length - row * columns);
    const cx = o.x === undefined ? width / 2 + (i % columns - (count - 1) / 2) * slot :
      Math.max(w / 2 + 10 * u, Math.min(width - w / 2 - 10 * u, width * o.x / 100));
    const by = height * 0.22 + rowH * (row + 0.86) - (rows === 1 ? (o.y - 76) * 3 * u : 0);
    return {o, visibility, w, h, cx, by};
  });
  return <AbsoluteFill>
    <div style={{position: 'absolute', top: height * 0.075, left: width * 0.075, right: width * 0.075}}>
      <div style={{fontSize: 17 * u, letterSpacing: 5 * u, color: theme.accent, marginBottom: 22 * u}}>INFRASTRUCTURE / {props.preset === 'city' ? 'ARCHITECTURE' : 'SYSTEMS'}</div>
      <div style={{fontSize: 58 * u, fontWeight: 600, color: theme.text, letterSpacing: -1.6 * u}}>{props.title}</div>
    </div>
    {states.map(({o, visibility, w, h, cx, by}, i) => <div key={i} style={{position: 'absolute', inset: 0, opacity: visibility}}>
      {props.showPlatform ? <div style={{position: 'absolute', left: cx - w / 2, top: by - 12 * u, width: w, height: 23 * u,
        borderRadius: '50%', border: `1px solid ${PAPER.track}`, background: PAPER.card}}/> : null}
      <PaperDeviceArt kind={o.kind} color={o.color} glow={o.glow} cx={cx} by={by} w={w} h={h * (props.animation === 'grow' ? Math.max(0.01, visibility) : 1)}
        u={u} time={frame / fps} state={o.glow ? 'active' : 'on'}/>
      {props.showLabels ? <div style={{position: 'absolute', left: Math.max(0, Math.min(width - slot, cx - slot / 2)), width: slot,
        top: by + 20 * u, textAlign: 'center', color: theme.muted, fontSize: Math.min(25 * u, slot / 5), overflowWrap: 'anywhere'}}>
        {o.label ?? o.kind}
      </div> : null}
    </div>)}
    {props.caption ? <div style={{position: 'absolute', left: '7.5%', right: '7.5%', bottom: height * 0.065, borderTop: `1px solid ${PAPER.track}`, paddingTop: 24 * u, fontSize: 22 * u, color: theme.muted}}>{props.caption}</div> : null}
  </AbsoluteFill>;
};

export const BuildingScene: React.FC<InfrastructureSceneProps> = (props) => <InfrastructureScene preset="city" title="A city takes shape" caption="Different sizes. One connected city." {...props}/>;
export const TechnologyScene: React.FC<InfrastructureSceneProps> = (props) => <InfrastructureScene preset="technology" title="The hardware behind the network" caption="Servers, computers, and routers working together." {...props}/>;
