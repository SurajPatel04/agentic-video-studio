/**
 * PacketScene: a packet's journey, in the paper style. Devices sit left to right (a branch shows
 * alternative paths); an envelope travels between them; it opens to show its fields (IP, port,
 * headers...); a router reads one field (it glows, a dashed line points at it) and picks a path (that
 * link lights up, the others dim); fields change on the way (TTL, NAT); a packet can be dropped.
 *
 * Steps run one after another (pushed back if they overlap, sped up if they would not fit).
 * Forgiving input: nodes as strings, fields as an object, plain verbs ("travel", "inspect"),
 * node labels instead of ids. Without steps the packet simply hops along the nodes.
 */
import type {FC, ReactNode} from 'react';
import {spring, useCurrentFrame, useVideoConfig} from 'remotion';
import {z} from 'zod';
import {Sfx} from '../audio';
import {PAPER} from '../iso/iso';
import {useSceneLength, useUnit} from '../theme';
import {Icon, MONO, PaperStage, clamp01, ease, flexList, fraction, type Cue} from './paperStage';
import {IsoIcon, isArtKind, isoKindFor} from '../iso/IsoIcon';

const nodeSchema = z.object({
  id: z.string().min(1).max(30),
  label: z.string().max(24),
  icon: z.string().max(30).optional(), // Lucide icon (default from the label: router, server, laptop, dns...)
}).strict();
const fieldSchema = z.object({name: z.string().max(24), value: z.string().max(40)}).strict();
const STEPS = ['send', 'route', 'open', 'close', 'read', 'change', 'note', 'drop'] as const;
const stepSchema = z.object({
  at: fraction,
  do: z.enum(STEPS),
  to: z.string().max(30).optional(), // send / route: the next node
  field: z.string().max(24).optional(), // read / change: field name
  value: z.string().max(40).optional(), // change: new value
  text: z.string().max(60).optional(), // note / drop: what to say
}).strict();
type Step = z.output<typeof stepSchema>;

const slug = (t: string) => t.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 30) || 'node';
const VERBS: Record<string, string> = {travel: 'send', move: 'send', go: 'send', hop: 'send', forward: 'send', arrive: 'send', deliver: 'send', transmit: 'send', reach: 'send', goto: 'send', 'go to': 'send',
  choose: 'route', pick: 'route', select: 'route', 'pick path': 'route', 'choose path': 'route', switch: 'route',
  inspect: 'read', check: 'read', look: 'read', examine: 'read', lookup: 'read', 'look up': 'read', parse: 'read', match: 'read',
  unwrap: 'open', unpack: 'open', expand: 'open', show: 'open', reveal: 'open', wrap: 'close', seal: 'close', pack: 'close', hide: 'close',
  update: 'change', set: 'change', modify: 'change', decrement: 'change', rewrite: 'change', nat: 'change', translate: 'change',
  say: 'note', label: 'note', explain: 'note', callout: 'note', annotate: 'note', comment: 'note', discard: 'drop', lose: 'drop', block: 'drop', reject: 'drop', deny: 'drop', lost: 'drop'};

const flexPacket = (raw: unknown) => {
  if (!raw || typeof raw !== 'object') return raw;
  const r = {...(raw as Record<string, unknown>)};
  const example = !['nodes', 'devices', 'hops', 'path', 'stops'].some((k) => r[k] !== undefined);
  for (const k of ['devices', 'hops', 'path', 'stops']) if (r.nodes === undefined && Array.isArray(r[k])) { r.nodes = r[k]; delete r[k]; }
  if (Array.isArray(r.nodes)) r.nodes = (r.nodes as unknown[]).map((n) => {
    if (typeof n === 'string') return {id: slug(n), label: n};
    if (!n || typeof n !== 'object') return n;
    const o = {...(n as Record<string, unknown>)};
    for (const k of ['name', 'title']) if (o.label === undefined && typeof o[k] === 'string') { o.label = o[k]; delete o[k]; }
    if (o.id === undefined && typeof o.label === 'string') o.id = slug(o.label);
    if (o.label === undefined && typeof o.id === 'string') o.label = o.id;
    for (const k of ['kind', 'type', 'role']) { if (o.icon === undefined && typeof o[k] === 'string') o.icon = ICON_FOR.find(([re]) => re.test(o[k] as string))?.[1] ?? o[k]; delete o[k]; }
    return o;
  });
  const nodes = (Array.isArray(r.nodes) ? r.nodes : []) as {id?: string; label?: string}[];
  const nodeId = (v: unknown) => {
    if (typeof v !== 'string') return v;
    const hit = nodes.find((n) => n.id === v) ?? nodes.find((n) => n.label?.toLowerCase() === v.toLowerCase()) ?? nodes.find((n) => n.id === slug(v));
    return hit?.id ?? v;
  };
  if (Array.isArray(r.links)) r.links = (r.links as unknown[]).map((l) => {
    if (Array.isArray(l)) return {from: nodeId(l[0]), to: nodeId(l[1])};
    if (!l || typeof l !== 'object') return l;
    const o = {...(l as Record<string, unknown>)};
    if (o.from === undefined && o.source !== undefined) { o.from = o.source; delete o.source; }
    if (o.to === undefined && o.target !== undefined) { o.to = o.target; delete o.target; }
    o.from = nodeId(o.from); o.to = nodeId(o.to);
    return o;
  });
  // packet: fields as an object or at the top level
  let pk = (r.packet && typeof r.packet === 'object' ? {...(r.packet as Record<string, unknown>)} : {}) as Record<string, unknown>;
  for (const k of ['fields', 'headers']) if (pk.fields === undefined && r[k] !== undefined) { pk.fields = r[k]; delete r[k]; }
  if (pk.fields === undefined && pk.headers !== undefined) { pk.fields = pk.headers; delete pk.headers; }
  if (pk.fields && typeof pk.fields === 'object' && !Array.isArray(pk.fields)) pk.fields = Object.entries(pk.fields as Record<string, unknown>).map(([name, value]) => ({name, value: String(value)}));
  if (Array.isArray(pk.fields)) pk.fields = (pk.fields as unknown[]).map((fl) => {
    if (!fl || typeof fl !== 'object') return fl;
    const o = {...(fl as Record<string, unknown>)};
    for (const k of ['key', 'label', 'field', 'header']) if (o.name === undefined && typeof o[k] === 'string') { o.name = o[k]; delete o[k]; }
    if (o.value !== undefined && typeof o.value !== 'string') o.value = String(o.value);
    delete o.id; delete o.layer;
    return o;
  });
  for (const k of ['name', 'title']) if (pk.label === undefined && typeof pk[k] === 'string') { pk.label = pk[k]; delete pk[k]; }
  if (Object.keys(pk).length) r.packet = pk; else pk = {};
  for (const k of ['actions', 'events', 'timeline']) if (r.steps === undefined && Array.isArray(r[k])) { r.steps = r[k]; delete r[k]; }
  r.steps = flexList(r.steps, {
    keys: {action: 'do', verb: 'do', type: 'do', target: 'to', node: 'to', next: 'to', dest: 'to', destination: 'to', at_node: 'to', key: 'field', header: 'field', name: 'field', new: 'value', newValue: 'value', message: 'text', label: 'text', note: 'text', reason: 'text'},
    values: {do: (v) => VERBS[v] ?? v},
  });
  if (Array.isArray(r.steps)) r.steps = (r.steps as Record<string, unknown>[]).map((s) => {
    if (!s || typeof s !== 'object') return s;
    const o = {...s};
    if (o.to !== undefined) o.to = nodeId(o.to);
    if (o.value !== undefined && typeof o.value !== 'string') o.value = String(o.value);
    if (o.do === 'read' && o.to !== undefined && o.field === undefined) delete o.to; // "read" at a node: the packet is already there
    if (o.do === 'note' || o.do === 'read' || o.do === 'open' || o.do === 'close' || o.do === 'change' || o.do === 'drop') delete o.to;
    return o;
  });
  if (example) { r.nodes = EXAMPLE.nodes; r.links ??= EXAMPLE.links; r.packet ??= EXAMPLE.packet; r.steps ??= EXAMPLE.steps; } // the built-in demo, complete
  return r;
};

const EXAMPLE = {
  nodes: [{id: 'laptop', label: 'Your laptop'}, {id: 'router', label: 'Router'}, {id: 'isp', label: 'ISP'}, {id: 'other', label: 'Other network'}, {id: 'server', label: 'Web server'}],
  links: [{from: 'laptop', to: 'router'}, {from: 'router', to: 'isp'}, {from: 'router', to: 'other'}, {from: 'isp', to: 'server'}],
  packet: {label: 'HTTP request', fields: [{name: 'Src IP', value: '192.168.1.20'}, {name: 'Dst IP', value: '93.184.216.34'}, {name: 'Dst port', value: '443'}, {name: 'TTL', value: '64'}, {name: 'Host', value: 'shop.example'}]},
  steps: [
    {at: 0.05, do: 'send', to: 'router'}, {at: 0.2, do: 'open'}, {at: 0.27, do: 'read', field: 'Dst IP', text: 'Where is it going?'},
    {at: 0.45, do: 'change', field: 'TTL', value: '63'}, {at: 0.52, do: 'close'}, {at: 0.56, do: 'route', to: 'isp'}, {at: 0.75, do: 'send', to: 'server'}, {at: 0.9, do: 'note', text: 'Delivered'},
  ] as Step[],
};

export const packetSceneSchema = z.preprocess(flexPacket, z.object({
  eyebrow: z.string().max(40).optional(),
  title: z.string().max(70).optional(),
  nodes: z.array(nodeSchema).min(2).max(7).default(() => EXAMPLE.nodes),
  links: z.array(z.object({from: z.string(), to: z.string(), label: z.string().max(20).optional()}).strict()).max(10).optional(), // default: a chain in node order
  packet: z.object({label: z.string().max(24).default('Packet'), color: z.string().max(20).optional(), fields: z.array(fieldSchema).max(7).default([])}).strict().default(() => EXAMPLE.packet),
  steps: z.array(stepSchema).max(20).optional(), // default: hop along the nodes
  sound: z.boolean().default(true),
}).strict().superRefine((p, ctx) => {
  const ids = new Set(p.nodes.map((n) => n.id));
  if (ids.size !== p.nodes.length) ctx.addIssue({code: 'custom', path: ['nodes'], message: 'node ids must be unique'});
  p.links?.forEach((l, i) => { for (const k of ['from', 'to'] as const) if (!ids.has(l[k])) ctx.addIssue({code: 'custom', path: ['links', i, k], message: `"${l[k]}" is not a node; nodes: ${[...ids].join(', ')}`}); });
  const names = p.packet.fields.map((x) => x.name.toLowerCase());
  p.steps?.forEach((s, i) => {
    if ((s.do === 'send' || s.do === 'route') && (!s.to || !ids.has(s.to))) ctx.addIssue({code: 'custom', path: ['steps', i, 'to'], message: `"${s.do}" needs "to" = a node id: ${[...ids].join(', ')}`});
    if ((s.do === 'read' || s.do === 'change') && (!s.field || !names.includes(s.field.toLowerCase()))) ctx.addIssue({code: 'custom', path: ['steps', i, 'field'], message: `"${s.do}" needs "field" = one of the packet fields: ${p.packet.fields.map((x) => x.name).join(', ') || '(add packet.fields)'}`});
    if (s.do === 'change' && s.value === undefined) ctx.addIssue({code: 'custom', path: ['steps', i, 'value'], message: '"change" needs the new "value"'});
    if (s.do === 'note' && !s.text) ctx.addIssue({code: 'custom', path: ['steps', i, 'text'], message: '"note" needs "text"'});
  });
}));
type Props = z.output<typeof packetSceneSchema>;

export const description =
  'A packet\'s journey, in the paper style: devices left to right (branches show other paths), an envelope travels ' +
  'between them, opens to show its fields (IP, port, TTL, headers), a router reads one field and picks a path (that ' +
  'link lights up), fields change on the way (TTL, NAT), a packet can be dropped. Steps: send / route (to), open, ' +
  'close, read (field), change (field, value), note (text), drop. Use for networking, HTTP, TCP/IP, DNS, routing, NAT, firewalls.';
export const tags = ['packet', 'network', 'networking', 'routing', 'router', 'ip', 'tcp', 'udp', 'http', 'dns', 'nat', 'firewall', 'headers', 'ttl', 'internet'];

const ICON_FOR: [RegExp, string][] = [[/router|gateway/i, 'router'], [/switch/i, 'network'], [/dns|resolver|name server/i, 'book-open'], [/firewall/i, 'brick-wall'],
  [/server|host|web|api|backend/i, 'server'], [/database|db/i, 'database'], [/cloud|isp|internet|network/i, 'cloud'], [/phone|mobile/i, 'smartphone'],
  [/laptop|client|computer|browser|you|user|pc/i, 'laptop'], [/load ?balancer|lb/i, 'split'], [/cdn|cache/i, 'zap'], [/tower|wifi|wireless/i, 'wifi']];
const iconOf = (n: {label: string; icon?: string}) => n.icon ?? ICON_FOR.find(([re]) => re.test(n.label))?.[1] ?? 'box';

export const PacketScene: FC<z.input<typeof packetSceneSchema>> = (input) => {
  const p = packetSceneSchema.parse(input) as Props;
  const f = useCurrentFrame();
  const {fps, width: W, height: H} = useVideoConfig();
  const u = useUnit();
  const len = useSceneLength();
  const links = p.links ?? p.nodes.slice(1).map((n, i) => ({from: p.nodes[i].id, to: n.id, label: undefined as string | undefined}));
  const steps: Step[] = p.steps ?? (() => {
    const out: Step[] = [];
    const n = p.nodes.length - 1;
    p.nodes.slice(1).forEach((nd, i) => {
      out.push({at: 0.05 + (0.85 * i) / n, do: 'send', to: nd.id});
      if (i === 0 && p.packet.fields.length) { out.push({at: 0.05 + 0.85 / n * 0.55, do: 'open'}); }
    });
    return out;
  })();

  // layout: columns by hops from the first node
  const col = new Map<string, number>([[p.nodes[0].id, 0]]);
  for (let pass = 0; pass < p.nodes.length; pass++) links.forEach((l) => { if (col.has(l.from) && !col.has(l.to)) col.set(l.to, col.get(l.from)! + 1); });
  let maxC = Math.max(...col.values());
  p.nodes.forEach((n) => { if (!col.has(n.id)) col.set(n.id, ++maxC); });
  const byCol = new Map<number, string[]>();
  p.nodes.forEach((n) => byCol.set(col.get(n.id)!, [...(byCol.get(col.get(n.id)!) ?? []), n.id]));
  const nCols = maxC + 1;
  const CW = 190 * u, CH = 140 * u;
  const pos = new Map<string, {x: number; y: number}>();
  byCol.forEach((ids, c) => ids.forEach((id, k) => pos.set(id, {
    x: 150 * u + CW / 2 + ((W - 300 * u - CW) * c) / Math.max(1, nCols - 1),
    y: H * 0.68 + (k - (ids.length - 1) / 2) * 200 * u,
  })));
  const anchor = (id: string) => { const q = pos.get(id)!; return {x: q.x, y: q.y - CH / 2 - 46 * u}; };

  // timeline
  const dur = (s: Step, sp: number) => Math.round(({send: 0.9, route: 1.25, open: 0.4, close: 0.35, read: 1.1, change: 0.7, note: 0.4, drop: 0.8}[s.do] / sp) * fps);
  const plan = (sp: number) => { let t = 0; return [...steps].sort((a, b) => a.at - b.at).map((s) => { const start = Math.max(Math.round(s.at * len), t); const end = start + dur(s, sp); t = end + 2; return {...s, start, end}; }); };
  let speed = 1, evs = plan(1);
  for (let k = 0; k < 4 && evs.length; k++) { const last = evs[evs.length - 1].end; if (last <= len * 0.95 || speed >= 3) break; speed = Math.min(3, speed * (last / (len * 0.95)) * 1.05); evs = plan(speed); }

  // state at frame f
  let at = p.nodes[0].id, envPos = anchor(at), open = 0, dropped = 0;
  const values = new Map(p.packet.fields.map((x) => [x.name.toLowerCase(), x.value]));
  const flash = new Map<string, number>();
  let reading: {field: string; k: number; node: string} | undefined, routing: {from: string; to: string; k: number} | undefined, note: {text: string; k: number; node: string} | undefined;
  for (const e of evs) {
    if (f < e.start) break;
    const k = clamp01((f - e.start) / Math.max(1, e.end - e.start));
    if (e.do === 'send' || e.do === 'route') {
      const from = at;
      const travelK = e.do === 'route' ? clamp01((k - 0.3) / 0.7) : k;
      if (e.do === 'route' && f < e.end + fps * 0.6) routing = {from, to: e.to!, k};
      const a = anchor(from), b = anchor(e.to!);
      const tk = ease(travelK);
      envPos = {x: a.x + (b.x - a.x) * tk, y: a.y + (b.y - a.y) * tk - Math.sin(tk * Math.PI) * 50 * u};
      if (k >= 1) { at = e.to!; envPos = b; }
    }
    if (e.do === 'open') open = ease(k);
    if (e.do === 'close') open = 1 - ease(k);
    if (e.do === 'read') { if (open < 1) open = Math.max(open, ease(clamp01(k * 3))); if (f < e.end + fps * 0.3) reading = {field: e.field!.toLowerCase(), k, node: at}; if (e.text && f < e.end + fps * 1.2) note = {text: e.text, k, node: at}; }
    if (e.do === 'change') { if (k >= 0.4) values.set(e.field!.toLowerCase(), e.value!); flash.set(e.field!.toLowerCase(), k); }
    if (e.do === 'note' && f < e.start + fps * 1.8) note = {text: e.text!, k: clamp01((f - e.start) / 8), node: at};
    if (e.do === 'drop') { dropped = ease(k); if (e.text && f < e.start + fps * 2) note = {text: e.text, k: clamp01((f - e.start) / 8), node: at}; }
  }
  if (dropped > 0) envPos = {x: envPos.x, y: envPos.y + dropped * 70 * u};

  const enter = spring({frame: f, fps, config: {damping: 16, stiffness: 110}});
  const fields = p.packet.fields;
  const rowH = 40 * u, cardW = 400 * u, cardH = 52 * u + fields.length * rowH;
  let cardX = envPos.x - cardW / 2, cardY = envPos.y - 46 * u - cardH;
  if (cardY < 175 * u) { cardY = Math.max(175 * u, envPos.y - cardH / 2); cardX = envPos.x + 80 * u; }
  cardX = Math.max(40 * u, Math.min(W - cardW - 40 * u, cardX));

  const cues: Cue[] = [];
  if (p.sound) evs.forEach((e) => {
    const s = ({send: ['whoosh', 0.22], route: ['connect', 0.25], open: ['pop', 0.3], close: ['tick', 0.25], read: ['rise', 0.22], change: ['blip', 0.3], note: ['blip', 0.18], drop: ['error', 0.35]} as Record<string, [string, number]>)[e.do];
    cues.push({sound: s[0], at: e.start, volume: s[1]});
    if (e.do === 'route') cues.push({sound: 'whoosh', at: e.start + Math.round((e.end - e.start) * 0.3), volume: 0.2});
  });
  const last = evs[evs.length - 1];
  if (p.sound && last && (last.do === 'send' || last.do === 'route')) cues.push({sound: 'ding', at: last.end, volume: 0.25});

  const linkPath = (a: {x: number; y: number}, b: {x: number; y: number}) => `M${a.x},${a.y} C${a.x + (b.x - a.x) / 2},${a.y} ${a.x + (b.x - a.x) / 2},${b.y} ${b.x},${b.y}`;
  const readRow = reading ? fields.findIndex((x) => x.name.toLowerCase() === reading!.field) : -1;
  const env: ReactNode = (
    <div style={{position: 'absolute', left: envPos.x - 52 * u, top: envPos.y - 36 * u, width: 104 * u, height: 72 * u, opacity: (1 - dropped * 0.85) * enter, transform: `rotate(${dropped * 25}deg)`, zIndex: 6}}>
      <svg width={104 * u} height={72 * u} viewBox="0 0 104 72" style={{overflow: 'visible'}}>
        <rect x="2" y="10" width="100" height="60" rx="6" fill={dropped > 0 ? '#fbe1dc' : p.packet.color ?? '#fff6df'} stroke={PAPER.ink} strokeWidth="3" />
        <path d={open > 0.5 ? 'M2,12 L52,-18 L102,12' : 'M2,12 L52,44 L102,12'} fill={dropped > 0 ? '#f7c9c0' : '#ffe9b8'} stroke={PAPER.ink} strokeWidth="3" strokeLinejoin="round" />
      </svg>
      <div style={{position: 'absolute', left: '50%', top: 78 * u, transform: 'translateX(-50%)', whiteSpace: 'nowrap', fontFamily: MONO, fontSize: 17 * u, fontWeight: 700, padding: `${2 * u}px ${10 * u}px`, borderRadius: 8 * u, background: PAPER.card, border: `${1.5 * u}px solid ${PAPER.ink}`}}>{p.packet.label}</div>
      {dropped > 0.3 ? <div style={{position: 'absolute', left: 30 * u, top: 4 * u, fontSize: 52 * u, fontWeight: 900, color: '#d9503f', transform: `scale(${dropped})`}}>✕</div> : null}
    </div>
  );

  return (
    <PaperStage eyebrow={p.eyebrow} title={p.title}>
      <svg width={W} height={H} style={{position: 'absolute', inset: 0}}>
        {links.map((l, i) => {
          const a = pos.get(l.from), b = pos.get(l.to);
          if (!a || !b) return null;
          const chosen = routing && routing.from === l.from && routing.to === l.to;
          const other = routing && routing.from === l.from && routing.to !== l.to;
          const lk = routing ? clamp01(routing.k / 0.3) : 0;
          return <g key={i} opacity={enter}>
            <path d={linkPath({x: a.x, y: a.y + CH * 0.18}, {x: b.x, y: b.y + CH * 0.18})} stroke={chosen ? '#ff5500' : PAPER.ink} strokeWidth={(chosen ? 3 + 3 * lk : 3) * u} fill="none" opacity={other ? 1 - 0.65 * lk : 0.9} strokeDasharray={other && lk > 0 ? `${10 * u} ${8 * u}` : undefined} />
            {l.label ? <text x={(a.x + b.x) / 2} y={(a.y + b.y) / 2 - 12 * u} textAnchor="middle" fontFamily={MONO} fontSize={17 * u} fill={PAPER.inkSoft}>{l.label}</text> : null}
          </g>;
        })}
        {reading && readRow >= 0 && open > 0.8 ? (() => {
          const q = pos.get(reading.node)!;
          const k = clamp01(reading.k / 0.3);
          const ty = cardY + 52 * u + (readRow + 0.5) * rowH;
          const tx = cardX + (cardX > q.x ? 0 : cardW);
          return <path d={`M${q.x},${q.y - CH / 2} L${q.x + (tx - q.x) * k},${q.y - CH / 2 + (ty - q.y + CH / 2) * k}`} stroke="#ff5500" strokeWidth={3 * u} strokeDasharray={`${8 * u} ${6 * u}`} fill="none" />;
        })() : null}
      </svg>
      {p.nodes.map((n, i) => {
        const q = pos.get(n.id)!;
        const isReading = reading && reading.node === n.id && reading.k < 1;
        const pop = spring({frame: f - 3 - i * 4, fps, config: {damping: 13}});
        const kind = n.icon && isArtKind(n.icon) ? n.icon : isoKindFor(n.label, 'tile');
        return <div key={n.id} style={{position: 'absolute', left: 0, top: 0, opacity: Math.min(1, pop * 1.5), transform: `translateY(${(1 - pop) * 30 * u}px)`}}>
          <IsoIcon kind={kind} icon={iconOf(n)} cx={q.x} by={q.y + CH / 2 - 6 * u} w={CW} h={CH} u={u} id={`pk-${n.id}`} time={f / fps} highlight={isReading ? 1 : 0} />
          <div style={{position: 'absolute', left: q.x, top: q.y + CH / 2 + 4 * u, transform: 'translateX(-50%)', whiteSpace: 'nowrap', fontFamily: MONO, fontSize: 20 * u, fontWeight: 800,
            padding: `${3 * u}px ${12 * u}px`, borderRadius: 10 * u, background: isReading ? '#ffe2c4' : PAPER.card, border: `${2 * u}px solid ${PAPER.ink}`}}>{n.label}</div>
        </div>;
      })}
      {/* the packet's fields */}
      {open > 0.02 && fields.length ? (
        <div style={{position: 'absolute', left: cardX, top: cardY, width: cardW, height: cardH, borderRadius: 16 * u, background: '#fffaf1', border: `${2.5 * u}px solid ${PAPER.ink}`, overflow: 'hidden', zIndex: 7,
          opacity: open, transform: `scale(${0.6 + 0.4 * open})`, transformOrigin: 'bottom center', boxShadow: `0 ${10 * u}px ${20 * u}px rgba(70,50,30,0.18)`}}>
          <div style={{height: 52 * u, display: 'flex', alignItems: 'center', gap: 10 * u, padding: `0 ${16 * u}px`, background: '#ffe9b8', borderBottom: `${2 * u}px solid ${PAPER.ink}`, fontWeight: 800, fontSize: 21 * u}}>
            <Icon name="mail-open" size={24 * u} />{p.packet.label}
          </div>
          {fields.map((x, k) => {
            const key = x.name.toLowerCase();
            const hl = reading && reading.field === key ? 0.6 + 0.4 * Math.sin(f / 3) : 0;
            const fl = flash.has(key) ? Math.max(0, 1 - Math.abs(flash.get(key)! - 0.45) * 2.5) : 0;
            return <div key={k} style={{height: rowH, display: 'flex', alignItems: 'center', padding: `0 ${16 * u}px`, fontFamily: MONO, fontSize: 20 * u, borderBottom: `${1 * u}px solid ${PAPER.track}`,
              background: hl ? `rgba(255,140,40,${0.3 * hl})` : fl ? `rgba(255,200,60,${0.5 * fl})` : undefined, fontWeight: hl ? 800 : 500}}>
              <span style={{color: PAPER.inkSoft, width: 150 * u, flexShrink: 0}}>{x.name}</span>
              <span style={{fontWeight: 800, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis'}}>{values.get(key)}</span>
              {hl ? <span style={{marginLeft: 'auto', display: 'flex'}}><Icon name="search" size={22 * u} color="#ff5500" /></span> : null}
            </div>;
          })}
        </div>
      ) : null}
      {env}
      {/* note bubble under the node */}
      {note ? (() => {
        const q = pos.get(note.node)!;
        const k = clamp01(note.k * 3);
        return <div style={{position: 'absolute', left: q.x, top: q.y + CH / 2 + 50 * u, transform: `translateX(-50%) scale(${0.7 + 0.3 * k})`, opacity: k, whiteSpace: 'nowrap', padding: `${8 * u}px ${16 * u}px`, borderRadius: 12 * u,
          background: '#fffaf1', border: `${2 * u}px solid ${PAPER.ink}`, fontSize: 21 * u, fontWeight: 700, boxShadow: `inset ${5 * u}px 0 0 #f0a43a`, zIndex: 8}}>{note.text}</div>;
      })() : null}
      {cues.map((c, k) => <Sfx key={k} sound={c.sound} at={c.at} volume={c.volume} />)}
    </PaperStage>
  );
};
