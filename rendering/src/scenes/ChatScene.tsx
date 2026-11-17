/**
 * ChatScene: a chat in the paper style, on a desktop window or on a phone. My messages are typed into
 * the composer and sent; the other side shows "typing…" dots, then its reply pops in or streams word
 * by word (AI assistants), with optional source chips under it (RAG). Two looks: "assistant"
 * (chatbot / AI) and "messenger" (WhatsApp-style conversation with ticks).
 *
 * Messages run one after another: if typing/streaming takes longer than the gap to the next "at",
 * the next message waits; if the whole chat would not fit in the scene, everything speeds up.
 * Forgiving input: "role"/"content", "user"/"assistant"/"bot" and the like are understood.
 */
import type {FC, ReactNode} from 'react';
import {spring, useCurrentFrame, useVideoConfig} from 'remotion';
import {z} from 'zod';
import {Sfx} from '../audio';
import {PAPER} from '../iso/iso';
import {useSceneLength} from '../theme';
import {DEVICE_ALIASES, DeviceFrame, Icon, PaperStage, SideTitle, clamp01, flexList, flexValue, fraction, useDevice, type Cue} from './paperStage';

export const messageSchema = z.object({
  at: fraction,
  from: z.enum(['me', 'them']),
  text: z.string().min(1).max(400),
  stream: z.boolean().optional(), // reply appears word by word (default: on for "them" in assistant look)
  typing: z.number().min(0).max(4).optional(), // seconds of "typing…" dots before a "them" message (default 0.9)
  sources: z.array(z.string().max(40)).max(4).optional(), // chips under the message (RAG: documents used)
  highlight: z.boolean().optional(), // glow when it appears
}).strict();
type Message = z.output<typeof messageSchema>;

const EXAMPLE: Message[] = [
  {at: 0.04, from: 'me', text: 'Can I return shoes I bought last week?'},
  {at: 0.3, from: 'them', text: 'Yes! You can return unworn shoes within 30 days. Start the return from Orders, print the label, and drop the box at any post office.', sources: ['returns-policy.pdf', 'help/orders']},
  {at: 0.72, from: 'me', text: 'Great, thanks!'},
];

const ME = new Set(['me', 'user', 'human', 'customer', 'you', 'self', 'client', 'i', 'student', 'shopper', 'sender']);
export const flexChat = (raw: unknown) => {
  if (!raw || typeof raw !== 'object') return raw;
  const r = {...(raw as Record<string, unknown>)};
  if (!r.messages) for (const k of ['conversation', 'chat', 'dialogue', 'dialog', 'turns']) if (Array.isArray(r[k])) { r.messages = r[k]; delete r[k]; }
  if (r.style !== undefined && r.look === undefined) { r.look = r.style; delete r.style; }
  r.look = flexValue(r.look, {chatbot: 'assistant', ai: 'assistant', bot: 'assistant', support: 'assistant', chatgpt: 'assistant', gpt: 'assistant',
    whatsapp: 'messenger', sms: 'messenger', imessage: 'messenger', text: 'messenger', messages: 'messenger', chat: 'messenger', telegram: 'messenger', group: 'messenger'});
  r.device = flexValue(r.device, DEVICE_ALIASES);
  r.messages = flexList(r.messages, {
    keys: {role: 'from', sender: 'from', author: 'from', speaker: 'from', who: 'from', content: 'text', message: 'text', body: 'text', msg: 'text'},
    values: {from: (v) => (ME.has(v) ? 'me' : 'them')},
  });
  return r;
};

export const chatSceneSchema = z.preprocess(flexChat, z.object({
  eyebrow: z.string().max(40).optional(),
  title: z.string().max(70).optional(),
  device: z.enum(['window', 'browser', 'laptop', 'monitor', 'phone']).default('window'),
  url: z.string().max(60).optional(), // browser / laptop: address bar (a web chat or a support page)
  look: z.enum(['assistant', 'messenger']).optional(), // default: messenger on a phone, assistant in a window
  name: z.string().max(30).optional(), // the other side, shown in the header
  icon: z.string().max(30).optional(), // their avatar icon (default bot / user)
  accent: z.string().max(20).optional(),
  messages: z.array(messageSchema).min(1).max(12).default(() => EXAMPLE),
  composer: z.boolean().default(true), // my messages are typed into the box at the bottom first
  instant: z.boolean().default(false),
  sound: z.boolean().default(true),
}).strict());
type Props = z.output<typeof chatSceneSchema>;

export const description =
  'A chat in the paper style on any device ("device": "window" | "browser" | "laptop" | "monitor" | "phone"): my messages are ' +
  'typed into the box and sent, the other side shows "typing…" dots, then replies (an AI reply streams word by word), ' +
  'with optional source chips under a reply (RAG). Looks: "assistant" (chatbot, ChatGPT-style AI, customer support) ' +
  'or "messenger" (WhatsApp-style conversation with ticks; default on a phone). Use for chatbots, AI assistants and ' +
  'RAG, customer support, messaging stories, rumours and forwarded messages.';
export const tags = ['chat', 'chatbot', 'ai', 'assistant', 'chatgpt', 'llm', 'rag', 'support', 'customer service', 'message', 'whatsapp', 'conversation', 'messenger', 'texting', 'sms'];

const TYPE_CPS = 18, WORDS_PS = 9;
type Ev = Message & {i: number; start: number; shown: number; end: number};
const timeline = (msgs: Message[], look: string, composer: boolean, len: number, fps: number, speed: number, minStart = 0): Ev[] => {
  let t = minStart;
  return msgs.map((m, i) => ({m, i})).sort((a, b) => a.m.at - b.m.at).map(({m, i}) => {
    const start = Math.max(Math.round(m.at * len), t);
    let shown = start, end = start;
    if (m.from === 'me') {
      shown = composer ? start + 4 + Math.ceil((m.text.length / (TYPE_CPS * speed)) * fps) + 4 : start;
      end = shown + 6;
    } else {
      shown = start + Math.round(((m.typing ?? 0.9) / speed) * fps);
      const stream = m.stream ?? look === 'assistant';
      end = shown + (stream ? Math.ceil((m.text.split(/\s+/).length / (WORDS_PS * speed)) * fps) : 6) + (m.sources?.length ? 8 + 6 * m.sources.length : 0);
    }
    t = end + 4;
    return {...m, i, start, shown, end};
  });
};

type PanelProps = {messages: Message[]; look: 'assistant' | 'messenger'; name?: string; icon?: string; accent?: string; composer: boolean; sound: boolean;
  w: number; h: number; s: number; compact: boolean; minStart?: number; phoneHeader?: boolean};

/** The chat itself (header, messages, composer) in a w x h box: used by ChatScene and by ScreenScene's chat widget. */
export const ChatPanel: FC<PanelProps> = (p) => {
  const f = useCurrentFrame();
  const {fps} = useVideoConfig();
  const len = useSceneLength();
  const phone = p.compact;
  const look = p.look;
  const assistant = look === 'assistant';
  const accent = p.accent ?? (assistant ? '#4f6ef5' : '#2f9e68');
  const name = p.name ?? (assistant ? 'Shoply Assistant' : 'Mira');
  const avatarIcon = p.icon ?? (assistant ? 'bot' : 'user');
  const minStart = p.minStart ?? 0;
  // speed up typing/streaming when the chat would run past the end of the scene
  let speed = 1, evs = timeline(p.messages, look, p.composer, len, fps, 1, minStart);
  for (let k = 0; k < 4; k++) {
    const last = evs[evs.length - 1].end;
    if (last <= len * 0.95 || speed >= 4) break;
    speed = Math.min(4, speed * (last / (len * 0.95)) * 1.05);
    evs = timeline(p.messages, look, p.composer, len, fps, speed, minStart);
  }

  const s = p.s;
  const AW = p.w, AH = p.h;
  const HEAD = phone ? 76 : 84, COMPOSE = p.composer ? (phone ? 96 : 96) : 0, SIDE = phone ? 16 : 32;
  const FONT = phone ? 23 : 26, LINE = phone ? 32 : 37, AV = phone ? 0 : 48;
  const maxW = (AW - SIDE * 2 - AV) * (phone ? 0.8 : 0.68);
  const charsPerLine = Math.floor((maxW - 40) / (FONT * 0.52));
  const estH = (m: Ev) => Math.max(1, Math.ceil(m.text.length / charsPerLine)) * LINE + 30 + (m.sources?.length ? 50 : 0) + (assistant ? 0 : 18);
  const viewH = AH - HEAD - COMPOSE - 24;

  const typingMe = p.composer ? evs.find((e) => e.from === 'me' && f >= e.start && f < e.shown) : undefined;
  const draft = typingMe ? typingMe.text.slice(0, Math.max(0, Math.floor(((f - typingMe.start - 4) / fps) * TYPE_CPS * speed))) : '';
  const sendPress = evs.some((e) => e.from === 'me' && p.composer && f >= e.shown - 4 && f < e.shown + 6);
  const themTyping = evs.find((e) => e.from === 'them' && f >= e.start && f < e.shown);
  const visible = evs.filter((e) => f >= e.shown);
  const total = visible.reduce((acc, e) => acc + estH(e) + 16, 0) + (themTyping ? 76 : 0);
  const anchorBottom = total > viewH;

  const avatar = (size: number) => (
    <div style={{width: size * s, height: size * s, borderRadius: '50%', flexShrink: 0, background: assistant ? '#cdc3ee' : '#f7c6a3', border: `${2 * s}px solid ${PAPER.ink}`, display: 'flex', alignItems: 'center', justifyContent: 'center'}}>
      <Icon name={avatarIcon} size={size * 0.55 * s} />
    </div>
  );

  const bubble = (e: Ev): ReactNode => {
    const me = e.from === 'me';
    const k = spring({frame: f - e.shown, fps, config: {damping: 14, stiffness: 170}});
    const stream = !me && (e.stream ?? assistant);
    const words = e.text.split(/\s+/);
    const n = stream ? Math.min(words.length, Math.floor(((f - e.shown) / fps) * WORDS_PS * speed) + 1) : words.length;
    const streaming = stream && n < words.length;
    const textDone = e.shown + (stream ? Math.ceil((words.length / (WORDS_PS * speed)) * fps) : 0);
    const lit = e.highlight && f >= e.shown ? clamp01(Math.min((f - e.shown) / 6, (e.shown + fps * 2 - f) / 10)) : 0;
    const bg = me ? (assistant ? accent : '#d9f2d0') : assistant ? PAPER.card : '#ffffff';
    const ink = me && assistant ? '#fff' : PAPER.ink;
    return (
      <div key={e.i} style={{display: 'flex', justifyContent: me ? 'flex-end' : 'flex-start', alignItems: 'flex-end', gap: 12 * s, marginTop: 16 * s,
        maxHeight: k < 0.98 && !stream ? estH(e) * s * k + 4 : undefined, opacity: Math.min(1, k * 1.6), transform: `translateY(${(1 - k) * 18 * s}px)`}}>
        {!me && AV ? avatar(AV) : null}
        <div style={{maxWidth: maxW * s}}>
          <div style={{padding: `${12 * s}px ${18 * s}px`, borderRadius: 22 * s, borderBottomRightRadius: me ? 6 * s : 22 * s, borderBottomLeftRadius: me ? 22 * s : 6 * s, background: bg, color: ink,
            border: `${2 * s}px solid ${me && assistant ? accent : PAPER.ink}`, fontSize: FONT * s, lineHeight: `${LINE * s}px`, boxShadow: lit ? `0 0 0 ${4 * s}px rgba(255,85,0,${0.85 * lit}), 0 0 ${24 * s}px rgba(255,140,40,${0.5 * lit})` : `0 ${3 * s}px 0 rgba(70,50,30,0.12)`}}>
            {words.slice(0, n).join(' ')}
            {streaming ? <span style={{display: 'inline-block', width: 11 * s, height: FONT * s, marginLeft: 6 * s, background: PAPER.ink, verticalAlign: 'middle', opacity: Math.floor(f / 6) % 2 ? 0.3 : 1}} /> : null}
            {!assistant ? <div style={{textAlign: 'right', fontSize: 15 * s, color: PAPER.inkSoft, lineHeight: 1.2}}>
              9:41 {me ? <span style={{color: f > e.shown + fps ? '#3d9be9' : PAPER.inkSoft, fontWeight: 800}}>✓✓</span> : null}
            </div> : null}
          </div>
          {e.sources?.length && f >= textDone + 6 ? <div style={{display: 'flex', gap: 8 * s, marginTop: 8 * s, flexWrap: 'wrap'}}>
            {e.sources.map((src, j) => {
              const kk = spring({frame: f - textDone - 6 - j * 6, fps, config: {damping: 14}});
              return <div key={j} style={{display: 'flex', alignItems: 'center', gap: 8 * s, padding: `${5 * s}px ${12 * s}px`, borderRadius: 14 * s, background: '#efe8dc', border: `${1.5 * s}px solid ${PAPER.ink}`,
                fontSize: (phone ? 15 : 18) * s, fontWeight: 600, opacity: kk, transform: `scale(${0.7 + 0.3 * kk})`}}><Icon name="file-text" size={16 * s} />{src}</div>;
            })}
          </div> : null}
        </div>
      </div>
    );
  };

  const dots = themTyping ? (
    <div style={{display: 'flex', alignItems: 'flex-end', gap: 12 * s, marginTop: 16 * s}}>
      {AV ? avatar(AV) : null}
      <div style={{display: 'flex', gap: 8 * s, padding: `${18 * s}px ${20 * s}px`, borderRadius: 22 * s, borderBottomLeftRadius: 6 * s, background: assistant ? PAPER.card : '#fff', border: `${2 * s}px solid ${PAPER.ink}`}}>
        {[0, 1, 2].map((d) => <div key={d} style={{width: 11 * s, height: 11 * s, borderRadius: '50%', background: PAPER.inkSoft, transform: `translateY(${-6 * s * Math.max(0, Math.sin((f - d * 4) / 4))}px)`}} />)}
      </div>
    </div>
  ) : null;

  const status = themTyping ? 'typing…' : assistant ? 'AI assistant · online' : 'online';
  const body = (
    <div style={{position: 'absolute', left: 0, top: 0, width: AW * s, height: AH * s,
      background: assistant ? '#fffdf8' : 'radial-gradient(circle, rgba(120,96,70,0.10) 1.5px, transparent 1.6px) 0 0 / 22px 22px, #f1e9dc'}}>
      {/* header */}
      <div style={{position: 'absolute', left: 0, right: 0, top: 0, height: HEAD * s, display: 'flex', alignItems: 'center', gap: 14 * s, padding: `0 ${(phone ? 14 : 28) * s}px`, borderBottom: `${2 * s}px solid ${PAPER.track}`, background: '#fffaf1', zIndex: 2}}>
        {p.phoneHeader ? <Icon name="arrow-left" size={26 * s} /> : null}
        {avatar(phone ? 46 : 54)}
        <div style={{minWidth: 0}}>
          <div style={{fontSize: (phone ? 22 : 26) * s, fontWeight: 800, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis'}}>{name}</div>
          <div style={{fontSize: (phone ? 16 : 18) * s, color: themTyping ? accent : PAPER.good, fontWeight: 600}}>{status}</div>
        </div>
        {p.phoneHeader ? <div style={{marginLeft: 'auto', display: 'flex', gap: 18 * s}}><Icon name="video" size={24 * s} /><Icon name="phone" size={22 * s} /></div> : null}
      </div>
      {/* messages */}
      <div style={{position: 'absolute', left: SIDE * s, right: SIDE * s, top: (HEAD + 4) * s, height: (viewH + 20) * s, overflow: 'hidden'}}>
        <div style={{position: 'absolute', left: 0, right: 0, ...(anchorBottom ? {bottom: 10 * s} : {top: 0}), display: 'flex', flexDirection: 'column'}}>
          {visible.map(bubble)}
          {dots}
        </div>
      </div>
      {/* composer */}
      {p.composer ? (
        <div style={{position: 'absolute', left: 0, right: 0, bottom: phone ? 18 * s : 0, height: (phone ? 78 : COMPOSE) * s, display: 'flex', alignItems: 'center', gap: 12 * s, padding: `0 ${(phone ? 12 : 24) * s}px`,
          borderTop: phone ? undefined : `${2 * s}px solid ${PAPER.track}`, background: phone ? 'transparent' : '#fffaf1'}}>
          <div style={{flex: 1, height: (phone ? 54 : 60) * s, borderRadius: 30 * s, background: '#fff', border: `${2 * s}px solid ${typingMe ? accent : PAPER.ink}`, display: 'flex', alignItems: 'center', padding: `0 ${20 * s}px`, fontSize: (phone ? 20 : 24) * s,
            color: draft ? PAPER.ink : '#a9a2b0', whiteSpace: 'nowrap', overflow: 'hidden', justifyContent: draft && draft.length > (phone ? 22 : 52) ? 'flex-end' : 'flex-start'}}>
            {draft || (assistant ? 'Ask anything…' : 'Message')}
            {typingMe && Math.floor(f / 8) % 2 === 0 ? <span style={{width: 3 * s, height: 26 * s, background: PAPER.ink, marginLeft: 2 * s, display: 'inline-block', flexShrink: 0}} /> : null}
          </div>
          <div style={{width: (phone ? 54 : 60) * s, height: (phone ? 54 : 60) * s, borderRadius: '50%', background: accent, border: `${2 * s}px solid ${PAPER.ink}`, display: 'flex', alignItems: 'center', justifyContent: 'center',
            transform: `scale(${sendPress ? 0.88 : 1})`}}><Icon name={phone && !assistant && !typingMe ? 'mic' : 'send'} size={26 * s} color="#fff" /></div>
        </div>
      ) : null}
    </div>
  );

  const cues: Cue[] = [];
  if (p.sound) evs.forEach((e) => {
    if (e.from === 'me') {
      if (p.composer) cues.push({sound: 'typing', at: e.start + 4, volume: 0.4, duration: Math.max(4, e.shown - e.start - 8), loop: true});
      cues.push({sound: 'swipe', at: e.shown - 2, volume: 0.25});
    } else {
      cues.push({sound: assistant ? 'pop' : 'notify', at: e.shown, volume: 0.3});
      if (e.sources?.length) cues.push({sound: 'sparkle', at: e.end - 6 * e.sources.length, volume: 0.2});
    }
    if (e.highlight) cues.push({sound: 'chime', at: e.shown, volume: 0.18});
  });

  return <>
    {body}
    {cues.map((c, k) => <Sfx key={k} sound={c.sound} at={c.at} volume={c.volume} duration={c.duration} loop={c.loop} />)}
  </>;
};

export const ChatScene: FC<z.input<typeof chatSceneSchema>> = (input) => {
  const p = chatSceneSchema.parse(input) as Props;
  const f = useCurrentFrame();
  const {fps} = useVideoConfig();
  const phone = p.device === 'phone';
  const look = p.look ?? (phone ? 'messenger' : 'assistant');
  const geo = useDevice(p.device, {w: 1180, h: 764, hasTitle: Boolean(p.title || p.eyebrow)});
  const enter = p.instant ? 1 : spring({frame: f, fps, config: {damping: 16, stiffness: 110}});
  return (
    <PaperStage eyebrow={p.eyebrow} title={p.title} instant={p.instant} side={phone}>
      {phone ? <SideTitle eyebrow={p.eyebrow} title={p.title} box={geo.pbox} instant={p.instant} /> : null}
      <DeviceFrame geo={geo} enter={enter} statusBg="#fffaf1" title={look === 'assistant' ? 'chat' : 'messages'} url={p.url ?? (p.device === 'browser' || p.device === 'laptop' ? (look === 'assistant' ? 'help.shoply.example/chat' : 'web.messages.example') : undefined)}>
        <ChatPanel messages={p.messages} look={look} name={p.name} icon={p.icon} accent={p.accent} composer={p.composer} sound={p.sound} w={geo.cw} h={geo.ch} s={geo.s} compact={phone} phoneHeader={phone} />
      </DeviceFrame>
    </PaperStage>
  );
};
