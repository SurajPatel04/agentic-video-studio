import {useMemo} from 'react';
import {AbsoluteFill, useCurrentFrame, useVideoConfig} from 'remotion';
import {z} from 'zod';
import {formatJsonExample, JsonExampleCode} from '../components/JsonExample';
import {PAPER} from '../iso/iso';
import {useSceneLength, useTheme, useUnit} from '../theme';
import {DARK, MONO, MONO_W, fraction} from './paperStage';

const annotationSchema = z.object({
  at: fraction,
  focus: z.string().min(1).max(120).optional(),
  occurrence: z.number().int().min(1).max(40).default(1),
  explanation: z.string().min(1).max(115),
}).strict();

const findFocus = (text: string, focus: string, occurrence: number) => {
  let start = text.indexOf(focus);
  for (let i = 1; i < occurrence && start !== -1; i++) {
    start = text.indexOf(focus, start + focus.length);
  }
  return start;
};

export const annotatedTextSceneSchema = z.object({
  title: z.string().min(1).max(68).default('Read the example'),
  layout: z.enum(['editor', 'text']).default('text'),
  label: z.string().max(40).optional(),
  text: z.string().min(1).max(220).default('GET /watches'),
  steps: z.array(annotationSchema).max(8).default([]),
}).strict().superRefine((p, ctx) => {
  const json = p.layout === 'editor' ? formatJsonExample(p.text) : null;
  const rows = p.text.split('\n').length;
  if (rows > (json ? 12 : 4)) {
    ctx.addIssue({code: 'custom', path: ['text'], message: 'Use up to twelve short lines for JSON or four lines for a plain example.'});
  }
  p.steps.forEach((step, i) => {
    if (i > 0 && step.at <= p.steps[i - 1].at) {
      ctx.addIssue({code: 'custom', path: ['steps', i, 'at'], message: 'Order the steps by their narration cues.'});
    }
    if (step.focus && findFocus(p.text, step.focus, step.occurrence) < 0) {
      ctx.addIssue({code: 'custom', path: ['steps', i, 'focus'], message: 'The selected text must appear verbatim in the example.'});
    }
  });
});

export const description = 'Show a complete request, expression, sentence or short excerpt from the start. Use layout "editor" for commands or code and "text" for prose and equations. A valid JSON body is indented and syntax colored, with the HTTP request or response line and headers shown above it. Cue each step to highlight the exact substring in focus and show a short explanation. If the substring repeats, occurrence counts matches from 1. Omit focus to explain the whole example.';
export const tags = ['annotation', 'walkthrough', 'reading', 'sentence', 'grammar', 'request', 'excerpt', 'formula', 'parts'];

export function AnnotatedTextScene(input: z.input<typeof annotatedTextSceneSchema>) {
  const p = annotatedTextSceneSchema.parse(input);
  const frame = useCurrentFrame();
  const len = useSceneLength();
  const theme = useTheme();
  const u = useUnit();
  const {width} = useVideoConfig();
  const editor = p.layout === 'editor';
  const json = useMemo(() => editor ? formatJsonExample(p.text) : null, [editor, p.text]);
  const step = p.steps.filter((s) => frame >= Math.round(s.at * len)).at(-1);
  const focus = step?.focus;
  const start = step && focus ? findFocus(p.text, focus, step.occurrence) : -1;
  const lines = p.text.split('\n');
  const maxLine = Math.max(...lines.map((line) => line.length));
  const size = Math.min(editor ? 90 : 72, 240 / lines.length, Math.max(32, (editor ? 2200 : 3400) / maxLine)) * u;
  const jsonWidth = Math.min(width - 144 * u, 1120 * u);
  const headerLines = json?.header?.split(/\r?\n/) ?? [];
  const headerSize = Math.min(38 * u, (jsonWidth - 80 * u) /
    (Math.max(1, ...headerLines.map(line => line.length)) * MONO_W));
  const jsonSize = json ? Math.min(45 * u, (jsonWidth - 80 * u) /
    (Math.max(...json.lines.map(line => line.length)) * MONO_W), 360 * u / (1.34 * (json.lines.length + Math.max(0, headerLines.length - 1)))) : 0;

  return (
    <AbsoluteFill style={{color: theme.text, fontFamily: theme.fontFamily}}>
      <h1 style={{position: 'absolute', top: 72 * u, left: 76 * u, right: 110 * u, margin: 0,
        fontSize: 58 * u, lineHeight: 1.14, letterSpacing: -u}}>{p.title}</h1>
      <div style={{position: 'absolute', inset: `${240 * u}px ${72 * u}px ${165 * u}px`,
        display: 'flex', flexDirection: 'column', alignItems: 'stretch', justifyContent: 'center',
        maxWidth: (json ? 1120 : 1380) * u, marginInline: 'auto'}}>
        <div style={{background: editor ? DARK.bg : PAPER.card, color: editor ? DARK.text : theme.text,
          border: `${2 * u}px solid ${PAPER.ink}`, borderRadius: 18 * u, overflow: 'hidden'}}>
          {json?.header ? (
            <div dir="ltr" style={{padding: `${24 * u}px ${38 * u}px`, borderBottom: `1px solid ${DARK.line}`,
              background: DARK.panel, color: DARK.text, fontFamily: MONO, fontSize: headerSize, fontWeight: 700, whiteSpace: 'pre-wrap',
              overflowWrap: 'anywhere'}}>
              {focus && start >= 0 && start + focus.length <= json.header.length ? <>
                {json.header.slice(0, start)}
                <mark style={{background: '#fed28f', color: '#281d13', borderRadius: 5 * u}}>{focus}</mark>
                {json.header.slice(start + focus.length)}
              </> : json.header}
            </div>
          ) : p.label ? (
            <div style={{padding: `${15 * u}px ${34 * u}px`, fontSize: 24 * u, fontWeight: 600, background: '#eae4d8', color: theme.text}}>
              {p.label}
            </div>
          ) : null}
          {json ? (
            <div style={{padding: `${30 * u}px ${38 * u}px`, fontFamily: MONO, fontSize: jsonSize, lineHeight: 1.34, textAlign: 'left'}}>
              <JsonExampleCode example={json} dark focusStart={start} focusLength={focus?.length} />
            </div>
          ) : <div dir="auto" style={{whiteSpace: 'pre-wrap', overflowWrap: 'anywhere', padding: `${42 * u}px ${36 * u}px`,
            textAlign: 'center', fontFamily: editor ? PAPER.font : theme.fontFamily, fontWeight: 600,
            fontSize: size, lineHeight: 1.28}}>
            {focus && start >= 0 ? (
              <>
                {p.text.slice(0, start)}
                <mark style={{color: '#241e19', background: '#fed28f', borderRadius: 5 * u}}>{focus}</mark>
                {p.text.slice(start + focus.length)}
              </>
            ) : p.text}
          </div>}
        </div>
        <div dir="auto" style={{padding: `${22 * u}px ${12 * u}px 0`, minHeight: 122 * u,
          fontSize: 32 * u, lineHeight: 1.3, textAlign: 'center', fontWeight: 600}}>
          {step?.explanation}
        </div>
      </div>
    </AbsoluteFill>
  );
}
