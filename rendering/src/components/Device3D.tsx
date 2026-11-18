import {useThree} from '@react-three/fiber';
import type {CSSProperties, FC} from 'react';
import {useMemo} from 'react';
import {interpolate, spring, useCurrentFrame, useVideoConfig} from 'remotion';
import * as THREE from 'three';
import {RoomEnvironment} from 'three/examples/jsm/environments/RoomEnvironment.js';
import type {Device3DKind, DeviceState} from './Device';
import {PaperDeviceArt} from './PaperDeviceArt';
import {useTheme, useUnit} from '../theme';
import {Sfx} from '../audio';

export type Device3DProps = {
  kind: Device3DKind;
  label?: string;
  state?: DeviceState;
  size?: number; // square viewport in 1080p pixels (scaled with the video)
  color?: string; // body colour override
  glow?: string; // screen / LED / light colour (default: theme accent)
  appearAt?: number; // frame the device pops in
  yaw?: number; // base angle in radians (default: three-quarter view)
  motion?: 'sway' | 'spin' | 'still'; // sway = rock gently, front stays visible; spin = continuous rocking cycle
  spin?: number; // speed: sway cycles or spin radians per second
  tilt?: number; // vertical perspective adjustment
  style?: CSSProperties;
  labelStyle?: CSSProperties;
};

/** Studio reflections: a soft room environment map so metal and gloss catch highlights. */
export const Environment: FC = () => {
  const {gl, scene} = useThree();
  useMemo(() => {
    if (scene.environment) return; // one per canvas, even if many components ask for it
    const pmrem = new THREE.PMREMGenerator(gl);
    scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    pmrem.dispose();
  }, [gl, scene]);
  return null;
};

/** The shared paper isometric device in a square viewport. */
export const Device3D: FC<Device3DProps> = ({
  kind,
  label,
  state = 'on',
  size = 320,
  color,
  glow,
  appearAt = 0,
  yaw = -0.45,
  motion = 'sway',
  spin = 0.35,
  tilt = 0.35,
  style,
  labelStyle,
}) => {
  const frame = useCurrentFrame();
  const {fps} = useVideoConfig();
  const theme = useTheme();
  const u = useUnit();
  const local = frame - appearAt;
  const t = Math.max(0, local) / fps;
  const pop = spring({frame: local, fps, config: {damping: 14}});
  const px = Math.round(size * u);
  const shake = state === 'error' ? Math.sin(local * 1.6) * 0.03 * Math.max(0, 1 - (local % fps) / 12) : 0;
  const turn = motion === 'spin' ? t * spin : motion === 'sway' ? Math.sin(t * spin * 2) * 0.5 : 0;

  const scale = interpolate(pop, [0, 1], [0.6, 1]);
  const angle = motion === 'still' ? 0 : Math.sin(yaw + turn) * 5;

  return (
    <div style={{display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6 * u, opacity: interpolate(pop, [0, 1], [0, 1]), ...style}}>
      <div style={{position: 'relative', width: px, height: px,
        transform: `translateX(${shake * px}px) scale(${scale}) perspective(${px * 2}px) rotateX(${(tilt - 0.35) * 12}deg) rotate(${angle}deg)`}}>
        <PaperDeviceArt kind={kind} cx={px / 2} by={px * 0.79} w={px * 0.84} h={px * 0.68}
          u={u} state={state} color={color} glow={glow} time={t}/>
      </div>
      {label ? (
        <span style={{fontSize: 30 * u, fontWeight: 600, color: state === 'off' ? theme.muted : theme.text, whiteSpace: 'nowrap', ...labelStyle}}>
          {label}
        </span>
      ) : null}
      <Sfx sound="pop" at={appearAt} volume={0.35} />
    </div>
  );
};
