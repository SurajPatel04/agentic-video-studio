import {useId, type FC} from 'react';
import {IsoIcon, isoKindFor} from '../iso/IsoIcon';
import {PAPER} from '../iso/iso';
import type {DeviceKind, DeviceState} from './Device';

const aliases: Partial<Record<DeviceKind, string>> = {
  computer: 'client', monitor: 'client', tablet: 'phone', modem: 'router',
  hub: 'router', switch: 'router', 'access-point': 'router', wifi: 'router',
  'load-balancer': 'loadbalancer', 'cell-tower': 'tower', 'data-center': 'server',
  internet: 'globe', isp: 'cloud', ram: 'memory', office: 'building', microphone: 'mic',
};

export const PaperDeviceArt: FC<{
  kind: DeviceKind; cx: number; by: number; w: number; h: number; u: number;
  state?: DeviceState; color?: string; glow?: string; time?: number; shadow?: boolean;
}> = ({kind, cx, by, w, h, u, state = 'on', color, glow, time, shadow}) => {
  const id = useId();
  const k = aliases[kind] ?? isoKindFor(kind, 'tile');
  const body = color && /^#[\da-f]{3}$/i.test(color) ? '#' + [...color.slice(1)].map(c => c.repeat(2)).join('') :
    color && /^#[\da-f]{6}$/i.test(color) ? color : undefined;
  return <div style={{position: 'absolute', inset: 0, pointerEvents: 'none',
    filter: state === 'active' && glow ? `drop-shadow(0 0 ${6 * u}px ${glow})` : undefined}}>
    <IsoIcon id={id} kind={k} icon={kind} cx={cx} by={by} w={w} h={h} u={u}
    color={state === 'error' ? PAPER.bad : state === 'off' ? PAPER.track : body}
    time={time} highlight={state === 'active' ? 0.65 : 0} shadow={shadow}/>
  </div>;
};
