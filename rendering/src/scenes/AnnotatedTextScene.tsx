import {Fragment, useMemo} from 'react';
import {AbsoluteFill, Easing, useCurrentFrame, useVideoConfig} from 'remotion';
import {z} from 'zod';
import {formatJsonExamples, jsonFieldRange, JsonExampleCode, wrapJsonExample} from '../components/JsonExample';
import {previewLineWindow, wrapPreviewLines} from '../components/textPreview';
import {PAPER} from '../iso/iso';
import {useBottomCaptionInset, useSceneLength, useTheme, useUnit} from '../theme';
import {IsoRegion, IsoScene, isoSceneSchema} from './IsoScene';
import {DARK, MONO, MONO_W, fraction} from './paperStage';

const annotationSchema = z.object({
  at: fraction,
  focus: z.string().min(1).max(120).optional(),
  focusPath: z.string().startsWith('/').optional(),
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

function findJsonFocus(examples: ReturnType<typeof formatJsonExamples>, pointer: string, occurrence: number) {
  for (const example of examples) {
    const range = jsonFieldRange(example, pointer);
    if (range && --occurrence === 0) return range;
  }
  return undefined;
}

export const annotatedTextSceneSchema = z.object({
  title: z.string().min(1).max(68).default('Read the example'),
  layout: z.enum(['editor', 'text']).default('text'),
  label: z.string().optional(),
  text: z.string().min(1).default('GET /watches'),
  appearAt: fraction.optional(),
  steps: z.array(annotationSchema).max(8).default([]),
  diagram: isoSceneSchema.optional(),
}).strict().superRefine((p, ctx) => {
  const examples = p.layout === 'editor' && p.steps.some(step => step.focusPath !== undefined)
    ? formatJsonExamples(p.text) : [];
  p.steps.forEach((step, i) => {
    if (i > 0 && step.at <= p.steps[i - 1].at) {
      ctx.addIssue({code: 'custom', path: ['steps', i, 'at'], message: 'Order the steps by their narration cues.'});
    }
    if (step.focusPath !== undefined) {
      if (!findJsonFocus(examples, step.focusPath, step.occurrence)) {
        ctx.addIssue({code: 'custom', path: ['steps', i, 'focusPath'], message: 'Choose an existing JSON pointer in the displayed editor example.'});
      }
    } else if (step.focus && findFocus(p.text, step.focus, step.occurrence) < 0) {
      ctx.addIssue({code: 'custom', path: ['steps', i, 'focus'], message: 'The selected text must appear verbatim in the example.'});
    }
  });
});

export const description = 'Show a request, expression, sentence or excerpt. Use layout "editor" for code and "text" for prose and equations. Supply complete valid JSON bodies. For a request and response with separate bodies, put each HTTP heading on its own line. Highlight a JSON field with focusPath, a JSON pointer such as /data/id or /data/0/id. For other text, use a verbatim focus. Use occurrence for repeated matches in reading order, counting from 1. Omit both focus fields to explain the whole example. Long JSON stays in the editor and scrolls to highlighted fields. Supply diagram (IsoScene objects, links and steps) to show the flow beside the example. Set appearAt to bring in the example on cue.';
export const tags = ['annotation', 'walkthrough', 'reading', 'sentence', 'grammar', 'request', 'excerpt', 'formula', 'parts'];

type FocusCue = {frame: number; start: number; length: number};

function JsonPanel({example, width, height, u, start, length, cues, frame, fps}: {
  example: ReturnType<typeof formatJsonExamples>[number]; width: number; height: number; u: number;
  start: number; length: number; cues: FocusCue[]; frame: number; fps: number;
}) {
  const innerWidth = width - 70 * u;
  const headerLines = example.header?.split(/\r?\n/) ?? [];
  const headerSize = Math.min(33 * u, innerWidth /
    (Math.max(1, ...headerLines.map(line => line.length)) * MONO_W));
  const headerHeight = headerLines.length ? headerLines.length * headerSize * 1.2 + 36 * u : 0;
  const bodyHeight = Math.max(140 * u, height - headerHeight - 50 * u);
  const jsonSize = Math.max(24 * u, Math.min(40 * u,
    innerWidth / (Math.max(...example.lines.map(line => line.length)) * MONO_W),
    bodyHeight / (1.3 * example.lines.length)));
  const columns = Math.max(1, Math.floor(innerWidth / (jsonSize * MONO_W)));
  const json = useMemo(() => wrapJsonExample(example, columns), [example, columns]);
  const lineHeight = jsonSize * 1.3;
  const contentHeight = json.rows.length * lineHeight;
  const viewport = Math.min(contentHeight, Math.floor(bodyHeight / lineHeight) * lineHeight);
  const maxScroll = contentHeight - viewport;
  let from = 0;
  let to = 0;
  let since = 0;
  const scrollDuration = Math.max(1, Math.round(fps * 0.36));
  const offsetAt = (time: number) => from + (to - from) *
    Easing.out(Easing.cubic)(Math.max(0, Math.min(1, (time - since) / scrollDuration)));
  if (maxScroll > 0) {
    for (const cue of cues) {
      if (cue.frame > frame) break;
      const row = json.rows.findIndex(pieces => pieces.some(piece => piece.start !== undefined &&
        piece.start < cue.start + cue.length && piece.start + piece.text.length > cue.start));
      if (row < 0) continue;
      const offset = offsetAt(cue.frame);
      const rowTop = lineHeight * row;
      if (rowTop >= Math.max(offset, to) && rowTop + lineHeight <= Math.min(offset, to) + viewport) continue;
      from = offset;
      to = Math.min(maxScroll, Math.max(0, rowTop - viewport / 2 + lineHeight / 2));
      since = cue.frame;
    }
  }
  const scroll = offsetAt(frame);
  const headerStart = start - example.headerStart;
  const focusHeader = headerStart >= 0 && length > 0 && headerStart + length <= (example.header?.length ?? 0);
  return <div style={{minWidth: 0}}>
    {example.header ? (
      <div dir="ltr" style={{padding: `${18 * u}px ${28 * u}px`, borderBottom: `1px solid ${DARK.line}`,
        background: DARK.panel, color: DARK.text, fontFamily: MONO, fontSize: headerSize, lineHeight: 1.2,
        fontWeight: 700, whiteSpace: 'pre-wrap', overflowWrap: 'anywhere'}}>
        {focusHeader ? <>
          {example.header.slice(0, headerStart)}
          <mark style={{background: '#fed28f', color: '#281d13', borderRadius: 5 * u}}>{example.header.slice(headerStart, headerStart + length)}</mark>
          {example.header.slice(headerStart + length)}
        </> : example.header}
      </div>
    ) : null}
    <div style={{padding: `${24 * u}px ${28 * u}px`, fontFamily: MONO, fontSize: jsonSize, lineHeight: `${lineHeight}px`, textAlign: 'left'}}>
      <div style={{height: viewport, overflow: 'hidden', position: 'relative'}}>
        <div style={{transform: `translateY(${-scroll}px)`}}>
          <JsonExampleCode example={json} dark fixedLines focusStart={start} focusLength={length} />
        </div>
        {maxScroll > 0 && <div style={{position: 'absolute', right: 0,
          top: scroll * viewport / contentHeight, height: viewport * viewport / contentHeight,
          width: 4 * u, borderRadius: 4 * u, background: '#666579'}} />}
      </div>
    </div>
  </div>;
}

export function AnnotatedTextScene(input: z.input<typeof annotatedTextSceneSchema>) {
  const p = annotatedTextSceneSchema.parse(input);
  const frame = useCurrentFrame();
  const len = useSceneLength();
  const theme = useTheme();
  const u = useUnit();
  const bottomCaptionInset = useBottomCaptionInset();
  const {width, height, fps} = useVideoConfig();
  const stacked = !!p.diagram && width <= height;
  const panelWidth = p.diagram && !stacked ? width * 0.4 : width - 144 * u;
  const editor = p.layout === 'editor';
  const opacity = p.appearAt === undefined ? 1 : Math.max(0, Math.min(1, (frame - Math.round(p.appearAt * len) + 1) / 6));
  const examples = useMemo(() => editor ? formatJsonExamples(p.text) : [], [editor, p.text]);
  const fullJson = examples[0];
  const cues = p.steps.map(step => {
    const field = step.focusPath !== undefined ? findJsonFocus(examples, step.focusPath, step.occurrence) : undefined;
    return {...step, frame: Math.round(step.at * len),
      start: field?.start ?? (step.focus ? findFocus(p.text, step.focus, step.occurrence) : -1),
      length: field?.length ?? step.focus?.length ?? 0};
  });
  const step = cues.filter(cue => frame >= cue.frame).at(-1);
  const start = step?.start ?? -1;
  const focusLength = step?.length ?? 0;
  const splitJson = examples.length === 2 && !p.diagram && width > height;
  const selectedJson = [...examples].reverse().find(example => start >= example.headerStart) ?? fullJson;
  const visibleExamples = splitJson ? examples : selectedJson ? [selectedJson] : [];
  const panelLimit = fullJson ? (splitJson ? 1580 : 1480) * u : 1380 * u;
  const cardWidth = Math.min(panelWidth, panelLimit);
  const jsonWidth = cardWidth / (splitJson ? 2 : 1);
  const titleLines = wrapPreviewLines(p.title, Math.max(1, Math.floor((width - 186 * u) / (58 * u * 0.64))));
  const top = Math.max(stacked ? 175 : 190, 96 + titleLines.length * 58 * 1.14) * u;
  const bottomMargin = Math.max(fullJson ? 48 : 165, bottomCaptionInset);
  const bottom = stacked ? 796 * u : height - bottomMargin * u;
  const labelWidth = cardWidth - 72 * u;
  const label = p.label?.replace(/\s+/g, ' ').trim() ?? '';
  const showLabel = !!label && (!fullJson?.header || examples.length > 1);
  const labelSize = Math.min(24 * u, Math.max(18 * u, labelWidth / (Math.max(1, label.length) * 0.65)));
  const labelLines = wrapPreviewLines(label, Math.max(1, Math.floor(labelWidth / (labelSize * 0.65))));
  const labelHeight = showLabel ? 30 * u + Math.min(2, labelLines.length) * labelSize * 1.25 : 0;
  const noteColumns = Math.max(1, Math.floor((cardWidth - 24 * u) / (32 * u * 0.65)));
  const noteLines = Math.max(0, ...p.steps.map(s => wrapPreviewLines(s.explanation, noteColumns).length));
  const noteHeight = noteLines ? (22 + 32 * 1.3 * noteLines) * u : 0;
  const cardHeight = bottom - top - labelHeight - noteHeight - 4 * u;
  const textWidth = cardWidth - 76 * u;
  const plain = useMemo(() => {
    if (fullJson) return null;
    const emWidth = editor ? MONO_W : 0.65;
    const maxSize = editor ? 40 : p.diagram ? 48 : 72;
    const bodyHeight = cardHeight - 84 * u;
    const layoutAt = (size: number) => ({size: size * u, lines: wrapPreviewLines(p.text,
      Math.max(1, Math.floor(textWidth / (size * u * emWidth))))});
    const sizes = [72, 48, 40, 34, 30, 28, 24].filter(size => size <= maxSize);
    for (const size of sizes) {
      const layout = layoutAt(size);
      if (layout.lines.length * layout.size * 1.28 <= bodyHeight) {
        return {...layout, leading: false, trailing: false};
      }
    }
    const layout = layoutAt(sizes.at(-1)!);
    const rows = Math.max(3, Math.floor(bodyHeight / (layout.size * 1.28)));
    return {size: layout.size, ...previewLineWindow(layout.lines, rows, start, focusLength)};
  }, [fullJson, editor, p.diagram, p.text, cardHeight, textWidth, u, start, focusLength]);

  return (
    <AbsoluteFill style={{color: theme.text, fontFamily: theme.fontFamily}}>
      {p.diagram ? (
        <IsoRegion.Provider value={{
          left: stacked ? 72 * u : panelWidth + 140 * u,
          right: width - 90 * u,
          top: (stacked ? 820 : 200) * u,
        }}>
          <IsoScene {...p.diagram} />
        </IsoRegion.Provider>
      ) : null}
      <h1 style={{position: 'absolute', top: 72 * u, left: 76 * u, right: 110 * u, margin: 0,
        fontSize: 58 * u, lineHeight: 1.14, letterSpacing: -u}}>{p.title}</h1>
      <div style={{position: 'absolute', top, left: 72 * u,
        right: p.diagram && !stacked ? undefined : 72 * u,
        width: p.diagram ? panelWidth : undefined,
        bottom: height - bottom,
        opacity,
        display: 'flex', flexDirection: 'column', alignItems: 'stretch', justifyContent: 'center',
        maxWidth: panelLimit, marginInline: p.diagram ? undefined : 'auto'}}>
        <div style={{background: editor ? DARK.bg : PAPER.card, color: editor ? DARK.text : theme.text,
          border: `${2 * u}px solid ${PAPER.ink}`, borderRadius: 18 * u, overflow: 'hidden'}}>
          {showLabel ? (
            <div dir="auto" style={{padding: `${15 * u}px ${34 * u}px`, fontSize: labelSize, fontWeight: 600, background: '#eae4d8', color: theme.text,
              whiteSpace: 'pre-line', overflowWrap: 'anywhere', lineHeight: 1.25}}>
              {labelLines.slice(0, 2).map(line => line.text).join('\n')}{labelLines.length > 2 ? '…' : ''}
            </div>
          ) : null}
          {fullJson ? (
            <div style={{display: 'grid', gridTemplateColumns: splitJson ? 'repeat(2, minmax(0, 1fr))' : 'minmax(0, 1fr)',
              gap: splitJson ? 1 : 0, background: DARK.line}}>
              {visibleExamples.map(example => <div key={example.headerStart} style={{background: DARK.bg, minWidth: 0}}>
                <JsonPanel example={example} width={jsonWidth} height={cardHeight} u={u} start={start}
                  length={focusLength} cues={cues} frame={frame} fps={fps} />
              </div>)}
            </div>
          ) : plain && <div dir="auto" style={{whiteSpace: 'pre-wrap', overflowWrap: 'anywhere', padding: `${42 * u}px ${36 * u}px`,
            textAlign: p.diagram || editor ? 'left' : 'center', fontFamily: editor ? MONO : theme.fontFamily, fontWeight: 600,
            fontSize: plain.size, lineHeight: 1.28}}>
            {plain.leading ? '…\n' : null}
            {plain.lines.map((line, i) => {
              const from = Math.max(0, start - line.start);
              const to = Math.min(line.text.length, start + focusLength - line.start);
              return <Fragment key={i}>{i > 0 ? '\n' : null}{start >= 0 && to > from ? <>
                {line.text.slice(0, from)}
                <mark style={{color: '#241e19', background: '#fed28f', borderRadius: 5 * u}}>{line.text.slice(from, to)}</mark>
                {line.text.slice(to)}
              </> : line.text}</Fragment>;
            })}
            {plain.trailing ? '\n…' : null}
          </div>}
        </div>
        {noteLines > 0 && <div dir="auto" style={{padding: `${22 * u}px ${12 * u}px 0`, height: noteHeight, boxSizing: 'border-box',
          flexShrink: 0, fontSize: 32 * u, lineHeight: 1.3, textAlign: p.diagram ? 'left' : 'center', fontWeight: 600}}>
          {step?.explanation}
        </div>}
      </div>
    </AbsoluteFill>
  );
}
