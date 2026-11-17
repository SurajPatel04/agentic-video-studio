import type {FC} from 'react';
import {AbsoluteFill, interpolate, useCurrentFrame, useVideoConfig} from 'remotion';
import {z} from 'zod';
import {entrance} from '../animation';
import {Device, deviceKindSchema, deviceStateSchema} from '../components/Device';
import {Device3D} from '../components/Device3D';
import {Pointer} from '../components/Pointer';
import {AppWindow, TextField, UIButton} from '../components/ui';
import {Mark} from '../effects/annotations';
import {SignalWaves} from '../effects/flow';
import {AnimatedText} from '../motion/AnimatedText';
import {useTheme, useUnit} from '../theme';

const frame = z.number().int().nonnegative();

export const deviceDemoSceneSchema = z.object({
  title: z.string().optional(),
  caption: z.string().optional(),
  app: z.string().max(30).default('Remote app'), // window title
  url: z.string().max(40).optional(), // show a browser address bar instead of the title
  input: z
    .object({
      label: z.string().max(30).default('Device name'),
      text: z.string().min(1).max(30),
      placeholder: z.string().max(30).default(''),
      mask: z.boolean().default(false), // password dots
      charsPerSecond: z.number().min(2).max(40).default(10),
    })
    .strict()
    .optional(), // leave out for a button-only demo
  button: z.string().max(24).default('Turn on'),
  buttonColor: z.string().optional(),
  device: z
    .object({
      kind: deviceKindSchema,
      label: z.string().max(30).optional(),
      color: z.string().optional(),
      glow: z.string().optional(),
      mode: z.enum(['3d', '2d']).default('3d'),
    })
    .strict()
    .default({kind: 'tv', label: 'Smart TV', mode: '3d'}),
  before: deviceStateSchema.default('off'),
  after: deviceStateSchema.default('active'),
  status: z.string().max(40).default('Done!'), // shown with a check mark after the click (markup ok)
  wireless: z.boolean().default(true), // waves from the app to the device on click
  startAt: frame.default(15),
});

export const description =
  'How-to demo: an app window with an optional text field (typed, or masked like a password) and a button; a mouse pointer clicks the field, types, presses the button, and a 2D or 3D device changes state (e.g. TV off → on) with a ✓ status line.';
export const tags = ['demo', 'ui', 'button', 'typing', 'pointer', 'device', 'how-to', 'app', 'smart home', '3d'];

// Layout (% of the frame) so the pointer knows where things are.
const PANEL = {left: 7, top: 25, width: 40, height: 56};
const INPUT_Y = 50;
const BUTTON_Y_WITH_INPUT = 65;
const BUTTON_Y = 55;
const CENTER_X = PANEL.left + PANEL.width / 2;
const DEVICE = {x: 73, y: 53};

export const DeviceDemoScene: FC<z.input<typeof deviceDemoSceneSchema>> = (input) => {
  const p = deviceDemoSceneSchema.parse(input);
  const f = useCurrentFrame();
  const {fps} = useVideoConfig();
  const theme = useTheme();
  const u = useUnit();

  // Timeline, all derived from startAt and the text length.
  const s = p.startAt;
  const reachInput = s + 22;
  const typeAt = reachInput + 6;
  const typingEnd = p.input ? typeAt + Math.ceil((p.input.text.length / p.input.charsPerSecond) * fps) : s;
  const buttonY = p.input ? BUTTON_Y_WITH_INPUT : BUTTON_Y;
  const reachButton = (p.input ? typingEnd : s) + 22;
  const clickAt = reachButton + 4;
  const changeAt = clickAt + 8;
  const state = f >= changeAt ? p.after : p.before;

  const path = [
    {x: 62, y: 88, at: s},
    ...(p.input ? [{x: CENTER_X + 6, y: INPUT_Y + 1.5, at: reachInput}, {x: CENTER_X + 6, y: INPUT_Y + 1.5, at: typingEnd}] : []),
    {x: CENTER_X + 3, y: buttonY + 1.5, at: reachButton},
    {x: CENTER_X + 3, y: buttonY + 1.5, at: clickAt + 12},
    {x: CENTER_X + 16, y: buttonY + 14, at: clickAt + 40},
  ];
  const clicks = p.input ? [reachInput + 2, clickAt] : [clickAt];
  const statusIn = interpolate(f, [changeAt + 6, changeAt + 16], [0, 1], {extrapolateLeft: 'clamp', extrapolateRight: 'clamp'});

  return (
    <AbsoluteFill>
      {p.title ? (
        <h2 style={{position: 'absolute', top: 60 * u, width: '100%', margin: 0, fontSize: 70 * u, fontWeight: 800, color: theme.text, textAlign: 'center',
          ...entrance('fade-up', f, fps, u)}}>{p.title}</h2>
      ) : null}

      <div style={{position: 'absolute', left: `${PANEL.left}%`, top: `${PANEL.top}%`, width: `${PANEL.width}%`, height: `${PANEL.height}%`, ...entrance('slide-right', f - 4, fps, u)}}>
        <AppWindow title={p.app} url={p.url} style={{height: '100%'}}>{null}</AppWindow>
      </div>
      {p.input ? (
        <div style={{position: 'absolute', left: `${PANEL.left + 3}%`, width: `${PANEL.width - 6}%`, top: `${INPUT_Y}%`, transform: 'translateY(-72%)'}}>
          <div style={entrance('fade', f - 8, fps, u)}>
            <TextField label={p.input.label} text={p.input.text} placeholder={p.input.placeholder} mask={p.input.mask}
              focusAt={reachInput + 2} typeAt={typeAt} charsPerSecond={p.input.charsPerSecond} />
          </div>
        </div>
      ) : null}
      <div style={{position: 'absolute', left: `${PANEL.left + 3}%`, width: `${PANEL.width - 6}%`, top: `${buttonY}%`, transform: 'translateY(-50%)'}}>
        <div style={entrance('fade', f - 10, fps, u)}>
          <UIButton label={p.button} pressAt={[clickAt]} color={p.buttonColor} />
        </div>
      </div>
      <div style={{position: 'absolute', left: `${PANEL.left + 3}%`, width: `${PANEL.width - 6}%`, top: `${buttonY + 10}%`, display: 'flex', alignItems: 'center',
        gap: 14 * u, opacity: statusIn, fontSize: 32 * u, fontWeight: 700, color: p.after === 'error' ? '#ef4444' : '#22c55e'}}>
        <AnimatedText text={p.status} mode="none" as="span" />
      </div>
      {f >= changeAt ? <Mark kind={p.after === 'error' ? 'cross' : 'check'} at={{x: PANEL.left + PANEL.width - 5, y: buttonY + 10.5}} size={60} startAt={changeAt + 4} /> : null}

      {p.wireless ? (
        <SignalWaves at={{x: PANEL.left + PANEL.width + 1, y: buttonY}} toward={{x: DEVICE.x - 9, y: DEVICE.y - 4}} inset={10} spread={40}
          count={3} speed={1.6} startAt={clickAt} stopAt={changeAt + 30} />
      ) : null}

      <div style={{position: 'absolute', left: `${DEVICE.x}%`, top: `${DEVICE.y}%`, transform: 'translate(-50%, -50%)'}}>
        {p.device.mode === '3d' ? (
          <Device3D kind={p.device.kind} label={p.device.label} state={state} color={p.device.color} glow={p.device.glow} size={600} appearAt={s - 10} />
        ) : (
          <Device kind={p.device.kind} label={p.device.label} state={state} color={p.device.color} glow={p.device.glow} size={300} appearAt={s - 10} />
        )}
      </div>

      {p.caption ? (
        <p style={{position: 'absolute', bottom: 50 * u, width: '100%', margin: 0, fontSize: 36 * u, color: theme.muted, textAlign: 'center',
          ...entrance('fade-up', f - 30, fps, u)}}>{p.caption}</p>
      ) : null}
      <Pointer path={path} clicks={clicks} variant="arrow" appearAt={s} />
    </AbsoluteFill>
  );
};
