import type {FC} from 'react';
import {useLayoutEffect, useRef} from 'react';
import {useCurrentFrame, useVideoConfig} from 'remotion';
import type * as THREE from 'three';
import type {DeviceKind, DeviceState} from './Device';
import {Environment} from './Device3D';
import {DeviceModel} from './three/DeviceModel';
import {makeLook} from './three/parts';
import {useTheme} from '../theme';

/** Any device kind (all 63). Kept as its own name for the older scenes. */
export type ObjectKind = DeviceKind;

/**
 * Scale per kind so the realistic models match the footprint the older scenes were laid out
 * for (buildings ~3 units tall, servers ~2.9, desks ~2 wide). Everything else: 1.25.
 */
const FIT: Partial<Record<DeviceKind, number>> = {
  building: 1.8, office: 1.3, school: 1.3, hospital: 1.3, factory: 1.3, shop: 1.3, house: 1.5, isp: 1.6,
  server: 1.75, 'data-center': 1.3, router: 1.15, computer: 1.3, laptop: 1.35, internet: 1.4, cloud: 1.3,
};

/**
 * Realistic 3D device for the older scenes (Network, PacketJourney, Infrastructure, City,
 * ExampleCard, ZoomOut). Renders the shared DeviceModel, grounded at y = 0.
 * `color` = body colour, `glow` = screen / LED colour, `opacity` fades the whole model.
 */
export const InfrastructureObject: FC<{kind: ObjectKind; color?: string; glow?: string; opacity?: number; state?: DeviceState}> = ({
  kind, color, glow, opacity = 1, state = 'on',
}) => {
  const frame = useCurrentFrame();
  const {fps} = useVideoConfig();
  const theme = useTheme();
  const ref = useRef<THREE.Group>(null);
  const look = makeLook(state, frame / fps, glow ?? theme.accent, color);

  // Fade: scale every material's opacity (keeping each one's own base opacity).
  useLayoutEffect(() => {
    ref.current?.traverse((o) => {
      const mats = (o as THREE.Mesh).material;
      if (!mats) return;
      for (const m of Array.isArray(mats) ? mats : [mats]) {
        if (m.userData.baseOpacity === undefined) m.userData.baseOpacity = m.opacity;
        m.opacity = m.userData.baseOpacity * opacity;
        m.transparent = m.userData.baseOpacity < 1 || opacity < 1;
      }
    });
  });

  return (
    <group ref={ref} scale={FIT[kind] ?? 1.25}>
      <Environment />
      <DeviceModel kind={kind} look={look} />
    </group>
  );
};
