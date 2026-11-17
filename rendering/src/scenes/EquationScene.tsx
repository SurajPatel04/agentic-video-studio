import {continueRender, delayRender, useCurrentFrame} from 'remotion';
import {useEffect, useMemo, useState} from 'react';
import katex from 'katex';
import {z} from 'zod';
import {StudyFrame} from '../components/StudyFrame';
import {useTheme} from '../theme';

const nonnegative = z.number().int().nonnegative();
const positive = z.number().int().positive();

export const equationSceneSchema = z.object({
  title: z.string().default('Solving a quadratic equation'),
  eyebrow: z.string().default('EQUATION / STEP BY STEP'),
  steps: z.array(z.object({
    latex: z.string(),
    note: z.string().optional(),
    highlight: z.boolean().optional(),
  })).min(1).max(5).default([
    {latex: 'ax^2 + bx + c = 0', note: 'Start with the standard form.'},
    {latex: 'x = \\frac{-b \\pm \\sqrt{b^2 - 4ac}}{2a}', note: 'Apply the quadratic formula.', highlight: true},
    {latex: 'b^2 - 4ac', note: 'The discriminant tells you how many real roots exist.'},
  ]),
  startAt: nonnegative.default(12),
  stagger: nonnegative.default(26),
  revealFrames: positive.default(18),
  layout: z.enum(['stack', 'focus']).default('stack'),
  footer: z.string().default('Every line is typeset with KaTeX and revealed on the frame timeline.'),
});

export const description = 'A step-by-step equation or derivation rendered with KaTeX and revealed line by line.';
export const tags = ['equation', 'math', 'formula', 'derivation', 'katex', 'science'];

const clamp = (value: number) => Math.min(1, Math.max(0, value));

export const EquationScene: React.FC<z.input<typeof equationSceneSchema>> = (input) => {
  const p = equationSceneSchema.parse(input);
  const frame = useCurrentFrame();
  const theme = useTheme();
  const [handle] = useState(() => delayRender('Loading equation fonts'));

  useEffect(() => {
    let active = true;
    Promise.all([
      document.fonts.load('1em KaTeX_Main'),
      document.fonts.load('italic 1em KaTeX_Math'),
      document.fonts.load('1em KaTeX_Size1'),
    ])
      .then(() => document.fonts.ready)
      .then(() => { if (active) continueRender(handle); })
      .catch(() => { if (active) continueRender(handle); });
    return () => { active = false; };
  }, [handle]);

  const stepKey = p.steps.map((step) => step.latex).join('\u0000');
  const rendered = useMemo(() => p.steps.map((step) => katex.renderToString(step.latex, {
    displayMode: true,
    throwOnError: false,
    strict: false,
    output: 'html',
  })), [stepKey]);

  const fontSize = p.steps.length >= 5 ? 32 : p.steps.length === 4 ? 36 : p.steps.length === 3 ? 41 : 48;
  const activeIndex = p.steps.reduce((latest, _step, i) => (frame >= p.startAt + i * p.stagger ? i : latest), -1);

  return (
    <StudyFrame title={p.title} eyebrow={p.eyebrow} footer={p.footer || undefined}>
      <div style={{display: 'flex', flexDirection: 'column', justifyContent: 'center', gap: p.steps.length > 3 ? 10 : 16, height: '100%'}}>
        {p.steps.map((step, i) => {
          const reveal = clamp((frame - p.startAt - i * p.stagger) / p.revealFrames);
          const isActive = i === activeIndex;
          const forceHighlight = step.highlight === true;
          const emphasized = forceHighlight || (p.layout === 'focus' && isActive);
          const dimmed = p.layout === 'focus' && activeIndex >= 0 && !isActive && !forceHighlight;
          return (
            <div
              key={`${step.latex}-${i}`}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 22,
                padding: p.steps.length > 3 ? '8px 24px' : '12px 28px',
                border: `1.5px solid ${emphasized ? theme.accent : 'transparent'}`,
                borderLeft: `5px solid ${emphasized ? theme.accent : '#2a4358'}`,
                borderRadius: 14,
                background: emphasized ? `${theme.accent}18` : '#122638',
                opacity: reveal * (dimmed ? 0.42 : 1),
                transform: `translateY(${(1 - reveal) * 18}px)`,
              }}
            >
              <div style={{width: 34, flex: '0 0 34px', fontSize: 18, color: emphasized ? theme.accent : theme.muted, fontWeight: 700}}>
                {String(i + 1).padStart(2, '0')}
              </div>
              <div style={{flex: 1, minWidth: 0}}>
                <div
                  style={{fontSize, lineHeight: 1.15, color: emphasized ? theme.text : '#d7e4ee', overflow: 'hidden'}}
                  dangerouslySetInnerHTML={{__html: rendered[i]}}
                />
                {step.note ? (
                  <div style={{fontSize: p.steps.length > 3 ? 18 : 21, lineHeight: 1.35, color: theme.muted, marginTop: 4}}>
                    {step.note}
                  </div>
                ) : null}
              </div>
            </div>
          );
        })}
      </div>
    </StudyFrame>
  );
};
