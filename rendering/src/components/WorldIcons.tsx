import type {FC} from 'react';
import {useCurrentFrame, useVideoConfig} from 'remotion';
import {Vector3, type Camera} from 'three';
import type {DeviceKind, DeviceState} from './Device';
import type {Point3} from './networkLayout';
import {PaperDeviceArt} from './PaperDeviceArt';

export type WorldIcon = {kind: DeviceKind; position: Point3; size: number; opacity?: number; state?: DeviceState};

export const WorldIcons: FC<{camera: Camera; width: number; height: number; icons: WorldIcon[]}> = ({camera, width, height, icons}) => {
  const frame = useCurrentFrame();
  const {fps} = useVideoConfig();
  return <>{icons.map(({kind, position, size, opacity = 1, state}, i) => {
    if (opacity <= 0) return null;
    const base = new Vector3(...position).project(camera);
    const top = new Vector3(position[0], position[1] + size, position[2]).project(camera);
    const h = (top.y - base.y) * height / 2;
    if (h <= 0 || base.z < -1 || base.z > 1) return null;
    return <div key={i} style={{position: 'absolute', inset: 0, pointerEvents: 'none', opacity, zIndex: Math.round((1 - base.z) * 100)}}>
      <PaperDeviceArt kind={kind} cx={(base.x + 1) * width / 2} by={(1 - base.y) * height / 2}
        w={h * 1.22} h={h} u={Math.max(0.35, h / 160)} state={state} time={frame / fps}/>
    </div>;
  })}</>;
};
