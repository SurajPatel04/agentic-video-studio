/**
 * Shared pieces for the paper-style data-structure scenes (Array, Stack, Hash, Tree, Graph, LinkedList,
 * EventLoop): one timeline for "micro steps", step aliases, a code card with a moving line highlight,
 * a note bar, counters and small drawing helpers.
 *
 * How the scenes work: the input steps are expanded into small "micro steps" (one comparison, one
 * pointer move...). Each micro step turns state N into state N+1; things are drawn by id, so an item
 * that moves between two states glides from its old place to the new one.
 */
import type {FC, ReactNode} from 'react';
import {z} from 'zod';
import {PAPER} from '../iso/iso';
import {MONO, clamp01, ease, flexList} from './paperStage';

export const lerp = (a: number, b: number, k: number) => a + (b - a) * k;
export type Pt = {x: number; y: number; w?: number; h?: number};
export const lerpPt = (a: Pt, b: Pt, k: number): Pt => ({x: lerp(a.x, b.x, k), y: lerp(a.y, b.y, k), w: lerp(a.w ?? 0, b.w ?? 0, k), h: lerp(a.h ?? 0, b.h ?? 0, k)});

/** Colours shared by the scenes (pastel fills + ink outline). */
export const FILL = {
  base: '#fffaf1', item: '#cdc3ee', compare: '#f4da93', swap: '#f4a596', done: '#b9e2c7', found: '#8fd19e',
  active: '#ffd7a8', soft: '#efe8dc', blue: '#b8d6f3', red: '#f3b9c6', dim: '#ece6dc', accent: '#ff7a1a', purple: '#8a6fd1', green: '#3f9a57',
};

/** A step as the scenes see it after normalising. */
export type Step = {do: string; at?: number; note?: string; line?: number} & Record<string, unknown>;
/** One schema for every step list: a verb in "do" plus free fields (checked by the scene). */
export const stepSchema = z.object({do: z.string().max(30), at: z.number().min(0).max(1).optional(), note: z.string().max(90).optional(), line: z.number().int().min(1).max(40).optional()}).catchall(z.unknown());

/**
 * Forgiving step lists: "action"/"op"/"type" -> "do", "text"/"say"/"explain" -> "note", "lineNumber" -> "line",
 * strings like "push 5" or "swap 0 3" become steps, verbs go through the scene's alias map.
 */
export const flexSteps = (raw: unknown, verbs: Record<string, string>, keys: Record<string, string> = {}) => {
  let list = raw;
  if (list && typeof list === 'object' && !Array.isArray(list)) list = [list];
  if (!Array.isArray(list)) return raw;
  list = list.map((s) => {
    if (typeof s !== 'string') return s;
    const [verb, ...rest] = s.trim().split(/[\s(),:]+/).filter(Boolean);
    return {do: verb, args: rest};
  });
  const out = flexList(list, {keys: {action: 'do', op: 'do', type: 'do', operation: 'do', verb: 'do', step: 'do', method: 'do', text: 'note', say: 'note', explain: 'note', caption: 'note', message: 'note', lineNumber: 'line', codeLine: 'line', ...keys},
    values: {do: (v) => verbs[v.replace(/[^a-z0-9]+/g, '')] ?? verbs[v] ?? v}}) as Record<string, unknown>[];
  return out.map((s) => {
    if (!s || typeof s !== 'object') return s;
    const o = {...s};
    if (typeof o.line === 'string' && o.line.trim() !== '' && !Number.isNaN(Number(o.line))) o.line = Number(o.line);
    if (typeof o.note === 'string') o.note = o.note.slice(0, 90);
    delete o.at; // micro steps are spread evenly; order is what matters
    return o;
  });
};

/**
 * Timeline for micro steps: spread over 8%..94% of the scene, at most 1.4 s each (so short lists
 * do not crawl), and at least ~0.25 s each (long lists speed up to fit).
 */
export const schedule = (count: number, len: number, fps: number, lead = 0.08) => {
  const start = Math.round(len * lead), end = Math.round(len * 0.94);
  const slot = Math.max(1, Math.min(fps * 1.4, (end - start) / Math.max(1, count)));
  const starts = Array.from({length: count}, (_, i) => start + i * slot);
  const dur = Math.max(4, Math.min(slot * 0.82, fps * 0.85));
  return {starts, dur, slot, end: start + count * slot};
};

/** Which micro step is playing at frame f, and how far along it is (eased 0..1). */
export const playhead = (f: number, starts: number[], dur: number) => {
  let c = -1;
  for (let i = 0; i < starts.length; i++) if (f >= starts[i]) c = i; else break;
  const raw = c < 0 ? 0 : clamp01((f - starts[c]) / dur);
  return {c, k: ease(raw), raw};
};

/** Code card: lines of (pseudo)code, the active line gets a highlight bar. */
export const CodeCard: FC<{lines: string[]; active?: number; x: number; y: number; w: number; h: number; u: number; title?: string; opacity?: number}> = ({lines, active, x, y, w, h, u, title = 'code', opacity = 1}) => {
  const head = 44 * u;
  const lh = Math.min(46 * u, (h - head - 20 * u) / Math.max(1, lines.length));
  const longest = Math.max(10, ...lines.map((l) => l.length));
  const font = Math.min(lh * 0.56, 24 * u, ((w - 70 * u) / longest) / 0.6);
  return (
    <div style={{position: 'absolute', left: x, top: y, width: w, height: h, borderRadius: 18 * u, background: PAPER.card, border: `${2.5 * u}px solid ${PAPER.ink}`, overflow: 'hidden', opacity, boxShadow: `0 ${8 * u}px ${18 * u}px rgba(70,50,30,0.12)`}}>
      <div style={{height: head, display: 'flex', alignItems: 'center', padding: `0 ${16 * u}px`, background: FILL.soft, borderBottom: `${2 * u}px solid ${PAPER.ink}`, fontWeight: 800, fontSize: 19 * u, fontFamily: MONO}}>{title}</div>
      <div style={{padding: `${10 * u}px 0`}}>
        {lines.map((l, i) => (
          <div key={i} style={{height: lh, display: 'flex', alignItems: 'center', fontFamily: MONO, fontSize: font, whiteSpace: 'pre', background: active === i + 1 ? '#ffe2c4' : 'transparent',
            boxShadow: active === i + 1 ? `inset ${5 * u}px 0 0 ${FILL.accent}` : undefined, fontWeight: active === i + 1 ? 800 : 500}}>
            <span style={{width: 44 * u, textAlign: 'right', paddingRight: 12 * u, color: PAPER.inkSoft, fontSize: font * 0.8, flexShrink: 0}}>{i + 1}</span>
            <span>{l}</span>
          </div>
        ))}
      </div>
    </div>
  );
};

/** The current step's note, as a pill centred at (cx, y). */
export const NoteBar: FC<{text?: string; cx: number; y: number; u: number; maxW: number; k?: number}> = ({text, cx, y, u, maxW, k = 1}) =>
  text ? (
    <div style={{position: 'absolute', left: cx - maxW / 2, top: y, width: maxW, display: 'flex', justifyContent: 'center', opacity: clamp01(k * 3)}}>
      <div style={{padding: `${10 * u}px ${24 * u}px`, borderRadius: 999, background: PAPER.ink, color: '#fffaf1', fontSize: 25 * u, fontWeight: 700, maxWidth: maxW, textAlign: 'center', lineHeight: 1.25}}>{text}</div>
    </div>
  ) : null;

/** Small counter chips ("comparisons: 4"). */
export const Counters: FC<{items: [string, string | number, string?][]; x: number; y: number; u: number; align?: 'left' | 'right'}> = ({items, x, y, u, align = 'right'}) => (
  <div style={{position: 'absolute', top: y, ...(align === 'right' ? {right: x} : {left: x}), display: 'flex', gap: 12 * u}}>
    {items.map(([label, value, color]) => (
      <div key={label} style={{padding: `${8 * u}px ${16 * u}px`, borderRadius: 12 * u, background: PAPER.card, border: `${2 * u}px solid ${PAPER.ink}`, fontSize: 21 * u, fontWeight: 700, color: PAPER.inkSoft}}>
        {label}: <span style={{color: color ?? PAPER.ink, fontFamily: MONO, fontWeight: 800}}>{value}</span>
      </div>
    ))}
  </div>
);

/** A labelled pointer arrow under (or above) an item: "i", "lo", "top". */
export const PointerTag: FC<{x: number; y: number; label: string; u: number; color?: string; up?: boolean; opacity?: number}> = ({x, y, label, u, color = FILL.accent, up = true, opacity = 1}) => (
  <div style={{position: 'absolute', left: x - 60 * u, top: up ? y : y - 74 * u, width: 120 * u, display: 'flex', flexDirection: up ? 'column' : 'column-reverse', alignItems: 'center', opacity}}>
    <svg width={28 * u} height={22 * u} viewBox="0 0 28 22" style={{transform: up ? undefined : 'rotate(180deg)'}}><path d="M14 0 L27 21 L1 21 Z" fill={color} /></svg>
    <div style={{marginTop: 4 * u, marginBottom: 4 * u, padding: `${2 * u}px ${12 * u}px`, borderRadius: 10 * u, background: color, color: '#fff', fontFamily: MONO, fontWeight: 800, fontSize: 22 * u}}>{label}</div>
  </div>
);

/** Arrow head path at the end of a line from (x1,y1) towards (x2,y2). */
export const arrowHead = (x1: number, y1: number, x2: number, y2: number, size: number) => {
  const a = Math.atan2(y2 - y1, x2 - x1);
  const p = (d: number, s: number) => `${x2 - size * Math.cos(a + s * 0.45) * d},${y2 - size * Math.sin(a + s * 0.45) * d}`;
  return `M${p(1, 1)} L${x2},${y2} L${p(1, -1)} Z`;
};

/** A card-like box (paper fill, ink border) positioned absolutely. */
export const Box: FC<{x: number; y: number; w: number; h: number; u: number; fill?: string; radius?: number; border?: string; glow?: string; opacity?: number; children?: ReactNode; style?: Record<string, unknown>}> = ({x, y, w, h, u, fill = PAPER.card, radius = 14, border = PAPER.ink, glow, opacity = 1, children, style}) => (
  <div style={{position: 'absolute', left: x, top: y, width: w, height: h, borderRadius: radius * u, background: fill, border: `${2.5 * u}px solid ${border}`, boxSizing: 'border-box', opacity,
    display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: glow ? `0 0 0 ${5 * u}px ${glow}, 0 ${6 * u}px ${14 * u}px rgba(70,50,30,0.14)` : `0 ${6 * u}px ${14 * u}px rgba(70,50,30,0.12)`, ...style}}>
    {children}
  </div>
);

/** Panel with a header label (used for stack / queue / heap areas). */
export const Panel: FC<{x: number; y: number; w: number; h: number; u: number; label: string; tint?: string; children?: ReactNode; opacity?: number; open?: 'top' | 'none'}> = ({x, y, w, h, u, label, tint = FILL.soft, children, opacity = 1}) => (
  <div style={{position: 'absolute', left: x, top: y, width: w, height: h, opacity}}>
    <div style={{position: 'absolute', inset: 0, borderRadius: 18 * u, background: 'rgba(255,250,241,0.7)', border: `${2.5 * u}px solid ${PAPER.ink}`}} />
    <div style={{position: 'absolute', left: 0, top: 0, right: 0, height: 44 * u, borderRadius: `${18 * u}px ${18 * u}px 0 0`, background: tint, borderBottom: `${2 * u}px solid ${PAPER.ink}`, display: 'flex', alignItems: 'center', padding: `0 ${16 * u}px`, fontWeight: 800, fontSize: 20 * u, whiteSpace: 'nowrap', overflow: 'hidden'}}>{label}</div>
    {children}
  </div>
);

/** Number-ish display of a value. */
export const show = (v: unknown) => (v === null || v === undefined ? 'null' : typeof v === 'string' ? v : String(v));
/** Read an int from many possible keys. */
export const intOf = (s: Record<string, unknown>, ...keys: string[]) => {
  for (const k of keys) {
    const v = s[k];
    if (typeof v === 'number' && Number.isFinite(v)) return Math.round(v);
    if (typeof v === 'string' && v.trim() !== '' && !Number.isNaN(Number(v))) return Math.round(Number(v));
  }
  return undefined;
};
/** Read a value (string/number) from many possible keys. */
export const valOf = (s: Record<string, unknown>, ...keys: string[]): string | number | undefined => {
  for (const k of keys) {
    const v = s[k];
    if (typeof v === 'number' || (typeof v === 'string' && v !== '')) return v;
    if (typeof v === 'boolean') return String(v);
  }
  return undefined;
};
/** Positional args from "push 5" style strings. */
export const argsOf = (s: Record<string, unknown>) => (Array.isArray(s.args) ? (s.args as unknown[]).map((a) => (typeof a === 'string' && a !== '' && !Number.isNaN(Number(a)) ? Number(a) : a)) : []);
/** Values list: numbers stay numbers, "5, 3, 8" becomes [5,3,8]. */
export const flexValues = (v: unknown) => {
  if (typeof v === 'string') v = v.split(/[\s,]+/).filter(Boolean);
  if (!Array.isArray(v)) return v;
  return v.map((x) => (typeof x === 'string' && x.trim() !== '' && !Number.isNaN(Number(x)) ? Number(x) : x));
};
export {clamp01, ease};
