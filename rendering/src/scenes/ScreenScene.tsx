/**
 * ScreenScene: a website or app being used, in the paper style. A device (laptop, monitor, phone or a
 * bare browser window) shows a page built from blocks; a timed script moves the mouse, clicks, types,
 * scrolls, opens other pages (address bar + loading bar), shows toasts and zooms in on details.
 *
 * Everything the pointer aims at comes from the same layout numbers the page is drawn with, so clicks
 * always land on the element. Timing ("at") is a fraction of the scene, like IsoScene.
 */
import type {CSSProperties, FC, ReactNode} from 'react';
import {AbsoluteFill, Easing, interpolate, spring, useCurrentFrame, useVideoConfig} from 'remotion';
import {Lock} from 'lucide-react';
import {z} from 'zod';
import {Sfx} from '../audio';
import {PAPER} from '../iso/iso';
import {iconByName} from '../iso/objects';
import {useSceneLength, useUnit} from '../theme';
import {IsoRegion, IsoScene, isoSceneSchema} from './IsoScene';
import {ChatPanel, flexChat, messageSchema} from './ChatScene';
import {DEVICE_ALIASES, clamp01, flexList, flexValue} from './paperStage';

/* ------------------------------------------------------------------------------ schema */

const fraction = z.number().min(0).max(1);
const itemSchema = z.union([
  z.string().max(48),
  z.object({
    id: z.string().max(30).optional(),
    label: z.string().max(40),
    text: z.string().max(60).optional(), // second line: price, date, detail
    icon: z.string().max(30).optional(), // Lucide icon name
  }).strict(),
]);
const BLOCK_TYPES = ['nav', 'hero', 'heading', 'text', 'image', 'cards', 'card', 'button', 'input', 'list', 'banner', 'footer'] as const;
const blockSchema = z.object({
  id: z.string().max(30).optional(), // needed only for things the script points at
  type: z.enum(BLOCK_TYPES),
  label: z.string().max(60).optional(), // heading / brand / button text / input label / banner text
  text: z.string().max(140).optional(), // body text
  button: z.string().max(24).optional(), // nav / hero call-to-action
  items: z.array(itemSchema).max(6).optional(), // nav links, cards, list rows
  icon: z.string().max(30).optional(),
  image: z.boolean().optional(), // hero: picture on the right
  placeholder: z.string().max(40).optional(), // input
  value: z.string().max(40).optional(), // input already filled in
  mask: z.boolean().optional(), // input: password dots
  variant: z.enum(['primary', 'secondary', 'success', 'error', 'info']).optional(),
  align: z.enum(['left', 'center']).optional(),
}).strict();
const pageSchema = z.object({
  id: z.string().min(1).max(30),
  url: z.string().max(60).optional(),
  blocks: z.array(blockSchema).min(1).max(12),
}).strict();
const ACTIONS = ['move', 'hover', 'click', 'type', 'scroll', 'navigate', 'highlight', 'toast', 'focus', 'unfocus'] as const;
const actionSchema = z.object({
  at: fraction,
  do: z.enum(ACTIONS),
  to: z.string().max(30).optional(), // element id (block id or item id)
  text: z.string().max(60).optional(), // type: what is typed; toast: the message
  page: z.string().max(30).optional(), // navigate: page id
  by: z.number().min(-3000).max(3000).optional(), // scroll by px (instead of "to")
  variant: z.enum(['success', 'error', 'info']).optional(), // toast colour
}).strict();

const EXAMPLE_PAGES: z.output<typeof pageSchema>[] = [
  {id: 'home', url: 'shop.example.com', blocks: [
    {type: 'nav', label: 'Shoply', items: ['Shop', 'Deals', 'Help'], button: 'Cart'},
    {type: 'hero', label: 'Run lighter', text: 'New trainers for every day.', button: 'Shop now', image: true},
    {id: 'products', type: 'cards', items: [
      {id: 'p1', label: 'Trail runner', text: '$40', icon: 'footprints'},
      {id: 'p2', label: 'City walker', text: '$55', icon: 'footprints'},
      {id: 'p3', label: 'Court classic', text: '$62', icon: 'footprints'}]},
  ]},
  {id: 'product', url: 'shop.example.com/trail-runner', blocks: [
    {type: 'nav', label: 'Shoply', items: ['Shop', 'Deals', 'Help'], button: 'Cart'},
    {type: 'hero', label: 'Trail runner', text: 'Grippy sole, light mesh. $40', image: true},
    {id: 'buy', type: 'button', label: 'Add to cart'},
  ]},
];
const EXAMPLE_ACTIONS: z.output<typeof actionSchema>[] = [
  {at: 0.15, do: 'move', to: 'p1'},
  {at: 0.3, do: 'click', to: 'p1'},
  {at: 0.32, do: 'navigate', page: 'product'},
  {at: 0.55, do: 'click', to: 'buy'},
  {at: 0.6, do: 'toast', text: 'Added to cart', variant: 'success'},
];

const VERBS: Record<string, string> = {tap: 'click', press: 'click', select: 'click', choose: 'click', fill: 'type', input: 'type', enter: 'type', write: 'type',
  open: 'navigate', go: 'navigate', goto: 'navigate', visit: 'navigate', load: 'navigate', redirect: 'navigate', 'go to': 'navigate',
  notify: 'toast', message: 'toast', snackbar: 'toast', alert: 'toast', notification: 'toast', zoom: 'focus', 'zoom in': 'focus', 'zoom out': 'unfocus',
  glow: 'highlight', point: 'highlight', mouseover: 'hover', moveto: 'move', 'move to': 'move', 'scroll down': 'scroll', 'scroll to': 'scroll'};
/** Forgiving input: page shorthand, device names, action verbs/keys AIs often use, the chat widget. */
const flexScreen = (raw: unknown) => {
  if (!raw || typeof raw !== 'object') return raw;
  let r = {...(raw as Record<string, unknown>)};
  // shorthand: "page": [blocks] for a one-page scene
  if (Array.isArray(r.page) && !r.pages) {
    const {page, url, ...rest} = r as {page: unknown[]; url?: string};
    r = {...rest, url, pages: [{id: 'home', url, blocks: page}]};
  }
  r.device = flexValue(r.device, {...DEVICE_ALIASES, window: 'browser', card: 'browser'});
  if (r.pages !== undefined && r.actions === undefined) r.actions = []; // own pages: never the built-in demo script
  const pageIds = new Set(Array.isArray(r.pages) ? (r.pages as {id?: unknown}[]).map((pg) => String(pg?.id)) : []);
  r.actions = flexList(r.actions, {
    keys: {action: 'do', verb: 'do', type: 'do', target: 'to', element: 'to', selector: 'to', value: 'text', content: 'text', message: 'text', amount: 'by', color: 'variant'},
    values: {do: (v) => VERBS[v] ?? v},
  });
  if (Array.isArray(r.actions)) r.actions = (r.actions as Record<string, unknown>[]).map((a) => {
    if (!a || typeof a !== 'object') return a;
    const o = {...a};
    if (o.do === 'navigate' && o.page === undefined && typeof o.to === 'string' && pageIds.has(o.to)) { o.page = o.to; delete o.to; }
    if (o.do === 'navigate' && o.page === undefined && typeof o.url === 'string') { o.page = o.url; delete o.url; }
    if (typeof o.variant === 'string') o.variant = flexValue(o.variant, {ok: 'success', done: 'success', green: 'success', fail: 'error', failed: 'error', danger: 'error', red: 'error', warning: 'error', blue: 'info', note: 'info'});
    return o;
  });
  if (r.chat && typeof r.chat === 'object' && !Array.isArray(r.chat)) r.chat = flexChat(r.chat);
  else if (Array.isArray(r.chat)) r.chat = flexChat({messages: r.chat});
  return r;
};

const chatWidgetSchema = z.object({
  name: z.string().max(30).optional(),
  look: z.enum(['assistant', 'messenger']).default('assistant'),
  icon: z.string().max(30).optional(),
  device: z.string().optional(), // ignored (comes from the shared chat aliases)
  messages: z.array(messageSchema).min(1).max(8),
  composer: z.boolean().default(true),
  open: fraction.optional(), // when the widget opens if no action clicks "chat" (default: just before the first message)
}).strict();

export const screenSceneSchema = z.preprocess(flexScreen, z.object({
  eyebrow: z.string().max(40).optional(),
  title: z.string().max(70).optional(),
  device: z.enum(['laptop', 'monitor', 'phone', 'browser']).default('laptop'),
  url: z.string().max(60).optional(), // address bar of the first page (pages may set their own)
  accent: z.string().max(20).default('#4f6ef5'), // the site's own colour (buttons, links)
  pages: z.array(pageSchema).min(1).max(6).default(() => EXAMPLE_PAGES),
  actions: z.array(actionSchema).max(30).default(() => EXAMPLE_ACTIONS),
  instant: z.boolean().default(false), // device already on screen (coming back from a diagram)
  chat: chatWidgetSchema.optional(), // a chat widget: a bubble in the corner of the page; click "chat" (or it opens itself) and the conversation plays
  diagram: isoSceneSchema.optional(), // split view: the screen on the left, this IsoScene diagram on the right, same timeline
  sound: z.boolean().default(true),
}).strict().superRefine((p, ctx) => {
  const pages = new Map(p.pages.map((pg) => [pg.id, pg]));
  if (pages.size !== p.pages.length) ctx.addIssue({code: 'custom', path: ['pages'], message: 'page ids must be unique'});
  let cur = p.pages[0];
  [...p.actions].map((a, i) => ({a, i})).sort((x, y) => x.a.at - y.a.at).forEach(({a, i}) => {
    if (a.do === 'navigate') {
      const next = a.page ? pages.get(a.page) : undefined;
      if (!next) ctx.addIssue({code: 'custom', path: ['actions', i, 'page'], message: `navigate needs "page" = one of: ${[...pages.keys()].join(', ')}`});
      else cur = next;
      return;
    }
    const needsTo = ['move', 'hover', 'click', 'type', 'highlight', 'focus'].includes(a.do);
    if (needsTo || (a.do === 'scroll' && a.to)) {
      const ids = [...targetIds(cur), ...(p.chat ? ['chat'] : [])];
      if (!a.to) ctx.addIssue({code: 'custom', path: ['actions', i, 'to'], message: `"${a.do}" needs "to": an element id on page "${cur.id}" (${ids.join(', ') || 'give blocks an id'})`});
      else if (!ids.includes(a.to)) ctx.addIssue({code: 'custom', path: ['actions', i, 'to'], message: `"${a.to}" is not on page "${cur.id}" at that time; ids there: ${ids.join(', ') || 'none (give blocks an id)'}`});
      else if (a.do === 'type' && !cur.blocks.some((b) => b.id === a.to && b.type === 'input')) ctx.addIssue({code: 'custom', path: ['actions', i, 'to'], message: '"type" must target an input block'});
    }
    if (a.do === 'type' && !a.text) ctx.addIssue({code: 'custom', path: ['actions', i, 'text'], message: '"type" needs "text"'});
    if (a.do === 'toast' && !a.text) ctx.addIssue({code: 'custom', path: ['actions', i, 'text'], message: '"toast" needs "text"'});
  });
}));
type Props = z.output<typeof screenSceneSchema>;
type Block = z.output<typeof blockSchema>;
type Page = z.output<typeof pageSchema>;
type Item = {id?: string; label: string; text?: string; icon?: string};

const asItem = (it: z.output<typeof itemSchema>): Item => (typeof it === 'string' ? {label: it} : it);
function targetIds(page: Page): string[] {
  return page.blocks.flatMap((b) => [b.id, ...(b.items ?? []).map((it) => asItem(it).id)]).filter((x): x is string => Boolean(x));
}

export const description =
  'A website or app being used, in the paper style: a laptop, monitor, phone or browser window shows pages built ' +
  'from blocks (nav, hero, heading, text, image, cards, card, button, input, list, banner, footer); a timed script ' +
  'moves the mouse, clicks, types into inputs (or password dots), scrolls, opens other pages (address bar + loading ' +
  'bar), shows toasts and zooms in on an element. Use to show what the user does and sees (sign up, search, buy, ' +
  'log in, submit a form). Add "diagram" (IsoScene props: objects, links, steps) to show the screen on the left and ' +
  'what happens behind it on the right at the same time (the click on the left, the request travelling on the right).';
export const tags = ['website', 'web', 'browser', 'app', 'ui', 'screen', 'click', 'mouse', 'typing', 'form', 'login',
  'sign up', 'checkout', 'demo', 'how-to', 'page', 'url', 'search', 'saas', 'user interface'];

/* ------------------------------------------------------------------------------ layout */

type Rect = {x: number; y: number; w: number; h: number};
type Placed = {block: Block; y: number; h: number; parts: Record<string, Rect>; items: Rect[]};
const PAD = 36, GAP = 22;

/** Page layout in page pixels (u = 1): block positions, and the rect of every pointable thing. */
const layoutPage = (page: Page, PW: number) => {
  const placed: Placed[] = [];
  const targets: Record<string, Rect> = {};
  let y = 0;
  page.blocks.forEach((b) => {
    const parts: Record<string, Rect> = {};
    const items: Rect[] = [];
    let h = 80;
    const list = (b.items ?? []).map(asItem);
    switch (b.type) {
      case 'nav': {
        h = 76;
        if (b.button) parts.button = {x: PW - 140, y: 16, w: 140, h: 44};
        const right = b.button ? PW - 170 : PW;
        list.forEach((_, k) => items.push({x: right - (list.length - k) * 112, y: 18, w: 104, h: 40}));
        break;
      }
      case 'hero': {
        h = b.button ? 256 : 206;
        if (b.button) parts.button = {x: 0, y: 178, w: 230, h: 58};
        if (b.image) parts.image = {x: PW * 0.56, y: 18, w: PW * 0.44, h: h - 36};
        break;
      }
      case 'heading': h = 66; break;
      case 'text': h = 92; break;
      case 'image': h = 250; break;
      case 'cards': case 'card': {
        h = 216;
        const n = Math.max(1, list.length || 1);
        const w = b.type === 'card' ? Math.min(PW, 360) : (PW - GAP * (n - 1)) / n;
        for (let k = 0; k < n; k++) items.push({x: k * (w + GAP), y: 8, w, h: h - 16});
        break;
      }
      case 'button': {
        h = 84;
        const w = 250;
        parts.button = {x: b.align === 'center' ? (PW - w) / 2 : 0, y: 12, w, h: 60};
        break;
      }
      case 'input': {
        h = 116;
        parts.box = {x: 0, y: 36, w: Math.min(PW, 600), h: 64};
        break;
      }
      case 'list': {
        h = Math.max(1, list.length) * 56 + 12;
        list.forEach((_, k) => items.push({x: 0, y: 6 + k * 56, w: PW, h: 50}));
        break;
      }
      case 'banner': h = 80; break;
      case 'footer': h = 96; break;
    }
    const at = (r: Rect): Rect => ({x: r.x, y: r.y + y, w: r.w, h: r.h});
    if (b.id) targets[b.id] = at(parts.button ?? parts.box ?? {x: 0, y: 0, w: PW, h});
    list.forEach((it, k) => { if (it.id && items[k]) targets[it.id] = at(items[k]); });
    placed.push({block: b, y, h, parts, items});
    y += h + GAP;
  });
  return {placed, targets, height: y};
};

/* ------------------------------------------------------------------------------ drawing */

const VARIANT: Record<string, {bg: string; ink: string}> = {
  success: {bg: '#dff3e2', ink: '#2f7a3d'}, error: {bg: '#fbe1dc', ink: '#b2402f'}, info: {bg: '#e1ebfb', ink: '#3456a8'},
};
const TINTS = ['#f7c6a3', '#b8d6f3', '#b9e2c7', '#cdc3ee', '#f4da93', '#f3b9c6'];

const IconIn: FC<{name?: string; size: number; color?: string}> = ({name, size, color = PAPER.ink}) => {
  const I = iconByName(name);
  return I ? <I width={size} height={size} color={color} strokeWidth={2.2} /> : null;
};

type ElState = {pressed: (id?: string) => number; hovered: (id?: string) => boolean; lit: (id?: string) => number; typed: (id?: string) => string | undefined};

const BlockView: FC<{pb: Placed; PW: number; u: number; accent: string; st: ElState; f: number; reveal: number}> = ({pb, PW, u, accent, st, f, reveal}) => {
  const {block: b, h, parts, items} = pb;
  const list = (b.items ?? []).map(asItem);
  const box = (r: Rect, extra: CSSProperties = {}): CSSProperties => ({position: 'absolute', left: r.x * u, top: r.y * u, width: r.w * u, height: r.h * u, ...extra});
  const ring = (id?: string): CSSProperties => {
    const l = st.lit(id);
    return l > 0 ? {boxShadow: `0 0 0 ${4 * u}px rgba(255,85,0,${0.85 * l}), 0 0 ${26 * u * l}px rgba(255,140,40,${0.6 * l})`} : {};
  };
  const btn = (r: Rect, label: string, id?: string, variant: string = 'primary'): ReactNode => {
    const press = st.pressed(id), hov = st.hovered(id);
    const primary = variant !== 'secondary';
    return <div style={box(r, {borderRadius: 14 * u, background: primary ? accent : PAPER.card, color: primary ? '#fff' : PAPER.ink,
      border: `${2 * u}px solid ${primary ? accent : PAPER.ink}`, display: 'flex', alignItems: 'center', justifyContent: 'center',
      fontWeight: 700, fontSize: 24 * u, transform: `scale(${1 - 0.06 * press})`, filter: hov ? 'brightness(1.08)' : undefined,
      boxShadow: press > 0 ? 'none' : `0 ${4 * u}px 0 ${primary ? 'rgba(0,0,0,0.18)' : PAPER.track}`, ...ring(id)})}>{label}</div>;
  };
  const textLines = (n: number, w = 1) => Array.from({length: n}, (_, k) => <div key={k} style={{height: 12 * u, borderRadius: 6 * u, background: PAPER.track, width: `${(k === n - 1 ? 0.6 : 0.92) * w * 100}%`, marginTop: 12 * u}} />);
  const style: CSSProperties = {position: 'absolute', left: 0, top: pb.y * u, width: PW * u, height: h * u, opacity: reveal, transform: `translateY(${(1 - reveal) * 14 * u}px)`};
  let inner: ReactNode = null;
  switch (b.type) {
    case 'nav':
      inner = <>
        <div style={{position: 'absolute', left: 0, top: 0, width: PW * u, height: h * u, borderBottom: `${2 * u}px solid ${PAPER.track}`}} />
        <div style={{position: 'absolute', left: 0, top: 18 * u, display: 'flex', alignItems: 'center', gap: 12 * u, fontWeight: 800, fontSize: 28 * u}}>
          <div style={{width: 34 * u, height: 34 * u, borderRadius: 10 * u, background: accent}} />{b.label ?? 'Site'}
        </div>
        {list.map((it, k) => <div key={k} style={box(items[k], {display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 21 * u, color: st.hovered(it.id) ? accent : PAPER.inkSoft, fontWeight: 600, borderRadius: 10 * u, ...ring(it.id)})}>{it.label}</div>)}
        {b.button && parts.button ? btn(parts.button, b.button, b.id) : null}
      </>;
      break;
    case 'hero':
      inner = <>
        <div style={{position: 'absolute', left: 0, top: 30 * u, width: (b.image ? PW * 0.52 : PW) * u}}>
          <div style={{fontSize: 52 * u, fontWeight: 800, lineHeight: 1.08, letterSpacing: -1 * u}}>{b.label ?? 'Welcome'}</div>
          <div style={{fontSize: 24 * u, color: PAPER.inkSoft, marginTop: 14 * u, lineHeight: 1.35, maxHeight: 66 * u, overflow: 'hidden'}}>{b.text ?? ''}</div>
        </div>
        {b.button && parts.button ? btn(parts.button, b.button, b.id) : null}
        {parts.image ? <div style={box(parts.image, {borderRadius: 22 * u, background: `linear-gradient(135deg, ${TINTS[1]}, ${TINTS[4]})`, border: `${2 * u}px solid ${PAPER.ink}`, display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden'})}>
          <IconIn name={b.icon ?? 'image'} size={86 * u} />
        </div> : null}
      </>;
      break;
    case 'heading':
      inner = <div style={{position: 'absolute', left: 0, top: 10 * u, fontSize: 38 * u, fontWeight: 800, width: PW * u, textAlign: b.align ?? 'left', ...ring(b.id)}}>{b.label}</div>;
      break;
    case 'text':
      inner = <div style={{position: 'absolute', left: 0, top: 4 * u, width: PW * u, ...ring(b.id)}}>
        {b.text ? <div style={{fontSize: 24 * u, lineHeight: 1.45, color: PAPER.inkSoft, maxHeight: 84 * u, overflow: 'hidden', textAlign: b.align ?? 'left'}}>{b.text}</div> : textLines(3)}
      </div>;
      break;
    case 'image':
      inner = <div style={{position: 'absolute', inset: 0, borderRadius: 22 * u, background: `linear-gradient(135deg, ${TINTS[2]}, ${TINTS[1]})`, border: `${2 * u}px solid ${PAPER.ink}`, display: 'flex', alignItems: 'center', justifyContent: 'center', ...ring(b.id)}}>
        <IconIn name={b.icon ?? 'image'} size={96 * u} />
      </div>;
      break;
    case 'cards': case 'card': {
      const cards = list.length ? list : [{label: b.label ?? 'Item', text: b.text, icon: b.icon}];
      inner = <>{cards.map((it, k) => {
        const r = items[k];
        if (!r) return null;
        const press = st.pressed(it.id), hov = st.hovered(it.id);
        return <div key={k} style={box(r, {borderRadius: 20 * u, background: PAPER.card, border: `${2 * u}px solid ${PAPER.ink}`, overflow: 'hidden',
          transform: `translateY(${hov ? -6 * u : 0}px) scale(${1 - 0.04 * press})`, boxShadow: hov ? `0 ${12 * u}px ${22 * u}px rgba(70,50,30,0.18)` : `0 ${4 * u}px 0 ${PAPER.track}`, ...ring(it.id)})}>
          <div style={{height: r.h * 0.5 * u, background: TINTS[k % TINTS.length], display: 'flex', alignItems: 'center', justifyContent: 'center', borderBottom: `${2 * u}px solid ${PAPER.ink}`}}>
            <IconIn name={it.icon ?? 'package'} size={58 * u} />
          </div>
          <div style={{padding: `${14 * u}px ${18 * u}px`}}>
            <div style={{fontSize: 24 * u, fontWeight: 700, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis'}}>{it.label}</div>
            {it.text ? <div style={{fontSize: 22 * u, color: accent, fontWeight: 700, marginTop: 6 * u}}>{it.text}</div> : textLines(1, 0.8)}
          </div>
        </div>;
      })}</>;
      break;
    }
    case 'button':
      inner = parts.button ? btn(parts.button, b.label ?? 'Continue', b.id, b.variant) : null;
      break;
    case 'input': {
      const r = parts.box!;
      const typed = st.typed(b.id) ?? b.value ?? '';
      const shown = b.mask ? '•'.repeat(typed.length) : typed;
      const focused = st.hovered(b.id) || (st.typed(b.id) !== undefined && st.typed(b.id) !== (b.value ?? ''));
      const caret = focused && Math.floor(f / 15) % 2 === 0;
      inner = <>
        <div style={{position: 'absolute', left: 0, top: 0, fontSize: 21 * u, fontWeight: 700, color: PAPER.inkSoft}}>{b.label ?? 'Field'}</div>
        <div style={box(r, {borderRadius: 14 * u, background: '#fff', border: `${2.5 * u}px solid ${focused ? accent : PAPER.ink}`, display: 'flex', alignItems: 'center', padding: `0 ${20 * u}px`, boxSizing: 'border-box',
          fontSize: 26 * u, letterSpacing: b.mask ? 4 * u : 0, color: shown ? PAPER.ink : '#a9a2b0', boxShadow: focused ? `0 0 0 ${5 * u}px ${accent}33` : undefined, ...ring(b.id)})}>
          {shown || b.placeholder || ''}{caret ? <span style={{width: 3 * u, height: 32 * u, background: PAPER.ink, marginLeft: 3 * u, display: 'inline-block'}} /> : null}
        </div>
      </>;
      break;
    }
    case 'list':
      inner = <>{list.map((it, k) => <div key={k} style={box(items[k], {display: 'flex', alignItems: 'center', gap: 16 * u, borderRadius: 12 * u, padding: `0 ${14 * u}px`, boxSizing: 'border-box',
        background: st.hovered(it.id) ? `${accent}14` : 'transparent', borderBottom: `${1.5 * u}px solid ${PAPER.track}`, fontSize: 23 * u, ...ring(it.id)})}>
        <IconIn name={it.icon ?? 'circle-check'} size={28 * u} color={accent} />
        <span style={{fontWeight: 600}}>{it.label}</span>
        {it.text ? <span style={{marginLeft: 'auto', color: PAPER.inkSoft}}>{it.text}</span> : null}
      </div>)}</>;
      break;
    case 'banner': {
      const v = VARIANT[b.variant ?? 'info'] ?? VARIANT.info;
      inner = <div style={{position: 'absolute', inset: 0, borderRadius: 16 * u, background: v.bg, color: v.ink, border: `${2 * u}px solid ${v.ink}`, display: 'flex', alignItems: 'center', gap: 14 * u, padding: `0 ${22 * u}px`, fontSize: 24 * u, fontWeight: 700, ...ring(b.id)}}>
        <IconIn name={b.icon ?? (b.variant === 'error' ? 'circle-alert' : b.variant === 'success' ? 'circle-check' : 'info')} size={30 * u} color={v.ink} />{b.label ?? b.text}
      </div>;
      break;
    }
    case 'footer':
      inner = <div style={{position: 'absolute', inset: 0, borderTop: `${2 * u}px solid ${PAPER.track}`, display: 'flex', alignItems: 'center', gap: 30 * u, color: PAPER.inkSoft, fontSize: 20 * u}}>
        <span style={{fontWeight: 700}}>{b.label ?? '© Site'}</span>{list.map((it, k) => <span key={k}>{it.label}</span>)}
      </div>;
      break;
  }
  return <div style={style}>{inner}</div>;
};

/** Mouse arrow with a click ripple. */
const Cursor: FC<{x: number; y: number; u: number; press: number; ripple: number; opacity: number}> = ({x, y, u, press, ripple, opacity}) => (
  <div style={{position: 'absolute', left: x, top: y, opacity, pointerEvents: 'none', zIndex: 20}}>
    {ripple > 0 && ripple < 1 ? <div style={{position: 'absolute', left: -40 * u * ripple, top: -40 * u * ripple, width: 80 * u * ripple, height: 80 * u * ripple, borderRadius: '50%', border: `${3 * u}px solid rgba(255,85,0,${1 - ripple})`}} /> : null}
    <svg width={44 * u} height={52 * u} viewBox="0 0 22 26" style={{transform: `scale(${1 - 0.15 * press})`, transformOrigin: '0 0', filter: `drop-shadow(0 ${3 * u}px ${4 * u}px rgba(0,0,0,0.3))`}}>
      <path d="M1 1 L1 20 L6 15.5 L9.5 23.5 L13 22 L9.6 14.2 L16.5 14.2 Z" fill="#fff" stroke={PAPER.ink} strokeWidth={1.6} strokeLinejoin="round" />
    </svg>
  </div>
);

/* ------------------------------------------------------------------------------ scene */

const DEVICES = {
  laptop: {vw: 1240, vh: 690, bezel: 22, radius: 26},
  monitor: {vw: 1240, vh: 680, bezel: 20, radius: 20},
  browser: {vw: 1380, vh: 760, bezel: 0, radius: 22},
  phone: {vw: 430, vh: 840, bezel: 18, radius: 58},
};
const ease = Easing.bezier(0.45, 0, 0.2, 1);

export const ScreenScene: FC<z.input<typeof screenSceneSchema>> = (input) => {
  const p = screenSceneSchema.parse(input) as Props;
  const f = useCurrentFrame();
  const {fps, width: W, height: H} = useVideoConfig();
  const u = useUnit();
  const len = useSceneLength();
  const dev = DEVICES[p.device];
  const phone = p.device === 'phone';
  const chromeH = phone ? 64 : 62;
  const PW = (dev.vw - (phone ? 40 : PAD * 2));
  const layouts = new Map(p.pages.map((pg) => [pg.id, layoutPage(pg, PW)]));

  // timeline: frames for each action, page changes and loading
  const acts = [...p.actions].sort((a, b) => a.at - b.at).map((a) => ({...a, fr: Math.round(a.at * len)}));
  const LOAD = Math.round(fps * 0.7);
  const navs = acts.filter((a) => a.do === 'navigate' && a.page);
  const pageAtFrame = (fr: number) => {
    let id = p.pages[0].id;
    for (const n of navs) if (fr >= n.fr + LOAD) id = n.page!;
    return id;
  };
  const pageId = pageAtFrame(f);
  const page = p.pages.find((pg) => pg.id === pageId)!;
  const lay = layouts.get(pageId)!;
  const loading = navs.find((n) => f >= n.fr && f < n.fr + LOAD);
  const lastNav = [...navs].reverse().find((n) => f >= n.fr);
  const shownUrl = (lastNav ? p.pages.find((pg) => pg.id === lastNav.page)?.url : undefined) ?? (lastNav ? undefined : page.url) ?? page.url ?? p.url ?? 'example.com';
  const pageSince = navs.filter((n) => f >= n.fr + LOAD).map((n) => n.fr + LOAD).pop() ?? (p.instant ? -100 : 8);

  // scrolling (resets on each new page)
  const viewH = dev.vh - chromeH;
  const scrollAt = (fr: number) => {
    const pid = pageAtFrame(fr);
    const l = layouts.get(pid)!;
    const since = navs.filter((n) => fr >= n.fr + LOAD).map((n) => n.fr + LOAD).pop() ?? -1;
    const maxS = Math.max(0, l.height + PAD - viewH);
    let s = 0;
    acts.filter((a) => a.do === 'scroll' && a.fr >= since && a.fr <= fr + 0).forEach((a) => {
      const goal = a.to && l.targets[a.to] ? l.targets[a.to].y - viewH * 0.25 : s + (a.by ?? viewH * 0.6);
      const k = ease(interpolate(fr, [a.fr, a.fr + fps * 0.7], [0, 1], {extrapolateLeft: 'clamp', extrapolateRight: 'clamp'}));
      s = s + (Math.max(0, Math.min(maxS, goal)) - s) * k;
    });
    return s;
  };
  const scroll = scrollAt(f);

  // device placement
  const hasTitle = Boolean(p.title || p.eyebrow);
  const topRoom = (hasTitle ? 190 : 50) * u, bottomRoom = 120 * u;
  const devW = (dev.vw + dev.bezel * 2) * u, baseH = p.device === 'laptop' ? 40 : p.device === 'monitor' ? 110 : 0;
  const devH = (dev.vh + dev.bezel * 2 + baseH) * u;
  const split = Boolean(p.diagram);
  const leftW = W * 0.47; // split view: the device lives in the left half
  const fit = Math.min(1, ((split ? leftW - 110 * u : W - 160 * u)) / devW, (H - topRoom - bottomRoom) / devH);
  const dw = devW * fit, dh = devH * fit;
  const dx = split ? 70 * u + (leftW - 70 * u - dw) / 2 : (W - dw) / 2, dy = topRoom + (H - topRoom - bottomRoom - dh) / 2;
  const s = u * fit; // page px -> screen px
  const vx = dx + dev.bezel * s, vy = dy + dev.bezel * s; // viewport origin on screen
  const contentX = vx + (phone ? 20 : PAD) * s, contentY = vy + (chromeH + (phone ? 16 : 24)) * s;
  const screenOf = (r: Rect, fr: number) => ({x: contentX + (r.x + r.w / 2) * s, y: contentY + (r.y + r.h / 2 - scrollAt(fr)) * s});
  const targetAt = (id: string | undefined, fr: number) => {
    if (!id) return null;
    if (id === 'chat' && p.chat) return {x: vx + (dev.vw - 58) * s, y: vy + (dev.vh - 58) * s}; // the chat bubble
    const l = layouts.get(pageAtFrame(fr))!;
    const r = l.targets[id];
    return r ? screenOf(r, fr) : null;
  };

  // pointer path: arrives at each target at the action's frame
  const MOVE = Math.round(fps * 0.55);
  const rest = {x: vx + (dev.vw - 80) * s, y: vy + (dev.vh - 70) * s};
  const keys = [{fr: 0, pos: rest}];
  acts.forEach((a) => {
    if (!['move', 'hover', 'click', 'type'].includes(a.do)) return;
    const pos = targetAt(a.to, a.fr);
    if (pos) keys.push({fr: a.fr, pos: {x: pos.x + 6 * s, y: pos.y + 4 * s}});
  });
  let cur = keys[0].pos;
  for (let k = 1; k < keys.length; k++) {
    const a = keys[k - 1], b = keys[k];
    const start = Math.max(a.fr, b.fr - MOVE);
    if (f <= start) break;
    const t = ease(interpolate(f, [start, b.fr], [0, 1], {extrapolateRight: 'clamp'}));
    cur = {x: a.pos.x + (b.pos.x - a.pos.x) * t, y: a.pos.y + (b.pos.y - a.pos.y) * t};
  }
  const firstMove = keys.length > 1 ? keys[1].fr - MOVE - 6 : len;
  const pointerOpacity = interpolate(f, [firstMove, firstMove + 8], [0, 1], {extrapolateLeft: 'clamp', extrapolateRight: 'clamp'});
  const clicks = acts.filter((a) => a.do === 'click');
  const lastClick = [...clicks].reverse().find((a) => f >= a.fr);
  const press = lastClick ? interpolate(f - lastClick.fr, [0, 3, 8], [0, 1, 0], {extrapolateRight: 'clamp'}) : 0;
  const ripple = lastClick ? interpolate(f - lastClick.fr, [0, 14], [0, 1], {extrapolateRight: 'clamp'}) : 0;

  // element states
  const pointerOn = (id?: string) => {
    if (!id) return false;
    const pa = acts.filter((a) => ['move', 'hover', 'click', 'type'].includes(a.do));
    const lastIdx = pa.map((a) => a.fr <= f).lastIndexOf(true);
    const next = pa[lastIdx + 1];
    return lastIdx >= 0 && pa[lastIdx].to === id && (!next || f < next.fr - MOVE);
  };
  const typedValues = new Map<string, string>();
  acts.filter((a) => a.do === 'type' && a.to && f >= a.fr + 6).forEach((a) => {
    const n = Math.min(a.text!.length, Math.floor(((f - a.fr - 6) / fps) * 13));
    typedValues.set(a.to!, a.text!.slice(0, n));
  });
  const st: ElState = {
    pressed: (id) => { const c = clicks.find((a) => a.to === id && f >= a.fr && f < a.fr + 9); return c ? interpolate(f - c.fr, [0, 3, 9], [0, 1, 0]) : 0; },
    hovered: pointerOn,
    lit: (id) => {
      const h = acts.find((a) => a.do === 'highlight' && a.to === id && f >= a.fr && f < a.fr + fps * 1.8);
      return h ? Math.min(1, (f - h.fr) / 6, (h.fr + fps * 1.8 - f) / 8) * (0.75 + 0.25 * Math.sin((f - h.fr) / 4)) : 0;
    },
    typed: (id) => (id ? typedValues.get(id) : undefined),
  };

  // camera focus (zoom on an element)
  const zooms = acts.filter((a) => a.do === 'focus' || a.do === 'unfocus');
  let cam = {k: 1, x: W / 2, y: H / 2};
  zooms.forEach((z) => {
    if (f < z.fr) return;
    const goal = z.do === 'focus' ? {k: 1.45, ...(targetAt(z.to, z.fr) ?? {x: W / 2, y: H / 2})} : {k: 1, x: W / 2, y: H / 2};
    const t = ease(interpolate(f, [z.fr, z.fr + fps * 0.6], [0, 1], {extrapolateRight: 'clamp'}));
    cam = {k: cam.k + (goal.k - cam.k) * t, x: cam.x + (goal.x - cam.x) * t, y: cam.y + (goal.y - cam.y) * t};
  });
  // zoom: the focused point slides to the middle of the frame as the scale grows (origin top-left)
  const zb = (cam.k - 1) / 0.45;
  const tx = (W / 2 - cam.k * cam.x) * zb + (cam.x - cam.k * cam.x) * (1 - zb);
  const ty = (H / 2 - cam.k * cam.y) * zb + (cam.y - cam.k * cam.y) * (1 - zb);
  const camera = cam.k === 1 ? undefined : `translate(${tx}px, ${ty}px) scale(${cam.k})`;

  // entrances
  const enter = p.instant ? 1 : spring({frame: f, fps, config: {damping: 16, stiffness: 110}});
  const titleIn = p.instant ? 1 : spring({frame: f - 2, fps, config: {damping: 200}});
  const toast = [...acts].reverse().find((a) => a.do === 'toast' && f >= a.fr && f < a.fr + fps * 2.6);
  const toastIn = toast ? Math.min(spring({frame: f - toast.fr, fps, config: {damping: 14}}), interpolate(f, [toast.fr + fps * 2.3, toast.fr + fps * 2.6], [1, 0], {extrapolateLeft: 'clamp'})) : 0;

  // the grid behind (same paper look as IsoScene)
  const step = 46 * u, lines: string[] = [];
  for (let c = -H; c < W + H; c += step * 2) {
    lines.push(`M${c},0 l${H * 1.732},${H}`, `M${c},0 l${-H * 1.732},${H}`);
  }

  const sounds: {sound: string; at: number; volume: number; duration?: number; loop?: boolean}[] = [];
  if (p.sound) acts.forEach((a) => {
    if (a.do === 'click') sounds.push({sound: 'click', at: a.fr, volume: 0.55});
    if (a.do === 'type') sounds.push({sound: 'typing', at: a.fr + 6, volume: 0.45, duration: Math.ceil(((a.text?.length ?? 0) / 13) * fps), loop: true});
    if (a.do === 'navigate') sounds.push({sound: 'swipe', at: a.fr + LOAD - 4, volume: 0.25});
    if (a.do === 'toast') sounds.push({sound: a.variant === 'error' ? 'error' : 'notify', at: a.fr, volume: 0.35});
    if (a.do === 'focus') sounds.push({sound: 'rise', at: a.fr, volume: 0.18});
    if (a.do === 'highlight') sounds.push({sound: 'chime', at: a.fr, volume: 0.18});
  });

  const reveal = (k: number) => (f - pageSince < 0 ? 1 : Math.min(1, Math.max(0, (f - pageSince - k * 3) / 9)));
  const loadK = loading ? (f - loading.fr) / LOAD : 0;

  return (
    <AbsoluteFill style={{background: `radial-gradient(ellipse at 50% 45%, ${PAPER.bgCenter} 0%, ${PAPER.bg} 70%)`, fontFamily: PAPER.sans, color: PAPER.ink, overflow: 'hidden'}}>
      <svg width={W} height={H} style={{position: 'absolute', inset: 0}}><path d={lines.join('')} stroke={PAPER.grid} strokeWidth={1.2 * u} fill="none" /></svg>
      {hasTitle ? (
        <div style={{position: 'absolute', left: 90 * u, top: 56 * u, opacity: titleIn, transform: `translateY(${(1 - titleIn) * 16 * u}px)`}}>
          {p.eyebrow ? <div style={{fontFamily: PAPER.font, fontWeight: 700, fontSize: 22 * u, letterSpacing: 3 * u, color: '#8a6fd1', textTransform: 'uppercase'}}>{p.eyebrow}</div> : null}
          {p.title ? <div style={{fontSize: 46 * u, fontWeight: 800, marginTop: 6 * u}}>{p.title}</div> : null}
        </div>
      ) : null}
      <div style={{position: 'absolute', inset: 0, transform: camera, transformOrigin: '0 0'}}>
        <div style={{position: 'absolute', left: dx, top: dy, width: dw, height: dh, opacity: enter, transform: `translateY(${(1 - enter) * 60 * u}px)`}}>
          {/* device body */}
          {p.device !== 'browser' ? <div style={{position: 'absolute', left: 0, top: 0, width: dw, height: (dev.vh + dev.bezel * 2) * s, borderRadius: dev.radius * s, background: '#34313d', border: `${3 * s}px solid ${PAPER.ink}`, boxSizing: 'border-box', boxShadow: `0 ${18 * s}px ${36 * s}px rgba(70,50,30,0.22)`}} /> : null}
          {p.device === 'laptop' ? <div style={{position: 'absolute', left: -60 * s, top: (dev.vh + dev.bezel * 2 - 4) * s, width: dw + 120 * s, height: 40 * s, background: '#d9d6de', border: `${3 * s}px solid ${PAPER.ink}`, borderRadius: `${6 * s}px ${6 * s}px ${22 * s}px ${22 * s}px`, boxSizing: 'border-box'}}>
            <div style={{margin: '0 auto', width: 180 * s, height: 12 * s, background: '#bdb9c4', borderRadius: `0 0 ${10 * s}px ${10 * s}px`}} />
          </div> : null}
          {p.device === 'monitor' ? <>
            <div style={{position: 'absolute', left: dw / 2 - 50 * s, top: (dev.vh + dev.bezel * 2 - 2) * s, width: 100 * s, height: 80 * s, background: '#cfcbd6', border: `${3 * s}px solid ${PAPER.ink}`, boxSizing: 'border-box'}} />
            <div style={{position: 'absolute', left: dw / 2 - 190 * s, top: (dev.vh + dev.bezel * 2 + 74) * s, width: 380 * s, height: 30 * s, background: '#d9d6de', border: `${3 * s}px solid ${PAPER.ink}`, borderRadius: 14 * s, boxSizing: 'border-box'}} />
          </> : null}
          {/* screen */}
          <div style={{position: 'absolute', left: dev.bezel * s, top: dev.bezel * s, width: dev.vw * s, height: dev.vh * s, borderRadius: (p.device === 'browser' ? dev.radius : phone ? 42 : 8) * s, overflow: 'hidden', background: '#fffdf8',
            border: p.device === 'browser' ? `${3 * s}px solid ${PAPER.ink}` : undefined, boxSizing: 'border-box', boxShadow: p.device === 'browser' ? `0 ${18 * s}px ${36 * s}px rgba(70,50,30,0.22)` : undefined}}>
            {/* browser chrome */}
            <div style={{position: 'absolute', left: 0, top: 0, width: '100%', height: chromeH * s, background: '#efe8dc', borderBottom: `${2 * s}px solid ${PAPER.track}`, display: 'flex', alignItems: 'center', gap: 12 * s, padding: `0 ${18 * s}px`, boxSizing: 'border-box'}}>
              {!phone ? ['#f08a7b', '#f5c451', '#74c98a'].map((c) => <div key={c} style={{width: 15 * s, height: 15 * s, borderRadius: '50%', background: c, border: `${1.5 * s}px solid ${PAPER.ink}`}} />) : null}
              <div style={{marginLeft: phone ? 0 : 18 * s, flex: 1, height: 38 * s, borderRadius: 19 * s, background: '#fff', border: `${2 * s}px solid ${PAPER.track}`, display: 'flex', alignItems: 'center', gap: 10 * s, padding: `0 ${16 * s}px`, fontSize: 20 * s, color: PAPER.inkSoft, overflow: 'hidden', whiteSpace: 'nowrap'}}>
                <Lock width={18 * s} height={18 * s} color={PAPER.good} strokeWidth={2.4} />{shownUrl}
              </div>
            </div>
            {loading ? <div style={{position: 'absolute', left: 0, top: chromeH * s - 4 * s, height: 5 * s, width: `${Math.min(100, ease(loadK) * 100)}%`, background: p.accent}} /> : null}
            {/* page */}
            <div style={{position: 'absolute', left: (phone ? 20 : PAD) * s, top: (chromeH + (phone ? 16 : 24)) * s, width: PW * s, height: (viewH - 24) * s, overflow: 'visible', opacity: loading ? 0.45 : 1, transition: 'none'}}>
              <div style={{position: 'absolute', left: 0, top: -scroll * s, width: PW * s}}>
                {lay.placed.map((pb, k) => <BlockView key={`${pageId}-${k}`} pb={pb} PW={PW} u={s} accent={p.accent} st={st} f={f} reveal={reveal(k)} />)}
              </div>
            </div>
            {loading ? <div style={{position: 'absolute', left: '50%', top: '50%', width: 56 * s, height: 56 * s, marginLeft: -28 * s, marginTop: -28 * s, borderRadius: '50%', border: `${6 * s}px solid ${PAPER.track}`, borderTopColor: p.accent, transform: `rotate(${f * 24}deg)`}} /> : null}
            {/* chat widget */}
            {p.chat ? (() => {
              const c = p.chat;
              const clickFr = acts.find((a) => a.do === 'click' && a.to === 'chat')?.fr;
              const firstMsg = Math.min(...c.messages.map((m) => m.at)) * len;
              const openFr = clickFr ?? (c.open !== undefined ? Math.round(c.open * len) : Math.max(0, Math.round(firstMsg - fps * 0.6)));
              const k = ease(clamp01((f - openFr - 4) / (fps * 0.35)));
              const pop = p.instant ? 1 : spring({frame: f - 10, fps, config: {damping: 12}});
              const PWW = phone ? dev.vw - 32 : 420, PH = Math.min(phone ? viewH - 30 : 560, viewH - 100);
              return <>
                {k > 0 ? <div style={{position: 'absolute', right: 16 * s, bottom: (phone ? 16 : 100) * s, width: PWW * s, height: PH * s, borderRadius: 22 * s, overflow: 'hidden', border: `${2.5 * s}px solid ${PAPER.ink}`, background: '#fffdf8',
                  boxShadow: `0 ${14 * s}px ${30 * s}px rgba(0,0,0,0.2)`, transform: `scale(${0.3 + 0.7 * k})`, transformOrigin: 'bottom right', opacity: clamp01(k * 2), zIndex: 15}}>
                  <ChatPanel messages={c.messages} look={c.look} name={c.name ?? (c.look === 'assistant' ? 'Help' : 'Chat')} icon={c.icon} accent={p.accent} composer={c.composer} sound={p.sound} w={PWW} h={PH} s={s} compact minStart={openFr + 8} />
                </div> : null}
                {!(phone && k > 0) ? <div style={{position: 'absolute', right: 26 * s, bottom: 26 * s, width: 64 * s, height: 64 * s, borderRadius: '50%', background: p.accent, border: `${2.5 * s}px solid ${PAPER.ink}`, display: 'flex', alignItems: 'center', justifyContent: 'center',
                  transform: `scale(${pop * (1 - 0.1 * (f >= openFr && f < openFr + 8 ? 1 : 0))})`, boxShadow: `0 ${6 * s}px ${14 * s}px rgba(0,0,0,0.2)`, zIndex: 16}}>
                  <IconIn name={k > 0.5 ? 'x' : 'message-circle'} size={32 * s} color="#fff" />
                </div> : null}
              </>;
            })() : null}
            {/* toast */}
            {toast ? (() => {
              const v = VARIANT[toast.variant ?? 'success'];
              return <div style={{position: 'absolute', right: 24 * s, top: (chromeH + 18) * s, padding: `${16 * s}px ${24 * s}px`, borderRadius: 16 * s, background: v.bg, color: v.ink, border: `${2.5 * s}px solid ${v.ink}`,
                fontSize: 24 * s, fontWeight: 700, display: 'flex', alignItems: 'center', gap: 12 * s, opacity: toastIn, transform: `translateY(${(1 - toastIn) * -30 * s}px)`, boxShadow: `0 ${10 * s}px ${20 * s}px rgba(0,0,0,0.12)`}}>
                <IconIn name={toast.variant === 'error' ? 'circle-x' : toast.variant === 'info' ? 'info' : 'circle-check'} size={28 * s} color={v.ink} />{toast.text}
              </div>;
            })() : null}
          </div>
        </div>
        <Cursor x={cur.x} y={cur.y} u={u * Math.max(0.8, fit)} press={press} ripple={ripple} opacity={pointerOpacity * enter} />
      </div>
      {p.diagram ? <>
        <div style={{position: 'absolute', left: leftW + 20 * u, top: topRoom + 10 * u, bottom: bottomRoom + 30 * u, borderLeft: `${2.5 * u}px dashed ${PAPER.track}`, opacity: enter}} />
        <IsoRegion.Provider value={{left: leftW + 90 * u, right: W - 60 * u, top: topRoom}}>
          <IsoScene {...p.diagram} sound={p.sound && p.diagram.sound} />
        </IsoRegion.Provider>
      </> : null}
      {sounds.map((c, k) => <Sfx key={k} sound={c.sound} at={c.at} volume={c.volume} duration={c.duration} loop={c.loop} />)}
    </AbsoluteFill>
  );
};
