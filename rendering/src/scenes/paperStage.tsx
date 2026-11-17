/**
 * Shared pieces for the paper-style "screen" scenes (ScreenScene, PhoneScene, TerminalScene, EditorScene):
 * the paper background with the iso grid, the eyebrow/title, a desktop window frame, and small helpers.
 */
import type {CSSProperties, FC, ReactNode} from 'react';
import {AbsoluteFill, Easing, spring, useCurrentFrame, useVideoConfig} from 'remotion';
import {z} from 'zod';
import {PAPER} from '../iso/iso';
import {iconByName} from '../iso/objects';
import {useUnit} from '../theme';

export const fraction = z.number().min(0).max(1);
export const ease = Easing.bezier(0.45, 0, 0.2, 1);
export const clamp01 = (x: number) => Math.max(0, Math.min(1, x));

/** Dark palette for terminals and code editors (sits inside a paper window frame). */
export const DARK = {
  bg: '#26232d', panel: '#2f2b37', line: '#3b3646', text: '#ece6f5', soft: '#9d96aa',
  green: '#8bd49c', blue: '#8fb8f0', red: '#f2877a', yellow: '#f3c46b', purple: '#c9a8f5', orange: '#ffa36b', cyan: '#7fd6d0',
};
export const MONO = "'DejaVu Sans Mono', 'Noto Sans Mono', 'Liberation Mono', monospace";
/** Width of one character of MONO, as a fraction of the font size. */
export const MONO_W = 0.602;

export const Icon: FC<{name?: string; size: number; color?: string; stroke?: number}> = ({name, size, color = PAPER.ink, stroke = 2.2}) => {
  const I = iconByName(name);
  return I ? <I width={size} height={size} color={color} strokeWidth={stroke} /> : null;
};

/** Paper background, grid and the eyebrow/title in the top-left (same look as IsoScene). */
export const PaperStage: FC<{eyebrow?: string; title?: string; instant?: boolean; side?: boolean; children?: ReactNode}> = ({eyebrow, title, instant, side, children}) => {
  const f = useCurrentFrame();
  const {fps, width: W, height: H} = useVideoConfig();
  const u = useUnit();
  const titleIn = instant ? 1 : spring({frame: f - 2, fps, config: {damping: 200}});
  const step = 46 * u, lines: string[] = [];
  for (let c = -H; c < W + H; c += step * 2) lines.push(`M${c},0 l${H * 1.732},${H}`, `M${c},0 l${-H * 1.732},${H}`);
  return (
    <AbsoluteFill style={{background: `radial-gradient(ellipse at 50% 45%, ${PAPER.bgCenter} 0%, ${PAPER.bg} 70%)`, fontFamily: PAPER.sans, color: PAPER.ink, overflow: 'hidden'}}>
      <svg width={W} height={H} style={{position: 'absolute', inset: 0}}><path d={lines.join('')} stroke={PAPER.grid} strokeWidth={1.2 * u} fill="none" /></svg>
      {!side && (eyebrow || title) ? (
        <div style={{position: 'absolute', left: 90 * u, top: 56 * u, opacity: titleIn, transform: `translateY(${(1 - titleIn) * 16 * u}px)`}}>
          {eyebrow ? <div style={{fontFamily: PAPER.font, fontWeight: 700, fontSize: 22 * u, letterSpacing: 3 * u, color: '#8a6fd1', textTransform: 'uppercase'}}>{eyebrow}</div> : null}
          {title ? <div style={{fontSize: 46 * u, fontWeight: 800, marginTop: 6 * u}}>{title}</div> : null}
        </div>
      ) : null}
      {children}
    </AbsoluteFill>
  );
};

/** Place a w x h box (design px) centred under the title, leaving room for captions at the bottom. */
export const useStageBox = (w: number, h: number, hasTitle: boolean) => {
  const {width: W, height: H} = useVideoConfig();
  const u = useUnit();
  const top = (hasTitle ? 180 : 50) * u, bottom = 150 * u; // captions sit below
  const fit = Math.min(1, (W - 140 * u) / (w * u), (H - top - bottom) / (h * u));
  const s = u * fit;
  return {s, x: (W - w * s) / 2, y: top + (H - top - bottom - h * s) / 2, W, H, u};
};

/** Desktop window: paper title bar with traffic lights, a title, an optional right slot; dark body. */
export const WindowFrame: FC<{x: number; y: number; w: number; h: number; s: number; title: ReactNode; right?: ReactNode; enter: number; bar?: number; body?: string; children: ReactNode}> = ({x, y, w, h, s, title, right, enter, bar = 56, body = DARK.bg, children}) => {
  const frame: CSSProperties = {position: 'absolute', left: x, top: y, width: w * s, height: h * s, borderRadius: 22 * s, overflow: 'hidden', background: body,
    border: `${3 * s}px solid ${PAPER.ink}`, boxSizing: 'border-box', boxShadow: `0 ${18 * s}px ${40 * s}px rgba(70,50,30,0.25)`,
    opacity: enter, transform: `translateY(${(1 - enter) * 60 * s}px)`};
  return (
    <div style={frame}>
      <div style={{position: 'absolute', left: 0, top: 0, right: 0, height: bar * s, background: '#efe8dc', borderBottom: `${2 * s}px solid ${PAPER.ink}`, display: 'flex', alignItems: 'center', padding: `0 ${20 * s}px`, gap: 12 * s, boxSizing: 'border-box'}}>
        {['#f08a7b', '#f5c451', '#74c98a'].map((c) => <div key={c} style={{width: 16 * s, height: 16 * s, borderRadius: '50%', background: c, border: `${1.5 * s}px solid ${PAPER.ink}`}} />)}
        <div style={{flex: 1, display: 'flex', alignItems: 'center', marginLeft: 14 * s, fontFamily: MONO, fontSize: 20 * s, color: PAPER.inkSoft, whiteSpace: 'nowrap', overflow: 'hidden'}}>{title}</div>
        {right}
      </div>
      <div style={{position: 'absolute', left: 0, right: 0, top: bar * s, bottom: 0}}>{children}</div>
    </div>
  );
};

/** Mouse arrow with a click ripple (screen px). */
export const Pointer: FC<{x: number; y: number; u: number; press: number; ripple: number; opacity: number}> = ({x, y, u, press, ripple, opacity}) => (
  <div style={{position: 'absolute', left: x, top: y, opacity, pointerEvents: 'none', zIndex: 20}}>
    {ripple > 0 && ripple < 1 ? <div style={{position: 'absolute', left: -40 * u * ripple, top: -40 * u * ripple, width: 80 * u * ripple, height: 80 * u * ripple, borderRadius: '50%', border: `${3 * u}px solid rgba(255,85,0,${1 - ripple})`}} /> : null}
    <svg width={44 * u} height={52 * u} viewBox="0 0 22 26" style={{transform: `scale(${1 - 0.15 * press})`, transformOrigin: '0 0', filter: `drop-shadow(0 ${3 * u}px ${4 * u}px rgba(0,0,0,0.3))`}}>
      <path d="M1 1 L1 20 L6 15.5 L9.5 23.5 L13 22 L9.6 14.2 L16.5 14.2 Z" fill="#fff" stroke={PAPER.ink} strokeWidth={1.6} strokeLinejoin="round" />
    </svg>
  </div>
);

export type Cue = {sound: string; at: number; volume: number; duration?: number; loop?: boolean};

/* ------------------------------------------------------------------ phone and browser frames (shared) */

export const PHONE = {SW: 430, SH: 920, BEZEL: 16, STATUS: 56};

/** Phone placement: right of centre when a title sits beside it (side), else centred; above the captions. */
export const usePhoneBox = (side: boolean) => {
  const {width: W, height: H} = useVideoConfig();
  const u = useUnit();
  const devW = PHONE.SW + PHONE.BEZEL * 2, devH = PHONE.SH + PHONE.BEZEL * 2;
  const fit = Math.min(1, (H - 60 * u - 165 * u) / (devH * u));
  const s = u * fit;
  const dx = side ? W * 0.68 - (devW * s) / 2 : (W - devW * s) / 2;
  const dy = 60 * u + (H - 60 * u - 165 * u - devH * s) / 2;
  return {s, dx, dy, sx: dx + PHONE.BEZEL * s, sy: dy + PHONE.BEZEL * s, devW, devH, W, H, u, fit};
};

/** Phone body + screen; children are drawn in screen px (0..SW*s, 0..SH*s); status bar on top. */
export const PhoneFrame: FC<{box: ReturnType<typeof usePhoneBox>; enter: number; time?: string; statusBg?: string; children: ReactNode}> = ({box, enter, time = '9:41', statusBg = '#fffdf8', children}) => {
  const {s, dx, dy, devW, devH, u} = box;
  return (
    <div style={{position: 'absolute', left: dx, top: dy, width: devW * s, height: devH * s, opacity: enter, transform: `translateY(${(1 - enter) * 80 * u}px)`}}>
      <div style={{position: 'absolute', inset: 0, borderRadius: 64 * s, background: '#34313d', border: `${3 * s}px solid ${PAPER.ink}`, boxSizing: 'border-box', boxShadow: `0 ${20 * s}px ${40 * s}px rgba(70,50,30,0.25)`}} />
      <div style={{position: 'absolute', left: -6 * s, top: 190 * s, width: 6 * s, height: 70 * s, borderRadius: 3 * s, background: '#34313d'}} />
      <div style={{position: 'absolute', right: -6 * s, top: 240 * s, width: 6 * s, height: 110 * s, borderRadius: 3 * s, background: '#34313d'}} />
      <div style={{position: 'absolute', left: PHONE.BEZEL * s, top: PHONE.BEZEL * s, width: PHONE.SW * s, height: PHONE.SH * s, borderRadius: 50 * s, overflow: 'hidden', background: '#fffdf8', fontFamily: PAPER.sans, color: PAPER.ink}}>
        {children}
        <div style={{position: 'absolute', left: 0, right: 0, top: 0, height: PHONE.STATUS * s, display: 'flex', alignItems: 'center', padding: `0 ${34 * s}px`, fontSize: 20 * s, fontWeight: 800, zIndex: 20, background: statusBg}}>
          <span>{time}</span>
          <div style={{position: 'absolute', left: '50%', top: 12 * s, marginLeft: -60 * s, width: 120 * s, height: 34 * s, borderRadius: 17 * s, background: '#1d1b22'}} />
          <span style={{marginLeft: 'auto', display: 'flex', gap: 6 * s, alignItems: 'center'}}>
            <Icon name="signal" size={20 * s} stroke={2.6} /><Icon name="wifi" size={20 * s} stroke={2.6} /><Icon name="battery" size={26 * s} stroke={2.2} />
          </span>
        </div>
        <div style={{position: 'absolute', left: '50%', bottom: 10 * s, marginLeft: -70 * s, width: 140 * s, height: 6 * s, borderRadius: 3 * s, background: PAPER.ink, opacity: 0.6, zIndex: 21}} />
      </div>
    </div>
  );
};

/** Eyebrow + title in a column left of a phone (the phone sits right of centre). */
export const SideTitle: FC<{eyebrow?: string; title?: string; box: ReturnType<typeof usePhoneBox>; instant?: boolean; children?: ReactNode}> = ({eyebrow, title, box, instant, children}) => {
  const f = useCurrentFrame();
  const {fps} = useVideoConfig();
  const {u, W, devW, s} = box;
  const k = instant ? 1 : spring({frame: f - 2, fps, config: {damping: 200}});
  return (
    <div style={{position: 'absolute', left: 110 * u, top: 0, bottom: 120 * u, width: W * 0.68 - (devW * s) / 2 - 190 * u, display: 'flex', flexDirection: 'column', justifyContent: 'center', opacity: k, transform: `translateY(${(1 - k) * 16 * u}px)`}}>
      {eyebrow ? <div style={{fontFamily: PAPER.font, fontWeight: 700, fontSize: 22 * u, letterSpacing: 3 * u, color: '#8a6fd1', textTransform: 'uppercase'}}>{eyebrow}</div> : null}
      {title ? <div style={{fontSize: 52 * u, fontWeight: 800, marginTop: 8 * u, lineHeight: 1.12}}>{title}</div> : null}
      {children}
    </div>
  );
};

/** Touch indicator for phones: a soft fingertip circle with a ripple (screen px). */
export const Finger: FC<{x: number; y: number; s: number; press: number; ripple: number; opacity: number}> = ({x, y, s, press, ripple, opacity}) => (
  <div style={{position: 'absolute', left: x, top: y, opacity, pointerEvents: 'none', zIndex: 30}}>
    {ripple > 0 && ripple < 1 ? <div style={{position: 'absolute', left: -44 * s * (0.4 + ripple), top: -44 * s * (0.4 + ripple), width: 88 * s * (0.4 + ripple), height: 88 * s * (0.4 + ripple), borderRadius: '50%', border: `${3 * s}px solid rgba(255,85,0,${1 - ripple})`}} /> : null}
    <div style={{position: 'absolute', left: -27 * s, top: -27 * s, width: 54 * s, height: 54 * s, borderRadius: '50%', background: 'rgba(43,40,51,0.32)', border: `${3 * s}px solid rgba(255,255,255,0.95)`,
      boxShadow: `0 ${6 * s}px ${14 * s}px rgba(0,0,0,0.25)`, transform: `scale(${1 - 0.18 * press})`}} />
  </div>
);

/** Light browser window: paper chrome with a URL pill; children drawn in the page area. */
export const BrowserFrame: FC<{x: number; y: number; w: number; h: number; s: number; url: string; enter: number; children: ReactNode}> = ({x, y, w, h, s, url, enter, children}) => (
  <WindowFrame x={x} y={y} w={w} h={h} s={s} enter={enter} bar={62} body="#fffdf8" title={
    <div style={{flex: 1, height: 38 * s, borderRadius: 19 * s, background: '#fff', border: `${2 * s}px solid ${PAPER.track}`, display: 'flex', alignItems: 'center', gap: 10 * s, padding: `0 ${16 * s}px`, fontFamily: PAPER.sans, fontSize: 20 * s, color: PAPER.inkSoft}}>
      <Icon name="lock" size={18 * s} color={PAPER.good} stroke={2.4} />{url}
    </div>}>
    {children}
  </WindowFrame>
);

/* ------------------------------------------------------------------ forgiving input (what AIs often write) */

type Obj = Record<string, unknown>;
/**
 * Normalise a list of timed items (actions, messages): rename alias keys (only when the real key is
 * missing), map alias values of some keys, turn percentages (30) into fractions (0.3), and spread
 * items without "at" evenly. Unknown things are left alone so validation can still explain them.
 */
export const flexList = (list: unknown, opts: {keys?: Record<string, string>; values?: Record<string, Record<string, string> | ((v: string) => string)>}) => {
  if (!Array.isArray(list)) return list;
  const n = list.length;
  return list.map((raw, i) => {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return raw;
    const o: Obj = {};
    for (const [k, v] of Object.entries(raw as Obj)) {
      const key = opts.keys?.[k];
      if (key && !(key in (raw as Obj))) o[key] = v;
      else o[k] = v;
    }
    for (const [k, map] of Object.entries(opts.values ?? {})) {
      if (typeof o[k] !== 'string') continue;
      const v = (o[k] as string).trim().toLowerCase();
      o[k] = typeof map === 'function' ? map(v) : map[v] ?? v;
    }
    if (typeof o.at === 'string' && o.at.trim() !== '' && !Number.isNaN(Number(o.at))) o.at = Number(o.at);
    if (typeof o.at === 'number' && o.at > 1 && o.at <= 100) o.at = o.at / 100;
    if (o.at === undefined) o.at = Math.round(((i + 0.5) / n) * 0.9 * 1000) / 1000;
    return o;
  });
};
/** Map one string prop through aliases (lower-cased); other values pass through. */
export const flexValue = (v: unknown, map: Record<string, string>) => (typeof v === 'string' ? map[v.trim().toLowerCase()] ?? v.trim().toLowerCase() : v);

/* ------------------------------------------------------------------ one device frame for every screen scene */

export const DEVICE_KINDS = ['window', 'browser', 'laptop', 'monitor', 'phone', 'card'] as const;
export type DeviceKind = (typeof DEVICE_KINDS)[number];
/** What AIs call the same devices. */
export const DEVICE_ALIASES: Record<string, DeviceKind> = {
  mobile: 'phone', smartphone: 'phone', iphone: 'phone', android: 'phone', app: 'phone', tablet: 'phone',
  web: 'browser', website: 'browser', webpage: 'browser', page: 'browser', chrome: 'browser', site: 'browser',
  computer: 'laptop', notebook: 'laptop', macbook: 'laptop', pc: 'monitor', desktop: 'monitor', screen: 'monitor', display: 'monitor',
  app_window: 'window', desktop_app: 'window', paper: 'card', plain: 'card', none: 'card',
};

/**
 * Geometry of a device holding a content area of w x h design px (phones: the fixed phone screen).
 * Content is always drawn from (0,0) of the content box; ox/oy is that point on the frame, s the scale.
 */
export const useDevice = (device: DeviceKind, o: {w: number; h: number; hasTitle: boolean; bar?: number}) => {
  const phone = device === 'phone';
  const bar = device === 'card' || phone ? 0 : o.bar ?? 56;
  const bezel = device === 'laptop' || device === 'monitor' ? 22 : 0;
  const baseH = device === 'laptop' ? 40 : device === 'monitor' ? 110 : 0;
  const overhang = device === 'laptop' ? 60 : 0;
  const fw = o.w + bezel * 2 + overhang * 2, fh = o.h + bar + bezel * 2 + baseH;
  const st = useStageBox(fw, fh, o.hasTitle);
  const pbox = usePhoneBox(o.hasTitle);
  if (phone) return {device, phone, s: pbox.s, ox: pbox.sx, oy: pbox.sy + PHONE.STATUS * pbox.s, cw: PHONE.SW, ch: PHONE.SH - PHONE.STATUS, pbox, frameX: pbox.dx, frameY: pbox.dy, bar, bezel, u: st.u};
  const frameX = st.x + overhang * st.s, frameY = st.y;
  return {device, phone, s: st.s, ox: frameX + bezel * st.s, oy: frameY + (bezel + bar) * st.s, cw: o.w, ch: o.h, pbox, frameX, frameY, bar, bezel, u: st.u};
};
export type DeviceGeo = ReturnType<typeof useDevice>;

/** Draws the device (window / browser / laptop / monitor / phone / nothing) and its children in the content box. */
export const DeviceFrame: FC<{geo: DeviceGeo; enter: number; title?: ReactNode; url?: string; right?: ReactNode; body?: string; statusBg?: string; children: ReactNode}> = ({geo, enter, title, url, right, body = '#fffdf8', statusBg, children}) => {
  const {s, cw, ch, bar, bezel, frameX, frameY, device} = geo;
  const content = <div style={{position: 'absolute', left: 0, top: 0, width: cw * s, height: ch * s, overflow: 'hidden'}}>{children}</div>;
  if (device === 'phone') {
    return <PhoneFrame box={geo.pbox} enter={enter} statusBg={statusBg}><div style={{position: 'absolute', left: 0, top: PHONE.STATUS * s, width: cw * s, height: ch * s, background: body}}>{content}</div></PhoneFrame>;
  }
  if (device === 'card') return <div style={{position: 'absolute', left: geo.ox, top: geo.oy, opacity: enter, transform: `translateY(${(1 - enter) * 60 * s}px)`}}>{content}</div>;
  const barNode = url !== undefined || device === 'browser'
    ? <div style={{flex: 1, height: 38 * s, borderRadius: 19 * s, background: '#fff', border: `${2 * s}px solid ${PAPER.track}`, display: 'flex', alignItems: 'center', gap: 10 * s, padding: `0 ${16 * s}px`, fontFamily: PAPER.sans, fontSize: 20 * s, color: PAPER.inkSoft, overflow: 'hidden', whiteSpace: 'nowrap'}}>
        <Icon name="lock" size={18 * s} color={PAPER.good} stroke={2.4} />{url ?? 'example.com'}
      </div>
    : title;
  if (device === 'window' || device === 'browser') {
    return <WindowFrame x={frameX} y={frameY} w={cw} h={ch + bar} s={s} enter={enter} bar={bar} body={body} title={barNode} right={right}>{content}</WindowFrame>;
  }
  // laptop / monitor: dark body around a screen that holds the bar and the content
  const W0 = (cw + bezel * 2) * s, H0 = (ch + bar + bezel * 2) * s;
  return (
    <div style={{position: 'absolute', left: frameX, top: frameY, width: W0, height: H0, opacity: enter, transform: `translateY(${(1 - enter) * 60 * s}px)`}}>
      <div style={{position: 'absolute', inset: 0, borderRadius: 26 * s, background: '#34313d', border: `${3 * s}px solid ${PAPER.ink}`, boxSizing: 'border-box', boxShadow: `0 ${18 * s}px ${36 * s}px rgba(70,50,30,0.22)`}} />
      {device === 'laptop' ? <div style={{position: 'absolute', left: -60 * s, top: H0 - 4 * s, width: W0 + 120 * s, height: 40 * s, background: '#d9d6de', border: `${3 * s}px solid ${PAPER.ink}`, borderRadius: `${6 * s}px ${6 * s}px ${22 * s}px ${22 * s}px`, boxSizing: 'border-box'}}>
        <div style={{margin: '0 auto', width: 180 * s, height: 12 * s, background: '#bdb9c4', borderRadius: `0 0 ${10 * s}px ${10 * s}px`}} />
      </div> : <>
        <div style={{position: 'absolute', left: W0 / 2 - 50 * s, top: H0 - 2 * s, width: 100 * s, height: 80 * s, background: '#cfcbd6', border: `${3 * s}px solid ${PAPER.ink}`, boxSizing: 'border-box'}} />
        <div style={{position: 'absolute', left: W0 / 2 - 190 * s, top: H0 + 74 * s, width: 380 * s, height: 30 * s, background: '#d9d6de', border: `${3 * s}px solid ${PAPER.ink}`, borderRadius: 14 * s, boxSizing: 'border-box'}} />
      </>}
      <div style={{position: 'absolute', left: bezel * s, top: bezel * s, width: cw * s, height: (ch + bar) * s, borderRadius: 8 * s, overflow: 'hidden', background: body}}>
        <div style={{position: 'absolute', left: 0, right: 0, top: 0, height: bar * s, background: '#efe8dc', borderBottom: `${2 * s}px solid ${PAPER.track}`, display: 'flex', alignItems: 'center', gap: 12 * s, padding: `0 ${18 * s}px`, boxSizing: 'border-box'}}>
          {['#f08a7b', '#f5c451', '#74c98a'].map((c) => <div key={c} style={{width: 15 * s, height: 15 * s, borderRadius: '50%', background: c, border: `${1.5 * s}px solid ${PAPER.ink}`}} />)}
          <div style={{flex: 1, display: 'flex', alignItems: 'center', marginLeft: 12 * s, fontFamily: MONO, fontSize: 20 * s, color: PAPER.inkSoft, whiteSpace: 'nowrap', overflow: 'hidden'}}>{barNode}</div>
          {right}
        </div>
        <div style={{position: 'absolute', left: 0, top: bar * s, width: cw * s, height: ch * s}}>{content}</div>
      </div>
    </div>
  );
};

/** Pointer for the device: a finger on phones, a mouse arrow elsewhere. */
export const DevicePointer: FC<{geo: DeviceGeo; x: number; y: number; press: number; ripple: number; opacity: number}> = ({geo, x, y, press, ripple, opacity}) =>
  geo.phone ? <Finger x={x} y={y} s={geo.u * Math.max(0.85, geo.pbox.fit)} press={press} ripple={ripple} opacity={opacity} />
    : <Pointer x={x} y={y} u={geo.u} press={press} ripple={ripple} opacity={opacity} />;

/** Preprocess for scenes that only need device aliases. */
export const deviceAlias = (raw: unknown) =>
  raw && typeof raw === 'object' && 'device' in raw ? {...(raw as Record<string, unknown>), device: flexValue((raw as {device: unknown}).device, DEVICE_ALIASES)} : raw;
