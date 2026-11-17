import {useCurrentFrame, useVideoConfig} from 'remotion';
import {z} from 'zod';
import {ThreeCanvas} from '@remotion/three';
import {entrance} from '../animation';
import {InfrastructureObject} from '../components/InfrastructureObject';
import {deviceKindSchema} from '../components/Device';
import {StudioLights} from '../components/NetworkWorld';
import {StudyFrame} from '../components/StudyFrame';
import {AnimatedText, Pulse, stripMarkup, textAnimationSchema} from '../motion';

// All text fields support markup: **bold**  ==highlight==  __underline__  ((circle))
const nonnegative = z.number().int().nonnegative();
const textAnimation = textAnimationSchema.default('words');
const wordCount = (s: string) => stripMarkup(s).split(/\s+/).filter(Boolean).length;
// StudyFrame draws on a fixed 1600x900 canvas, so entrances use 1 design px per unit.
const U = 1;

/* ------------------------------------------------------------------ Definition */

export const definitionSceneSchema = z.object({
  term: z.string().default('A key concept'),
  abbreviation: z.string().default(''),
  meaning: z.string().default('Explain the idea in plain language, then connect it to a concrete example.'),
  detail: z.string().default(''),
  revealAt: nonnegative.default(20),
  textAnimation,
});
export const DefinitionScene: React.FC<z.input<typeof definitionSceneSchema>> = (input) => {
  const p = definitionSceneSchema.parse(input);
  const f = useCurrentFrame();
  const {fps} = useVideoConfig();
  const footerAt = p.revealAt + wordCount(p.meaning) * 3 + 15;
  return <StudyFrame title={p.term} eyebrow="DEFINITION / THE CORE IDEA" footer={p.detail} footerAt={footerAt} textAnimation={p.textAnimation}>
    <div style={{display: 'flex', gap: 36, alignItems: 'stretch', marginTop: 65, minHeight: 290, maxHeight: 440}}>
      {p.abbreviation.trim() ? <div style={{flex: '0 0 250px', display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontSize: Math.min(78, 300 / Math.max(4, p.abbreviation.length)), fontWeight: 750, color: '#76d3ed',
        padding: 24, overflowWrap: 'anywhere', textAlign: 'center', background: '#16334a', borderRadius: 24,
        boxSizing: 'border-box', ...entrance('pop', f - 8, fps, U)}}>{p.abbreviation}</div> : null}
      <div style={{flex: 1, minWidth: 0, padding: '36px 44px', border: '1px solid #35576f', borderLeft: '5px solid #38bdf8',
        borderRadius: 22, background: 'linear-gradient(125deg, #152d42, #122236)', display: 'flex', flexDirection: 'column', justifyContent: 'center'}}>
        <div style={{fontSize: 15, letterSpacing: 3, fontWeight: 700, color: '#76d3ed', marginBottom: 22}}>IN PLAIN WORDS</div>
        <AnimatedText text={p.meaning} mode={p.textAnimation} startAt={p.revealAt} stagger={3}
          style={{fontSize: p.meaning.length > 220 ? 30 : p.meaning.length > 140 ? 36 : 43, lineHeight: 1.4, overflowWrap: 'anywhere'}} />
      </div>
    </div>
  </StudyFrame>;
};

/* ---------------------------------------------------------------- Example card */

export const exampleCardSceneSchema = z.object({
  title: z.string().default('Home Wi-Fi is a **LAN**'),
  example: z.string().default('Your phone, laptop, and printer connect through the ==home router==.'),
  takeaway: z.string().default('One small area. Several connected devices.'),
  kind: deviceKindSchema.default('router'), // any of the 65 device kinds
  textAnimation,
});
export const ExampleCardScene: React.FC<z.input<typeof exampleCardSceneSchema>> = (input) => {
  const p = exampleCardSceneSchema.parse(input);
  const f = useCurrentFrame();
  const {fps} = useVideoConfig();
  const textAt = 18;
  return <StudyFrame title={p.title} eyebrow="REAL-LIFE EXAMPLE" footer={p.takeaway} footerAt={textAt + wordCount(p.example) * 3 + 15} textAnimation={p.textAnimation}>
    <div style={{display: 'flex', alignItems: 'center', gap: 60, border: '1px solid #34536b', background: '#11273a', borderRadius: 24, ...entrance('fade-up', f, fps, U)}}>
      <ThreeCanvas width={500} height={500} camera={{position: [0, 2, 5], fov: 45}}><StudioLights/><group position={[0, -0.8, 0]} rotation={[0, -0.3, 0]}><InfrastructureObject kind={p.kind}/></group></ThreeCanvas>
      <AnimatedText text={p.example} mode={p.textAnimation} startAt={textAt} stagger={3}
        style={{fontSize: 42, lineHeight: 1.4, maxWidth: 730, paddingRight: 35}} />
    </div>
  </StudyFrame>;
};

/* ----------------------------------------------------------------------- Steps */

export const stepsSceneSchema = z.object({
  title: z.string().default('How a message moves'),
  steps: z.array(z.string()).min(2).max(6).default(['Create the message', 'Split into ==packets==', 'Forward across the network', 'Reassemble at the **destination**']),
  startAt: nonnegative.default(10),
  stagger: nonnegative.default(30),
  textAnimation,
});
export const StepsScene: React.FC<z.input<typeof stepsSceneSchema>> = (input) => {
  const p = stepsSceneSchema.parse(input);
  const f = useCurrentFrame();
  const {fps} = useVideoConfig();
  return <StudyFrame title={p.title} eyebrow="PROCESS / STEP BY STEP" textAnimation={p.textAnimation}>
    <div style={{display: 'flex', flexDirection: 'column', gap: 10}}>{p.steps.map((s, i) => {
      const at = p.startAt + i * p.stagger;
      const last = i === p.steps.length - 1;
      return <div key={i} style={{display: 'flex', alignItems: 'center', gap: 28, ...entrance('slide-left', f - at, fps, U)}}>
        <div style={{width: 65, textAlign: 'center', fontSize: 29, color: '#78d6ee', ...entrance('pop', f - at - 4, fps, U)}}>{i + 1}</div>
        <div style={{flex: 1, padding: '18px 28px', background: '#173148', borderRadius: 12, fontSize: 29}}>
          <AnimatedText as="span" text={s} mode={p.textAnimation} startAt={at + 6} stagger={3} />
        </div>
        <span style={{width: 50, color: last ? '#71e3af' : '#88b8cc', fontSize: 27, ...entrance(last ? 'pop' : 'slide-down', f - at - 12, fps, U)}}>{last ? '✓' : '↓'}</span>
      </div>;
    })}</div>
  </StudyFrame>;
};

/* ------------------------------------------------------------------------ Quiz */

export const quizSceneSchema = z.object({
  question: z.string().default('Which network typically spans a **city**?'),
  options: z.array(z.string()).length(4).default(['LAN', 'MAN', 'WAN', 'PAN']),
  correctIndex: z.number().int().min(0).max(3).default(1),
  answerAt: nonnegative.default(120),
  explanation: z.string().default('A **MAN** connects sites across a ==metropolitan area==.'),
  optionsAt: nonnegative.default(25),
  optionStagger: nonnegative.default(8),
  textAnimation,
});
export const QuizScene: React.FC<z.input<typeof quizSceneSchema>> = (input) => {
  const p = quizSceneSchema.parse(input);
  const f = useCurrentFrame();
  const {fps} = useVideoConfig();
  const answered = f >= p.answerAt;
  const footer = answered
    ? <AnimatedText key="answer" text={p.explanation} mode={p.textAnimation} startAt={p.answerAt + 8} stagger={2} />
    : <AnimatedText key="prompt" text="Pause the video and choose A, B, C, or D." mode="fade" startAt={p.optionsAt + 4 * p.optionStagger} />;
  return <StudyFrame title={p.question} eyebrow="QUICK CHECK / CHOOSE AN ANSWER" footer={footer} textAnimation={p.textAnimation}>
    <div style={{display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 24, marginTop: 40}}>{p.options.map((o, i) => {
      const correct = answered && i === p.correctIndex;
      return <div key={i} style={{...entrance('pop', f - p.optionsAt - i * p.optionStagger, fps, U)}}>
        <Pulse at={i === p.correctIndex ? [p.answerAt] : []} color="#74e3b6" style={{display: 'block'}}>
          <div style={{padding: '42px 30px', fontSize: 36, border: `2px solid ${correct ? '#74e3b6' : '#38566e'}`, borderRadius: 18,
            background: correct ? '#16463d' : '#142b40', opacity: answered && !correct ? 0.45 : 1}}>
            <span style={{color: '#8faabe', marginRight: 30}}>{'ABCD'[i]}</span>
            <AnimatedText as="span" text={o} mode="none" />
            {correct ? <span style={{marginLeft: 16, color: '#74e3b6', display: 'inline-block', ...entrance('pop', f - p.answerAt, fps, U)}}>✓</span> : null}
          </div>
        </Pulse>
      </div>;
    })}</div>
  </StudyFrame>;
};

/* --------------------------------------------------------------------- Summary */

export const summarySceneSchema = z.object({
  title: z.string().default('Three networks. Three scales.'),
  points: z.array(z.string()).min(1).max(6).default(['**LAN** connects nearby devices.', '**MAN** connects sites across a ==city==.', '**WAN** connects networks across __large distances__.']),
  startAt: nonnegative.default(10),
  stagger: nonnegative.default(25),
  textAnimation,
});
export const SummaryScene: React.FC<z.input<typeof summarySceneSchema>> = (input) => {
  const p = summarySceneSchema.parse(input);
  const f = useCurrentFrame();
  const {fps} = useVideoConfig();
  return <StudyFrame title={p.title} eyebrow="RECAP / TAKE THESE WITH YOU" textAnimation={p.textAnimation}>
    <div style={{display: 'flex', flexDirection: 'column', gap: 20, marginTop: 25}}>{p.points.map((point, i) => {
      const at = p.startAt + i * p.stagger;
      return <div key={i} style={{padding: '22px 30px', fontSize: 34, background: '#142d40', borderRadius: 14, display: 'flex', gap: 26, ...entrance('slide-left', f - at, fps, U)}}>
        <span style={{color: '#71e3af', display: 'inline-block', ...entrance('pop', f - at - 5, fps, U)}}>✓</span>
        <AnimatedText as="span" text={point} mode={p.textAnimation} startAt={at + 6} stagger={3} />
      </div>;
    })}</div>
  </StudyFrame>;
};
