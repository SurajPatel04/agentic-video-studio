import {useMemo} from 'react';
import {AbsoluteFill, Easing, useCurrentFrame, useVideoConfig} from 'remotion';
import {z} from 'zod';
import {formatJsonExample, JsonExampleCode} from '../components/JsonExample';
import {previewLineWindow, wrapPreviewLines} from '../components/textPreview';
import {PAPER} from '../iso/iso';
import {useSceneLength, useTheme, useUnit} from '../theme';
import {DARK, MONO_W, fraction} from './paperStage';

const partSchema = z.object({
  text: z.string().min(1),
  label: z.string().max(24).optional(),
  tone: z.enum(['neutral', 'teal', 'amber']).default('neutral'),
}).strict();

const rowSchema = z.object({
  parts: z.array(partSchema).min(1).max(4),
  result: z.string().min(1).max(170),
  hidden: z.boolean().default(false),
}).strict();

const focusSchema = z.object({
  row: z.union([z.literal(0), z.literal(1)]),
  part: z.number().int().min(0).max(3).optional(),
  resultFocus: z.string().min(1).max(90).optional(),
  explanation: z.string().max(110).optional(),
}).strict();
const stepSchema = focusSchema.extend({at: fraction, reveal: z.boolean().default(false)});
const rowState = z.object({shown: z.boolean(), revealed: z.boolean()}).strict();

const exampleRows: [z.output<typeof rowSchema>, z.output<typeof rowSchema>] = [
  {parts: [{text: 'Meet at noon.', tone: 'neutral'}], result: 'Meet at 12:00 p.m.', hidden: false},
  {parts: [{text: 'Meet at ', tone: 'neutral'}, {text: 'sunset', label: 'New time', tone: 'amber'},
    {text: '.', tone: 'neutral'}], result: 'Meet when the sun goes down.', hidden: false},
];

export const outcomeComparisonSceneSchema = z.object({
  title: z.string().min(1).max(68).default('Compare two examples'),
  layout: z.enum(['editor', 'text']).default('text'),
  inputHeading: z.string().min(1).max(30).default('Example'),
  resultHeading: z.string().min(1).max(30).default('Outcome'),
  rows: z.tuple([rowSchema, rowSchema]).default(exampleRows),
  steps: z.array(stepSchema).max(10).default([]),
  resultsOnCue: z.boolean().optional(),
  start: z.object({rows: z.tuple([rowState, rowState]), active: focusSchema.optional()}).strict().optional(),
}).strict().superRefine((p, ctx) => {
  p.rows.forEach((row, i) => {
    if (row.result.split('\n').length > 4) {
      ctx.addIssue({code: 'custom', path: ['rows', i, 'result'], message: 'Show up to four result lines.'});
    }
  });
  p.steps.forEach((step, i) => {
    if (i > 0 && step.at <= p.steps[i - 1].at) {
      ctx.addIssue({code: 'custom', path: ['steps', i, 'at'], message: 'Order steps by their narration cues.'});
    }
    if (step.part !== undefined && step.part >= p.rows[step.row].parts.length) {
      ctx.addIssue({code: 'custom', path: ['steps', i, 'part'], message: 'Select a part that exists in the chosen row.'});
    }
    if (step.resultFocus && !p.rows[step.row].result.includes(step.resultFocus)) {
      ctx.addIssue({code: 'custom', path: ['steps', i, 'resultFocus'], message: 'Use exact text from the outcome.'});
    }
  });
  const active = p.start?.active;
  if (active?.part !== undefined && active.part >= p.rows[active.row].parts.length) {
    ctx.addIssue({code: 'custom', path: ['start', 'active', 'part'], message: 'Select a part that exists in the chosen row.'});
  }
  if (active?.resultFocus && !p.rows[active.row].result.includes(active.resultFocus)) {
    ctx.addIssue({code: 'custom', path: ['start', 'active', 'resultFocus'], message: 'Use exact text from the outcome.'});
  }
});

export const description = 'Compare two examples with their outcomes. Each row has text parts that concatenate into the complete example, optional labels and tones, and a result. Use editor layout for requests and code, or text layout for other subjects. Examples may contain line breaks. Long examples wrap and keep the focused part in view. Cue an input part or highlight exact output text with resultFocus. Rows with hidden true first appear when their row is cued. Set resultsOnCue true and use reveal true to introduce a result on its cue. To keep this board across consecutive scenes, use continue true with only new steps in the next scene’s plan.';
export const tags = ['comparison', 'outcome', 'cause and effect', 'request', 'response', 'reading', 'two examples'];

const tones = {
  neutral: ['#e7e1da', '#302b34'],
  teal: ['#b5ded3', '#153b35'],
  amber: ['#ffcc81', '#40290d'],
} as const;

export function OutcomeComparisonScene(input: z.input<typeof outcomeComparisonSceneSchema>) {
  const p = outcomeComparisonSceneSchema.parse(input);
  const frame = useCurrentFrame();
  const len = useSceneLength();
  const {width, height} = useVideoConfig();
  const u = useUnit();
  const theme = useTheme();
  const editor = p.layout === 'editor';
  const portrait = width < height;
  const examples = useMemo(() => editor ? p.rows.map(row => formatJsonExample(row.result)) : [],
    [editor, p.rows]);
  const jsonRows = examples.filter(example => example !== null);
  const jsonLines = jsonRows.reduce((count, example) => count + example.lines.length + (example.header?.split(/\r?\n/).length ?? 0), 0);
  const maxJsonLine = Math.max(1, ...jsonRows.flatMap(example => [...example.lines, ...(example.header?.split(/\r?\n/) ?? [])].map(line => line.length)));
  const panelWidth = (Math.min(width - 128 * u, 1550 * u) - (portrait ? 34 : 64) * u) / (portrait ? 2.21 : 2.28);
  const jsonSize = Math.min(25 * u, (panelWidth - 52 * u) / (maxJsonLine * MONO_W),
    (jsonRows.length === 2 ? 455 : 295) * u / (1.25 * Math.max(1, jsonLines)));
  const steps = p.steps.map((step) => ({...step, frame: Math.min(len - 1, Math.round(step.at * len))}))
    .filter((step) => step.frame <= frame);
  const active = steps.at(-1) ?? p.start?.active;
  const fadeIn = (at: number) => Easing.out(Easing.cubic)(Math.min(1, (frame - at + 1) / Math.min(10, len - at)));
  const hasLabels = p.rows.some((row) => row.parts.some((part) => part.label));
  const tracks = `minmax(0, 1fr) ${(portrait ? 34 : 64) * u}px minmax(0, ${portrait ? 0.83 : 0.78}fr)`;
  const resultsOnCue = p.resultsOnCue ?? p.steps.some((step) => step.reveal);
  const longest = Math.max(...p.rows.map((row) => row.parts.reduce((size, part) => size + part.text.length, 0)));
  const fontSize = Math.min(editor ? 48 : 44, Math.max(23, (portrait ? 620 : 1120) / longest)) * u;
  const previewSize = 24 * u;
  const columns = Math.max(12, Math.floor((panelWidth / (portrait ? 0.83 : 0.78) - 52 * u) /
    (previewSize * (editor ? MONO_W : 0.65))));

  return (
    <AbsoluteFill style={{fontFamily: theme.fontFamily, color: theme.text}}>
      <h1 style={{position: 'absolute', top: 68 * u, left: 80 * u, right: 112 * u, margin: 0,
        fontSize: 58 * u, lineHeight: 1.13, letterSpacing: -u}}>{p.title}</h1>
      <div style={{position: 'absolute', inset: `${205 * u}px ${64 * u}px ${175 * u}px`, maxWidth: 1550 * u,
        marginInline: 'auto', display: 'flex', flexDirection: 'column', justifyContent: 'center', gap: 16 * u}}>
        <div style={{display: 'grid', gridTemplateColumns: tracks, fontSize: 24 * u, fontWeight: 700}}>
          <div style={{paddingInline: 25 * u}}>{p.inputHeading}</div>
          <div aria-hidden />
          <div style={{paddingInline: 25 * u}}>{p.resultHeading}</div>
        </div>
        {p.rows.map((row, index) => {
          const current = active?.row === index;
          const dimmed = (active?.row ?? (p.start ? undefined : p.steps[0]?.row) ?? index) !== index;
          const initial = p.start?.rows[index];
          const rowStart = steps.find((step) => step.row === index);
          const resultStart = steps.find((step) => step.row === index && step.reveal);
          const rowOpacity = (initial?.shown ?? !row.hidden) ? 1 : rowStart ? fadeIn(rowStart.frame) : 0;
          const resultOpacity = (initial?.revealed ?? !resultsOnCue) ? 1 : resultStart ? fadeIn(resultStart.frame) : 0;
          const resultFocus = current ? active?.resultFocus : undefined;
          const resultStartIndex = resultFocus ? row.result.indexOf(resultFocus) : -1;
          const json = examples[index];
          const source = row.parts.map(part => part.text).join('');
          const usePreview = /[\r\n]/.test(source) || source.length > columns * 2;
          const activePart = current ? active?.part : undefined;
          let offset = 0;
          const parts = row.parts.map(part => {
            const start = offset;
            offset += part.text.length;
            return {...part, start, end: offset};
          });
          const focusedPart = activePart === undefined ? undefined : parts[activePart];
          const preview = usePreview ? previewLineWindow(wrapPreviewLines(source, columns), 6,
            focusedPart?.start, focusedPart?.text.length) : null;
          return (
            <div key={index} style={{display: 'grid', gridTemplateColumns: tracks, alignItems: 'stretch',
              transform: `translateY(${(1 - rowOpacity) * 9 * u}px)`,
              opacity: rowOpacity * (dimmed ? 0.68 : 1)}}>
              <div style={{background: editor ? DARK.bg : PAPER.card, color: editor ? DARK.text : theme.text,
                border: `${2 * u}px solid ${current ? '#af7a40' : '#8f8170'}`, borderRadius: 17 * u, padding: `${22 * u}px ${24 * u}px`,
                display: 'flex', alignItems: 'center', minWidth: 0, minHeight: (portrait ? 140 : 160) * u}}>
                {preview ? (
                  <div style={{fontFamily: editor ? PAPER.font : theme.fontFamily, fontSize: previewSize, fontWeight: 700,
                    whiteSpace: 'pre-wrap', overflowWrap: 'anywhere', minWidth: 0, lineHeight: 1.3}}>
                    {preview.leading ? <div>…</div> : null}
                    {preview.lines.map((line, i) => <div key={i} style={{minHeight: '1.3em'}}>
                      {parts.map((part, partIndex) => {
                        const start = Math.max(line.start, part.start);
                        const end = Math.min(line.start + line.text.length, part.end);
                        if (end <= start) return null;
                        const [background, color] = tones[part.tone];
                        const marked = partIndex === activePart || part.tone !== 'neutral';
                        return <span key={partIndex} style={{background: marked ? background : undefined,
                          color: marked ? color : undefined, borderRadius: 4 * u,
                          boxShadow: partIndex === activePart ? `0 0 0 ${2 * u}px #e08a35` : undefined}}>
                          {source.slice(start, end)}
                        </span>;
                      })}
                    </div>)}
                    {preview.trailing ? <div>…</div> : null}
                    {focusedPart?.label ? <div style={{fontFamily: theme.fontFamily, fontSize: 18 * u}}>{focusedPart.label}</div> : null}
                  </div>
                ) : <div style={{display: 'flex', flexWrap: 'wrap', alignItems: 'flex-start', rowGap: 6 * u, maxWidth: '100%'}}>
                  {row.parts.map((part, partIndex) => {
                    const focused = current && active?.part === partIndex;
                    const [background, color] = tones[part.tone];
                    const badge = focused || part.tone !== 'neutral' || (editor && part.label);
                    return (
                      <div key={partIndex} style={{display: 'grid', gridTemplateRows: hasLabels ? 'auto 1.4em' : 'auto',
                        minWidth: 0, maxWidth: '100%', fontSize: (portrait ? 16 : 19) * u}}>
                        <span style={{fontFamily: editor ? PAPER.font : theme.fontFamily, fontWeight: 750,
                          whiteSpace: 'pre-wrap', overflowWrap: 'anywhere', fontSize, lineHeight: 1.33, borderRadius: 4 * u,
                          background: badge ? background : undefined, color: badge ? color : undefined,
                          boxShadow: focused ? `0 0 0 ${2.5 * u}px #e08a35` : undefined}}>{part.text}</span>
                        {hasLabels ? <span style={{paddingTop: 5 * u, fontWeight: focused ? 750 : 500,
                          fontFamily: theme.fontFamily, color: editor ? '#d9cfc9' : theme.muted,
                          whiteSpace: 'nowrap', width: 0, minWidth: '100%'}}>{part.label}</span> : null}
                      </div>
                    );
                  })}
                </div>}
              </div>
              <div aria-hidden style={{alignSelf: 'center', textAlign: 'center', opacity: resultOpacity,
                fontSize: 38 * u, lineHeight: 1, color: '#81552d'}}>→</div>
              <div style={{minWidth: 0, display: 'flex', alignItems: 'center', borderRadius: 17 * u,
                border: `${2 * u}px ${resultOpacity ? 'solid' : 'dashed'} #b5a38c`,
                background: resultOpacity ? index === 1 ? '#fbe8c8' : PAPER.card : 'transparent',
                padding: `${18 * u}px ${24 * u}px`}}>
                <div dir="auto" style={{opacity: resultOpacity, fontFamily: editor ? PAPER.font : theme.fontFamily,
                  transform: `translateX(${(1 - resultOpacity) * 8 * u}px)`,
                  fontSize: json ? jsonSize : (editor ? (portrait ? 20 : 24) : (portrait ? 27 : 34)) * u,
                  lineHeight: json ? 1.25 : 1.3, fontWeight: editor ? 600 : 650, whiteSpace: 'pre-wrap', overflowWrap: 'anywhere',
                  minWidth: 0}}>{json ? <>
                    {json.header ? <div dir="ltr" style={{fontWeight: 800}}>{json.header}</div> : null}
                    <JsonExampleCode example={json} focusStart={resultStartIndex} focusLength={resultFocus?.length} />
                  </> : resultFocus && resultStartIndex >= 0 ? <>
                    {row.result.slice(0, resultStartIndex)}
                    <mark style={{background: '#ffcc81', color: '#40290d', borderRadius: 3 * u}}>{resultFocus}</mark>
                    {row.result.slice(resultStartIndex + resultFocus.length)}
                  </> : row.result}</div>
              </div>
            </div>
          );
        })}
        <div style={{textAlign: 'center', minHeight: (portrait ? 128 : 100) * u, paddingTop: 14 * u, fontSize: 30 * u, lineHeight: 1.25, fontWeight: 650}}>
          {active?.explanation}
        </div>
      </div>
    </AbsoluteFill>
  );
}
