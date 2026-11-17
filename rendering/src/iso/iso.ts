/**
 * Isometric "paper" style: math + palette shared by the iso primitives and IsoScene.
 *
 * Grid units: x goes right-down, y goes left-down, z goes up. `project` turns a grid point into
 * screen pixels for a tile size T (pixels per grid unit) around an origin.
 */

export const C30 = Math.cos(Math.PI / 6); // 0.866
export const S30 = 0.5;

export type Pt = {x: number; y: number};

export const project = (x: number, y: number, z: number, T: number, o: Pt = {x: 0, y: 0}): Pt => ({
  x: o.x + (x - y) * C30 * T,
  y: o.y + (x + y) * S30 * T - z * T,
});

export const PAPER = {
  bg: '#f4ede2',
  bgCenter: '#f8f3ea',
  grid: 'rgba(120, 96, 70, 0.10)',
  ink: '#2b2833',
  inkSoft: '#6a6472',
  card: '#fffaf1',
  track: '#e8dfd1',
  shadow: 'rgba(70, 50, 30, 0.13)',
  good: '#6cc070',
  warn: '#f0a43a',
  bad: '#e5604f',
  glow: 'rgba(255, 176, 64, 0.95)',
  font: "'DejaVu Sans Mono', 'Noto Sans Mono', 'Liberation Mono', monospace",
  sans: "'Inter', 'DejaVu Sans', 'Segoe UI', Arial, sans-serif",
};

/** Pastel fills; faces are shaded from them (top lighter, right side darker). */
export const ISO_COLORS = {
  lavender: '#cdc3ee',
  peach: '#f7c6a3',
  mint: '#b9e2c7',
  sky: '#b8d6f3',
  butter: '#f4da93',
  rose: '#f3b9c6',
  teal: '#b0dfda',
  coral: '#f4a596',
  slate: '#d2d5de',
  cream: '#f2e9da',
} as const;
export type IsoColor = keyof typeof ISO_COLORS;
export const isoColorNames = Object.keys(ISO_COLORS) as [IsoColor, ...IsoColor[]];

const hex = (h: string) => {
  const n = parseInt(h.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
};
const toHex = (c: number[]) => '#' + c.map((v) => Math.round(Math.max(0, Math.min(255, v))).toString(16).padStart(2, '0')).join('');

/** Mix towards white (amount > 0) or black (amount < 0). */
export const shade = (color: string, amount: number) => {
  const c = hex(color);
  const target = amount > 0 ? 255 : 0;
  const a = Math.abs(amount);
  return toHex(c.map((v) => v + (target - v) * a));
};

export const mix = (a: string, b: string, t: number) => {
  const ca = hex(a), cb = hex(b);
  return toHex(ca.map((v, i) => v + (cb[i] - v) * t));
};

export const faces = (base: string) => ({top: shade(base, 0.38), left: shade(base, 0.08), right: shade(base, -0.1)});

/** Status colour: green -> amber -> red as the value rises. */
export const statusColor = (v: number) => (v < 70 ? PAPER.good : v < 88 ? PAPER.warn : PAPER.bad);

/** SVG path through `points` with rounded corners (radius r, clamped to half of each edge). */
export const roundedPath = (points: Pt[], r: number) => {
  const n = points.length;
  let d = '';
  for (let i = 0; i < n; i++) {
    const p0 = points[(i - 1 + n) % n], p1 = points[i], p2 = points[(i + 1) % n];
    const l1 = Math.hypot(p1.x - p0.x, p1.y - p0.y), l2 = Math.hypot(p2.x - p1.x, p2.y - p1.y);
    const r1 = Math.min(r, l1 / 2), r2 = Math.min(r, l2 / 2);
    const a = {x: p1.x + ((p0.x - p1.x) / l1) * r1, y: p1.y + ((p0.y - p1.y) / l1) * r1};
    const b = {x: p1.x + ((p2.x - p1.x) / l2) * r2, y: p1.y + ((p2.y - p1.y) / l2) * r2};
    d += `${i === 0 ? 'M' : 'L'}${a.x.toFixed(1)},${a.y.toFixed(1)} Q${p1.x.toFixed(1)},${p1.y.toFixed(1)} ${b.x.toFixed(1)},${b.y.toFixed(1)} `;
  }
  return d + 'Z';
};

export const poly = (pts: Pt[]) => pts.map((p) => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ');
