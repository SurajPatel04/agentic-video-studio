/**
 * PhoneScene: a phone being used, in the paper style. A finger taps and swipes, apps open from the home
 * screen (zoom from the icon), screens slide in and back, a keyboard slides up while typing, a
 * notification drops in, an OTP text arrives and fills the code box by itself, a spinner waits, a
 * snackbar confirms. The title and each action's "note" are shown as a step list beside the phone.
 *
 * Every touch point comes from the same layout numbers the screen is drawn with, so taps always land
 * on the element. "at" is a fraction of the scene, like IsoScene and ScreenScene.
 */
import type {CSSProperties, FC, ReactNode} from 'react';
import {interpolate, spring, useCurrentFrame, useVideoConfig} from 'remotion';
import {Battery, Signal, Wifi} from 'lucide-react';
import {z} from 'zod';
import {Sfx} from '../audio';
import {PAPER} from '../iso/iso';
import {useSceneLength, useUnit} from '../theme';
import {Icon, PaperStage, clamp01, ease, flexList, flexValue, fraction, type Cue} from './paperStage';

/* ------------------------------------------------------------------------------ schema */

const itemSchema = z.union([
  z.string().max(60),
  z.object({
    id: z.string().max(30).optional(),
    label: z.string().max(60),
    text: z.string().max(40).optional(), // second line / right side: price, time, sender
    icon: z.string().max(30).optional(),
    me: z.boolean().optional(), // chat: my message (right side)
  }).strict(),
]);
const BLOCKS = ['header', 'heading', 'text', 'image', 'amount', 'input', 'button', 'list', 'cards', 'chat', 'banner', 'tabs'] as const;
const blockSchema = z.object({
  id: z.string().max(30).optional(),
  type: z.enum(BLOCKS),
  label: z.string().max(50).optional(),
  text: z.string().max(120).optional(),
  value: z.string().max(30).optional(), // amount: "$120.50"; input: already filled
  icon: z.string().max(30).optional(),
  placeholder: z.string().max(30).optional(),
  mask: z.boolean().optional(), // input: password dots
  digits: z.number().int().min(4).max(8).optional(), // input: one box per digit (OTP / PIN)
  items: z.array(itemSchema).max(6).optional(),
  variant: z.enum(['primary', 'secondary', 'success', 'error', 'info']).optional(),
}).strict();
const appSchema = z.object({
  id: z.string().max(30),
  label: z.string().max(14),
  icon: z.string().max(30).optional(),
  color: z.string().max(20).optional(),
}).strict();
const screenSchema = z.object({
  id: z.string().min(1).max(30),
  type: z.enum(['home', 'app']).default('app'),
  apps: z.array(appSchema).max(16).optional(), // home screen icons
  blocks: z.array(blockSchema).max(10).default([]),
}).strict();
const ACTIONS = ['tap', 'type', 'swipe', 'open', 'back', 'notify', 'otp', 'wait', 'highlight', 'toast', 'focus', 'unfocus'] as const;
const actionSchema = z.object({
  at: fraction,
  do: z.enum(ACTIONS),
  to: z.string().max(30).optional(), // element / app id ("notification" = the notification on screen)
  screen: z.string().max(30).optional(), // open: screen id
  text: z.string().max(80).optional(), // type: text; notify/toast/wait: message; otp: the code
  title: z.string().max(30).optional(), // notify / otp: sender or app name
  icon: z.string().max(30).optional(), // notify: icon
  direction: z.enum(['up', 'down', 'left', 'right']).optional(), // swipe
  variant: z.enum(['success', 'error', 'info']).optional(), // toast
  seconds: z.number().min(0.4).max(4).optional(), // wait
  note: z.string().max(60).optional(), // step text shown beside the phone
}).strict();
type Action = z.output<typeof actionSchema>;
type Screen = z.output<typeof screenSchema>;
type Block = z.output<typeof blockSchema>;
type Item = {id?: string; label: string; text?: string; icon?: string; me?: boolean};
const asItem = (it: z.output<typeof itemSchema>): Item => (typeof it === 'string' ? {label: it} : it);

const EXAMPLE_SCREENS: z.input<typeof screenSchema>[] = [
  {id: 'home', type: 'home', apps: [
    {id: 'shoply', label: 'Shoply', icon: 'shopping-bag', color: '#ff7a45'}, {id: 'msgs', label: 'Messages', icon: 'message-circle', color: '#4cc06a'},
    {id: 'cam', label: 'Camera', icon: 'camera', color: '#8a8fa0'}, {id: 'maps', label: 'Maps', icon: 'map', color: '#3d9be9'},
    {id: 'bank', label: 'Bank', icon: 'landmark', color: '#6b5bd6'}, {id: 'music', label: 'Music', icon: 'music', color: '#f25b7a'},
    {id: 'notes', label: 'Notes', icon: 'notebook-pen', color: '#f2b632'}, {id: 'mail', label: 'Mail', icon: 'mail', color: '#4a8cf0'}]},
  {id: 'verify', blocks: [
    {type: 'header', label: 'Shoply', icon: 'arrow-left'},
    {type: 'heading', label: 'Verify your phone', text: 'We sent a 6-digit code to +1 555 0134'},
    {id: 'code', type: 'input', label: 'Code', digits: 6},
    {id: 'go', type: 'button', label: 'Verify'}]},
  {id: 'shop', blocks: [
    {type: 'header', label: 'Shoply'},
    {type: 'banner', label: 'You are signed in', variant: 'success'},
    {type: 'cards', items: [{label: 'Trainers', text: '$40', icon: 'footprints'}, {label: 'Backpack', text: '$32', icon: 'backpack'}]},
    {type: 'tabs', items: [{label: 'Home', icon: 'house'}, {label: 'Search', icon: 'search'}, {label: 'Cart', icon: 'shopping-cart'}]}]},
];
const EXAMPLE_ACTIONS: Action[] = [
  {at: 0.08, do: 'tap', to: 'shoply', note: 'Open the app'},
  {at: 0.12, do: 'open', screen: 'verify'},
  {at: 0.3, do: 'otp', to: 'code', text: '482913', title: 'Shoply', note: 'A code arrives by SMS'},
  {at: 0.6, do: 'tap', to: 'go', note: 'Tap Verify'},
  {at: 0.64, do: 'wait', text: 'Checking code', seconds: 1},
  {at: 0.78, do: 'open', screen: 'shop', note: 'Signed in'},
];

const VERBS: Record<string, string> = {click: 'tap', press: 'tap', touch: 'tap', select: 'tap', choose: 'tap', fill: 'type', input: 'type', enter: 'type', write: 'type',
  scroll: 'swipe', 'scroll down': 'swipe', 'scroll up': 'swipe', drag: 'swipe', navigate: 'open', go: 'open', goto: 'open', show: 'open', launch: 'open', 'go back': 'back', return: 'back',
  notification: 'notify', push: 'notify', alert: 'notify', sms: 'otp', code: 'otp', 'receive otp': 'otp', loading: 'wait', load: 'wait', spinner: 'wait', processing: 'wait', pause: 'wait',
  glow: 'highlight', point: 'highlight', snackbar: 'toast', message: 'toast', zoom: 'focus', 'zoom in': 'focus', 'zoom out': 'unfocus'};
/** Forgiving input: one-screen shorthand, action verbs/keys AIs often use, "open" with "to" = a screen, swipes without a direction. */
const flexPhone = (raw: unknown) => {
  if (!raw || typeof raw !== 'object') return raw;
  let r = {...(raw as Record<string, unknown>)};
  // shorthand: "blocks": [...] for a one-screen scene
  if (Array.isArray(r.blocks) && !r.screens) {
    const {blocks, ...rest} = r as {blocks: unknown[]};
    r = {...rest, screens: [{id: 'app', blocks}]};
  }
  if (r.screens !== undefined && r.actions === undefined) r.actions = []; // own screens: never the built-in demo script
  const screenIds = new Set(Array.isArray(r.screens) ? (r.screens as {id?: unknown}[]).map((sc) => String(sc?.id)) : []);
  r.actions = flexList(r.actions, {
    keys: {action: 'do', verb: 'do', type: 'do', target: 'to', element: 'to', app: 'to', value: 'text', content: 'text', message: 'text', code: 'text', body: 'text', sender: 'title', from: 'title', page: 'screen', duration: 'seconds', dir: 'direction', status: 'variant', color: 'variant'},
    values: {do: (v) => VERBS[v] ?? v},
  });
  if (Array.isArray(r.actions)) r.actions = (r.actions as Record<string, unknown>[]).map((a, i) => {
    if (!a || typeof a !== 'object') return a;
    const o = {...a};
    const raw0 = (Array.isArray((raw as {actions?: unknown}).actions) ? ((raw as {actions: Record<string, unknown>[]}).actions[i] ?? {}) : {}) as Record<string, unknown>;
    if (o.do === 'open' && o.screen === undefined && typeof o.to === 'string' && screenIds.has(o.to)) { o.screen = o.to; delete o.to; }
    if (o.do === 'swipe' && o.direction === undefined) o.direction = /up/.test(String(raw0.do ?? raw0.action ?? '')) ? 'down' : 'up'; // "scroll up" shows earlier content
    if (typeof o.direction === 'string') o.direction = flexValue(o.direction, {upward: 'up', downward: 'down', 'swipe up': 'up', 'swipe down': 'down', 'swipe left': 'left', 'swipe right': 'right'});
    if (typeof o.variant === 'string') o.variant = flexValue(o.variant, {ok: 'success', done: 'success', fail: 'error', failed: 'error', warning: 'error'});
    if (typeof o.seconds === 'number' && o.seconds > 4) o.seconds = Math.min(4, o.seconds / 1000 >= 0.4 ? o.seconds / 1000 : 4); // ms given
    return o;
  });
  return r;
};

export const phoneSceneSchema = z.preprocess(flexPhone, z.object({
  eyebrow: z.string().max(40).optional(),
  title: z.string().max(60).optional(),
  accent: z.string().max(20).default('#4f6ef5'),
  time: z.string().max(8).default('9:41'),
  screens: z.array(screenSchema).min(1).max(6).default(() => EXAMPLE_SCREENS.map((sc) => screenSchema.parse(sc))),
  actions: z.array(actionSchema).max(30).default(() => EXAMPLE_ACTIONS),
  instant: z.boolean().default(false),
  sound: z.boolean().default(true),
}).strict().superRefine((p, ctx) => {
  const screens = new Map(p.screens.map((sc) => [sc.id, sc]));
  if (screens.size !== p.screens.length) ctx.addIssue({code: 'custom', path: ['screens'], message: 'screen ids must be unique'});
  p.screens.forEach((sc, i) => {
    if (sc.type === 'home' && !sc.apps?.length) ctx.addIssue({code: 'custom', path: ['screens', i, 'apps'], message: 'a home screen needs "apps"'});
    if (sc.type === 'app' && !sc.blocks.length) ctx.addIssue({code: 'custom', path: ['screens', i, 'blocks'], message: 'an app screen needs "blocks"'});
  });
  const stack = [p.screens[0].id];
  let notified = false;
  [...p.actions].map((a, i) => ({a, i})).sort((x, y) => x.a.at - y.a.at).forEach(({a, i}) => {
    const cur = screens.get(stack[stack.length - 1])!;
    const issue = (path: string, message: string) => ctx.addIssue({code: 'custom', path: ['actions', i, path], message});
    if (a.do === 'open') {
      if (!a.screen || !screens.has(a.screen)) issue('screen', `open needs "screen" = one of: ${[...screens.keys()].join(', ')}`);
      else stack.push(a.screen);
      return;
    }
    if (a.do === 'back') { if (stack.length < 2) issue('do', '"back" needs an earlier "open"'); else stack.pop(); return; }
    if (a.do === 'notify') { notified = true; if (!a.text) issue('text', '"notify" needs "text"'); return; }
    const needsTo = ['tap', 'type', 'otp', 'highlight', 'focus'].includes(a.do) || (a.do === 'swipe' && a.to);
    if (needsTo) {
      const ids = targetIds(cur);
      if (a.to === 'notification' && a.do === 'tap') { if (!notified) issue('to', 'tap "notification" needs a "notify" before it'); }
      else if (!a.to) issue('to', `"${a.do}" needs "to": an id on screen "${cur.id}" (${ids.join(', ') || 'give blocks an id'})`);
      else if (!ids.includes(a.to)) issue('to', `"${a.to}" is not on screen "${cur.id}" at that time; ids there: ${ids.join(', ') || 'none (give blocks an id)'}`);
      else if ((a.do === 'type' || a.do === 'otp') && !cur.blocks.some((b) => b.id === a.to && b.type === 'input')) issue('to', `"${a.do}" must target an input block`);
    }
    if ((a.do === 'type' || a.do === 'otp' || a.do === 'toast') && !a.text) issue('text', `"${a.do}" needs "text"`);
    if (a.do === 'swipe' && !a.direction) issue('direction', '"swipe" needs "direction": up, down, left or right');
  });
}));
type Props = z.output<typeof phoneSceneSchema>;

function targetIds(sc: Screen): string[] {
  return [...(sc.apps ?? []).map((a) => a.id), ...sc.blocks.flatMap((b) => [b.id, ...(b.items ?? []).map((it) => asItem(it).id)])].filter((x): x is string => Boolean(x));
}

export const description =
  'A phone being used, in the paper style: a finger taps and swipes, an app opens from the home screen, screens ' +
  'slide in and back, a keyboard slides up while typing, a notification drops in, an OTP text arrives and fills the ' +
  'code box by itself, a spinner waits, a snackbar confirms. Screens are built from blocks (header, heading, text, ' +
  'image, amount, input, button, list, cards, chat, banner, tabs). The title and each action\'s note appear as steps ' +
  'beside the phone. Use for mobile apps, phone logins and OTP, payments, push notifications, messaging.';
export const tags = ['phone', 'mobile', 'app', 'smartphone', 'tap', 'swipe', 'otp', 'notification', 'payment', 'upi', 'login',
  'message', 'chat', 'sms', 'push notification', 'two-factor', 'android', 'iphone'];

/* ------------------------------------------------------------------------------ layout */

const SW = 430, SH = 920, BEZEL = 16, STATUS = 56, PAD = 22, PW = SW - PAD * 2, GAP = 16, TABS = 78, KEYB = 300;
const TOP = STATUS + 10;
type Rect = {x: number; y: number; w: number; h: number};
type Placed = {block: Block; y: number; h: number; parts: Record<string, Rect>; items: Rect[]};
type Target = {r: Rect; fixed?: boolean};

const layoutScreen = (sc: Screen) => {
  const placed: Placed[] = [];
  const targets: Record<string, Target> = {};
  let y = 0;
  if (sc.type === 'home') {
    (sc.apps ?? []).forEach((a, k) => {
      const col = k % 4, row = Math.floor(k / 4);
      targets[a.id] = {r: {x: col * (PW / 4) + (PW / 4 - 76) / 2, y: 190 + row * 122, w: 76, h: 76}};
    });
    return {placed, targets, height: 190 + Math.ceil((sc.apps?.length ?? 0) / 4) * 122};
  }
  sc.blocks.forEach((b) => {
    const parts: Record<string, Rect> = {};
    const items: Rect[] = [];
    const list = (b.items ?? []).map(asItem);
    let h = 70;
    switch (b.type) {
      case 'header': h = 60; parts.icon = {x: 0, y: 8, w: 44, h: 44}; break;
      case 'heading': h = b.text ? 104 : 54; break;
      case 'text': h = 86; break;
      case 'image': h = 190; break;
      case 'amount': h = 112; break;
      case 'input': h = 106; parts.box = {x: 0, y: 34, w: PW, h: 64}; break;
      case 'button': h = 74; parts.button = {x: 0, y: 6, w: PW, h: 62}; break;
      case 'list': h = Math.max(1, list.length) * 70; list.forEach((_, k) => items.push({x: 0, y: k * 70, w: PW, h: 64})); break;
      case 'cards': {
        const w = (PW - 14) / 2;
        list.forEach((_, k) => items.push({x: (k % 2) * (w + 14), y: Math.floor(k / 2) * 164, w, h: 150}));
        h = Math.ceil(Math.max(1, list.length) / 2) * 164;
        break;
      }
      case 'chat': {
        let cy = 0;
        list.forEach((it) => {
          const bh = it.label.length > 24 ? 88 : 58;
          const bw = Math.min(PW * 0.8, 48 + Math.min(it.label.length, 24) * 11.5);
          items.push({x: it.me ? PW - bw : 0, y: cy, w: bw, h: bh});
          cy += bh + 12;
        });
        h = Math.max(58, cy);
        break;
      }
      case 'banner': h = 66; break;
      case 'tabs': {
        h = 0;
        const n = Math.max(1, list.length);
        list.forEach((_, k) => items.push({x: k * (SW / n), y: SH - TABS, w: SW / n, h: TABS}));
        break;
      }
    }
    const fixed = b.type === 'tabs';
    const at = (r: Rect): Target => (fixed ? {r, fixed} : {r: {x: r.x, y: r.y + y, w: r.w, h: r.h}});
    if (b.id) targets[b.id] = at(parts.button ?? parts.box ?? parts.icon ?? {x: 0, y: 0, w: PW, h});
    list.forEach((it, k) => { if (it.id && items[k]) targets[it.id] = at(items[k]); });
    placed.push({block: b, y, h, parts, items});
    if (!fixed) y += h + GAP;
  });
  return {placed, targets, height: y};
};
type Layout = ReturnType<typeof layoutScreen>;

/* ------------------------------------------------------------------------------ drawing */

const VARIANT: Record<string, {bg: string; ink: string}> = {
  success: {bg: '#dff3e2', ink: '#2f7a3d'}, error: {bg: '#fbe1dc', ink: '#b2402f'}, info: {bg: '#e1ebfb', ink: '#3456a8'},
};
const TINTS = ['#f7c6a3', '#b8d6f3', '#b9e2c7', '#cdc3ee', '#f4da93', '#f3b9c6'];

type ElState = {pressed: (id?: string) => number; lit: (id?: string) => number; typed: (id?: string) => string | undefined; focused: (id?: string) => boolean; swiped: (id?: string) => number};

const BlockView: FC<{pb: Placed; s: number; accent: string; st: ElState; f: number}> = ({pb, s, accent, st, f}) => {
  const {block: b, h, parts, items} = pb;
  const list = (b.items ?? []).map(asItem);
  const box = (r: Rect, extra: CSSProperties = {}): CSSProperties => ({position: 'absolute', left: r.x * s, top: r.y * s, width: r.w * s, height: r.h * s, boxSizing: 'border-box', ...extra});
  const ring = (id?: string): CSSProperties => {
    const l = st.lit(id);
    return l > 0 ? {boxShadow: `0 0 0 ${4 * s}px rgba(255,85,0,${0.85 * l}), 0 0 ${24 * s * l}px rgba(255,140,40,${0.6 * l})`} : {};
  };
  const slide = (id?: string): CSSProperties => {
    const k = st.swiped(id);
    return k ? {transform: `translateX(${k * SW * s}px)`, opacity: 1 - Math.abs(k)} : {};
  };
  let inner: ReactNode = null;
  switch (b.type) {
    case 'header':
      inner = <>
        {b.icon ? <div style={box(parts.icon, {borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', background: st.pressed(b.id) ? PAPER.track : 'transparent', ...ring(b.id)})}><Icon name={b.icon} size={28 * s} /></div> : null}
        <div style={{position: 'absolute', left: 0, right: 0, top: 12 * s, textAlign: 'center', fontSize: 26 * s, fontWeight: 800}}>{b.label}</div>
        <div style={{position: 'absolute', left: -PAD * s, right: -PAD * s, bottom: 0, height: 2 * s, background: PAPER.track}} />
      </>;
      break;
    case 'heading':
      inner = <div style={ring(b.id)}>
        <div style={{fontSize: 32 * s, fontWeight: 800, lineHeight: 1.15}}>{b.label}</div>
        {b.text ? <div style={{fontSize: 20 * s, color: PAPER.inkSoft, marginTop: 8 * s, lineHeight: 1.35}}>{b.text}</div> : null}
      </div>;
      break;
    case 'text':
      inner = <div style={{fontSize: 21 * s, lineHeight: 1.4, color: PAPER.inkSoft, maxHeight: 86 * s, overflow: 'hidden', ...ring(b.id)}}>{b.text ?? b.label}</div>;
      break;
    case 'image':
      inner = <div style={{position: 'absolute', inset: 0, borderRadius: 20 * s, background: `linear-gradient(135deg, ${TINTS[2]}, ${TINTS[1]})`, border: `${2 * s}px solid ${PAPER.ink}`, display: 'flex', alignItems: 'center', justifyContent: 'center', ...ring(b.id)}}>
        <Icon name={b.icon ?? 'image'} size={80 * s} />
      </div>;
      break;
    case 'amount':
      inner = <div style={{position: 'absolute', inset: 0, borderRadius: 20 * s, background: `${accent}14`, border: `${2 * s}px solid ${accent}55`, padding: `${16 * s}px ${20 * s}px`, boxSizing: 'border-box', ...ring(b.id)}}>
        <div style={{fontSize: 19 * s, color: PAPER.inkSoft, fontWeight: 600}}>{b.label ?? 'Balance'}</div>
        <div style={{fontSize: 44 * s, fontWeight: 800, marginTop: 4 * s}}>{st.typed(b.id) ?? b.value ?? b.text ?? ''}</div>
      </div>;
      break;
    case 'input': {
      const r = parts.box;
      const typed = st.typed(b.id) ?? b.value ?? '';
      const focused = st.focused(b.id);
      const caret = focused && Math.floor(f / 15) % 2 === 0;
      const label = <div style={{position: 'absolute', left: 0, top: 0, fontSize: 19 * s, fontWeight: 700, color: PAPER.inkSoft}}>{b.label ?? 'Field'}</div>;
      if (b.digits) {
        const n = b.digits, gap = 10, w = (PW - gap * (n - 1)) / n;
        inner = <>{label}{Array.from({length: n}, (_, k) => {
          const ch = typed[k];
          const active = focused && k === typed.length;
          return <div key={k} style={box({x: k * (w + gap), y: r.y, w, h: r.h}, {borderRadius: 14 * s, border: `${2.5 * s}px solid ${active || (ch && st.lit(b.id) > 0) ? accent : PAPER.ink}`,
            display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 32 * s, fontWeight: 800, boxShadow: active ? `0 0 0 ${4 * s}px ${accent}33` : undefined,
            background: ch && st.lit(b.id) > 0 ? `${accent}14` : '#fff'})}>{ch ?? (active && caret ? '|' : '')}</div>;
        })}</>;
        break;
      }
      const shown = b.mask ? '•'.repeat(typed.length) : typed;
      inner = <>{label}
        <div style={box(r, {borderRadius: 14 * s, background: '#fff', border: `${2.5 * s}px solid ${focused ? accent : PAPER.ink}`, display: 'flex', alignItems: 'center', padding: `0 ${18 * s}px`,
          fontSize: 23 * s, color: shown ? PAPER.ink : '#a9a2b0', boxShadow: focused ? `0 0 0 ${4 * s}px ${accent}33` : undefined, overflow: 'hidden', whiteSpace: 'nowrap', ...ring(b.id)})}>
          {shown || b.placeholder || ''}{caret ? <span style={{width: 3 * s, height: 28 * s, background: PAPER.ink, marginLeft: 2 * s, display: 'inline-block'}} /> : null}
        </div>
      </>;
      break;
    }
    case 'button': {
      const press = st.pressed(b.id);
      const primary = b.variant !== 'secondary';
      inner = <div style={box(parts.button, {borderRadius: 31 * s, background: primary ? accent : PAPER.card, color: primary ? '#fff' : PAPER.ink, border: `${2 * s}px solid ${primary ? accent : PAPER.ink}`,
        display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800, fontSize: 24 * s, transform: `scale(${1 - 0.05 * press})`, boxShadow: press ? 'none' : `0 ${4 * s}px 0 rgba(0,0,0,0.16)`, ...ring(b.id)})}>{b.label ?? 'Continue'}</div>;
      break;
    }
    case 'list':
      inner = <>{list.map((it, k) => <div key={k} style={box(items[k], {display: 'flex', alignItems: 'center', gap: 14 * s, padding: `0 ${12 * s}px`, borderRadius: 14 * s,
        background: st.pressed(it.id) ? `${accent}18` : PAPER.card, border: `${1.5 * s}px solid ${PAPER.track}`, ...ring(it.id), ...slide(it.id)})}>
        <div style={{width: 42 * s, height: 42 * s, borderRadius: 12 * s, background: TINTS[k % TINTS.length], display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0}}><Icon name={it.icon ?? 'circle'} size={24 * s} /></div>
        <div style={{fontSize: 21 * s, fontWeight: 700, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis'}}>{it.label}</div>
        {it.text ? <div style={{marginLeft: 'auto', fontSize: 19 * s, color: PAPER.inkSoft, whiteSpace: 'nowrap'}}>{it.text}</div> : null}
      </div>)}</>;
      break;
    case 'cards':
      inner = <>{list.map((it, k) => items[k] ? <div key={k} style={box(items[k], {borderRadius: 18 * s, background: PAPER.card, border: `${2 * s}px solid ${PAPER.ink}`, overflow: 'hidden',
        transform: `scale(${1 - 0.04 * st.pressed(it.id)})`, ...ring(it.id), ...slide(it.id)})}>
        <div style={{height: 84 * s, background: TINTS[k % TINTS.length], display: 'flex', alignItems: 'center', justifyContent: 'center', borderBottom: `${2 * s}px solid ${PAPER.ink}`}}><Icon name={it.icon ?? 'package'} size={44 * s} /></div>
        <div style={{padding: `${8 * s}px ${12 * s}px`}}>
          <div style={{fontSize: 19 * s, fontWeight: 700, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis'}}>{it.label}</div>
          {it.text ? <div style={{fontSize: 18 * s, color: accent, fontWeight: 800}}>{it.text}</div> : null}
        </div>
      </div> : null)}</>;
      break;
    case 'chat':
      inner = <>{list.map((it, k) => items[k] ? <div key={k} style={box(items[k], {borderRadius: 22 * s, borderBottomRightRadius: it.me ? 6 * s : 22 * s, borderBottomLeftRadius: it.me ? 22 * s : 6 * s,
        background: it.me ? accent : '#ece6dc', color: it.me ? '#fff' : PAPER.ink, padding: `${12 * s}px ${18 * s}px`, fontSize: 20 * s, lineHeight: 1.35, overflow: 'hidden', ...ring(it.id)})}>{it.label}</div> : null)}</>;
      break;
    case 'banner': {
      const v = VARIANT[b.variant ?? 'info'] ?? VARIANT.info;
      inner = <div style={{position: 'absolute', inset: 0, borderRadius: 16 * s, background: v.bg, color: v.ink, border: `${2 * s}px solid ${v.ink}`, display: 'flex', alignItems: 'center', gap: 12 * s, padding: `0 ${18 * s}px`, fontSize: 21 * s, fontWeight: 700, ...ring(b.id), ...slide(b.id)}}>
        <Icon name={b.icon ?? (b.variant === 'error' ? 'circle-alert' : b.variant === 'success' ? 'circle-check' : 'info')} size={26 * s} color={v.ink} />{b.label ?? b.text}
      </div>;
      break;
    }
    case 'tabs':
      return null; // drawn fixed at the bottom by ScreenView
  }
  return <div style={{position: 'absolute', left: 0, top: pb.y * s, width: PW * s, height: h * s}}>{inner}</div>;
};

const Tabs: FC<{pb: Placed; s: number; accent: string; st: ElState}> = ({pb, s, accent, st}) => {
  const list = (pb.block.items ?? []).map(asItem);
  return <div style={{position: 'absolute', left: 0, right: 0, bottom: 0, height: TABS * s, background: '#fffaf1', borderTop: `${2 * s}px solid ${PAPER.track}`}}>
    {list.map((it, k) => <div key={k} style={{position: 'absolute', left: pb.items[k].x * s, width: pb.items[k].w * s, top: 8 * s, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2 * s,
      color: k === 0 || st.pressed(it.id) ? accent : PAPER.inkSoft, fontSize: 15 * s, fontWeight: 700, borderRadius: 12 * s, ...(st.lit(it.id) ? {boxShadow: `0 0 0 ${4 * s}px rgba(255,85,0,${0.85 * st.lit(it.id)})`} : {})}}>
      <Icon name={it.icon ?? 'circle'} size={28 * s} color={k === 0 || st.pressed(it.id) ? accent : PAPER.inkSoft} />{it.label}
    </div>)}
  </div>;
};

const ScreenView: FC<{sc: Screen; lay: Layout; s: number; scroll: number; accent: string; st: ElState; f: number; time: string}> = ({sc, lay, s, scroll, accent, st, f, time}) => {
  if (sc.type === 'home') {
    return <div style={{position: 'absolute', inset: 0, background: 'linear-gradient(160deg, #f9d7c0 0%, #dcd2f3 55%, #bfe0ef 100%)'}}>
      <div style={{position: 'absolute', left: 0, right: 0, top: (TOP + 30) * s, textAlign: 'center', color: PAPER.ink}}>
        <div style={{fontSize: 76 * s, fontWeight: 800, letterSpacing: -2 * s}}>{time}</div>
        <div style={{fontSize: 20 * s, fontWeight: 600, color: PAPER.inkSoft}}>Tuesday, 14 May</div>
      </div>
      {(sc.apps ?? []).map((a) => {
        const r = lay.targets[a.id].r;
        const press = st.pressed(a.id);
        return <div key={a.id} style={{position: 'absolute', left: (PAD + r.x) * s, top: (TOP + r.y) * s, width: r.w * s}}>
          <div style={{width: r.w * s, height: r.h * s, borderRadius: 20 * s, background: a.color ?? accent, border: `${2 * s}px solid ${PAPER.ink}`, display: 'flex', alignItems: 'center', justifyContent: 'center',
            transform: `scale(${1 - 0.1 * press})`, filter: press ? 'brightness(0.9)' : undefined, boxShadow: st.lit(a.id) ? `0 0 0 ${4 * s}px rgba(255,85,0,${0.85 * st.lit(a.id)})` : `0 ${4 * s}px 0 rgba(0,0,0,0.15)`}}>
            <Icon name={a.icon ?? 'app-window'} size={40 * s} color="#fff" stroke={2.4} />
          </div>
          <div style={{textAlign: 'center', fontSize: 15 * s, fontWeight: 700, marginTop: 6 * s, width: (r.w + 20) * s, marginLeft: -10 * s, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis'}}>{a.label}</div>
        </div>;
      })}
    </div>;
  }
  const tabs = lay.placed.find((pb) => pb.block.type === 'tabs');
  return <div style={{position: 'absolute', inset: 0, background: '#fffdf8'}}>
    <div style={{position: 'absolute', left: PAD * s, top: (TOP - scroll) * s, width: PW * s}}>
      {lay.placed.map((pb, k) => <BlockView key={k} pb={pb} s={s} accent={accent} st={st} f={f} />)}
    </div>
    {tabs ? <Tabs pb={tabs} s={s} accent={accent} st={st} /> : null}
  </div>;
};

const KEYS = ['qwertyuiop', 'asdfghjkl', 'zxcvbnm'];
const Keyboard: FC<{s: number; k: number; lit?: string}> = ({s, k, lit}) => (
  <div style={{position: 'absolute', left: 0, right: 0, bottom: 0, height: KEYB * s, background: '#e4ded4', borderTop: `${2 * s}px solid ${PAPER.track}`, transform: `translateY(${(1 - k) * KEYB * s}px)`, padding: `${14 * s}px ${6 * s}px`, boxSizing: 'border-box', zIndex: 6}}>
    {KEYS.map((row, r) => <div key={r} style={{display: 'flex', justifyContent: 'center', gap: 6 * s, marginBottom: 10 * s}}>
      {row.split('').map((c) => <div key={c} style={{width: 35 * s, height: 50 * s, borderRadius: 8 * s, background: lit === c ? '#ffd2b0' : '#fffdf8', boxShadow: `0 ${2 * s}px 0 rgba(0,0,0,0.18)`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 21 * s, fontWeight: 600,
        transform: lit === c ? `translateY(${-3 * s}px) scale(1.12)` : undefined}}>{c}</div>)}
    </div>)}
    <div style={{display: 'flex', justifyContent: 'center', gap: 6 * s}}>
      <div style={{width: 80 * s, height: 50 * s, borderRadius: 8 * s, background: '#cfc8bd'}} />
      <div style={{width: 210 * s, height: 50 * s, borderRadius: 8 * s, background: lit === ' ' ? '#ffd2b0' : '#fffdf8', boxShadow: `0 ${2 * s}px 0 rgba(0,0,0,0.18)`}} />
      <div style={{width: 80 * s, height: 50 * s, borderRadius: 8 * s, background: '#cfc8bd'}} />
    </div>
  </div>
);

/** Touch indicator: a soft fingertip circle with a ripple. */
const Finger: FC<{x: number; y: number; s: number; press: number; ripple: number; opacity: number}> = ({x, y, s, press, ripple, opacity}) => (
  <div style={{position: 'absolute', left: x, top: y, opacity, pointerEvents: 'none', zIndex: 30}}>
    {ripple > 0 && ripple < 1 ? <div style={{position: 'absolute', left: -44 * s * (0.4 + ripple), top: -44 * s * (0.4 + ripple), width: 88 * s * (0.4 + ripple), height: 88 * s * (0.4 + ripple), borderRadius: '50%', border: `${3 * s}px solid rgba(255,85,0,${1 - ripple})`}} /> : null}
    <div style={{position: 'absolute', left: -27 * s, top: -27 * s, width: 54 * s, height: 54 * s, borderRadius: '50%', background: 'rgba(43,40,51,0.32)', border: `${3 * s}px solid rgba(255,255,255,0.95)`,
      boxShadow: `0 ${6 * s}px ${14 * s}px rgba(0,0,0,0.25)`, transform: `scale(${1 - 0.18 * press})`}} />
  </div>
);

/* ------------------------------------------------------------------------------ scene */

export const PhoneScene: FC<z.input<typeof phoneSceneSchema>> = (input) => {
  const p = phoneSceneSchema.parse(input) as Props;
  const f = useCurrentFrame();
  const {fps, width: W, height: H} = useVideoConfig();
  const u = useUnit();
  const len = useSceneLength();
  const layouts = new Map(p.screens.map((sc) => [sc.id, layoutScreen(sc)]));
  const screenById = new Map(p.screens.map((sc) => [sc.id, sc]));
  const acts = [...p.actions].sort((a, b) => a.at - b.at).map((a) => ({...a, fr: Math.round(a.at * len)}));
  type A = (typeof acts)[number];
  const TRANS = Math.round(fps * 0.45), MOVE = Math.round(fps * 0.5), TYPE_CPS = 11;

  // screen stack over time
  const navs: {fr: number; from: string; to: string; kind: 'zoom' | 'slide' | 'back'; origin?: Rect}[] = [];
  {
    const stack = [p.screens[0].id];
    acts.forEach((a, k) => {
      const from = stack[stack.length - 1];
      if (a.do === 'open' && a.screen && screenById.has(a.screen)) {
        stack.push(a.screen);
        const prev = acts.slice(0, k).reverse().find((x) => x.do === 'tap');
        const fromSc = screenById.get(from)!;
        const icon = prev && fromSc.type === 'home' && a.fr - prev.fr < fps * 0.8 && prev.to ? layouts.get(from)!.targets[prev.to]?.r : undefined;
        navs.push({fr: a.fr, from, to: a.screen, kind: icon ? 'zoom' : 'slide', origin: icon});
      }
      if (a.do === 'back' && stack.length > 1) { stack.pop(); navs.push({fr: a.fr, from, to: stack[stack.length - 1], kind: 'back'}); }
    });
  }
  const screenAt = (fr: number) => [...navs].reverse().find((n) => fr >= n.fr)?.to ?? p.screens[0].id;
  const nav = [...navs].reverse().find((n) => f >= n.fr && f < n.fr + TRANS);
  const curId = screenAt(f);

  // typing / otp values
  const typeStart = (a: A) => a.fr + 10;
  const typeEnd = (a: A) => typeStart(a) + Math.ceil(((a.text?.length ?? 0) / TYPE_CPS) * fps);
  const otpFill = (a: A) => a.fr + Math.round(fps * 0.9);
  const typed = new Map<string, string>();
  acts.forEach((a) => {
    if (a.do === 'type' && a.to && f >= typeStart(a)) typed.set(a.to, a.text!.slice(0, Math.floor(((f - typeStart(a)) / fps) * TYPE_CPS)));
    if (a.do === 'otp' && a.to && f >= otpFill(a)) typed.set(a.to, a.text!.slice(0, Math.floor((f - otpFill(a)) / 2.5) + 1));
  });
  const typingNow = acts.find((a) => a.do === 'type' && f >= a.fr && f < typeEnd(a) + 18);
  const kbK = typingNow ? Math.min(clamp01((f - typingNow.fr - 2) / 8), clamp01((typeEnd(typingNow) + 18 - f) / 8)) : 0;
  const kbLit = typingNow && f >= typeStart(typingNow) && f < typeEnd(typingNow) ? (typed.get(typingNow.to!) ?? '').slice(-1).toLowerCase() : undefined;

  // scrolling per screen (reset when a screen is opened)
  const viewH = SH - TOP - 20;
  const scrollAt = (fr: number) => {
    const id = screenAt(fr);
    const l = layouts.get(id)!;
    const since = [...navs].reverse().find((n) => fr >= n.fr)?.fr ?? -1;
    const hasTabs = screenById.get(id)!.blocks.some((b) => b.type === 'tabs');
    const maxS = Math.max(0, l.height - (viewH - (hasTabs ? TABS : 0)));
    let s0 = 0;
    acts.filter((a) => a.do === 'swipe' && (a.direction === 'up' || a.direction === 'down') && a.fr >= since && a.fr <= fr).forEach((a) => {
      const t = a.to ? l.targets[a.to] : undefined;
      const goal = t && !t.fixed ? t.r.y - viewH * 0.3 : s0 + (a.direction === 'up' ? 1 : -1) * viewH * 0.5;
      const k = ease(clamp01((fr - a.fr) / (fps * 0.5)));
      s0 += (Math.max(0, Math.min(maxS, goal)) - s0) * k;
    });
    // lift the page while the keyboard covers the input being typed into
    const tn = acts.find((a) => a.do === 'type' && fr >= a.fr && fr < typeEnd(a) + 18);
    if (tn && tn.to && l.targets[tn.to]) {
      const r = l.targets[tn.to].r;
      const need = TOP + r.y + r.h + 30 - s0 - (SH - KEYB);
      const k = Math.min(clamp01((fr - tn.fr - 2) / 8), clamp01((typeEnd(tn) + 18 - fr) / 8));
      if (need > 0) s0 += need * k;
    }
    return s0;
  };

  // phone placement: steps on the left, phone on the right when there is a title/notes; centred otherwise
  const notes = acts.filter((a) => a.note);
  const side = Boolean(p.title || p.eyebrow || notes.length);
  const devW = SW + BEZEL * 2, devH = SH + BEZEL * 2;
  const fit = Math.min(1, (H - 60 * u - 165 * u) / (devH * u)); // keep the phone above the captions
  const s = u * fit;
  const dx = side ? W * 0.68 - (devW * s) / 2 : (W - devW * s) / 2;
  const dy = 60 * u + (H - 60 * u - 165 * u - devH * s) / 2;
  const sx = dx + BEZEL * s, sy = dy + BEZEL * s; // screen origin on the frame
  const pointOn = (id: string | undefined, fr: number) => {
    if (!id) return null;
    if (id === 'notification') return {x: sx + (SW / 2) * s, y: sy + (STATUS + 50) * s};
    const t = layouts.get(screenAt(fr))!.targets[id];
    if (!t) return null;
    if (t.fixed) return {x: sx + (t.r.x + t.r.w / 2) * s, y: sy + (t.r.y + t.r.h / 2) * s};
    return {x: sx + (PAD + t.r.x + t.r.w / 2) * s, y: sy + (TOP + t.r.y + t.r.h / 2 - scrollAt(fr)) * s};
  };

  // touches: tap / type (taps the input) / swipe (drag)
  type Touch = {fr: number; end: number; a: {x: number; y: number}; b: {x: number; y: number}; to?: string; swipe?: boolean};
  const touches: Touch[] = [];
  acts.forEach((a) => {
    if (a.do === 'tap' || a.do === 'type') {
      const pt = pointOn(a.to, a.fr);
      if (pt) touches.push({fr: a.fr, end: a.fr, a: pt, b: pt, to: a.to});
    }
    if (a.do === 'swipe') {
      const c = pointOn(a.to, a.fr) ?? {x: sx + (SW / 2) * s, y: sy + (SH / 2) * s};
      const d = 160 * s;
      const v = {up: [0, 1], down: [0, -1], left: [1, 0], right: [-1, 0]}[a.direction ?? 'up'];
      touches.push({fr: a.fr, end: a.fr + Math.round(fps * 0.5), a: {x: c.x + v[0] * d, y: c.y + v[1] * d}, b: {x: c.x - v[0] * d, y: c.y - v[1] * d}, to: a.to, swipe: true});
    }
  });
  const entry = {x: sx + (SW + 60) * s, y: sy + (SH + 80) * s};
  let finger = {x: entry.x, y: entry.y, op: 0, press: 0, ripple: 0};
  {
    const prevI = touches.map((t) => t.fr <= f).lastIndexOf(true);
    const prev = touches[prevI], next = touches[prevI + 1];
    const chained = prev && next && next.fr - prev.end < fps * 1.4;
    if (prev && f <= prev.end) { // dragging
      const k = ease(clamp01((f - prev.fr) / Math.max(1, prev.end - prev.fr)));
      finger = {x: prev.a.x + (prev.b.x - prev.a.x) * k, y: prev.a.y + (prev.b.y - prev.a.y) * k, op: 1, press: prev.swipe ? 0.6 : interpolate(f - prev.fr, [0, 3, 8], [0, 1, 0], {extrapolateRight: 'clamp'}), ripple: prev.swipe ? 0 : clamp01((f - prev.fr) / 14)};
    } else if (next && f >= next.fr - MOVE) { // moving to the next touch
      const from = chained ? prev.b : entry;
      const k = ease(clamp01((f - (next.fr - MOVE)) / MOVE));
      finger = {x: from.x + (next.a.x - from.x) * k, y: from.y + (next.a.y - from.y) * k, op: chained ? 1 : clamp01(k * 2.5), press: 0, ripple: 0};
    } else if (prev) { // resting after a touch, then leaving
      const k = clamp01((f - prev.end) / 14);
      finger = {x: prev.b.x, y: prev.b.y, op: chained ? 1 : 1 - k, press: 0, ripple: prev.swipe ? 0 : clamp01((f - prev.fr) / 14)};
    }
  }

  // element states
  const st: ElState = {
    pressed: (id) => { const t = touches.find((x) => !x.swipe && x.to === id && f >= x.fr && f < x.fr + 9); return t ? interpolate(f - t.fr, [0, 3, 9], [0, 1, 0]) : 0; },
    lit: (id) => {
      const h = acts.find((a) => (a.do === 'highlight' || a.do === 'otp') && a.to === id && f >= (a.do === 'otp' ? otpFill(a) : a.fr) && f < (a.do === 'otp' ? otpFill(a) : a.fr) + fps * 1.8);
      if (!h) return 0;
      const s0 = h.do === 'otp' ? otpFill(h) : h.fr;
      return Math.min(1, (f - s0) / 6, (s0 + fps * 1.8 - f) / 8) * (0.75 + 0.25 * Math.sin((f - s0) / 4));
    },
    typed: (id) => (id ? typed.get(id) : undefined),
    focused: (id) => Boolean(id && acts.some((a) => (a.do === 'type' && a.to === id && f >= a.fr && f < typeEnd(a) + 18) || (a.do === 'otp' && a.to === id && f >= a.fr && f < otpFill(a) + 20))),
    swiped: (id) => {
      const a = acts.find((x) => x.do === 'swipe' && x.to === id && (x.direction === 'left' || x.direction === 'right') && f >= x.fr);
      return a ? (a.direction === 'left' ? -1 : 1) * ease(clamp01((f - a.fr - 4) / (fps * 0.4))) : 0;
    },
  };

  // overlays: notification / otp banner, wait spinner, toast
  const notifs = acts.filter((a) => a.do === 'notify' || a.do === 'otp').map((a) => {
    const tapped = acts.find((t) => t.do === 'tap' && t.to === 'notification' && t.fr > a.fr);
    const end = a.do === 'otp' ? otpFill(a) + Math.round(fps * 1.3) : Math.min(a.fr + Math.round(fps * 2.8), tapped ? tapped.fr + 8 : Infinity);
    return {a, end};
  });
  const shownNote = [...notifs].reverse().find((n) => f >= n.a.fr && f < n.end);
  const noteK = shownNote ? Math.min(spring({frame: f - shownNote.a.fr, fps, config: {damping: 15, stiffness: 140}}), clamp01((shownNote.end - f) / 7)) : 0;
  const wait = acts.find((a) => a.do === 'wait' && f >= a.fr && f < a.fr + (a.seconds ?? 1.2) * fps);
  const waitK = wait ? Math.min(clamp01((f - wait.fr) / 6), clamp01((wait.fr + (wait.seconds ?? 1.2) * fps - f) / 6)) : 0;
  const toast = [...acts].reverse().find((a) => a.do === 'toast' && f >= a.fr && f < a.fr + fps * 2.6);
  const toastK = toast ? Math.min(spring({frame: f - toast.fr, fps, config: {damping: 14}}), clamp01((toast.fr + fps * 2.6 - f) / 8)) : 0;

  // camera focus
  let cam = {k: 1, x: W / 2, y: H / 2};
  acts.filter((a) => a.do === 'focus' || a.do === 'unfocus').forEach((z0) => {
    if (f < z0.fr) return;
    const goal = z0.do === 'focus' ? {k: 1.4, ...(pointOn(z0.to, z0.fr) ?? {x: W / 2, y: H / 2})} : {k: 1, x: W / 2, y: H / 2};
    const t = ease(clamp01((f - z0.fr) / (fps * 0.6)));
    cam = {k: cam.k + (goal.k - cam.k) * t, x: cam.x + (goal.x - cam.x) * t, y: cam.y + (goal.y - cam.y) * t};
  });
  const zb = (cam.k - 1) / 0.4;
  const tx = (W / 2 - cam.k * cam.x) * zb + (cam.x - cam.k * cam.x) * (1 - zb);
  const ty = (H / 2 - cam.k * cam.y) * zb + (cam.y - cam.k * cam.y) * (1 - zb);
  const camera = cam.k === 1 ? undefined : `translate(${tx}px, ${ty}px) scale(${cam.k})`;

  // screens with transitions
  const view = (id: string, style: CSSProperties, key: string) => (
    <div key={key} style={{position: 'absolute', inset: 0, overflow: 'hidden', ...style}}>
      <ScreenView sc={screenById.get(id)!} lay={layouts.get(id)!} s={s} scroll={scrollAt(f)} accent={p.accent} st={st} f={f} time={p.time} />
    </div>
  );
  let screens: ReactNode;
  if (nav) {
    const k = ease(clamp01((f - nav.fr) / TRANS));
    if (nav.kind === 'zoom' && nav.origin) {
      const o = nav.origin;
      const ox = PAD + o.x + o.w / 2, oy = TOP + o.y + o.h / 2;
      const sc0 = o.w / SW;
      const sc1 = sc0 + (1 - sc0) * k;
      screens = <>
        {view(nav.from, {transform: `scale(${1 + 0.06 * k})`, filter: `blur(${2 * k * s}px)`}, 'from')}
        {view(nav.to, {transformOrigin: '0 0', transform: `translate(${(ox - (SW / 2) * sc1) * (1 - k) * s}px, ${(oy - (SH / 2) * sc1) * (1 - k) * s}px) scale(${sc1})`, borderRadius: 40 * (1 - k) * s, opacity: clamp01(k * 3)}, 'to')}
      </>;
    } else if (nav.kind === 'slide') {
      screens = <>
        {view(nav.from, {transform: `translateX(${-0.3 * SW * k * s}px)`, filter: `brightness(${1 - 0.15 * k})`}, 'from')}
        {view(nav.to, {transform: `translateX(${SW * (1 - k) * s}px)`, boxShadow: `${-8 * s}px 0 ${24 * s}px rgba(0,0,0,0.15)`}, 'to')}
      </>;
    } else {
      screens = <>
        {view(nav.to, {transform: `translateX(${-0.3 * SW * (1 - k) * s}px)`, filter: `brightness(${0.85 + 0.15 * k})`}, 'to')}
        {view(nav.from, {transform: `translateX(${SW * k * s}px)`, boxShadow: `${-8 * s}px 0 ${24 * s}px rgba(0,0,0,0.15)`}, 'from')}
      </>;
    }
  } else screens = view(curId, {}, 'cur');

  const enter = p.instant ? 1 : spring({frame: f, fps, config: {damping: 16, stiffness: 110}});
  const titleIn = p.instant ? 1 : spring({frame: f - 2, fps, config: {damping: 200}});
  const onHome = !nav && screenById.get(curId)!.type === 'home';

  const cues: Cue[] = [];
  if (p.sound) acts.forEach((a) => {
    if (a.do === 'tap' || a.do === 'type') cues.push({sound: 'tick', at: a.fr, volume: 0.45});
    if (a.do === 'type') cues.push({sound: 'typing', at: typeStart(a), volume: 0.4, duration: Math.max(4, typeEnd(a) - typeStart(a)), loop: true});
    if (a.do === 'swipe') cues.push({sound: 'swipe', at: a.fr, volume: 0.3});
    if (a.do === 'open' || a.do === 'back') cues.push({sound: 'whoosh', at: a.fr, volume: 0.18});
    if (a.do === 'notify') cues.push({sound: 'notify', at: a.fr, volume: 0.4});
    if (a.do === 'otp') { cues.push({sound: 'notify', at: a.fr, volume: 0.4}); cues.push({sound: 'sparkle', at: otpFill(a), volume: 0.3}); }
    if (a.do === 'toast') cues.push({sound: a.variant === 'error' ? 'error' : 'success', at: a.fr, volume: 0.35});
    if (a.do === 'highlight') cues.push({sound: 'chime', at: a.fr, volume: 0.18});
    if (a.do === 'focus') cues.push({sound: 'rise', at: a.fr, volume: 0.18});
    if (a.do === 'wait') cues.push({sound: 'data', at: a.fr, volume: 0.12});
  });

  // step list beside the phone
  const activeNote = [...notes].reverse().findIndex((a) => f >= a.fr);
  const curNote = activeNote < 0 ? -1 : notes.length - 1 - activeNote;

  return (
    <PaperStage eyebrow={p.eyebrow} title={p.title} instant={p.instant} side={side}>
      {side ? (
        <div style={{position: 'absolute', left: 110 * u, top: 0, bottom: 120 * u, width: W * 0.68 - (devW * s) / 2 - 190 * u, display: 'flex', flexDirection: 'column', justifyContent: 'center', opacity: titleIn, transform: `translateY(${(1 - titleIn) * 16 * u}px)`}}>
          {p.eyebrow ? <div style={{fontFamily: PAPER.font, fontWeight: 700, fontSize: 22 * u, letterSpacing: 3 * u, color: '#8a6fd1', textTransform: 'uppercase'}}>{p.eyebrow}</div> : null}
          {p.title ? <div style={{fontSize: 52 * u, fontWeight: 800, marginTop: 8 * u, lineHeight: 1.12}}>{p.title}</div> : null}
          <div style={{marginTop: 40 * u, display: 'flex', flexDirection: 'column', gap: 18 * u}}>
            {notes.map((a, k) => {
              const on = f >= a.fr;
              const kIn = on ? spring({frame: f - a.fr, fps, config: {damping: 16}}) : 0;
              const current = k === curNote;
              return <div key={k} style={{display: 'flex', alignItems: 'center', gap: 18 * u, opacity: 0.35 + 0.65 * kIn, transform: `translateX(${(1 - kIn) * -12 * u}px)`}}>
                <div style={{width: 46 * u, height: 46 * u, borderRadius: '50%', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800, fontSize: 22 * u,
                  background: current ? '#ff5500' : on ? PAPER.ink : PAPER.track, color: on ? '#fff' : PAPER.inkSoft, border: `${2 * u}px solid ${PAPER.ink}`}}>{on && !current ? '✓' : k + 1}</div>
                <div style={{fontSize: 30 * u, fontWeight: current ? 800 : 600, color: on ? PAPER.ink : PAPER.inkSoft}}>{a.note}</div>
              </div>;
            })}
          </div>
        </div>
      ) : null}
      <div style={{position: 'absolute', inset: 0, transform: camera, transformOrigin: '0 0'}}>
        <div style={{position: 'absolute', left: dx, top: dy, width: devW * s, height: devH * s, opacity: enter, transform: `translateY(${(1 - enter) * 80 * u}px)`}}>
          <div style={{position: 'absolute', inset: 0, borderRadius: 64 * s, background: '#34313d', border: `${3 * s}px solid ${PAPER.ink}`, boxSizing: 'border-box', boxShadow: `0 ${20 * s}px ${40 * s}px rgba(70,50,30,0.25)`}} />
          <div style={{position: 'absolute', left: -6 * s, top: 190 * s, width: 6 * s, height: 70 * s, borderRadius: 3 * s, background: '#34313d'}} />
          <div style={{position: 'absolute', right: -6 * s, top: 240 * s, width: 6 * s, height: 110 * s, borderRadius: 3 * s, background: '#34313d'}} />
          <div style={{position: 'absolute', left: BEZEL * s, top: BEZEL * s, width: SW * s, height: SH * s, borderRadius: 50 * s, overflow: 'hidden', background: '#fffdf8'}}>
            {screens}
            {/* status bar */}
            <div style={{position: 'absolute', left: 0, right: 0, top: 0, height: STATUS * s, display: 'flex', alignItems: 'center', padding: `0 ${34 * s}px`, fontSize: 20 * s, fontWeight: 800, zIndex: 5, background: onHome ? 'transparent' : '#fffdf8'}}>
              <span>{p.time}</span>
              <div style={{position: 'absolute', left: '50%', top: 12 * s, marginLeft: -60 * s, width: 120 * s, height: 34 * s, borderRadius: 17 * s, background: '#1d1b22'}} />
              <span style={{marginLeft: 'auto', display: 'flex', gap: 6 * s, alignItems: 'center'}}>
                <Signal width={20 * s} height={20 * s} strokeWidth={2.6} /><Wifi width={20 * s} height={20 * s} strokeWidth={2.6} /><Battery width={26 * s} height={26 * s} strokeWidth={2.2} />
              </span>
            </div>
            {/* notification / OTP message */}
            {shownNote ? (
              <div style={{position: 'absolute', left: 12 * s, right: 12 * s, top: (STATUS - 2) * s, zIndex: 8, transform: `translateY(${(noteK - 1) * 140 * s}px)`, opacity: clamp01(noteK * 2),
                background: 'rgba(255,253,248,0.97)', borderRadius: 24 * s, border: `${2 * s}px solid ${PAPER.ink}`, boxShadow: `0 ${10 * s}px ${24 * s}px rgba(0,0,0,0.18)`, padding: `${14 * s}px ${16 * s}px`, display: 'flex', gap: 14 * s, alignItems: 'center'}}>
                <div style={{width: 48 * s, height: 48 * s, borderRadius: 12 * s, flexShrink: 0, background: shownNote.a.do === 'otp' ? '#4cc06a' : p.accent, display: 'flex', alignItems: 'center', justifyContent: 'center'}}>
                  <Icon name={shownNote.a.icon ?? (shownNote.a.do === 'otp' ? 'message-circle' : 'bell')} size={28 * s} color="#fff" />
                </div>
                <div style={{minWidth: 0, flex: 1}}>
                  <div style={{display: 'flex', fontSize: 17 * s, color: PAPER.inkSoft, fontWeight: 700}}>{shownNote.a.do === 'otp' ? 'MESSAGES' : (shownNote.a.title ?? 'App').toUpperCase()}<span style={{marginLeft: 'auto', fontWeight: 500}}>now</span></div>
                  <div style={{fontSize: 20 * s, fontWeight: 700, marginTop: 2 * s, lineHeight: 1.3}}>
                    {shownNote.a.do === 'otp' ? <>{shownNote.a.title ? `${shownNote.a.title}: ` : ''}Your code is <span style={{color: p.accent, letterSpacing: 2 * s}}>{shownNote.a.text}</span></> : shownNote.a.text}
                  </div>
                </div>
              </div>
            ) : null}
            {/* keyboard */}
            {kbK > 0 ? <Keyboard s={s} k={ease(kbK)} lit={kbLit} /> : null}
            {/* wait spinner */}
            {waitK > 0 ? (
              <div style={{position: 'absolute', inset: 0, zIndex: 9, background: `rgba(43,40,51,${0.25 * waitK})`, display: 'flex', alignItems: 'center', justifyContent: 'center'}}>
                <div style={{background: '#fffdf8', borderRadius: 24 * s, padding: `${28 * s}px ${36 * s}px`, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 16 * s, transform: `scale(${0.85 + 0.15 * waitK})`, opacity: waitK, border: `${2 * s}px solid ${PAPER.ink}`}}>
                  <div style={{width: 54 * s, height: 54 * s, borderRadius: '50%', border: `${6 * s}px solid ${PAPER.track}`, borderTopColor: p.accent, transform: `rotate(${f * 24}deg)`}} />
                  <div style={{fontSize: 21 * s, fontWeight: 700}}>{wait?.text ?? 'Please wait'}</div>
                </div>
              </div>
            ) : null}
            {/* snackbar */}
            {toast ? (() => {
              const v = VARIANT[toast.variant ?? 'success'];
              return <div style={{position: 'absolute', left: 20 * s, right: 20 * s, bottom: (kbK > 0 ? KEYB + 16 : 110) * s, zIndex: 10, padding: `${16 * s}px ${20 * s}px`, borderRadius: 18 * s, background: v.bg, color: v.ink, border: `${2.5 * s}px solid ${v.ink}`,
                fontSize: 21 * s, fontWeight: 800, display: 'flex', alignItems: 'center', gap: 12 * s, opacity: toastK, transform: `translateY(${(1 - toastK) * 40 * s}px)`, boxShadow: `0 ${10 * s}px ${20 * s}px rgba(0,0,0,0.12)`}}>
                <Icon name={toast.variant === 'error' ? 'circle-x' : toast.variant === 'info' ? 'info' : 'circle-check'} size={26 * s} color={v.ink} />{toast.text}
              </div>;
            })() : null}
            {/* home indicator */}
            <div style={{position: 'absolute', left: '50%', bottom: 10 * s, marginLeft: -70 * s, width: 140 * s, height: 6 * s, borderRadius: 3 * s, background: PAPER.ink, opacity: 0.6, zIndex: 11}} />
          </div>
        </div>
        <Finger x={finger.x} y={finger.y} s={u * Math.max(0.85, fit)} press={finger.press} ripple={finger.ripple} opacity={finger.op * enter} />
      </div>
      {cues.map((c, k) => <Sfx key={k} sound={c.sound} at={c.at} volume={c.volume} duration={c.duration} loop={c.loop} />)}
    </PaperStage>
  );
};
