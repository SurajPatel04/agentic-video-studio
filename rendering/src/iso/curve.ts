/** Quadratic Bézier helpers for curved, animated links: points by arc length so motion is even. */
import type {Pt} from './iso';

export type Curve = {a: Pt; c: Pt; b: Pt; table: number[]; length: number};

const at = (a: Pt, c: Pt, b: Pt, t: number): Pt => {
  const m = 1 - t;
  return {x: m * m * a.x + 2 * m * t * c.x + t * t * b.x, y: m * m * a.y + 2 * m * t * c.y + t * t * b.y};
};

export const curve = (a: Pt, c: Pt, b: Pt): Curve => {
  const table = [0];
  let prev = a, length = 0;
  for (let i = 1; i <= 40; i++) {
    const p = at(a, c, b, i / 40);
    length += Math.hypot(p.x - prev.x, p.y - prev.y);
    table.push(length);
    prev = p;
  }
  return {a, c, b, table, length};
};

/** t (0..1) for a fraction of the curve's length. */
const tAt = (k: Curve, s: number) => {
  const target = Math.max(0, Math.min(1, s)) * k.length;
  let i = 1;
  while (i < k.table.length && k.table[i] < target) i++;
  const l0 = k.table[i - 1], l1 = k.table[Math.min(i, k.table.length - 1)];
  return (i - 1 + (l1 > l0 ? (target - l0) / (l1 - l0) : 0)) / 40;
};

/** Point and direction (radians) at a fraction s of the curve's length. */
export const along = (k: Curve, s: number): {p: Pt; angle: number} => {
  const t = tAt(k, s);
  const p = at(k.a, k.c, k.b, t);
  const m = 1 - t;
  const dx = 2 * m * (k.c.x - k.a.x) + 2 * t * (k.b.x - k.c.x), dy = 2 * m * (k.c.y - k.a.y) + 2 * t * (k.b.y - k.c.y);
  return {p, angle: Math.atan2(dy, dx)};
};

/** SVG path of the part of the curve from 0 to fraction s (de Casteljau split). */
export const pathTo = (k: Curve, s: number) => {
  const t = tAt(k, s);
  const q0 = {x: k.a.x + (k.c.x - k.a.x) * t, y: k.a.y + (k.c.y - k.a.y) * t};
  const end = at(k.a, k.c, k.b, t);
  return `M${k.a.x.toFixed(1)},${k.a.y.toFixed(1)} Q${q0.x.toFixed(1)},${q0.y.toFixed(1)} ${end.x.toFixed(1)},${end.y.toFixed(1)}`;
};

/** Control point for a link from a to b bent sideways by `bend` × distance. */
export const bendPoint = (a: Pt, b: Pt, bend: number): Pt => {
  const mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2;
  const dx = b.x - a.x, dy = b.y - a.y, d = Math.hypot(dx, dy) || 1;
  return {x: mx + (-dy / d) * bend * d, y: my + (dx / d) * bend * d};
};

export const sample = (k: Curve, n = 16): Pt[] => Array.from({length: n - 1}, (_, i) => at(k.a, k.c, k.b, (i + 1) / n));
