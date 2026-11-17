/**
 * `overlays` on any scene in the composition JSON: effects and annotations drawn on top of
 * the scene (2D or 3D). Positions are {"x": %, "y": %} of the frame, or a named spot:
 * "top-left" "top" "top-right" "left" "center" "right" "bottom-left" "bottom" "bottom-right".
 * Frames are scene-relative. Callouts put their label on the side with room unless `offset` is given.
 *
 *   {"id": "s1", "component": "Device3DScene", "props": {...},
 *    "overlays": [
 *      {"type": "flow", "points": [{"x": 30, "y": 50}, {"x": 70, "y": 50}], "effect": "packet", "label": "GET /"},
 *      {"type": "waves", "at": {"x": 30, "y": 40}, "toward": {"x": 70, "y": 40}},
 *      {"type": "callout", "at": {"x": 70, "y": 45}, "label": "The **server**", "startAt": 40},
 *      {"type": "check", "at": {"x": 80, "y": 30}, "startAt": 90},
 *      {"type": "badge", "at": {"x": 20, "y": 30}, "text": 1}
 *
 * All types: flow, waves, callout, check, cross, badge, arrow, pointer, highlight, tooltip, zoom,
 * field, sound, progress, lock, terminal, notification, toggle, chat.
 *    ]}
 */
import type {FC, ReactNode} from 'react';
import {AbsoluteFill} from 'remotion';
import {z} from 'zod';
import {DrawArrow} from '../motion/effects';
import {Pointer, pointerSchema} from '../components/Pointer';
import {Badge, badgeSchema, Callout, calloutSchema, HighlightBox, highlightBoxSchema, Mark, markSchema, Tooltip, tooltipSchema, ZoomLens, zoomLensSchema} from './annotations';
import {FieldLines, fieldSchema, Lock, lockSchema, ProgressBar, progressSchema, SoundWave, soundSchema} from './more';
import {Chat, chatSchema, Notification, notificationSchema, Terminal, terminalSchema, Toggle, toggleSchema} from './ui';
import {FlowPath, flowSchema, pointSchema, SignalWaves, wavesSchema} from './flow';

export const arrowSchema = z
  .object({
    from: pointSchema,
    to: pointSchema,
    startAt: z.number().int().nonnegative().default(0),
    duration: z.number().int().positive().default(22),
    bend: z.number().min(-1).max(1).default(0.25),
    color: z.string().optional(),
    width: z.number().min(1).max(30).default(6),
    label: z.string().max(40).optional(),
    dashed: z.boolean().default(false),
  })
  .strict();

export const overlaySchema = z.discriminatedUnion('type', [
  flowSchema.extend({type: z.literal('flow')}),
  wavesSchema.extend({type: z.literal('waves')}),
  calloutSchema.extend({type: z.literal('callout')}),
  markSchema.extend({type: z.literal('check')}),
  markSchema.extend({type: z.literal('cross')}),
  badgeSchema.extend({type: z.literal('badge')}),
  arrowSchema.extend({type: z.literal('arrow')}),
  pointerSchema.extend({type: z.literal('pointer')}),
  highlightBoxSchema.extend({type: z.literal('highlight')}),
  tooltipSchema.extend({type: z.literal('tooltip')}),
  zoomLensSchema.extend({type: z.literal('zoom')}),
  fieldSchema.extend({type: z.literal('field')}),
  soundSchema.extend({type: z.literal('sound')}),
  progressSchema.extend({type: z.literal('progress')}),
  lockSchema.extend({type: z.literal('lock')}),
  terminalSchema.extend({type: z.literal('terminal')}),
  notificationSchema.extend({type: z.literal('notification')}),
  toggleSchema.extend({type: z.literal('toggle')}),
  chatSchema.extend({type: z.literal('chat')}),
]);
export const overlaysSchema = z.array(overlaySchema).max(40);
export type Overlay = z.input<typeof overlaySchema>;

/** Renders a list of overlays on top of whatever is behind it. `scene` lets the zoom lens magnify it. */
export const Overlays: FC<{items: Overlay[]; scene?: ReactNode}> = ({items, scene}) => (
  <AbsoluteFill style={{pointerEvents: 'none'}}>
    {items.map((o, i) => {
      switch (o.type) {
        case 'flow': {
          const {type: _t, ...rest} = o;
          return <FlowPath key={i} {...rest} />;
        }
        case 'waves': {
          const {type: _t, ...rest} = o;
          return <SignalWaves key={i} {...rest} />;
        }
        case 'callout': {
          const {type: _t, ...rest} = o;
          return <Callout key={i} {...rest} />;
        }
        case 'check':
        case 'cross': {
          const {type, ...rest} = o;
          return <Mark key={i} kind={type} {...rest} />;
        }
        case 'badge': {
          const {type: _t, ...rest} = o;
          return <Badge key={i} {...rest} />;
        }
        case 'arrow': {
          const {type: _t, ...rest} = o;
          return <DrawArrow key={i} {...arrowSchema.parse(rest)} />;
        }
        case 'pointer': {
          const {type: _t, ...rest} = o;
          return <Pointer key={i} {...rest} />;
        }
        default: {
          const {type, ...rest} = o;
          switch (type) {
            case 'highlight': return <HighlightBox key={i} {...(rest as z.input<typeof highlightBoxSchema>)} />;
            case 'tooltip': return <Tooltip key={i} {...(rest as z.input<typeof tooltipSchema>)} />;
            case 'zoom': return <ZoomLens key={i} scene={scene} {...(rest as z.input<typeof zoomLensSchema>)} />;
            case 'field': return <FieldLines key={i} {...(rest as z.input<typeof fieldSchema>)} />;
            case 'sound': return <SoundWave key={i} {...(rest as z.input<typeof soundSchema>)} />;
            case 'progress': return <ProgressBar key={i} {...(rest as z.input<typeof progressSchema>)} />;
            case 'lock': return <Lock key={i} {...(rest as z.input<typeof lockSchema>)} />;
            case 'terminal': return <Terminal key={i} {...(rest as z.input<typeof terminalSchema>)} />;
            case 'notification': return <Notification key={i} {...(rest as z.input<typeof notificationSchema>)} />;
            case 'toggle': return <Toggle key={i} {...(rest as z.input<typeof toggleSchema>)} />;
            case 'chat': return <Chat key={i} {...(rest as z.input<typeof chatSchema>)} />;
            default: return null;
          }
        }
      }
    })}
  </AbsoluteFill>
);
