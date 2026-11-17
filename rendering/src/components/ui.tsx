/**
 * Small UI kit for "how to use it" demos. Frame-driven, sizes in 1080p px (scaled with useUnit).
 *
 *   <AppWindow title="Smart TV">…</AppWindow>
 *   <TextField label="Password" text="hello123" typeAt={40} mask />
 *   <UIButton label="Turn on" pressAt={[120]} />
 */
import type {CSSProperties, FC, ReactNode} from 'react';
import {interpolate, useCurrentFrame, useVideoConfig} from 'remotion';
import {Sfx} from '../audio';
import {useTheme, useUnit} from '../theme';

/** App / browser window: title bar with three dots, rounded body. */
export const AppWindow: FC<{title?: string; children: ReactNode; style?: CSSProperties; url?: string}> = ({title, children, style, url}) => {
  const theme = useTheme();
  const u = useUnit();
  return (
    <div style={{borderRadius: 22 * u, overflow: 'hidden', background: 'rgba(15,23,42,0.92)', border: `${2 * u}px solid rgba(148,163,184,0.25)`,
      boxShadow: `0 ${20 * u}px ${60 * u}px rgba(0,0,0,0.45)`, display: 'flex', flexDirection: 'column', ...style}}>
      <div style={{display: 'flex', alignItems: 'center', gap: 10 * u, padding: `${14 * u}px ${18 * u}px`, background: 'rgba(30,41,59,0.95)'}}>
        {['#ef4444', '#f59e0b', '#22c55e'].map((c) => <span key={c} style={{width: 14 * u, height: 14 * u, borderRadius: '50%', background: c}} />)}
        {url ? (
          <span style={{marginLeft: 12 * u, flex: 1, padding: `${6 * u}px ${14 * u}px`, borderRadius: 10 * u, background: 'rgba(2,6,23,0.6)', color: theme.muted, fontSize: 22 * u}}>{url}</span>
        ) : (
          <span style={{marginLeft: 12 * u, color: theme.muted, fontSize: 24 * u, fontWeight: 600}}>{title}</span>
        )}
      </div>
      <div style={{flex: 1, padding: 34 * u, display: 'flex', flexDirection: 'column', gap: 26 * u}}>{children}</div>
    </div>
  );
};

/** Text input that gets focus and types its text (optionally masked like a password). */
export const TextField: FC<{
  label?: string;
  text: string;
  placeholder?: string;
  focusAt?: number;
  typeAt?: number;
  charsPerSecond?: number;
  mask?: boolean;
  style?: CSSProperties;
}> = ({label, text, placeholder = '', focusAt, typeAt = 0, charsPerSecond = 10, mask = false, style}) => {
  const f = useCurrentFrame();
  const {fps} = useVideoConfig();
  const theme = useTheme();
  const u = useUnit();
  const focused = f >= (focusAt ?? typeAt);
  const n = Math.max(0, Math.min(text.length, Math.floor(((f - typeAt) / fps) * charsPerSecond)));
  const shown = mask ? '•'.repeat(n) : text.slice(0, n);
  const caret = focused && (n < text.length ? true : Math.floor(f / (fps / 2)) % 2 === 0);
  return (
    <label style={{display: 'flex', flexDirection: 'column', gap: 10 * u, ...style}}>
      {label ? <span style={{fontSize: 24 * u, color: theme.muted, fontWeight: 600}}>{label}</span> : null}
      <span style={{display: 'flex', alignItems: 'center', height: 72 * u, padding: `0 ${22 * u}px`, borderRadius: 14 * u, background: 'rgba(2,6,23,0.65)',
        border: `${3 * u}px solid ${focused ? theme.accent : 'rgba(148,163,184,0.35)'}`, fontSize: 32 * u, color: theme.text,
        boxShadow: focused ? `0 0 0 ${6 * u}px color-mix(in srgb, ${theme.accent} 22%, transparent)` : 'none', letterSpacing: mask ? '0.12em' : undefined}}>
        {n === 0 && !focused ? <span style={{color: theme.muted}}>{placeholder}</span> : shown}
        {caret ? <span style={{width: 3 * u, height: 38 * u, marginLeft: 3 * u, background: theme.accent}} /> : null}
      </span>
      <Sfx sound="typing" at={typeAt} duration={Math.ceil((text.length / charsPerSecond) * fps)} loop volume={0.8} />
    </label>
  );
};

/** Button that presses down (and ripples) at the given frames. */
export const UIButton: FC<{label: string; pressAt?: number[]; color?: string; done?: boolean; style?: CSSProperties}> = ({
  label, pressAt = [], color, done = false, style,
}) => {
  const f = useCurrentFrame();
  const theme = useTheme();
  const u = useUnit();
  const bg = color ?? theme.accent;
  const press = Math.max(0, ...pressAt.map((a) => (f >= a && f < a + 8 ? Math.sin(((f - a) / 8) * Math.PI) : 0)));
  const ripples = pressAt.filter((a) => f >= a && f < a + 20);
  return (
    <span style={{position: 'relative', overflow: 'hidden', display: 'flex', alignItems: 'center', justifyContent: 'center', height: 80 * u,
      borderRadius: 16 * u, background: bg, color: '#04121f', fontSize: 34 * u, fontWeight: 800, transform: `scale(${1 - 0.06 * press})`,
      filter: `brightness(${1 - 0.15 * press})`, boxShadow: `0 ${(10 - 8 * press) * u}px ${30 * u}px color-mix(in srgb, ${bg} 45%, transparent)`, ...style}}>
      {ripples.map((a) => {
        const k = interpolate(f - a, [0, 20], [0, 1]);
        return <span key={a} style={{position: 'absolute', left: '50%', top: '50%', width: 600 * u * k, height: 600 * u * k, borderRadius: '50%',
          transform: 'translate(-50%, -50%)', background: 'rgba(255,255,255,0.45)', opacity: 1 - k}} />;
      })}
      <span style={{position: 'relative'}}>{done ? '✓ ' : ''}{label}</span>
    </span>
  );
};
