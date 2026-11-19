/**
 * TerminalScene: a command line in the paper style. Commands are typed letter by letter after the
 * prompt, output streams in line by line, progress bars fill, and a run ends with a green check or a
 * red error badge. The window scrolls like a real terminal when it fills up.
 *
 * Commands accelerate to meet their response cue. The response stays visible for the explanation.
 */
import type {FC, ReactNode} from 'react';
import {spring, useCurrentFrame, useVideoConfig} from 'remotion';
import {z} from 'zod';
import {Sfx} from '../audio';
import {useSceneLength} from '../theme';
import {DARK, DEVICE_ALIASES, DeviceFrame, MONO, PaperStage, clamp01, flexList, flexValue, fraction, useDevice, type Cue} from './paperStage';

const ACTIONS = ['run', 'output', 'progress', 'done', 'clear'] as const;
const actionSchema = z.object({
  at: fraction,
  do: z.enum(ACTIONS),
  text: z.string().max(600).optional(), // run: the command; output: lines (\n); progress: label; done: message
  variant: z.enum(['normal', 'muted', 'success', 'error', 'warn', 'info']).optional(),
  seconds: z.number().min(0.3).max(8).optional(), // progress: how long the bar takes
}).strict();
type Action = z.output<typeof actionSchema>;

const EXAMPLE: Action[] = [
  {at: 0.04, do: 'run', text: 'npm install'},
  {at: 0.22, do: 'progress', text: 'Installing packages', seconds: 1.6},
  {at: 0.42, do: 'output', text: 'added 214 packages in 3s', variant: 'muted'},
  {at: 0.5, do: 'run', text: 'npm run deploy'},
  {at: 0.66, do: 'output', text: 'Building app...\nUploading 12 files\nStarting server'},
  {at: 0.84, do: 'done', text: 'Live at shop.example.com', variant: 'success'},
];

const VERBS: Record<string, string> = {command: 'run', cmd: 'run', exec: 'run', execute: 'run', type: 'run', input: 'run', enter: 'run', shell: 'run', prompt: 'run',
  print: 'output', log: 'output', out: 'output', stdout: 'output', stderr: 'output', response: 'output', show: 'output', text: 'output', echo: 'output',
  loading: 'progress', load: 'progress', install: 'progress', bar: 'progress', spinner: 'progress', download: 'progress', wait: 'progress',
  success: 'done', finish: 'done', finished: 'done', complete: 'done', completed: 'done', pass: 'done', passed: 'done', result: 'done', status: 'done', badge: 'done',
  fail: 'done', failed: 'done', error: 'done', cls: 'clear', reset: 'clear'};
const FAILS = new Set(['fail', 'failed', 'error']);
/** Forgiving input: device names, action verbs/keys AIs often use, "commands": [...] shorthand. */
const flexTerminal = (raw: unknown) => {
  if (!raw || typeof raw !== 'object') return raw;
  const r = {...(raw as Record<string, unknown>)};
  r.device = flexValue(r.device, {...DEVICE_ALIASES, phone: 'window', card: 'window'});
  if (!r.actions && Array.isArray(r.commands)) { r.actions = (r.commands as unknown[]).map((c) => (typeof c === 'string' ? {do: 'run', text: c} : c)); delete r.commands; }
  if (!r.actions && Array.isArray(r.steps)) { r.actions = r.steps; delete r.steps; }
  const before = Array.isArray(r.actions) ? (r.actions as Record<string, unknown>[]) : [];
  r.actions = flexList(r.actions, {
    keys: {action: 'do', verb: 'do', type: 'do', kind: 'do', command: 'text', cmd: 'text', content: 'text', output: 'text', message: 'text', value: 'text', label: 'text', lines: 'text', status: 'variant', color: 'variant', duration: 'seconds'},
    values: {do: (v) => VERBS[v] ?? v},
  });
  if (Array.isArray(r.actions)) r.actions = (r.actions as Record<string, unknown>[]).map((a, i) => {
    if (!a || typeof a !== 'object') return a;
    const o = {...a};
    const verb = String(before[i]?.do ?? before[i]?.action ?? before[i]?.type ?? '').toLowerCase();
    if (o.do === 'done' && o.variant === undefined && FAILS.has(verb)) o.variant = 'error';
    if (Array.isArray(o.text)) o.text = (o.text as unknown[]).map(String).join('\n');
    if (typeof o.variant === 'string') o.variant = flexValue(o.variant, {ok: 'success', pass: 'success', passed: 'success', green: 'success', fail: 'error', failed: 'error', red: 'error', warning: 'warn', yellow: 'warn', grey: 'muted', gray: 'muted', dim: 'muted', blue: 'info'});
    if (typeof o.seconds === 'number' && o.seconds > 8) o.seconds = Math.min(8, o.seconds / 1000 >= 0.3 ? o.seconds / 1000 : 8); // ms given
    if (o.do === 'run' && typeof o.text === 'string') o.text = o.text.replace(/^\s*\$\s+/, ''); // "$ npm i": the prompt is drawn already
    return o;
  });
  return r;
};

export const terminalSceneSchema = z.preprocess(flexTerminal, z.object({
  device: z.enum(['window', 'browser', 'laptop', 'monitor']).default('window'), // a terminal window, a web shell, or on a laptop / monitor screen
  url: z.string().max(60).optional(), // browser: address bar
  eyebrow: z.string().max(40).optional(),
  title: z.string().max(70).optional(),
  window: z.string().max(50).default('bash — ~/shop'), // title bar text
  prompt: z.string().max(30).default('~/shop $'),
  actions: z.array(actionSchema).min(1).max(24).default(() => EXAMPLE),
  instant: z.boolean().default(false), // window already on screen (continuing from the previous scene)
  sound: z.boolean().default(true),
}).strict().superRefine((p, ctx) => {
  p.actions.forEach((a, i) => {
    if (['run', 'output', 'done'].includes(a.do) && !a.text) ctx.addIssue({code: 'custom', path: ['actions', i, 'text'], message: `"${a.do}" needs "text"`});
    if (a.do === 'run' && a.text?.includes('\n')) ctx.addIssue({code: 'custom', path: ['actions', i, 'text'], message: 'one command per "run"; put each command in its own action'});
    if (a.text && a.text.split('\n').length > 12) ctx.addIssue({code: 'custom', path: ['actions', i, 'text'], message: 'at most 12 lines per action; split it into two "output" actions'});
  });
}));
type Props = z.output<typeof terminalSceneSchema>;

export const description =
  'A terminal / command line in the paper style: commands are typed letter by letter after the prompt, output ' +
  'streams in line by line, progress bars fill, and a run ends with a green check or a red error badge. Use for ' +
  'git, npm, pip, Docker, deploys, Linux commands, servers starting, tests passing or failing.';
export const tags = ['terminal', 'command line', 'shell', 'bash', 'cli', 'git', 'npm', 'docker', 'deploy', 'linux', 'console', 'install', 'devops'];

const CPS = 16; // typed characters per second
const ROWS = 12;
const LINE_H = 50, FONT = 31;

type Ev = Action & {start: number; end: number; typeEnd: number};
export const terminalTimeline = (acts: Action[], len: number, fps: number, speed = 1): Ev[] => {
  let t = 0;
  const ordered = acts.map((action, i) => {
    const next = acts[i + 1];
    // Keep an authored request/response pair together when the spoken cues are reversed.
    // The response keeps its cue; the completed request is ready to read first.
    if (action.do === 'run' && next?.do === 'output' && /^HTTP\/\d/.test(next.text ?? '') && action.at >= next.at) {
      return {...action, at: next.at};
    }
    return action;
  }).sort((a, b) => a.at - b.at);
  return ordered.map((a, i) => {
    const next = ordered[i + 1];
    const fullStatus = /^HTTP\/\d/.test(next?.text ?? '');
    const curlStatus = /^curl\s/.test(a.text ?? '') && /^[1-5]\d\d\s/.test(next?.text ?? '');
    const preparedRequest = a.do === 'run' && next?.do === 'output' && (fullStatus || curlStatus);
    const start = preparedRequest && fullStatus && i === 0 ? 0 : Math.max(Math.round(a.at * len), t);
    let end = start, typeEnd = start;
    if (a.do === 'run') {
      typeEnd = start + 4 + Math.ceil(((a.text ?? '').length / (CPS * speed)) * fps);
      end = typeEnd + 5;
      if (preparedRequest) {
        // A worked HTTP example opens with the complete request ready to inspect.
        typeEnd = start;
        end = start;
      } else if (next?.do === 'output') {
        const deadline = Math.max(start, Math.round(ordered[i + 1].at * len) - 1);
        end = Math.min(end, deadline);
        typeEnd = Math.min(typeEnd, end);
      }
    }
    if (a.do === 'output' && ordered[i - 1]?.do !== 'run') end = start + Math.max(1, Math.round(3 / speed)) * (a.text ?? '').split('\n').length;
    if (a.do === 'progress') end = start + Math.round(((a.seconds ?? 1.5) / speed) * fps);
    if (a.do === 'done') end = start + 8;
    t = end + 1;
    return {...a, start, end, typeEnd};
  });
};

const COLOR: Record<string, string> = {normal: DARK.text, muted: DARK.soft, success: DARK.green, error: DARK.red, warn: DARK.yellow, info: DARK.blue};

export const TerminalScene: FC<z.input<typeof terminalSceneSchema>> = (input) => {
  const p = terminalSceneSchema.parse(input) as Props;
  const f = useCurrentFrame();
  const {fps} = useVideoConfig();
  const len = useSceneLength();
  const hasTitle = Boolean(p.title || p.eyebrow);
  const WW = 1500, WH = 64 + 40 + ROWS * LINE_H;
  const geo = useDevice(p.device, {w: WW, h: WH - 64, hasTitle, bar: 64});
  const s = geo.s;
  // speed up typing / progress when everything would not finish inside the scene
  let speed = 1, evs = terminalTimeline(p.actions, len, fps);
  for (let k = 0; k < 4; k++) {
    const last = evs[evs.length - 1].end;
    if (last <= len * 0.95 || speed >= 4) break;
    speed = Math.min(4, speed * (last / (len * 0.95)) * 1.05);
    evs = terminalTimeline(p.actions, len, fps, speed);
  }
  const caretOn = Math.floor(f / 15) % 2 === 0;
  const caret = (solid: boolean) => (solid || caretOn ? <span style={{display: 'inline-block', width: 14 * s, height: 30 * s, background: DARK.text, marginLeft: 4 * s, verticalAlign: 'middle'}} /> : null);
  const promptNode = <span style={{color: DARK.green, fontWeight: 700}}>{p.prompt}</span>;

  let rows: ReactNode[] = [];
  evs.forEach((e, i) => {
    if (f < e.start) return;
    const k = f - e.start;
    if (e.do === 'clear') { rows = []; return; }
    if (e.do === 'run') {
      const fractionTyped = f >= e.typeEnd ? 1 : clamp01((k - 4) / Math.max(1, e.typeEnd - e.start - 4));
      const n = Math.floor(e.text!.length * fractionTyped);
      rows.push(<div key={`r${i}`} style={{overflowWrap: 'anywhere'}}>{promptNode} <span>{e.text!.slice(0, n)}</span>{f < e.typeEnd + 3 ? caret(f < e.typeEnd) : null}</div>);
    }
    if (e.do === 'output') {
      e.text!.split('\n').forEach((line, j) => {
        if (e.end > e.start && k < j * Math.max(1, Math.round(3 / speed))) return;
        rows.push(<div key={`o${i}-${j}`} style={{color: COLOR[e.variant ?? 'normal'], whiteSpace: 'pre-wrap', overflowWrap: 'anywhere'}}>{line || ' '}</div>);
      });
    }
    if (e.do === 'progress') {
      const t = clamp01(k / Math.max(1, e.end - e.start));
      const done = t >= 1;
      rows.push(<div key={`p${i}`} style={{display: 'flex', alignItems: 'center', gap: 18 * s}}>
        <span style={{color: done ? DARK.green : DARK.blue, width: 30 * s}}>{done ? '✓' : '⠿⠻⠽⠾⠷⠯'[Math.floor(f / 3) % 6]}</span>
        <span style={{minWidth: 380 * s}}>{e.text ?? 'Working'}</span>
        <div style={{width: 420 * s, height: 20 * s, borderRadius: 10 * s, background: DARK.line, overflow: 'hidden'}}>
          <div style={{width: `${t * 100}%`, height: '100%', background: done ? DARK.green : DARK.blue}} />
        </div>
        <span style={{color: DARK.soft, width: 80 * s, textAlign: 'right'}}>{Math.round(t * 100)}%</span>
      </div>);
    }
    if (e.do === 'done') {
      const pop = spring({frame: k, fps, config: {damping: 11, stiffness: 160}});
      const bad = e.variant === 'error';
      const c = bad ? DARK.red : DARK.green;
      rows.push(<div key={`d${i}`} style={{display: 'flex', alignItems: 'center', height: LINE_H * s}}>
        <span style={{display: 'inline-flex', alignItems: 'center', gap: 12 * s, padding: `${2 * s}px ${16 * s}px`, borderRadius: 10 * s, background: `${c}26`, border: `${2 * s}px solid ${c}`, color: c, fontWeight: 700,
          transform: `scale(${0.6 + 0.4 * pop})`, transformOrigin: 'left center', opacity: Math.min(1, pop * 1.5)}}>{bad ? '✗' : '✓'} {e.text}</span>
      </div>);
    }
  });
  const started = evs.filter((e) => f >= e.start);
  const busy = started.some((e) => f < e.end + 2);
  if (!busy) rows.push(<div key="idle">{promptNode} {caret(false)}</div>);
  const shown = rows.slice(-ROWS);

  const enter = p.instant ? 1 : spring({frame: f, fps, config: {damping: 16, stiffness: 110}});
  const cues: Cue[] = [];
  if (p.sound) evs.forEach((e) => {
    if (e.do === 'run' && e.typeEnd > e.start) {
      cues.push({sound: 'typing', at: e.start + 4, volume: 0.45, duration: Math.max(4, e.typeEnd - e.start - 4), loop: true});
      cues.push({sound: 'tick', at: e.typeEnd, volume: 0.4});
    }
    if (e.do === 'output' && e.text!.split('\n').length > 2) cues.push({sound: 'data', at: e.start, volume: 0.12});
    if (e.do === 'progress') cues.push({sound: 'ding', at: e.end, volume: 0.2});
    if (e.do === 'done') cues.push({sound: e.variant === 'error' ? 'error' : 'success', at: e.start, volume: 0.4});
  });

  return (
    <PaperStage eyebrow={p.eyebrow} title={p.title} instant={p.instant}>
      <DeviceFrame geo={geo} enter={enter} title={p.window} url={p.url} body={DARK.bg}>
        <div style={{position: 'absolute', inset: 0, padding: `${20 * s}px ${32 * s}px`, fontFamily: MONO, fontSize: FONT * s, lineHeight: `${LINE_H * s}px`, color: DARK.text, overflow: 'hidden'}}>
          {shown}
        </div>
      </DeviceFrame>
      {cues.map((c, k) => <Sfx key={k} sound={c.sound} at={c.at} volume={c.volume} duration={c.duration} loop={c.loop} />)}
    </PaperStage>
  );
};
