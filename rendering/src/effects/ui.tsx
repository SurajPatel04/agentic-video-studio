/**
 * UI pieces usable as overlays (positions: % of the frame or a named anchor; near an edge the
 * element aligns to that edge so it never runs off the frame).
 *
 *   <Terminal at="center" lines={[{text: 'ping google.com', prompt: true}, {text: '64 bytes from …'}]} />
 *   <Notification at="top-right" title="New message" text="Your file is ready" />
 *   <Toggle at="center" label="Wi-Fi" onAt={40} />            (style "switch" or "checkbox")
 *   <Chat at="center" messages={[{from: 'them', text: 'Hi!'}, {from: 'me', text: 'Hello'}]} />
 */
import {PAPER} from '../iso/iso';
import type {FC} from 'react';
import {interpolate, spring, useCurrentFrame, useVideoConfig} from 'remotion';
import {z} from 'zod';
import {Device, deviceKindSchema} from '../components/Device';
import {AppWindow} from '../components/ui';
import {Sfx} from '../audio';
import {AnimatedText} from '../motion/AnimatedText';
import {useTheme, useUnit} from '../theme';
import {ANCHORS, pointSchema} from './flow';
import {placeAt} from './more';

const frame = z.number().int().nonnegative();

/* --------------------------------------------------------------------- Terminal */

export const terminalSchema = z
  .object({
    at: pointSchema.default({...ANCHORS.center}),
    width: z.number().min(300).max(1800).default(1000),
    title: z.string().max(40).default('Terminal'),
    fontSize: z.number().min(20).max(60).default(30),
    lines: z
      .array(
        z.object({
          text: z.string().max(120),
          prompt: z.boolean().default(false), // typed command with "$ " (otherwise output, appears at once)
          color: z.string().optional(),
          pause: frame.default(8), // frames to wait before this line
        }).strict(),
      )
      .min(1)
      .max(14)
      .default([
        {text: 'ping google.com', prompt: true, pause: 8},
        {text: '64 bytes from 142.250.183.14: time=12 ms', prompt: false, color: '#4ade80', pause: 8},
        {text: '64 bytes from 142.250.183.14: time=11 ms', prompt: false, color: '#4ade80', pause: 8},
      ]),
    charsPerSecond: z.number().min(4).max(80).default(22),
    startAt: frame.default(0),
  })
  .strict();
export type TerminalProps = z.input<typeof terminalSchema>;

/** Terminal window: commands type out after a `$` prompt, output lines appear after each. */
export const Terminal: FC<TerminalProps> = (input) => {
  const p = terminalSchema.parse(input);
  const f = useCurrentFrame();
  const {fps, width: W, height: H} = useVideoConfig();
  const u = useUnit();
  if (f < p.startAt) return null;
  let t = p.startAt + 10;
  const typingSounds: ([number, number] | null)[] = [];
  const rows = p.lines.map((l) => {
    t += l.pause;
    const start = t;
    const dur = l.prompt ? Math.ceil((l.text.length / p.charsPerSecond) * fps) : 0;
    t += dur;
    typingSounds.push(l.prompt ? [start, dur] : null);
    const n = f < start ? -1 : l.prompt ? Math.min(l.text.length, Math.floor(((f - start) / fps) * p.charsPerSecond)) : l.text.length;
    return {l, n, typing: l.prompt && n >= 0 && n < l.text.length};
  });
  const active = rows.findIndex((r) => r.typing);
  const lastShown = rows.reduce((acc, r, i) => (r.n >= 0 ? i : acc), -1);
  const blink = Math.floor(f / (fps / 2)) % 2 === 0;
  const pop = spring({frame: f - p.startAt, fps, config: {damping: 16}});
  return (
    <div style={{...placeAt(p.at, W, H), width: p.width * u, opacity: pop}}>
      <AppWindow title={p.title} terminal>
        <div style={{fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace', fontSize: p.fontSize * u, lineHeight: 1.5, color: '#e2e8f0', display: 'flex', flexDirection: 'column'}}>
          {rows.map(({l, n}, i) => (n < 0 ? null : (
            <span key={i} style={{color: l.color ?? (l.prompt ? '#e2e8f0' : '#94a3b8'), whiteSpace: 'pre-wrap'}}>
              {l.prompt ? <span style={{color: '#c9a8f5'}}>$ </span> : null}
              {l.text.slice(0, n)}
              {(active === i || (active < 0 && i === lastShown)) && blink ? <span style={{background: '#e2e8f0', color: 'transparent'}}>_</span> : null}
            </span>
          )))}
        </div>
      </AppWindow>
      {typingSounds.map((ts, i) => (ts && ts[1] > 0 ? <Sfx key={i} sound="typing" at={ts[0]} duration={ts[1]} loop volume={0.8} /> : null))}
    </div>
  );
};

/* ----------------------------------------------------------------- Notification */

export const notificationSchema = z
  .object({
    at: pointSchema.default({...ANCHORS['top-right']}),
    title: z.string().max(40),
    text: z.string().max(90).optional(), // markup ok
    icon: deviceKindSchema.optional(), // any device kind as the icon
    color: z.string().optional(),
    startAt: frame.default(0),
    hideAt: frame.optional(),
    width: z.number().min(240).max(900).default(560),
  })
  .strict();
export type NotificationProps = z.input<typeof notificationSchema>;

/** Toast notification that slides in from the nearest side (and out at hideAt). */
export const Notification: FC<NotificationProps> = (input) => {
  const p = notificationSchema.parse(input);
  const f = useCurrentFrame();
  const {fps, width: W, height: H} = useVideoConfig();
  const theme = useTheme();
  const u = useUnit();
  if (f < p.startAt) return null;
  const color = p.color ?? theme.accent;
  const inK = spring({frame: f - p.startAt, fps, config: {damping: 15}});
  const outK = p.hideAt !== undefined ? spring({frame: f - p.hideAt, fps, config: {damping: 20}}) : 0;
  const k = inK - outK;
  const side = p.at.x >= 50 ? 1 : -1;
  const base = placeAt(p.at, W, H);
  return (
    <div style={{...base, transform: `${base.transform} translateX(${side * (1 - k) * 120}%)`, opacity: k, width: p.width * u, display: 'flex', gap: 22 * u,
      alignItems: 'center', padding: `${22 * u}px ${26 * u}px`, borderRadius: 22 * u, background: PAPER.card, border: `${2 * u}px solid ${PAPER.track}`,
      borderLeft: `${8 * u}px solid ${color}`, boxShadow: `0 ${16 * u}px ${50 * u}px rgba(0,0,0,0.45)`}}>
      {p.icon ? <Device kind={p.icon} size={84} color={color} /> : null}
      <div style={{display: 'flex', flexDirection: 'column', gap: 6 * u, minWidth: 0}}>
        <span style={{fontSize: 32 * u, fontWeight: 800, color: theme.text}}>{p.title}</span>
        {p.text ? <AnimatedText text={p.text} mode="none" as="span" style={{fontSize: 26 * u, color: theme.muted}} markColor={color} /> : null}
      </div>
      <Sfx sound="notify" at={p.startAt} />
    </div>
  );
};

/* ------------------------------------------------------------- Toggle / checkbox */

export const toggleSchema = z
  .object({
    at: pointSchema.default({...ANCHORS.center}),
    label: z.string().max(40).optional(),
    style: z.enum(['switch', 'checkbox']).default('switch'),
    on: z.boolean().default(false), // starting value
    flipAt: z.array(frame).max(10).default([30]), // frames it flips
    size: z.number().min(30).max(300).default(80),
    color: z.string().optional(),
    startAt: frame.default(0),
  })
  .strict();
export type ToggleProps = z.input<typeof toggleSchema>;

/** Switch or checkbox that flips at the given frames. */
export const Toggle: FC<ToggleProps> = (input) => {
  const p = toggleSchema.parse(input);
  const f = useCurrentFrame();
  const {fps, width: W, height: H} = useVideoConfig();
  const theme = useTheme();
  const u = useUnit();
  if (f < p.startAt) return null;
  const flips = p.flipAt.filter((a) => f >= a);
  const isOn = flips.length % 2 === 1 ? !p.on : p.on;
  const last = flips.length ? flips[flips.length - 1] : -100;
  const k = spring({frame: f - last, fps, config: {damping: 14}}); // 0→1 after the last flip
  const pos = flips.length ? (isOn ? k : 1 - k) : isOn ? 1 : 0;
  const color = p.color ?? '#22c55e';
  const s = p.size * u;
  const appear = interpolate(f - p.startAt, [0, 8], [0, 1], {extrapolateRight: 'clamp'});
  const track = `color-mix(in srgb, ${color} ${Math.round(pos * 100)}%, #475569)`;
  return (
    <div style={{...placeAt(p.at, W, H), display: 'flex', alignItems: 'center', gap: 24 * u, opacity: appear}}>
      {p.style === 'switch' ? (
        <span style={{position: 'relative', width: s * 1.8, height: s, borderRadius: s, background: track, boxShadow: pos > 0.5 ? `0 0 ${20 * u}px ${color}` : 'none'}}>
          <span style={{position: 'absolute', top: s * 0.1, left: s * 0.1 + pos * s * 0.8, width: s * 0.8, height: s * 0.8, borderRadius: '50%', background: '#fff',
            boxShadow: `0 ${4 * u}px ${10 * u}px rgba(0,0,0,0.35)`}} />
        </span>
      ) : (
        <svg width={s} height={s} viewBox="0 0 24 24">
          <rect x={1.5} y={1.5} width={21} height={21} rx={5} fill={pos > 0.05 ? color : 'transparent'} fillOpacity={pos} stroke={pos > 0.5 ? color : '#94a3b8'} strokeWidth={2} />
          <path d="M6.5 12.5 L10.3 16.2 L17.6 8.4" fill="none" stroke="#fff" strokeWidth={2.8} strokeLinecap="round" strokeLinejoin="round"
            pathLength={1} strokeDasharray={1} strokeDashoffset={1 - pos} />
        </svg>
      )}
      {p.label ? <span style={{fontSize: s * 0.5, fontWeight: 600, color: theme.text, whiteSpace: 'nowrap'}}>{p.label}</span> : null}
      {p.flipAt.map((a) => <Sfx key={a} sound="click" at={a} />)}
    </div>
  );
};

/* ------------------------------------------------------------------------- Chat */

export const chatSchema = z
  .object({
    at: pointSchema.default({...ANCHORS.center}),
    width: z.number().min(300).max(1600).default(900),
    messages: z
      .array(z.object({from: z.enum(['me', 'them']), text: z.string().max(140), at: frame.optional()}).strict())
      .min(1)
      .max(10)
      .default([
        {from: 'them', text: 'Did you get my file?'},
        {from: 'me', text: 'Yes! It arrived in **2 seconds**'},
      ]),
    gap: frame.default(40), // frames between messages (when no `at`)
    typing: z.boolean().default(true), // "…" bubble before each of their messages
    names: z.object({me: z.string().max(20).optional(), them: z.string().max(20).optional()}).strict().default({}),
    color: z.string().optional(), // my bubble colour
    startAt: frame.default(0),
  })
  .strict();
export type ChatProps = z.input<typeof chatSchema>;

/** Chat conversation: bubbles pop in left (them) and right (me), with a typing indicator. */
export const Chat: FC<ChatProps> = (input) => {
  const p = chatSchema.parse(input);
  const f = useCurrentFrame();
  const {fps, width: W, height: H} = useVideoConfig();
  const theme = useTheme();
  const u = useUnit();
  if (f < p.startAt) return null;
  const color = p.color ?? theme.accent;
  const times = p.messages.map((m, i) => m.at ?? p.startAt + 12 + i * p.gap);
  const typingFor = 22;
  return (
    <div style={{...placeAt(p.at, W, H), width: p.width * u, display: 'flex', flexDirection: 'column', gap: 18 * u}}>
      {p.messages.map((m, i) => {
        const at = times[i];
        const showTyping = p.typing && m.from === 'them' && f >= at - typingFor && f < at;
        if (f < at && !showTyping) return null;
        const mine = m.from === 'me';
        const pop = spring({frame: f - (showTyping ? at - typingFor : at), fps, config: {damping: 14}});
        const name = mine ? p.names.me : p.names.them;
        return (
          <div key={i} style={{display: 'flex', flexDirection: 'column', alignItems: mine ? 'flex-end' : 'flex-start', gap: 6 * u}}>
            {name && !showTyping ? <span style={{fontSize: 22 * u, color: theme.muted, padding: `0 ${10 * u}px`}}>{name}</span> : null}
            <div style={{maxWidth: '78%', padding: `${18 * u}px ${26 * u}px`, borderRadius: 30 * u, fontSize: 32 * u, lineHeight: 1.35,
              borderBottomRightRadius: mine ? 8 * u : 30 * u, borderBottomLeftRadius: mine ? 30 * u : 8 * u,
              background: mine ? `color-mix(in srgb, ${color} 20%, ${PAPER.card})` : PAPER.track, color: PAPER.ink, fontWeight: mine ? 600 : 500,
              transform: `scale(${pop})`, transformOrigin: mine ? 'bottom right' : 'bottom left', opacity: pop}}>
              {showTyping ? (
                <span style={{display: 'flex', gap: 8 * u, padding: `${6 * u}px 0`}}>
                  {[0, 1, 2].map((d) => (
                    <span key={d} style={{width: 14 * u, height: 14 * u, borderRadius: '50%', background: theme.muted,
                      transform: `translateY(${Math.sin((f / fps) * 10 - d) * 4 * u}px)`}} />
                  ))}
                </span>
              ) : (
                <AnimatedText text={m.text} mode="none" as="span" markColor={mine ? '#04121f' : color} />
              )}
            </div>
          </div>
        );
      })}
      {times.map((at, i) => <Sfx key={`s${i}`} sound="pop" at={at} volume={0.55} />)}
    </div>
  );
};
