import type {ComponentType, CSSProperties} from 'react';
import {
  Battery, BatteryCharging, Bot, CircuitBoard, BrickWall, Building2, Cable, Camera, Car, Cloud, Cpu, Database, Drone,
  EthernetPort, Factory, Gamepad2, Globe, HardDrive, Headphones, Hospital, House, Keyboard, Laptop, Lightbulb,
  MemoryStick, Mic, Monitor, Mouse, Network, Plug, Power, Printer, RadioTower, Router,
  Satellite, School, Server, ServerCog, Shield, Smartphone, Speaker, Split, Store, Tablet, Tv, Usb, User,
  Users, Watch, Webcam, Wifi, LockKeyhole, LockKeyholeOpen, Magnet,
} from 'lucide-react';
import {interpolate, spring, useCurrentFrame, useVideoConfig} from 'remotion';
import {z} from 'zod';
import {
  CapacitorIcon, CoaxIcon, FibreIcon, HackerIcon, HubIcon, IspIcon, ModemIcon, ResistorIcon, UnderseaCableIcon,
  type IconProps,
} from './icons';
import {useTheme, useUnit} from '../theme';
import {Sfx} from '../audio';

/** Every device any scene can show. Add a line here and it is available everywhere. */
export const DEVICE_ICONS = {
  // computers
  computer: Monitor,
  laptop: Laptop,
  phone: Smartphone,
  tablet: Tablet,
  smartwatch: Watch,
  // input / output
  mouse: Mouse,
  keyboard: Keyboard,
  monitor: Monitor,
  tv: Tv,
  printer: Printer,
  speaker: Speaker,
  headphones: Headphones,
  webcam: Webcam,
  camera: Camera,
  microphone: Mic,
  gamepad: Gamepad2,
  // network
  router: Router,
  modem: ModemIcon,
  hub: HubIcon,
  server: Server,
  switch: Network,
  'access-point': Wifi,
  wifi: Wifi,
  firewall: BrickWall,
  security: Shield,
  'load-balancer': Split,
  'cell-tower': RadioTower,
  satellite: Satellite,
  cloud: Cloud,
  internet: Globe,
  database: Database,
  'data-center': ServerCog,
  // cables / ports
  ethernet: EthernetPort,
  cable: Cable,
  usb: Usb,
  coaxial: CoaxIcon,
  fibre: FibreIcon,
  'undersea-cable': UnderseaCableIcon,
  // electronics
  cpu: Cpu,
  ram: MemoryStick,
  storage: HardDrive,
  battery: Battery,
  charging: BatteryCharging,
  bulb: Lightbulb,
  plug: Plug,
  power: Power,
  resistor: ResistorIcon,
  capacitor: CapacitorIcon,
  motherboard: CircuitBoard,
  // places
  house: House,
  building: Building2,
  office: Building2,
  school: School,
  hospital: Hospital,
  factory: Factory,
  shop: Store,
  isp: IspIcon,
  // people / other
  user: User,
  users: Users,
  robot: Bot,
  car: Car,
  drone: Drone,
  hacker: HackerIcon,
  // security / physics
  lock: LockKeyhole, // state off = open padlock
  magnet: Magnet,
} satisfies Record<string, ComponentType<IconProps>>;

export type DeviceKind = keyof typeof DEVICE_ICONS;
export const deviceKinds = Object.keys(DEVICE_ICONS) as [DeviceKind, ...DeviceKind[]];
export const deviceKindSchema = z.enum(deviceKinds);

/** 2D-only kinds (no 3D model yet). Device3D / Device3DScene accept only the other kinds. */
/** Kinds with no 3D model yet (Device3DScene rejects them). Every kind has one now. */
export const DEVICE_2D_ONLY = [] as const;
export type Device3DKind = Exclude<DeviceKind, (typeof DEVICE_2D_ONLY)[number]>;
export const device3DKinds = deviceKinds.filter((k) => !(DEVICE_2D_ONLY as readonly string[]).includes(k)) as [Device3DKind, ...Device3DKind[]];
export const device3DKindSchema = z.enum(device3DKinds);
export const deviceStateSchema = z.enum(['off', 'on', 'active', 'error']);
export type DeviceState = z.infer<typeof deviceStateSchema>;

export type DeviceProps = {
  kind: DeviceKind;
  label?: string;
  state?: DeviceState; // off = dim, on = accent, active = accent + pulse, error = red + shake
  size?: number; // tile size in 1080p pixels (scaled with the video)
  color?: string; // icon / tile colour (error still shows red)
  glow?: string; // glow + pulse-ring colour (default: same as the icon)
  appearAt?: number; // frame (relative to the scene) the device pops in
  tile?: boolean; // rounded background tile
  style?: CSSProperties;
  labelStyle?: CSSProperties;
};

const ERROR = '#ef4444';

/** One device: lucide icon in a tile, label, and frame-driven state effects. */
export const Device: React.FC<DeviceProps> = ({
  kind,
  label,
  state = 'on',
  size = 140,
  color,
  glow,
  appearAt = 0,
  tile = true,
  style,
  labelStyle,
}) => {
  const frame = useCurrentFrame();
  const {fps} = useVideoConfig();
  const theme = useTheme();
  const u = useUnit();
  const Icon = kind === 'lock' && state === 'off' ? LockKeyholeOpen : DEVICE_ICONS[kind] ?? Monitor;

  const local = frame - appearAt;
  const pop = spring({frame: local, fps, config: {damping: 14}});
  const tint = state === 'error' ? ERROR : color ?? (state === 'off' ? theme.muted : theme.accent);
  const halo = state === 'error' ? ERROR : glow ?? tint;
  const px = size * u;

  // Error: short shake every second. Active: soft breathing glow.
  const shake = state === 'error' ? Math.sin(local * 1.6) * 4 * u * Math.max(0, 1 - (local % fps) / 12) : 0;
  const breathe = state === 'active' ? 0.5 + 0.5 * Math.sin((local / fps) * Math.PI * 2) : 0;

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: 14 * u,
        opacity: interpolate(pop, [0, 1], [0, 1]),
        transform: `translateX(${shake}px) scale(${interpolate(pop, [0, 1], [0.6, 1])})`,
        ...style,
      }}
    >
      <div style={{position: 'relative', width: px, height: px}}>
        {/* active: two rings expanding outward, one second apart */}
        {state === 'active'
          ? [0, 0.5].map((offset) => {
              const t = ((local / fps + offset) % 1 + 1) % 1;
              return (
                <div
                  key={offset}
                  style={{
                    position: 'absolute',
                    inset: 0,
                    borderRadius: 28 * u,
                    border: `${3 * u}px solid ${halo}`,
                    opacity: (1 - t) * 0.7,
                    transform: `scale(${1 + t * 0.45})`,
                  }}
                />
              );
            })
          : null}
        <div
          style={{
            position: 'absolute',
            inset: 0,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            borderRadius: 28 * u,
            background: tile ? `color-mix(in srgb, ${tint} 14%, transparent)` : 'transparent',
            border: tile ? `${2 * u}px solid color-mix(in srgb, ${tint} ${state === 'off' ? 25 : 55}%, transparent)` : 'none',
            boxShadow:
              state === 'active'
                ? `0 0 ${(24 + 26 * breathe) * u}px color-mix(in srgb, ${halo} ${40 + 30 * breathe}%, transparent)`
                : 'none',
          }}
        >
          <Icon size={px * 0.56} color={tint} strokeWidth={1.8} opacity={state === 'off' ? 0.55 : 1} />
        </div>
      </div>
      {label ? (
        <span
          style={{
            fontSize: 30 * u,
            fontWeight: 600,
            color: state === 'off' ? theme.muted : theme.text,
            whiteSpace: 'nowrap',
            ...labelStyle,
          }}
        >
          {label}
        </span>
      ) : null}
      <Sfx sound="pop" at={appearAt} volume={0.35} />
    </div>
  );
};
