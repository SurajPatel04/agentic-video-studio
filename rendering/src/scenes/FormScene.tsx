/**
 * FormScene: a form being filled in, in the paper style. The mouse clicks into a field and types,
 * ticks a checkbox, presses Submit; the button spins, then invalid fields shake with a red message
 * (or the whole form turns into a success card). Retyping a field with an error fixes it (green check).
 * Password fields can show a live strength meter.
 *
 * Actions run one after another; typing pushes later actions back instead of overlapping.
 */
import type {CSSProperties, FC, ReactNode} from 'react';
import {interpolate, spring, useCurrentFrame, useVideoConfig} from 'remotion';
import {z} from 'zod';
import {Sfx} from '../audio';
import {PAPER} from '../iso/iso';
import {useSceneLength} from '../theme';
import {DEVICE_ALIASES, DeviceFrame, DevicePointer, Icon, PHONE, PaperStage, SideTitle, clamp01, ease, flexList, flexValue, fraction, useDevice, type Cue} from './paperStage';

const FIELD_TYPES = ['text', 'email', 'password', 'phone', 'number', 'date', 'url', 'textarea', 'checkbox', 'select'] as const;
/** Names AIs often use for the same field types (HTML input types and plain words). */
const TYPE_ALIASES: Record<string, (typeof FIELD_TYPES)[number]> = {
  tel: 'phone', mobile: 'phone', telephone: 'phone', phone_number: 'phone', phonenumber: 'phone', cell: 'phone',
  integer: 'number', numeric: 'number', amount: 'number', age: 'number', zip: 'number', pin: 'number',
  datetime: 'date', 'datetime-local': 'date', birthday: 'date', dob: 'date', time: 'date',
  website: 'url', link: 'url', textbox: 'textarea', multiline: 'textarea', message: 'textarea', comment: 'textarea',
  string: 'text', name: 'text', search: 'text', username: 'text', address: 'text', mail: 'email', pass: 'password',
  dropdown: 'select', radio: 'select', checkbox: 'checkbox', toggle: 'checkbox', switch: 'checkbox', boolean: 'checkbox',
};
const fieldSchema = z.preprocess((raw) => {
  if (raw && typeof raw === 'object' && typeof (raw as {type?: unknown}).type === 'string') {
    const t = ((raw as {type: string}).type).toLowerCase();
    return {...raw, type: (FIELD_TYPES as readonly string[]).includes(t) ? t : TYPE_ALIASES[t] ?? t};
  }
  return raw;
}, z.object({
  id: z.string().min(1).max(30),
  label: z.string().max(40),
  type: z.enum(FIELD_TYPES).default('text'),
  prefix: z.string().max(8).optional(), // phone: country code shown before the number ("+91")
  placeholder: z.string().max(40).optional(),
  value: z.string().max(40).optional(), // already filled in (checkbox: "yes" = ticked)
  strength: z.boolean().optional(), // password: live strength meter
}).strict());
const ACTIONS = ['type', 'check', 'submit', 'error', 'highlight'] as const;
const actionSchema = z.object({
  at: fraction,
  do: z.enum(ACTIONS),
  to: z.string().max(30).optional(), // field id
  text: z.string().max(60).optional(), // type: the text; error: message; submit: success message
  errors: z.array(z.object({to: z.string().max(30), text: z.string().max(60)}).strict()).max(6).optional(), // submit: what the server/validator rejects
}).strict();
type Action = z.output<typeof actionSchema>;
type Field = z.output<typeof fieldSchema>;

const EXAMPLE_FIELDS: z.input<typeof fieldSchema>[] = [
  {id: 'email', label: 'Email', type: 'email', placeholder: 'you@example.com'},
  {id: 'pass', label: 'Password', type: 'password', placeholder: 'At least 8 characters', strength: true},
  {id: 'terms', label: 'I agree to the terms', type: 'checkbox'},
];
const EXAMPLE: Action[] = [
  {at: 0.04, do: 'type', to: 'email', text: 'mira@mail'},
  {at: 0.16, do: 'type', to: 'pass', text: 'cat1'},
  {at: 0.27, do: 'submit', errors: [{to: 'email', text: 'Enter a full email address'}, {to: 'pass', text: 'Use at least 8 characters'}]},
  {at: 0.46, do: 'type', to: 'email', text: 'mira@mail.com'},
  {at: 0.58, do: 'type', to: 'pass', text: 'Blue-Kite-42!'},
  {at: 0.74, do: 'check', to: 'terms'},
  {at: 0.8, do: 'submit', text: 'Account created'},
];

const VERBS: Record<string, string> = {fill: 'type', enter: 'type', input: 'type', write: 'type', 'type in': 'type', typing: 'type',
  tick: 'check', toggle: 'check', select: 'check', checkbox: 'check', uncheck: 'check',
  send: 'submit', save: 'submit', confirm: 'submit', register: 'submit', signup: 'submit', 'sign up': 'submit', continue: 'submit', next: 'submit', login: 'submit',
  validate: 'error', invalid: 'error', reject: 'error', warn: 'error', focus: 'highlight', glow: 'highlight', point: 'highlight'};
const slug = (t: string) => t.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 30) || 'field';
const flexForm = (raw: unknown) => {
  if (!raw || typeof raw !== 'object') return raw;
  const r = {...(raw as Record<string, unknown>)};
  if (r.form && typeof r.form === 'string' && r.heading === undefined) { r.heading = r.form; delete r.form; }
  r.device = flexValue(r.device, DEVICE_ALIASES);
  if (Array.isArray(r.fields)) r.fields = r.fields.map((fl) => {
    if (!fl || typeof fl !== 'object') return fl;
    const o = {...(fl as Record<string, unknown>)};
    if (o.id === undefined) o.id = typeof o.name === 'string' ? slug(o.name) : typeof o.label === 'string' ? slug(o.label) : o.id;
    if (o.label === undefined && typeof o.name === 'string') o.label = o.name;
    for (const k of ['name', 'required', 'options', 'validation', 'pattern', 'autocomplete', 'minLength', 'maxLength']) delete o[k];
    return o;
  });
  if (r.fields !== undefined && r.actions === undefined) r.actions = []; // own fields: never the built-in demo script
  const types = new Map<string, unknown>(Array.isArray(r.fields) ? (r.fields as Record<string, unknown>[]).map((fl) => [String(fl?.id), fl?.type]) : []);
  r.actions = flexList(r.actions, {
    keys: {action: 'do', verb: 'do', type: 'do', step: 'do', target: 'to', field: 'to', element: 'to', value: 'text', input: 'text', message: 'text', success: 'text'},
    values: {do: (v) => VERBS[v] ?? v},
  });
  if (Array.isArray(r.actions)) r.actions = (r.actions as Record<string, unknown>[]).map((a) => {
    if (!a || typeof a !== 'object') return a;
    const o = {...a};
    if (['click', 'press', 'tap'].includes(String(o.do))) o.do = typeof o.to === 'string' && types.get(o.to) === 'checkbox' ? 'check' : typeof o.to === 'string' && types.has(o.to) ? 'highlight' : 'submit';
    if (o.do === 'submit' && typeof o.to === 'string' && !types.has(o.to)) delete o.to;
    if (o.do === 'check' && typeof o.to === 'string' && types.get(o.to) === 'select') o.do = 'type'; // choosing an option // "to": "submit-button"
    if (o.errors && typeof o.errors === 'object' && !Array.isArray(o.errors)) o.errors = Object.entries(o.errors as Record<string, unknown>).map(([to, text]) => ({to, text: String(text)}));
    return o;
  });
  return r;
};

export const formSceneSchema = z.preprocess(flexForm, z.object({
  device: z.enum(['card', 'browser', 'laptop', 'monitor', 'window', 'phone']).default('card'), // a paper card, a web page (browser / laptop / monitor), an app window, or a phone app
  url: z.string().max(60).optional(), // browser / laptop / monitor: address bar
  eyebrow: z.string().max(40).optional(),
  title: z.string().max(70).optional(),
  heading: z.string().max(40).default('Create your account'),
  subtitle: z.string().max(80).optional(),
  button: z.string().max(24).default('Sign up'),
  accent: z.string().max(20).default('#4f6ef5'),
  fields: z.array(fieldSchema).min(1).max(6).default(() => EXAMPLE_FIELDS.map((x) => fieldSchema.parse(x))),
  actions: z.array(actionSchema).max(20).default(() => EXAMPLE),
  instant: z.boolean().default(false),
  sound: z.boolean().default(true),
}).strict().superRefine((p, ctx) => {
  const byId = new Map(p.fields.map((x) => [x.id, x]));
  if (byId.size !== p.fields.length) ctx.addIssue({code: 'custom', path: ['fields'], message: 'field ids must be unique'});
  const ids = [...byId.keys()].join(', ');
  p.actions.forEach((a, i) => {
    const issue = (path: string, message: string) => ctx.addIssue({code: 'custom', path: ['actions', i, path], message});
    if (a.do !== 'submit') {
      const fl = a.to ? byId.get(a.to) : undefined;
      if (!fl) issue('to', `"${a.do}" needs "to" = a field id: ${ids}`);
      else if (a.do === 'type' && fl.type === 'checkbox') issue('to', '"type" needs a text field; use "check" for a checkbox');
      else if (a.do === 'check' && fl.type !== 'checkbox') issue('to', '"check" needs a checkbox field');
    }
    if ((a.do === 'type' || a.do === 'error') && !a.text) issue('text', `"${a.do}" needs "text"`);
    a.errors?.forEach((e, j) => { if (!byId.has(e.to)) ctx.addIssue({code: 'custom', path: ['actions', i, 'errors', j, 'to'], message: `"${e.to}" is not a field; fields: ${ids}`}); });
  });
  // story check: a successful submit must not leave a field with an error that was never fixed
  const open = new Set<string>();
  [...p.actions].map((a, i) => ({a, i})).sort((x, y) => x.a.at - y.a.at).forEach(({a, i}) => {
    if ((a.do === 'type' || a.do === 'check') && a.to) open.delete(a.to);
    if (a.do === 'error' && a.to) open.add(a.to);
    if (a.do === 'submit') {
      if (a.errors?.length) a.errors.forEach((e) => open.add(e.to));
      else if (open.size) ctx.addIssue({code: 'custom', path: ['actions', i], message: `this submit succeeds but ${[...open].join(', ')} still ha${open.size > 1 ? 've' : 's'} an error: add a "type" (or "check") that fixes it first, or give this submit "errors"`});
    }
  });
}));
type Props = z.output<typeof formSceneSchema>;

export const description =
  'A form being filled in, in the paper style: the mouse clicks into fields and types (passwords as dots with an ' +
  'optional strength meter), ticks a checkbox, presses submit; the button spins, then invalid fields shake with a red ' +
  'message, the user fixes them (green checks), and a second submit turns the form into a success card. Use for ' +
  'sign-up flows, input validation, password rules, security, form UX.';
export const tags = ['form', 'sign up', 'signup', 'register', 'validation', 'input validation', 'password', 'security', 'error', 'checkout', 'ux', 'login'];

const CPS = 14;
type Ev = Action & {start: number; end: number; from: number};
const timeline = (acts: Action[], fields: Field[], len: number, fps: number, speed = 1): Ev[] => {
  let t = 0;
  const cur = new Map(fields.map((x) => [x.id, x.value ?? '']));
  return [...acts].sort((a, b) => a.at - b.at).map((a) => {
    const start = Math.max(Math.round(a.at * len), t);
    let end = start + 10, from = 0;
    if (a.do === 'type') {
      const before = cur.get(a.to ?? '') ?? '';
      from = before && (a.text ?? '').startsWith(before) ? before.length : 0; // a fix that only adds: keep typing from there
      cur.set(a.to ?? '', a.text ?? '');
      end = start + 12 + Math.ceil((((a.text ?? '').length - from) / (CPS * speed)) * fps);
    }
    if (a.do === 'submit') end = start + Math.round(fps * 0.9);
    t = end + 3;
    return {...a, start, end, from};
  });
};

const strengthOf = (v: string) => {
  let sc = 0;
  if (v.length >= 8) sc++;
  if (v.length >= 12) sc++;
  if (/[A-Z]/.test(v) && /[a-z]/.test(v)) sc++;
  if (/\d/.test(v)) sc++;
  if (/[^A-Za-z0-9]/.test(v)) sc++;
  return v ? Math.max(1, Math.min(4, sc)) : 0;
};
const STRENGTH = [{c: PAPER.track, t: ''}, {c: '#e5604f', t: 'Weak'}, {c: '#f0a43a', t: 'Fair'}, {c: '#a7c957', t: 'Good'}, {c: '#4caf63', t: 'Strong'}];

export const FormScene: FC<z.input<typeof formSceneSchema>> = (input) => {
  const p = formSceneSchema.parse(input) as Props;
  const f = useCurrentFrame();
  const {fps} = useVideoConfig();
  const len = useSceneLength();
  const hasTitle = Boolean(p.title || p.eyebrow);
  // speed up typing when the form would not finish inside the scene
  let speed = 1, evs = timeline(p.actions, p.fields, len, fps);
  for (let k = 0; k < 4 && evs.length; k++) {
    const last = evs[evs.length - 1].end + (evs[evs.length - 1].do === 'submit' ? fps : 0);
    if (last <= len * 0.95 || speed >= 4) break;
    speed = Math.min(4, speed * (last / (len * 0.95)) * 1.05);
    evs = timeline(p.actions, p.fields, len, fps, speed);
  }
  const phone = p.device === 'phone', page = !phone && p.device !== 'card';

  // layout (design px)
  const CW = phone ? PHONE.SW : 760, PADX = phone ? 26 : 52, IW = CW - PADX * 2, TOP = phone ? 26 : 46;
  let y0 = TOP + 52 + (p.subtitle ? 40 : 0) + 30;
  const rows = p.fields.map((fl) => {
    const h = fl.type === 'checkbox' ? 64 : 136 + (fl.strength ? 26 : 0) + (fl.type === 'textarea' ? 50 : 0);
    const r = {fl, y: y0, h};
    y0 += h;
    return r;
  });
  const btnY = y0 + 10, CH = phone ? PHONE.SH - PHONE.STATUS : btnY + 70 + 48;
  // the device holds a page (the card centred on it), a phone screen, or just the card
  const PW = 1240, PH = Math.max(690, CH + 80);
  const geo = useDevice(p.device, {w: page ? PW : CW, h: page ? PH : CH, hasTitle, bar: 60});
  const s = geo.s;
  const offX = page ? (PW - CW) / 2 : 0, offY = page ? 40 : 0;
  // top-left of the form content on screen
  const x = geo.ox + offX * s, y = geo.oy + offY * s;
  const boxOf = (id?: string) => {
    const r = rows.find((q) => q.fl.id === id);
    if (!r) return {x: x + (PADX + IW / 2) * s, y: y + (btnY + 35) * s};
    if (r.fl.type === 'checkbox') return {x: x + (PADX + 18) * s, y: y + (r.y + 22) * s};
    return {x: x + (PADX + Math.min(IW * 0.4, 260)) * s, y: y + (r.y + 34 + 32) * s};
  };

  // field state at frame f
  const values = new Map<string, string>(p.fields.map((fl) => [fl.id, fl.value ?? '']));
  const errors = new Map<string, {text: string; at: number}>();
  const fixed = new Map<string, number>();
  let success: Ev | undefined, spinning = false, focusId: string | undefined;
  for (const e of evs) {
    if (f < e.start) break;
    if (e.do === 'type' && e.to) {
      const n = Math.max(e.from, Math.min(e.text!.length, e.from + Math.floor(((f - e.start - 10) / fps) * CPS * speed)));
      values.set(e.to, f < e.start + 10 ? values.get(e.to) ?? '' : e.text!.slice(0, n));
      if (f < e.end + 6) focusId = e.to;
      if (f >= e.end && errors.has(e.to)) { errors.delete(e.to); fixed.set(e.to, e.end); }
    }
    if (e.do === 'check' && e.to && f >= e.start + 2) {
      values.set(e.to, values.get(e.to) === 'yes' ? '' : 'yes');
      if (errors.has(e.to)) { errors.delete(e.to); fixed.set(e.to, e.start); }
    }
    if (e.do === 'error' && e.to) { errors.set(e.to, {text: e.text!, at: e.start}); fixed.delete(e.to); }
    if (e.do === 'submit') {
      const res = e.start + Math.round(fps * 0.6);
      if (f < res) spinning = true;
      else if (e.errors?.length) e.errors.forEach((er) => { errors.set(er.to, {text: er.text, at: res}); fixed.delete(er.to); });
      else success = e;
    }
  }

  // pointer: visits each field / the button
  const MOVE = Math.round(fps * 0.45);
  const keys = evs.filter((e) => e.do === 'type' || e.do === 'check' || e.do === 'submit').map((e) => ({fr: e.start, pos: boxOf(e.do === 'submit' ? undefined : e.to)}));
  const rest = phone ? {x: x + (CW + 80) * s, y: y + (CH + 100) * s} : {x: x + (CW + 40) * s, y: y + CH * 0.6 * s};
  let ptr = rest;
  [{fr: 0, pos: rest}, ...keys].forEach((kf, k, arr) => {
    if (k === 0) return;
    const a = arr[k - 1];
    const st = Math.max(a.fr, kf.fr - MOVE);
    if (f <= st) return;
    const t = ease(clamp01((f - st) / Math.max(1, kf.fr - st)));
    ptr = {x: a.pos.x + (kf.pos.x - a.pos.x) * t, y: a.pos.y + (kf.pos.y - a.pos.y) * t};
  });
  const lastKey = [...keys].reverse().find((kf) => f >= kf.fr);
  const press = lastKey ? interpolate(f - lastKey.fr, [0, 3, 8], [0, 1, 0], {extrapolateRight: 'clamp'}) : 0;
  const ripple = lastKey ? clamp01((f - lastKey.fr) / 14) : 0;
  const ptrOp = keys.length ? clamp01((f - (keys[0].fr - MOVE - 6)) / 8) * (success ? 1 - clamp01((f - success.start - 20) / 10) : 1) : 0;
  const submitPress = evs.some((e) => e.do === 'submit' && f >= e.start && f < e.start + 8);

  const enter = p.instant ? 1 : spring({frame: f, fps, config: {damping: 16, stiffness: 110}});
  const successK = success ? spring({frame: f - success.start - Math.round(fps * 0.6), fps, config: {damping: 13}}) : 0;

  const fieldView = (r: (typeof rows)[number]): ReactNode => {
    const fl: Field = r.fl;
    const v = values.get(fl.id) ?? '';
    const err = errors.get(fl.id);
    const ok = fixed.has(fl.id) && !err;
    const lit = evs.find((e) => e.do === 'highlight' && e.to === fl.id && f >= e.start && f < e.start + fps * 1.8);
    const litK = lit ? Math.min(1, (f - lit.start) / 6, (lit.start + fps * 1.8 - f) / 8) : 0;
    const shake = err ? Math.sin((f - err.at) * 1.9) * 9 * Math.max(0, 1 - (f - err.at) / 14) : 0;
    const focused = focusId === fl.id;
    const border = err ? '#d9503f' : ok ? '#4caf63' : focused ? p.accent : PAPER.ink;
    const ring: CSSProperties = litK ? {boxShadow: `0 0 0 ${4 * s}px rgba(255,85,0,${0.85 * litK})`} : focused ? {boxShadow: `0 0 0 ${5 * s}px ${p.accent}33`} : err ? {boxShadow: `0 0 0 ${4 * s}px rgba(217,80,63,0.18)`} : {};
    if (fl.type === 'checkbox') {
      const on = v === 'yes';
      return <div key={fl.id} style={{position: 'absolute', left: PADX * s, top: r.y * s, display: 'flex', alignItems: 'center', gap: 16 * s, fontSize: 23 * s, fontWeight: 600, transform: `translateX(${shake * s}px)`}}>
        <div style={{width: 36 * s, height: 36 * s, borderRadius: 9 * s, border: `${2.5 * s}px solid ${border}`, background: on ? p.accent : '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', ...ring}}>
          {on ? <Icon name="check" size={26 * s} color="#fff" stroke={3} /> : null}
        </div>
        {fl.label}
        {err ? <span style={{color: '#c2412f', fontSize: 19 * s}}>· {err.text}</span> : null}
      </div>;
    }
    const shown = fl.type === 'password' ? '•'.repeat(v.length) : v;
    const area = fl.type === 'textarea';
    const lead = fl.type === 'phone' ? (fl.prefix
      ? <span style={{marginRight: 14 * s, padding: `${4 * s}px ${10 * s}px`, borderRadius: 8 * s, background: '#efe8dc', border: `${1.5 * s}px solid ${PAPER.track}`, fontWeight: 700, fontSize: 22 * s, color: PAPER.ink, letterSpacing: 0}}>{fl.prefix}</span>
      : <span style={{marginRight: 12 * s, display: 'flex'}}><Icon name="phone" size={24 * s} color={PAPER.inkSoft} /></span>)
      : fl.type === 'url' ? <span style={{marginRight: 12 * s, display: 'flex'}}><Icon name="globe" size={24 * s} color={PAPER.inkSoft} /></span> : null;
    const caret = focused && Math.floor(f / 14) % 2 === 0;
    const sc = fl.strength ? strengthOf(v) : 0;
    const errK = err ? clamp01((f - err.at) / 6) : 0;
    return <div key={fl.id} style={{position: 'absolute', left: PADX * s, top: r.y * s, width: IW * s}}>
      <div style={{fontSize: 20 * s, fontWeight: 700, color: PAPER.inkSoft}}>{fl.label}</div>
      <div style={{marginTop: 8 * s, height: (area ? 114 : 64) * s, borderRadius: 14 * s, background: err ? '#fff6f4' : '#fff', border: `${2.5 * s}px solid ${border}`, display: 'flex', alignItems: area ? 'flex-start' : 'center', padding: area ? `${14 * s}px ${20 * s}px` : `0 ${20 * s}px`,
        fontSize: 25 * s, letterSpacing: fl.type === 'password' && v ? 4 * s : 0, color: shown ? PAPER.ink : '#a9a2b0', transform: `translateX(${shake * s}px)`, boxSizing: 'border-box', ...ring}}>
        {lead}
        <span style={{whiteSpace: area ? 'normal' : 'nowrap', overflow: 'hidden', lineHeight: 1.35, maxHeight: area ? 88 * s : undefined}}>{shown || fl.placeholder || ''}</span>
        {caret ? <span style={{width: 3 * s, height: 30 * s, background: PAPER.ink, marginLeft: 3 * s, display: 'inline-block'}} /> : null}
        <span style={{marginLeft: 'auto', display: 'flex'}}>
          {err ? <Icon name="circle-alert" size={28 * s} color="#d9503f" /> : ok ? <Icon name="circle-check" size={28 * s} color="#4caf63" /> : fl.type === 'select' ? <Icon name="chevron-down" size={26 * s} /> : fl.type === 'date' ? <Icon name="calendar" size={26 * s} color={PAPER.inkSoft} /> : null}
        </span>
      </div>
      {fl.strength ? <div style={{display: 'flex', alignItems: 'center', gap: 8 * s, marginTop: 10 * s}}>
        {[1, 2, 3, 4].map((k) => <div key={k} style={{flex: 1, height: 8 * s, borderRadius: 4 * s, background: k <= sc ? STRENGTH[sc].c : PAPER.track}} />)}
        <span style={{width: 90 * s, fontSize: 17 * s, fontWeight: 700, color: STRENGTH[sc].c, textAlign: 'right'}}>{STRENGTH[sc].t}</span>
      </div> : null}
      <div style={{height: 28 * s, marginTop: 6 * s, fontSize: 19 * s, fontWeight: 600, color: '#c2412f', opacity: errK, transform: `translateY(${(1 - errK) * -6 * s}px)`}}>{err ? err.text : ''}</div>
    </div>;
  };

  const cues: Cue[] = [];
  if (p.sound) evs.forEach((e) => {
    if (e.do === 'type') {
      cues.push({sound: 'click', at: e.start, volume: 0.35});
      cues.push({sound: 'typing', at: e.start + 10, volume: 0.4, duration: Math.max(4, e.end - e.start - 12), loop: true});
    }
    if (e.do === 'check') cues.push({sound: 'tick', at: e.start, volume: 0.45});
    if (e.do === 'submit') {
      cues.push({sound: 'click', at: e.start, volume: 0.5});
      cues.push({sound: e.errors?.length ? 'error' : 'success', at: e.start + Math.round(fps * 0.6), volume: 0.4});
    }
    if (e.do === 'error') cues.push({sound: 'error', at: e.start, volume: 0.3});
    if (e.do === 'highlight') cues.push({sound: 'chime', at: e.start, volume: 0.18});
  });

  return (
    <PaperStage eyebrow={p.eyebrow} title={p.title} instant={p.instant} side={phone}>
      {phone ? <SideTitle eyebrow={p.eyebrow} title={p.title} box={geo.pbox} instant={p.instant} /> : null}
      {(() => {
        const content = <>
        <div style={{opacity: 1 - successK}}>
          <div style={{position: 'absolute', left: PADX * s, top: TOP * s, fontSize: (phone ? 34 : 40) * s, fontWeight: 800}}>{p.heading}</div>
          {p.subtitle ? <div style={{position: 'absolute', left: PADX * s, top: (TOP + 54) * s, fontSize: 21 * s, color: PAPER.inkSoft}}>{p.subtitle}</div> : null}
          {rows.map(fieldView)}
          <div style={{position: 'absolute', left: PADX * s, top: btnY * s, width: IW * s, height: 66 * s, borderRadius: 16 * s, background: p.accent, color: '#fff', border: `${2 * s}px solid ${p.accent}`,
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 14 * s, fontSize: 25 * s, fontWeight: 800, transform: `scale(${submitPress ? 0.97 : 1})`, boxShadow: submitPress ? 'none' : `0 ${4 * s}px 0 rgba(0,0,0,0.18)`}}>
            {spinning ? <div style={{width: 28 * s, height: 28 * s, borderRadius: '50%', border: `${4 * s}px solid rgba(255,255,255,0.35)`, borderTopColor: '#fff', transform: `rotate(${f * 24}deg)`}} /> : null}
            {spinning ? 'Checking…' : p.button}
          </div>
        </div>
        {success ? (
          <div style={{position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 22 * s, opacity: successK}}>
            <div style={{width: 130 * s, height: 130 * s, borderRadius: '50%', background: '#dff3e2', border: `${4 * s}px solid #2f7a3d`, display: 'flex', alignItems: 'center', justifyContent: 'center', transform: `scale(${0.5 + 0.5 * successK})`}}>
              <Icon name="check" size={80 * s} color="#2f7a3d" stroke={3} />
            </div>
            <div style={{fontSize: (phone ? 32 : 40) * s, fontWeight: 800, textAlign: 'center', padding: `0 ${20 * s}px`}}>{success.text ?? 'Done!'}</div>
          </div>
        ) : null}
        </>;
        const card = (left: number, top: number, framed: boolean) => (
          <div style={{position: 'absolute', left, top, width: CW * s, height: CH * s, borderRadius: framed ? 28 * s : 0, background: framed ? PAPER.card : '#fffdf8', border: framed ? `${3 * s}px solid ${PAPER.ink}` : undefined, boxSizing: 'border-box',
            boxShadow: framed && !page ? `0 ${18 * s}px ${40 * s}px rgba(70,50,30,0.22)` : undefined, overflow: 'hidden'}}>{content}</div>
        );
        return <DeviceFrame geo={geo} enter={enter} title="Sign up" url={page && p.device !== 'window' ? p.url ?? 'shop.example.com/signup' : undefined}>
          {card(offX * s, offY * s, !phone)}
        </DeviceFrame>;
      })()}
      <DevicePointer geo={geo} x={ptr.x} y={ptr.y} press={press} ripple={ripple} opacity={ptrOp * enter} />
      {cues.map((c, k) => <Sfx key={k} sound={c.sound} at={c.at} volume={c.volume} duration={c.duration} loop={c.loop} />)}
    </PaperStage>
  );
};
