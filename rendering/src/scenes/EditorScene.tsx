/**
 * EditorScene: a code editor in the paper style. Code is typed letter by letter with syntax colours,
 * an autocomplete popup suggests a word, a red wavy underline marks an error (with the message at the
 * end of the line), a line is selected and fixed, and the mouse clicks ▶ Run so the output panel slides
 * up with the result.
 *
 * Line numbers in actions mean the line as it is at that moment (after earlier inserts/deletes).
 * Actions run one after another; typing pushes later actions back instead of overlapping.
 */
import type {CSSProperties, FC, ReactNode} from 'react';
import {interpolate, spring, useCurrentFrame, useVideoConfig} from 'remotion';
import {z} from 'zod';
import {Sfx} from '../audio';
import {PAPER} from '../iso/iso';
import {useSceneLength} from '../theme';
import {DARK, DEVICE_ALIASES, DeviceFrame, MONO, MONO_W, PaperStage, Pointer, clamp01, ease, flexList, flexValue, fraction, useDevice, type Cue} from './paperStage';

const ACTIONS = ['type', 'replace', 'fix', 'delete', 'suggest', 'error', 'run', 'highlight'] as const;
const actionSchema = z.object({
  at: fraction,
  do: z.enum(ACTIONS),
  line: z.number().int().min(0).max(40).optional(), // type: insert after this line (0 = top, default end); others: the line
  text: z.string().max(500).optional(), // type/replace/fix: code; error: message; run: output lines
  items: z.array(z.string().max(30)).min(1).max(5).optional(), // suggest: popup entries
  pick: z.string().max(30).optional(), // suggest: the chosen entry (default: first)
  variant: z.enum(['success', 'error']).optional(), // run result
}).strict();
type Action = z.output<typeof actionSchema>;

const EXAMPLE_CODE = 'def greet(name):\n    message = "Hello, " + name\n    return mesage';
const EXAMPLE: Action[] = [
  {at: 0.04, do: 'type', text: '\nprint(greet("Mira"))'},
  {at: 0.22, do: 'run', text: 'Traceback (most recent call last):\n  File "app.py", line 5\nNameError: name \'mesage\' is not defined', variant: 'error'},
  {at: 0.38, do: 'error', line: 3, text: "NameError: 'mesage' is not defined"},
  {at: 0.5, do: 'fix', line: 3, text: '    return mes'},
  {at: 0.6, do: 'suggest', line: 3, items: ['message', 'max', 'memoryview'], pick: 'message'},
  {at: 0.78, do: 'run', text: 'Hello, Mira', variant: 'success'},
];

const CPS = 16;
const MAX_LINES = 22;

type Ev = Action & {i: number; start: number; end: number};
const timeline = (acts: Action[], len: number, fps: number, speed = 1): Ev[] => {
  let t = 0;
  return acts.map((a, i) => ({a, i})).sort((x, y) => x.a.at - y.a.at).map(({a, i}) => {
    const start = Math.max(Math.round(a.at * len), t);
    const typing = Math.ceil(((a.text ?? '').length / (CPS * speed)) * fps);
    let end = start, next = start;
    if (a.do === 'type') { end = start + 4 + typing; next = end + 3; }
    if (a.do === 'replace' || a.do === 'fix') { end = start + 12 + typing; next = end + 3; }
    if (a.do === 'delete') { end = start + 10; next = end; }
    if (a.do === 'suggest') { end = start + Math.round((1.3 / Math.min(speed, 1.6)) * fps); next = end + 3; }
    if (a.do === 'run') { end = start + 14 + 4 * (a.text ?? '').split('\n').length; next = end + 6; }
    t = next;
    return {...a, i, start, end};
  });
};

type Line = {id: string; text: string; err?: string; errAt?: number; hl?: number};
type Doc = {lines: Line[]; cursor?: {id: string; col: number; typing: boolean}; popup?: {id: string; items: string[]; sel: number; k: number}; select?: string; run?: Ev};
type Issue = {i: number; field: string; message: string};

/** Replace the word fragment at the end of a line with the picked completion. */
const complete = (text: string, pick: string) => {
  const m = text.match(/[A-Za-z_$][\w$]*$/);
  return m && pick.startsWith(m[0]) ? text.slice(0, text.length - m[0].length) + pick : text + pick;
};

/** The document at frame f (f = Infinity for the final state). Collects line-number problems when asked. */
const buildDoc = (code: string, evs: Ev[], f: number, fps: number, issues?: Issue[], speed = 1): Doc => {
  let lines: Line[] = code === '' ? [] : code.split('\n').map((text, k) => ({id: `c${k}`, text}));
  const doc: Doc = {lines};
  for (const e of evs) {
    if (e.start > f) break;
    const k = f - e.start;
    const at = (): number => {
      const n = e.line;
      if (n === undefined || n < 1 || n > lines.length) {
        issues?.push({i: e.i, field: 'line', message: `"${e.do}" needs "line" between 1 and ${lines.length} (the file has ${lines.length} lines at that moment)`});
        return -1;
      }
      return n - 1;
    };
    const typed = (from: number) => Math.max(0, Math.min((e.text ?? '').length, Math.floor(((k - from) / fps) * CPS * speed)));
    doc.popup = undefined;
    doc.select = undefined;
    switch (e.do) {
      case 'type': {
        const after = e.line ?? lines.length;
        if (after < 0 || after > lines.length) { issues?.push({i: e.i, field: 'line', message: `"type" inserts after "line" 0..${lines.length}`}); break; }
        const parts = (e.text ?? '').slice(0, typed(4)).split('\n');
        lines = [...lines.slice(0, after), ...parts.map((text, j) => ({id: `t${e.i}-${j}`, text})), ...lines.slice(after)];
        doc.cursor = {id: `t${e.i}-${parts.length - 1}`, col: parts[parts.length - 1].length, typing: f < e.end};
        break;
      }
      case 'replace': case 'fix': {
        const n = at();
        if (n < 0) break;
        if (k < 12) { doc.select = lines[n].id; doc.cursor = {id: lines[n].id, col: lines[n].text.length, typing: false}; break; }
        const text = (e.text ?? '').slice(0, typed(12));
        lines = lines.map((l, j) => (j === n ? {id: l.id, text, hl: l.hl} : l));
        doc.cursor = {id: lines[n].id, col: text.length, typing: f < e.end};
        break;
      }
      case 'delete': {
        const n = at();
        if (n < 0) break;
        if (k < 10) doc.select = lines[n].id;
        else lines = lines.filter((_, j) => j !== n);
        break;
      }
      case 'suggest': {
        const n = at();
        if (n < 0) break;
        const items = e.items ?? [];
        const pick = e.pick ?? items[0] ?? '';
        if (!items.length) issues?.push({i: e.i, field: 'items', message: '"suggest" needs "items"'});
        if (f < e.end) doc.popup = {id: lines[n].id, items, sel: k > fps * 0.55 ? Math.max(0, items.indexOf(pick)) : 0, k};
        else lines = lines.map((l, j) => (j === n ? {...l, text: complete(l.text, pick)} : l));
        doc.cursor = {id: lines[n].id, col: lines[n].text.length, typing: false};
        break;
      }
      case 'error': {
        const n = at();
        if (n >= 0) lines = lines.map((l, j) => (j === n ? {...l, err: e.text ?? 'Error', errAt: e.start} : l));
        break;
      }
      case 'highlight': {
        const n = at();
        if (n >= 0) lines = lines.map((l, j) => (j === n ? {...l, hl: e.start} : l));
        break;
      }
      case 'run': doc.run = e; break;
    }
    if (lines.length > MAX_LINES) issues?.push({i: e.i, field: 'text', message: `keep the file to ${MAX_LINES} lines or fewer so it fits`});
  }
  doc.lines = lines;
  return doc;
};

const VERBS: Record<string, string> = {write: 'type', insert: 'type', add: 'type', append: 'type', 'add line': 'type', code: 'type', input: 'type',
  edit: 'fix', change: 'fix', correct: 'fix', update: 'fix', rewrite: 'fix', modify: 'fix', 'replace line': 'replace',
  remove: 'delete', erase: 'delete', 'delete line': 'delete', autocomplete: 'suggest', complete: 'suggest', suggestion: 'suggest', intellisense: 'suggest',
  mark: 'error', underline: 'error', bug: 'error', warn: 'error', warning: 'error', lint: 'error', problem: 'error',
  execute: 'run', play: 'run', start: 'run', compile: 'run', test: 'run', output: 'run', focus: 'highlight', glow: 'highlight', point: 'highlight', select: 'highlight'};
/** Forgiving input: device names, action verbs/keys AIs often use, "lines" as an array, outputs as arrays. */
const flexEditor = (raw: unknown) => {
  if (!raw || typeof raw !== 'object') return raw;
  const r = {...(raw as Record<string, unknown>)};
  r.device = flexValue(r.device, {...DEVICE_ALIASES, phone: 'window', card: 'window'});
  if (r.code === undefined && typeof r.content === 'string') { r.code = r.content; delete r.content; }
  if (Array.isArray(r.code)) r.code = (r.code as unknown[]).map(String).join('\n');
  if (r.filename === undefined && typeof r.file === 'string') { r.filename = r.file; delete r.file; }
  if (r.code !== undefined && r.actions === undefined) r.actions = []; // own code: never the built-in demo edits
  r.actions = flexList(r.actions, {
    keys: {action: 'do', verb: 'do', type: 'do', kind: 'do', code: 'text', content: 'text', value: 'text', output: 'text', message: 'text', lineNumber: 'line', ln: 'line', row: 'line', at_line: 'line',
      options: 'items', suggestions: 'items', choices: 'items', choice: 'pick', selected: 'pick', result: 'variant', status: 'variant'},
    values: {do: (v) => VERBS[v] ?? v},
  });
  if (Array.isArray(r.actions)) r.actions = (r.actions as Record<string, unknown>[]).map((a) => {
    if (!a || typeof a !== 'object') return a;
    const o = {...a};
    if (Array.isArray(o.text)) o.text = (o.text as unknown[]).map(String).join('\n');
    if (typeof o.line === 'string' && /^\d+$/.test(o.line)) o.line = Number(o.line);
    if (typeof o.variant === 'string') o.variant = flexValue(o.variant, {ok: 'success', pass: 'success', passed: 'success', fail: 'error', failed: 'error', crash: 'error', exception: 'error'});
    return o;
  });
  return r;
};

export const editorSceneSchema = z.preprocess(flexEditor, z.object({
  device: z.enum(['window', 'browser', 'laptop', 'monitor']).default('window'), // an editor window, an online editor, or on a laptop / monitor screen
  url: z.string().max(60).optional(), // browser: address bar
  eyebrow: z.string().max(40).optional(),
  title: z.string().max(70).optional(),
  filename: z.string().max(40).default('app.py'),
  code: z.string().max(1500).default(EXAMPLE_CODE), // the file before the actions (may be "")
  actions: z.array(actionSchema).max(20).default(() => EXAMPLE),
  instant: z.boolean().default(false),
  sound: z.boolean().default(true),
}).strict().superRefine((p, ctx) => {
  if (p.code.split('\n').length > MAX_LINES) ctx.addIssue({code: 'custom', path: ['code'], message: `keep the code to ${MAX_LINES} lines or fewer`});
  p.actions.forEach((a, i) => {
    if (['type', 'replace', 'fix', 'error', 'run'].includes(a.do) && a.text === undefined) ctx.addIssue({code: 'custom', path: ['actions', i, 'text'], message: `"${a.do}" needs "text"`});
    if (a.do === 'suggest' && a.pick && a.items && !a.items.includes(a.pick)) ctx.addIssue({code: 'custom', path: ['actions', i, 'pick'], message: `"pick" must be one of items: ${a.items.join(', ')}`});
    if ((a.do === 'replace' || a.do === 'fix') && a.text?.includes('\n')) ctx.addIssue({code: 'custom', path: ['actions', i, 'text'], message: `"${a.do}" changes one line; use "type" to add lines`});
  });
  const issues: Issue[] = [];
  buildDoc(p.code, timeline(p.actions, 300, 30), Infinity, 30, issues);
  const seen = new Set<string>();
  issues.forEach((x) => {
    const key = `${x.i}${x.field}`;
    if (!seen.has(key)) { seen.add(key); ctx.addIssue({code: 'custom', path: ['actions', x.i, x.field], message: x.message}); }
  });
}));
type Props = z.output<typeof editorSceneSchema>;

export const description =
  'A code editor in the paper style: code is typed letter by letter with syntax colours, an autocomplete popup ' +
  'completes a word, a red wavy underline marks an error with its message, a line is fixed, and the mouse clicks ' +
  '▶ Run so an output panel shows the result (green success or red error). Use for programming lessons, debugging, ' +
  'how a bug is found and fixed, writing a first program.';
export const tags = ['code', 'editor', 'programming', 'debugging', 'bug', 'error', 'ide', 'vscode', 'python', 'javascript', 'function', 'syntax', 'autocomplete', 'run'];

/* ------------------------------------------------------------------------------ syntax colours */

const KEYWORDS = new Set(('def return if elif else for while in import from as class try except finally with lambda pass break continue ' +
  'and or not is None True False function const let var new this async await export default switch case public private ' +
  'static void int float double char bool boolean string fn mut struct impl use package func select null undefined true false ' +
  'throw catch extends interface type enum yield do then fi echo SELECT FROM WHERE INSERT INTO VALUES UPDATE SET CREATE TABLE').split(' '));
const TOKEN = /(#.*$|\/\/.*$|--.*$)|("(?:[^"\\]|\\.)*"?|'(?:[^'\\]|\\.)*'?|`[^`]*`?)|(\b\d+(?:\.\d+)?\b)|([A-Za-z_$][\w$]*)|(\s+)|([^\s])/g;
const colorize = (text: string): ReactNode[] => {
  const out: ReactNode[] = [];
  let m: RegExpExecArray | null;
  TOKEN.lastIndex = 0;
  let k = 0;
  while ((m = TOKEN.exec(text))) {
    const [tok, comment, str, num, ident] = m;
    let color = DARK.text, italic = false;
    if (comment) { color = DARK.soft; italic = true; }
    else if (str) color = DARK.green;
    else if (num) color = DARK.orange;
    else if (ident) {
      if (KEYWORDS.has(ident)) color = DARK.purple;
      else if (text[TOKEN.lastIndex] === '(') color = DARK.blue;
    } else if (/[()[\]{}]/.test(tok)) color = DARK.yellow;
    else if (/[=+\-*/<>!%&|:.,]/.test(tok)) color = DARK.cyan;
    out.push(<span key={k++} style={{color, fontStyle: italic ? 'italic' : undefined}}>{tok}</span>);
  }
  return out;
};

const runCommand = (file: string) => {
  const ext = file.split('.').pop() ?? '';
  return ({py: `python ${file}`, js: `node ${file}`, ts: `npx tsx ${file}`, go: `go run ${file}`, rb: `ruby ${file}`, sh: `bash ${file}`, java: `java ${file}`, php: `php ${file}`, rs: 'cargo run', c: './a.out', cpp: './a.out', sql: `sqlite3 < ${file}`} as Record<string, string>)[ext] ?? `run ${file}`;
};
const DOT: Record<string, string> = {py: '#f3c46b', js: '#f5d94e', ts: '#5fa3f0', go: '#7fd6d0', rb: '#f2877a', java: '#ffa36b', html: '#ff8a5c', css: '#8fb8f0', sql: '#c9a8f5'};

/* ------------------------------------------------------------------------------ scene */

export const EditorScene: FC<z.input<typeof editorSceneSchema>> = (input) => {
  const p = editorSceneSchema.parse(input) as Props;
  const f = useCurrentFrame();
  const {fps} = useVideoConfig();
  const len = useSceneLength();
  const hasTitle = Boolean(p.title || p.eyebrow);
  const WW = 1560, WH = 800, BAR = 64, STATUS = 40, GUTTER = 84, FONT = 31, ROW = 50, PANEL = 250;
  const geo = useDevice(p.device, {w: WW, h: WH - BAR, hasTitle, bar: BAR});
  const s = geo.s, u = geo.u, x = geo.ox, y = geo.oy - BAR * s; // x, y: top-left of the bar
  // speed up typing when the edits would not finish inside the scene
  let speed = 1, evs = timeline(p.actions, len, fps);
  for (let k = 0; k < 4 && evs.length; k++) {
    const last = Math.max(...evs.map((e) => e.end)) + (evs.some((e) => e.do === 'run') ? 10 : 0);
    if (last <= len * 0.95 || speed >= 4) break;
    speed = Math.min(4, speed * (last / (len * 0.95)) * 1.05);
    evs = timeline(p.actions, len, fps, speed);
  }
  const doc = buildDoc(p.code, evs, f, fps, undefined, speed);
  const cw = FONT * MONO_W; // character width (design px)

  // output panel
  const run = doc.run;
  const panelK = run ? ease(clamp01((f - run.start - 6) / 10)) : 0;
  const codeH = WH - BAR - STATUS - PANEL * panelK;
  const visible = Math.max(4, Math.floor((codeH - 20) / ROW));
  const curIdx = doc.cursor ? doc.lines.findIndex((l) => l.id === doc.cursor!.id) : doc.lines.length - 1;
  const top = Math.max(0, Math.min(doc.lines.length - visible, curIdx - visible + 2));
  const errors = doc.lines.filter((l) => l.err).length;
  const caretOn = doc.cursor?.typing || Math.floor(f / 15) % 2 === 0;

  // mouse: travels to ▶ Run for each run
  const runs = evs.filter((e) => e.do === 'run');
  const runBtn = {x: x + (WW - 118) * s, y: y + (BAR / 2) * s};
  const nextRun = runs.find((r) => f <= r.start + 22);
  const pointerK = nextRun ? ease(clamp01((f - (nextRun.start - 16)) / 16)) : 1;
  const pointerOp = nextRun ? interpolate(f, [nextRun.start - 20, nextRun.start - 14, nextRun.start + 16, nextRun.start + 24], [0, 1, 1, 0], {extrapolateLeft: 'clamp', extrapolateRight: 'clamp'}) : 0;
  const from = {x: x + WW * 0.62 * s, y: y + WH * 0.45 * s};
  const ptr = {x: from.x + (runBtn.x - from.x) * pointerK, y: from.y + (runBtn.y - from.y) * pointerK};
  const pressRun = nextRun ? interpolate(f - nextRun.start, [0, 3, 9], [0, 1, 0], {extrapolateLeft: 'clamp', extrapolateRight: 'clamp'}) : 0;
  const ripple = nextRun && f >= nextRun.start ? clamp01((f - nextRun.start) / 14) : 0;

  const enter = p.instant ? 1 : spring({frame: f, fps, config: {damping: 16, stiffness: 110}});
  const ext = p.filename.split('.').pop() ?? '';

  const runButton = (
    <div style={{display: 'flex', alignItems: 'center', gap: 10 * s, padding: `${8 * s}px ${20 * s}px`, borderRadius: 12 * s, background: '#5cb87a', color: '#fff', fontFamily: PAPER.sans, fontWeight: 800, fontSize: 21 * s,
      border: `${2 * s}px solid ${PAPER.ink}`, transform: `scale(${1 - 0.08 * pressRun})`, boxShadow: pressRun > 0 ? 'none' : `0 ${3 * s}px 0 rgba(0,0,0,0.25)`}}>▶ Run</div>
  );
  const tab = (
    <div style={{display: 'flex', alignItems: 'center', gap: 10 * s, padding: `${8 * s}px ${18 * s}px`, borderRadius: 10 * s, background: DARK.bg, color: DARK.text, fontSize: 20 * s, lineHeight: 1.2}}>
      <span style={{width: 12 * s, height: 12 * s, borderRadius: 3 * s, background: DOT[ext] ?? DARK.soft}} />{p.filename}
    </div>
  );

  const wavy = (w: number) => {
    let d = `M0 ${4 * s}`;
    for (let xx = 0; xx < w; xx += 8 * s) d += ` q ${2 * s} ${-4 * s} ${4 * s} 0 t ${4 * s} 0`;
    return <svg width={w} height={8 * s} style={{position: 'absolute', left: 0, bottom: -2 * s, overflow: 'visible'}}><path d={d} stroke={DARK.red} strokeWidth={2 * s} fill="none" /></svg>;
  };

  const rows = doc.lines.slice(top, top + visible).map((l, j) => {
    const idx = top + j;
    const rowStyle: CSSProperties = {position: 'absolute', left: 0, right: 0, top: (10 + j * ROW) * s, height: ROW * s, display: 'flex', alignItems: 'center'};
    const hl = l.hl !== undefined && f >= l.hl && f < l.hl + fps * 1.8 ? Math.min(1, (f - l.hl) / 6, (l.hl + fps * 1.8 - f) / 8) : 0;
    const isCur = doc.cursor?.id === l.id;
    const indent = l.text.length - l.text.trimStart().length;
    const errK = l.err && l.errAt !== undefined ? clamp01((f - l.errAt) / 8) : 0;
    const textW = l.text.length * cw;
    const msgRoom = (WW - GUTTER - 60 - textW - 40) * s;
    return (
      <div key={l.id} style={rowStyle}>
        {isCur || hl > 0 || doc.select === l.id ? <div style={{position: 'absolute', left: 0, right: 0, top: 0, bottom: 0, background: doc.select === l.id ? 'rgba(143,184,240,0.28)' : hl > 0 ? `rgba(255,140,40,${0.28 * hl})` : 'rgba(255,255,255,0.04)', boxShadow: hl > 0 ? `inset ${4 * s}px 0 0 rgba(255,120,30,${hl})` : undefined}} /> : null}
        <div style={{width: GUTTER * s, textAlign: 'right', paddingRight: 22 * s, boxSizing: 'border-box', color: isCur ? DARK.text : DARK.soft, fontSize: 22 * s, position: 'relative'}}>
          {l.err ? <span style={{position: 'absolute', left: 14 * s, top: '50%', marginTop: -7 * s, width: 14 * s, height: 14 * s, borderRadius: '50%', background: DARK.red, opacity: errK}} /> : null}
          {idx + 1}
        </div>
        <div style={{position: 'relative', whiteSpace: 'pre', fontSize: FONT * s, height: ROW * s, lineHeight: `${ROW * s}px`}}>
          {colorize(l.text)}
          {isCur && caretOn ? <span style={{position: 'absolute', left: (doc.cursor!.col * cw) * s, top: 7 * s, width: 3 * s, height: 30 * s, background: DARK.text}} /> : null}
          {l.err && errK > 0 ? <div style={{position: 'absolute', left: indent * cw * s, width: Math.max(cw, textW - indent * cw) * s * errK, bottom: 4 * s, height: 8 * s}}>{wavy(Math.max(cw, textW - indent * cw) * s * errK)}</div> : null}
        </div>
        {l.err && errK > 0 ? <div style={{marginLeft: 40 * s, maxWidth: Math.max(0, msgRoom), overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: DARK.red, fontStyle: 'italic', fontSize: 21 * s, opacity: errK, padding: `${2 * s}px ${12 * s}px`, background: 'rgba(242,135,122,0.12)', borderRadius: 8 * s}}>● {l.err}</div> : null}
      </div>
    );
  });

  // autocomplete popup under the cursor line
  let popup: ReactNode = null;
  if (doc.popup) {
    const pi = doc.lines.findIndex((l) => l.id === doc.popup!.id) - top;
    const line = doc.lines.find((l) => l.id === doc.popup!.id)!;
    const pop = spring({frame: doc.popup.k, fps, config: {damping: 14, stiffness: 180}});
    popup = (
      <div style={{position: 'absolute', left: (GUTTER + line.text.length * cw - 20) * s, top: (10 + (pi + 1) * ROW + 4) * s, width: 360 * s, borderRadius: 10 * s, background: DARK.panel, border: `${2 * s}px solid ${DARK.line}`,
        boxShadow: `0 ${10 * s}px ${24 * s}px rgba(0,0,0,0.4)`, overflow: 'hidden', transform: `scale(${0.85 + 0.15 * pop})`, transformOrigin: 'top left', opacity: pop, zIndex: 5}}>
        {doc.popup.items.map((it, k) => (
          <div key={it} style={{display: 'flex', alignItems: 'center', gap: 14 * s, height: 42 * s, padding: `0 ${14 * s}px`, fontSize: 22 * s, background: k === doc.popup!.sel ? '#3d5a8f' : 'transparent', color: DARK.text}}>
            <span style={{width: 26 * s, height: 26 * s, borderRadius: 6 * s, background: k === 0 ? DARK.blue : DARK.purple, color: DARK.bg, fontSize: 16 * s, fontWeight: 800, display: 'flex', alignItems: 'center', justifyContent: 'center'}}>{k === 0 ? 'ab' : 'ƒ'}</span>
            {it}
          </div>
        ))}
      </div>
    );
  }

  // output panel
  let panel: ReactNode = null;
  if (run && panelK > 0) {
    const outLines = (run.text ?? '').split('\n');
    const shown = outLines.filter((_, k) => f >= run.start + 14 + 4 * k);
    const finished = f >= run.end;
    const bad = run.variant === 'error';
    const badge = finished ? spring({frame: f - run.end, fps, config: {damping: 12}}) : 0;
    panel = (
      <div style={{position: 'absolute', left: 0, right: 0, bottom: STATUS * s, height: PANEL * panelK * s, background: '#211e27', borderTop: `${2 * s}px solid ${DARK.line}`, overflow: 'hidden'}}>
        <div style={{display: 'flex', alignItems: 'center', gap: 24 * s, height: 42 * s, padding: `0 ${24 * s}px`, fontSize: 18 * s, letterSpacing: 2 * s, color: DARK.soft, fontFamily: PAPER.sans, fontWeight: 700}}>
          <span style={{color: DARK.text, borderBottom: `${2 * s}px solid ${DARK.blue}`, paddingBottom: 4 * s}}>TERMINAL</span><span>PROBLEMS</span><span>OUTPUT</span>
          {finished ? <span style={{marginLeft: 'auto', letterSpacing: 0, fontSize: 19 * s, color: bad ? DARK.red : DARK.green, opacity: badge, transform: `scale(${0.7 + 0.3 * badge})`}}>{bad ? '✗ exited with code 1' : '✓ finished'}</span> : null}
        </div>
        <div style={{padding: `${4 * s}px ${24 * s}px`, fontSize: 23 * s, lineHeight: `${34 * s}px`, whiteSpace: 'pre'}}>
          <div style={{color: DARK.soft}}>$ {runCommand(p.filename)}</div>
          {shown.slice(-4).map((l, k) => <div key={k} style={{color: bad ? DARK.red : DARK.text}}>{l || ' '}</div>)}
        </div>
      </div>
    );
  }

  const cur = doc.cursor ? doc.lines.findIndex((l) => l.id === doc.cursor!.id) : -1;
  const cues: Cue[] = [];
  if (p.sound) evs.forEach((e) => {
    const typing = Math.ceil(((e.text ?? '').length / (CPS * speed)) * fps);
    if (e.do === 'type') cues.push({sound: 'typing', at: e.start + 4, volume: 0.45, duration: Math.max(4, typing), loop: true});
    if (e.do === 'replace' || e.do === 'fix') {
      cues.push({sound: 'remove', at: e.start + 8, volume: 0.2});
      cues.push({sound: 'typing', at: e.start + 12, volume: 0.45, duration: Math.max(4, typing), loop: true});
    }
    if (e.do === 'delete') cues.push({sound: 'remove', at: e.start + 8, volume: 0.25});
    if (e.do === 'suggest') { cues.push({sound: 'pop', at: e.start, volume: 0.25}); cues.push({sound: 'tick', at: e.end, volume: 0.35}); }
    if (e.do === 'error') cues.push({sound: 'error', at: e.start, volume: 0.3});
    if (e.do === 'highlight') cues.push({sound: 'chime', at: e.start, volume: 0.18});
    if (e.do === 'run') {
      cues.push({sound: 'click', at: e.start, volume: 0.55});
      cues.push({sound: e.variant === 'error' ? 'alert' : 'success', at: e.end, volume: 0.35});
    }
  });

  return (
    <PaperStage eyebrow={p.eyebrow} title={p.title} instant={p.instant}>
      <DeviceFrame geo={geo} enter={enter} title={tab} right={runButton} url={p.url} body={DARK.bg}>
        <div style={{position: 'absolute', inset: 0, fontFamily: MONO, color: DARK.text}}>
          <div style={{position: 'absolute', left: 0, top: 0, bottom: 0, width: GUTTER * s, background: '#2a2731', borderRight: `${1.5 * s}px solid ${DARK.line}`}} />
          <div style={{position: 'absolute', left: 0, right: 0, top: 0, height: codeH * s, overflow: 'hidden'}}>{rows}</div>
          {popup}
          {panel}
          <div style={{position: 'absolute', left: 0, right: 0, bottom: 0, height: STATUS * s, background: '#efe8dc', borderTop: `${2 * s}px solid ${PAPER.ink}`, display: 'flex', alignItems: 'center', gap: 30 * s, padding: `0 ${22 * s}px`, fontFamily: PAPER.sans, fontSize: 18 * s, color: PAPER.inkSoft, fontWeight: 600}}>
            <span style={{color: errors ? '#c2412f' : '#3f8a52'}}>{errors ? `⊗ ${errors} problem${errors > 1 ? 's' : ''}` : '✓ No problems'}</span>
            <span style={{marginLeft: 'auto'}}>Ln {cur + 1 || doc.lines.length}, Col {(doc.cursor?.col ?? 0) + 1}</span>
            <span>{ext.toUpperCase() || 'TEXT'}</span><span>UTF-8</span>
          </div>
        </div>
      </DeviceFrame>
      <Pointer x={ptr.x} y={ptr.y} u={u} press={pressRun} ripple={ripple} opacity={pointerOp * enter} />
      {cues.map((c, k) => <Sfx key={k} sound={c.sound} at={c.at} volume={c.volume} duration={c.duration} loop={c.loop} />)}
    </PaperStage>
  );
};
