/**
 * IsoIcon: draw one isometric object (any IsoScene kind that is "art") fitted into a w x h box whose
 * bottom-centre sits at (cx, by) in screen px. Lets other scenes (packets, pipelines...) use the same
 * 3D paper objects as IsoScene instead of flat icons.
 */
import type {FC} from 'react';
import {KINDS} from '../scenes/IsoScene';
import {C30, ISO_COLORS, PAPER, S30} from './iso';
import {IsoArt, type ArtKind} from './objects';

type KindInfo = {shape: string; size: [number, number, number]; color: keyof typeof ISO_COLORS};
const TABLE = KINDS as unknown as Record<string, KindInfo>;
export const isArtKind = (k: string) => TABLE[k]?.shape === 'art';

/** Pick an iso kind from a device / step name ("Home router" -> router, "ISP" -> cloud). */
const BY_NAME: [RegExp, string][] = [
  [/router|gateway|modem/i, 'router'], [/load ?balancer|\blb\b/i, 'loadbalancer'], [/firewall|vpn|tls|secure/i, 'lock'], [/dns|resolver|name ?server/i, 'server'],
  [/database|\bdb\b|sql|postgres|mysql|warehouse|table/i, 'database'], [/storage|disk|s3|bucket|lake/i, 'storage'], [/cache|cdn|redis/i, 'cache'], [/queue|kafka|broker/i, 'queue'],
  [/\bapi\b|endpoint|gateway/i, 'api'], [/server|host|backend|web ?app|service/i, 'server'], [/cloud|isp|internet|network|wan/i, 'cloud'],
  [/phone|mobile|smartphone/i, 'phone'], [/tower|cell|wifi|wireless|antenna/i, 'tower'], [/satellite/i, 'satellite'], [/laptop|computer|pc|browser|client|you\b|user|home/i, 'laptop'],
  [/monitor|desktop|screen/i, 'client'], [/file|csv|json|document/i, 'file'], [/code|script|function/i, 'code'],
];
export const isoKindFor = (name: string, fallback = 'tile') => {
  if (isArtKind(name.toLowerCase())) return name.toLowerCase();
  const hit = BY_NAME.find(([re]) => re.test(name))?.[1];
  return hit && isArtKind(hit) ? hit : fallback;
};

export const IsoIcon: FC<{kind: string; cx: number; by: number; w: number; h: number; u: number; id: string; color?: string; icon?: string; time?: number; highlight?: number; shadow?: boolean}> = ({kind, cx, by, w, h, u, id, color, icon, time = 0, highlight = 0, shadow = true}) => {
  const k = isArtKind(kind) ? kind : 'tile';
  const [gw, gd, gh] = TABLE[k].size;
  const T = Math.min(w / ((gw + gd) * C30), h / ((gw + gd) * S30 + gh));
  const ow = (gw + gd) * C30 * T, oh = (gw + gd) * S30 * T + gh * T;
  // svg box = the object's own bounds (plus margin for glow / antennae)
  const m = 30 * u;
  const left = cx - ow / 2 - m, top = by - oh - m;
  const o = {x: ow / 2 + m - ((gw - gd) / 2) * C30 * T, y: m + oh - (gw + gd) * S30 * T};
  const fill = color ?? ISO_COLORS[TABLE[k].color] ?? ISO_COLORS.cream;
  return (
    <svg width={ow + m * 2} height={oh + m * 2} style={{position: 'absolute', left, top, overflow: 'visible', pointerEvents: 'none'}}>
      {shadow ? <ellipse cx={ow / 2 + m} cy={oh + m - 2 * u} rx={ow * 0.42} ry={ow * 0.12} fill={PAPER.shadow} /> : null}
      <IsoArt kind={k as ArtKind} id={id} g={{x: 0, y: 0, z: 0, w: gw, d: gd, h: gh}} zz={0} T={T} o={o} sw={Math.max(1.6, 2.6 * u * Math.min(1, T / (60 * u)))} color={fill} icon={k === 'tile' ? icon ?? 'box' : icon} time={time} highlight={highlight} />
    </svg>
  );
};
