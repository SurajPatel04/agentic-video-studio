import {useThree} from '@react-three/fiber';
import {ThreeCanvas} from '@remotion/three';
import type {CSSProperties, FC} from 'react';
import {useMemo} from 'react';
import {interpolate, spring, useCurrentFrame, useVideoConfig} from 'remotion';
import * as THREE from 'three';
import {RoomEnvironment} from 'three/examples/jsm/environments/RoomEnvironment.js';
import type {Device3DKind, DeviceState} from './Device';
import {DeviceModel} from './three/DeviceModel';
import {makeLook} from './three/parts';
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
  motion?: 'sway' | 'spin' | 'still'; // sway = rock gently, front stays visible; spin = full turntable
  spin?: number; // speed: sway cycles or spin radians per second
  tilt?: number; // camera height: 0 = eye level, 1 = high
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

let shadowTexture: THREE.Texture | null = null;
/** Soft round contact shadow (a radial gradient), cheaper and steadier than real shadows. */
export const ContactShadow: FC<{opacity: number}> = ({opacity}) => {
  if (!shadowTexture) {
    const c = document.createElement('canvas');
    c.width = c.height = 128;
    const ctx = c.getContext('2d')!;
    const g = ctx.createRadialGradient(64, 64, 0, 64, 64, 64);
    g.addColorStop(0, 'rgba(0,0,0,0.55)');
    g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 128, 128);
    shadowTexture = new THREE.CanvasTexture(c);
  }
  return (
    <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.001, 0]} scale={[2.3, 1.7, 1]}>
      <planeGeometry args={[1, 1]} />
      <meshBasicMaterial map={shadowTexture} transparent opacity={opacity} depthWrite={false} />
    </mesh>
  );
};

export const CameraAim: FC<{y: number}> = ({y}) => {
  const camera = useThree((s) => s.camera);
  camera.lookAt(0, y, 0);
  camera.updateMatrixWorld();
  return null;
};

/** A realistic 3D device in its own little studio, usable anywhere in a 2D layout. */
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
  const look = makeLook(state, t, glow ?? theme.accent, color);
  const px = Math.round(size * u);
  const shake = state === 'error' ? Math.sin(local * 1.6) * 0.03 * Math.max(0, 1 - (local % fps) / 12) : 0;
  const camY = 0.9 + tilt * 1.6;
  const turn = motion === 'spin' ? t * spin : motion === 'sway' ? Math.sin(t * spin * 2) * 0.5 : 0;

  return (
    <div style={{display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6 * u, opacity: interpolate(pop, [0, 1], [0, 1]), ...style}}>
      <ThreeCanvas width={px} height={px} camera={{position: [0, camY, 3.9], fov: 34}} gl={{antialias: true}}>
        <CameraAim y={0.62} />
        <Environment />
        <hemisphereLight args={['#dfe9ff', '#1a1f29', 0.6]} />
        <directionalLight position={[2.5, 4, 3]} intensity={1.6} />
        <directionalLight position={[-3, 2, -2]} intensity={0.8} color={theme.accent} />
        <group scale={interpolate(pop, [0, 1], [0.6, 1])}>
          <ContactShadow opacity={0.9} />
          <group position={[shake, 0, 0]} rotation={[0, yaw + turn, 0]}>
            <DeviceModel kind={kind} look={look} />
          </group>
        </group>
      </ThreeCanvas>
      {label ? (
        <span style={{fontSize: 30 * u, fontWeight: 600, color: state === 'off' ? theme.muted : theme.text, whiteSpace: 'nowrap', ...labelStyle}}>
          {label}
        </span>
      ) : null}
      <Sfx sound="pop" at={appearAt} volume={0.35} />
    </div>
  );
};
