/** Radio, audio and podcast objects: headphones, mixing console, boom mic, speaker, recorder and booth. */
import type {FC} from 'react';
import type {ArtProps, Geo} from './objects';
import {face} from './objects';
import {IsoBox, IsoCylinder, IsoShadow} from './shapes';
import {PAPER, project, shade, type Pt} from './iso';

export const AUDIO_KINDS = {
  headphones: {size: [1.8, 1.1, 2.1], color: 'lavender'},
  mixingconsole: {size: [3.2, 1.8, 1.1], color: 'teal'},
  boommic: {size: [2.6, 1.6, 2.4], color: 'peach'},
  speaker: {size: [1.8, 1.4, 2.4], color: 'butter'},
  audiorecorder: {size: [2.4, 1.5, 0.9], color: 'slate'},
  podcastbooth: {size: [3.8, 2.8, 2.9], color: 'mint'},
} as const;
export type AudioKind = keyof typeof AUDIO_KINDS;

const line = (T: number, sw: number, k = 1) => (sw * k) / T;
const ink = (T: number, sw: number, k = 0.6) => ({
  stroke: PAPER.ink, strokeWidth: line(T, sw, k), strokeLinejoin: 'round' as const, strokeLinecap: 'round' as const,
});

/** A thick outlined bar between two screen points (boom arms, mic stands). */
const limb = (a: Pt, b: Pt, w: number, color: string, sw: number) => (
  <g>
    <line x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke={PAPER.ink} strokeWidth={w + sw * 1.6} strokeLinecap="round" />
    <line x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke={color} strokeWidth={w} strokeLinecap="round" />
  </g>
);

/** Over-ear headphones: a thick headband, two deep ear cups and a trailing cable. */
const Headphones: FC<ArtProps> = (p) => {
  const {g, zz, T, o, sw, color} = p;
  const c = project(g.x + g.w / 2, g.y + g.d / 2, zz, T, o);
  const half = 0.63 * T, bandW = 0.23 * T;
  const cupW = 0.42 * T, cupH = 0.7 * T;
  const cupY = c.y - cupH + 0.02 * T;
  const top = c.y - 1.84 * T;
  const band = `M${c.x - half},${cupY + 0.1 * T} C${c.x - half - 0.1 * T},${top + 0.68 * T} ${c.x - half + 0.08 * T},${top} ${c.x},${top} C${c.x + half - 0.08 * T},${top} ${c.x + half + 0.1 * T},${top + 0.68 * T} ${c.x + half},${cupY + 0.1 * T}`;
  const cup = (dx: number, rot: number) => (
    <g transform={`translate(${c.x + dx} ${cupY}) rotate(${rot} ${0} ${cupH / 2})`}>
      <rect x={-cupW / 2 + 0.07 * T} y={-0.06 * T} width={cupW} height={cupH} rx={cupW * 0.42} fill={shade(color, -0.34)} {...ink(1, sw, 0.8)} />
      <rect x={-cupW / 2} y={0} width={cupW} height={cupH} rx={cupW * 0.42} fill={color} {...ink(1, sw, 0.8)} />
      <ellipse cx={0} cy={cupH * 0.55} rx={cupW * 0.28} ry={cupH * 0.3} fill={shade(color, -0.12)} {...ink(1, sw, 0.5)} />
      <ellipse cx={0} cy={cupH * 0.55} rx={cupW * 0.16} ry={cupH * 0.2} fill={shade(color, 0.22)} {...ink(1, sw, 0.4)} />
      <circle cx={0} cy={cupH * 0.55} r={0.018 * T} fill={PAPER.ink} />
      <rect x={-0.05 * T} y={-0.08 * T} width={0.1 * T} height={0.13 * T} rx={0.03 * T} fill={shade(color, -0.4)} {...ink(1, sw, 0.45)} />
    </g>
  );
  return <g key={p.id}>
    <ellipse cx={c.x - half} cy={c.y + 0.03 * T} rx={cupW * 0.85} ry={0.09 * T} fill={PAPER.shadow} />
    <ellipse cx={c.x + half} cy={c.y + 0.03 * T} rx={cupW * 0.85} ry={0.09 * T} fill={PAPER.shadow} />
    <path d={band} transform={`translate(${0.1 * T} ${0.06 * T})`} fill="none" stroke={shade(color, -0.4)} strokeWidth={bandW + sw * 1.6} strokeLinecap="round" />
    <path d={band} fill="none" stroke={PAPER.ink} strokeWidth={bandW + sw * 1.4} strokeLinecap="round" />
    <path d={band} fill="none" stroke={shade(color, 0.06)} strokeWidth={bandW} strokeLinecap="round" />
    <path d={band} transform={`translate(${-0.015 * T} ${-0.055 * T})`} fill="none" stroke="#ffffff" strokeOpacity={0.32} strokeWidth={bandW * 0.24} strokeLinecap="round" />
    {cup(-half, -7)}
    {cup(half, 7)}
    <path d={`M${c.x - half - 0.02 * T},${c.y - 0.02 * T} q${-0.14 * T},${0.2 * T} ${0.02 * T},${0.3 * T} q${0.18 * T},${0.13 * T} ${0.04 * T},${0.3 * T}`} fill="none" stroke={PAPER.ink} strokeWidth={sw * 0.9} strokeLinecap="round" />
  </g>;
};

/** Mixing console: a low desk with a meter bridge, channel knobs and faders. */
const MixingConsole: FC<ArtProps> = (p) => {
  const {g, zz, T, o, sw, color} = p;
  const board: Geo = {x: g.x, y: g.y + 0.2, z: zz, w: g.w, d: g.d - 0.4, h: Math.min(0.5, g.h * 0.52)};
  const bridge: Geo = {x: g.x + g.w / 2 - 0.62, y: g.y + 0.02, z: zz, w: 1.24, d: 0.12, h: 0.94};
  const w = board.w, d = board.d;
  const knobs = ['#f4a596', '#b8d6f3', '#f4da93', '#b9e2c7', '#cdc3ee', '#f3b9c6', '#b0dfda', '#f7c6a3'];
  const fader = [0.36, 0.62, 0.24, 0.5, 0.7, 0.34, 0.56, 0.44];
  return <g>
    <IsoShadow x={g.x + 0.1} y={g.y + 0.35} w={g.w - 0.2} d={g.d * 0.55} opacity={0.5} T={T} o={o} sw={sw} />
    <IsoBox id={`${p.id}-bridge`} {...bridge} color={shade(color, -0.3)} T={T} o={o} sw={sw} radius={T * 0.08} />
    <g transform={face('front', bridge, zz, p)}>
      <rect x={0.08} y={0.1} width={bridge.w - 0.16} height={bridge.h - 0.2} rx={0.06} fill="#2f3a55" {...ink(T, sw, 0.6)} />
      <text x={0.18} y={0.3} fontFamily={PAPER.sans} fontWeight={800} fontSize={0.12} fill="#b9e2c7" letterSpacing={0.02}>MIX</text>
      {[0, 1, 2, 3, 4, 5].map((i) => <rect key={i} x={0.2 + i * 0.14} y={0.45} width={0.06} height={0.27} rx={0.03} fill={i % 2 ? '#9ed3a8' : '#9fc4ec'} opacity={0.9} />)}
      <rect x={bridge.w - 0.3} y={0.2} width={0.14} height={0.14} rx={0.07} fill="#f4a596" {...ink(T, sw, 0.4)} />
    </g>
    <IsoBox id={`${p.id}-board`} {...board} color={color} T={T} o={o} sw={sw} radius={T * 0.12} />
    <g transform={face('top', board, zz, p)}>
      <rect x={0.12} y={0.12} width={w - 0.24} height={d - 0.24} rx={0.1} fill={shade(color, 0.22)} {...ink(T, sw, 0.45)} />
      {knobs.map((c, i) => {
        const x = 0.28 + i * ((w - 0.56) / (knobs.length - 1));
        return <g key={`k${i}`}>
          <circle cx={x} cy={0.4} r={0.085} fill={c} {...ink(T, sw, 0.55)} />
          <circle cx={x} cy={0.4} r={0.03} fill={shade(c, -0.35)} />
          <line x1={x} y1={0.4} x2={x} y2={0.335} stroke={PAPER.ink} strokeWidth={line(T, sw, 0.6)} strokeLinecap="round" />
          <circle cx={x} cy={0.73} r={0.052} fill={shade(color, -0.18)} {...ink(T, sw, 0.45)} />
        </g>;
      })}
      {fader.map((v, i) => {
        const x = 0.28 + i * ((w - 0.56) / (fader.length - 1));
        const trackTop = d * 0.62, trackH = d * 0.28, capY = trackTop + (1 - v) * (trackH - 0.12);
        return <g key={`f${i}`}>
          <rect x={x - 0.035} y={trackTop} width={0.07} height={trackH} rx={0.035} fill={shade(color, -0.3)} {...ink(T, sw, 0.4)} />
          <rect x={x - 0.085} y={capY} width={0.17} height={0.12} rx={0.045} fill={knobs[i]} {...ink(T, sw, 0.5)} />
          <line x1={x - 0.055} y1={capY + 0.06} x2={x + 0.055} y2={capY + 0.06} stroke={PAPER.ink} strokeWidth={line(T, sw, 0.35)} opacity={0.55} />
        </g>;
      })}
    </g>
    <g transform={face('front', board, zz, p)}>
      <rect x={0.12} y={0.09} width={w - 0.24} height={board.h - 0.18} rx={0.06} fill={shade(color, -0.22)} {...ink(T, sw, 0.5)} />
      <text x={0.24} y={board.h * 0.63} fontFamily={PAPER.sans} fontWeight={800} fontSize={0.09} fill={PAPER.card}>SOUND BOARD</text>
      {[0, 1, 2].map((i) => <circle key={i} cx={w - 0.6 + i * 0.16} cy={board.h * 0.5} r={0.045} fill={i === 2 ? '#74e08a' : shade(color, -0.45)} {...ink(T, sw, 0.35)} />)}
    </g>
  </g>;
};

/** Boom microphone: weighted desk stand, articulated arm, shock mount and hanging capsule. */
const BoomMic: FC<ArtProps> = (p) => {
  const {g, zz, T, o, sw, color} = p;
  const bx = g.x + 0.46, by = g.y + g.d * 0.66;
  const base = project(bx, by, zz, T, o), top = project(bx, by, zz + 1.38, T, o);
  const j1 = {x: top.x + 0.52 * T, y: top.y - 0.18 * T};
  const j2 = {x: j1.x + 0.62 * T, y: j1.y + 0.26 * T};
  const tip = {x: j2.x + 0.03 * T, y: j2.y + 0.14 * T};
  const cw = {x: top.x - 0.3 * T, y: top.y + 0.04 * T};
  const micW = 0.21 * T, micH = 0.5 * T;
  return <g>
    <IsoShadow x={g.x + 0.12} y={g.y + 0.5} w={g.w - 0.24} d={g.d * 0.42} opacity={0.45} T={T} o={o} sw={sw} />
    <IsoCylinder cx={bx} cy={by} z={zz} r={0.4} h={0.1} color={shade(color, -0.18)} T={T} o={o} sw={sw} bands={0} />
    <circle cx={base.x} cy={base.y - 0.1 * T} r={0.11 * T} fill={shade(color, 0.2)} {...ink(1, sw, 0.5)} />
    {limb(base, top, sw * 1.9, '#4a5068', sw)}
    {limb(top, cw, sw * 1.5, '#6a7088', sw)}
    <circle cx={cw.x} cy={cw.y} r={0.1 * T} fill={shade(color, -0.1)} {...ink(1, sw, 0.55)} />
    {limb(top, j1, sw * 2, '#4a5068', sw)}
    {limb(j1, j2, sw * 1.8, '#5b6478', sw)}
    <circle cx={j1.x} cy={j1.y} r={0.1 * T} fill={shade(color, 0.08)} {...ink(1, sw, 0.6)} />
    <circle cx={j1.x} cy={j1.y} r={0.032 * T} fill={PAPER.ink} />
    <circle cx={j2.x} cy={j2.y} r={0.04 * T} fill={PAPER.ink} opacity={0.8} />
    <g transform={`translate(${j2.x} ${j2.y}) rotate(-24)`}>
      <ellipse cx={0} cy={0.17 * T} rx={0.27 * T} ry={0.105 * T} fill="none" stroke={PAPER.ink} strokeWidth={sw * 1.1} />
      <ellipse cx={0} cy={0.17 * T} rx={0.19 * T} ry={0.07 * T} fill={PAPER.card} opacity={0.25} />
      <rect x={-micW / 2} y={0.02 * T} width={micW} height={micH} rx={micW * 0.42} fill="#4a5068" {...ink(1, sw, 0.8)} />
      <rect x={-micW * 0.34} y={0.08 * T} width={micW * 0.68} height={micH * 0.62} rx={micW * 0.3} fill="#5b6478" />
      {[0.16, 0.24, 0.32].map((v) => <line key={v} x1={-micW * 0.34} y1={v * T + 0.02 * T} x2={micW * 0.34} y2={v * T + 0.02 * T} stroke={PAPER.ink} strokeWidth={sw * 0.35} opacity={0.65} />)}
      <rect x={-micW / 2} y={0.05 * T} width={micW} height={0.055 * T} rx={0.027 * T} fill={color} {...ink(1, sw, 0.45)} />
      <path d={`M0 ${micH + 0.02 * T} q${0.18 * T},${0.24 * T} ${-0.08 * T},${0.42 * T}`} fill="none" stroke={PAPER.ink} strokeWidth={sw * 0.9} strokeLinecap="round" />
    </g>
    <path d={`M${tip.x} ${tip.y} q${-0.4 * T},${0.7 * T} ${-0.75 * T},${1.15 * T}`} fill="none" stroke={PAPER.ink} strokeWidth={sw * 0.7} opacity={0.4} strokeDasharray={`${line(T, sw, 2)} ${line(T, sw, 1.4)}`} />
  </g>;
};

/** Studio monitor speaker: a tall cabinet with a woofer, tweeter and front port. */
const Speaker: FC<ArtProps> = (p) => {
  const {g, zz, T, o, sw, color} = p;
  const body: Geo = {x: g.x + 0.06, y: g.y + 0.32, z: zz + 0.18, w: g.w - 0.12, d: g.d - 0.6, h: g.h - 0.28};
  const w = body.w, h = body.h;
  const woofer = {x: w / 2, y: h * 0.62, r: Math.min(w, h) * 0.31};
  const tweeter = {x: w / 2, y: h * 0.21, r: Math.min(w, h) * 0.14};
  return <g>
    <IsoShadow x={g.x + 0.25} y={g.y + 0.3} w={g.w - 0.5} d={g.d * 0.5} opacity={0.5} T={T} o={o} sw={sw} />
    <IsoBox id={`${p.id}-plinth`} x={g.x + 0.34} y={body.y + 0.1} z={zz} w={g.w - 0.68} d={body.d - 0.2} h={0.18} color={shade(color, -0.4)} T={T} o={o} sw={sw * 0.8} radius={T * 0.06} />
    <IsoBox id={`${p.id}-cabinet`} {...body} color={color} T={T} o={o} sw={sw} radius={T * 0.1} />
    <g transform={face('front', body, body.z, p)}>
      <rect x={0.06} y={0.06} width={w - 0.12} height={h - 0.12} rx={0.08} fill={shade(color, -0.16)} {...ink(T, sw, 0.7)} />
      <circle cx={tweeter.x} cy={tweeter.y} r={tweeter.r * 1.25} fill={shade(color, -0.35)} {...ink(T, sw, 0.55)} />
      <circle cx={tweeter.x} cy={tweeter.y} r={tweeter.r} fill="#3b455c" {...ink(T, sw, 0.55)} />
      <circle cx={tweeter.x} cy={tweeter.y} r={tweeter.r * 0.42} fill="#6a7088" />
      <circle cx={woofer.x} cy={woofer.y} r={woofer.r * 1.18} fill={shade(color, -0.34)} {...ink(T, sw, 0.65)} />
      <circle cx={woofer.x} cy={woofer.y} r={woofer.r} fill="#3b455c" {...ink(T, sw, 0.65)} />
      <circle cx={woofer.x} cy={woofer.y} r={woofer.r * 0.58} fill="#4a5068" {...ink(T, sw, 0.4)} />
      <circle cx={woofer.x} cy={woofer.y} r={woofer.r * 0.24} fill={shade(color, 0.1)} {...ink(T, sw, 0.4)} />
      <ellipse cx={woofer.x - woofer.r * 0.28} cy={woofer.y - woofer.r * 0.34} rx={woofer.r * 0.3} ry={woofer.r * 0.14} fill="#ffffff" opacity={0.22} />
      <rect x={w / 2 - w * 0.18} y={h - 0.22} width={w * 0.36} height={0.1} rx={0.05} fill="#2f3a55" {...ink(T, sw, 0.45)} />
      <circle cx={0.16} cy={0.16} r={0.035} fill="#74e08a" {...ink(T, sw, 0.3)} />
      <text x={w - 0.16} y={h - 0.06} textAnchor="end" fontFamily={PAPER.sans} fontWeight={800} fontSize={0.07} fill={PAPER.ink} opacity={0.55}>AUDIO</text>
    </g>
  </g>;
};

/** Handheld field recorder: a low deck with a waveform screen, transport keys and XLR inputs. */
const AudioRecorder: FC<ArtProps> = (p) => {
  const {g, zz, T, o, sw, color} = p;
  const body: Geo = {x: g.x, y: g.y + 0.14, z: zz, w: g.w, d: g.d - 0.28, h: Math.min(0.58, g.h * 0.6)};
  const w = body.w, d = body.d;
  const btn = ['#e5604f', '#74e08a', '#b8d6f3'];
  return <g>
    <IsoShadow x={g.x + 0.1} y={g.y + 0.25} w={g.w - 0.2} d={g.d * 0.55} opacity={0.5} T={T} o={o} sw={sw} />
    <IsoBox id={`${p.id}-body`} {...body} color={color} T={T} o={o} sw={sw} radius={T * 0.14} />
    <g transform={face('top', body, zz, p)}>
      <rect x={0.1} y={0.1} width={w - 0.2} height={d - 0.2} rx={0.08} fill={shade(color, 0.2)} {...ink(T, sw, 0.45)} />
      <rect x={0.18} y={0.18} width={w * 0.52} height={d - 0.36} rx={0.06} fill="#2f3a55" {...ink(T, sw, 0.65)} />
      <text x={0.3} y={0.36} fontFamily={PAPER.sans} fontWeight={800} fontSize={0.09} fill="#f4a596">REC</text>
      <text x={w * 0.62} y={0.36} textAnchor="end" fontFamily={PAPER.font} fontSize={0.1} fill="#fffaf1">00:12:48</text>
      {[0.36, 0.52, 0.24, 0.62, 0.44, 0.7, 0.3, 0.56, 0.4].map((v, i) => (
        <rect key={i} x={0.26 + i * (w * 0.44 / 9)} y={d * 0.56 - v * 0.18} width={w * 0.028} height={v * 0.36} rx={0.014} fill={i % 3 === 0 ? '#f4da93' : '#9ed3a8'} />
      ))}
      <line x1={0.26} y1={d * 0.72} x2={w * 0.61} y2={d * 0.72} stroke="#fffaf1" strokeWidth={line(T, sw, 0.35)} opacity={0.35} />
      {btn.map((c, i) => <g key={c}>
        <circle cx={w * 0.72} cy={0.28 + i * 0.19} r={0.062} fill={c} {...ink(T, sw, 0.5)} />
        {i === 0 ? <circle cx={w * 0.72} cy={0.28} r={0.026} fill={PAPER.card} /> : null}
        {i === 1 ? <path d={`M${w * 0.72 - 0.025} ${0.245} l0.06 0.035 l-0.06 0.035 Z`} fill={PAPER.ink} /> : null}
        {i === 2 ? <rect x={w * 0.72 - 0.024} y={0.655} width={0.048} height={0.048} fill={PAPER.ink} /> : null}
      </g>)}
      <circle cx={w * 0.9} cy={d * 0.58} r={0.14} fill={shade(color, -0.3)} {...ink(T, sw, 0.65)} />
      <circle cx={w * 0.9} cy={d * 0.58} r={0.095} fill={shade(color, 0.2)} {...ink(T, sw, 0.45)} />
      <line x1={w * 0.9} y1={d * 0.58} x2={w * 0.9} y2={d * 0.58 - 0.08} stroke={PAPER.ink} strokeWidth={line(T, sw, 0.6)} strokeLinecap="round" />
    </g>
    <g transform={face('front', body, zz, p)}>
      <rect x={0.12} y={0.08} width={w - 0.24} height={body.h - 0.16} rx={0.05} fill={shade(color, -0.18)} {...ink(T, sw, 0.45)} />
      {[0, 1].map((i) => <g key={i} transform={`translate(${0.42 + i * 0.55} ${body.h * 0.5})`}>
        <circle r={0.11} fill={shade(color, -0.4)} {...ink(T, sw, 0.55)} />
        <circle r={0.075} fill="#2f3a55" {...ink(T, sw, 0.4)} />
        {[0, 1, 2].map((k) => <circle key={k} cx={Math.cos((k * 2 * Math.PI) / 3) * 0.035} cy={Math.sin((k * 2 * Math.PI) / 3) * 0.035} r={0.012} fill="#d9b45a" />)}
      </g>)}
      <text x={w - 0.22} y={body.h * 0.58} textAnchor="end" fontFamily={PAPER.sans} fontWeight={800} fontSize={0.08} fill={PAPER.card}>FIELD</text>
      <circle cx={w - 0.28} cy={body.h * 0.32} r={0.022} fill={PAPER.bad} />
    </g>
  </g>;
};

/** A small desk microphone on a table top (screen-space, used inside the booth). */
const DeskMic: FC<{at: Pt; T: number; sw: number; flip: number; color: string}> = ({at, T, sw, flip, color}) => (
  <g>
    <ellipse cx={at.x} cy={at.y + 0.02 * T} rx={0.13 * T} ry={0.05 * T} fill={PAPER.shadow} />
    <ellipse cx={at.x} cy={at.y} rx={0.14 * T} ry={0.055 * T} fill={shade(color, -0.15)} {...ink(T, sw, 0.6)} />
    <line x1={at.x} y1={at.y} x2={at.x + flip * 0.04 * T} y2={at.y - 0.62 * T} stroke={PAPER.ink} strokeWidth={sw * 1.6} strokeLinecap="round" />
    <g transform={`translate(${at.x + flip * 0.06 * T} ${at.y - 0.7 * T}) rotate(${flip * 22})`}>
      <ellipse cx={0} cy={0.02 * T} rx={0.12 * T} ry={0.05 * T} fill="none" stroke={PAPER.ink} strokeWidth={sw * 0.8} />
      <rect x={-0.095 * T} y={-0.15 * T} width={0.19 * T} height={0.32 * T} rx={0.095 * T} fill="#4a5068" {...ink(T, sw, 0.7)} />
      <rect x={-0.072 * T} y={-0.12 * T} width={0.144 * T} height={0.21 * T} rx={0.072 * T} fill="#5b6478" />
      {[0.065, 0.095, 0.125, 0.155].map((v) => <line key={v} x1={-0.068 * T} y1={-v * T} x2={0.068 * T} y2={-v * T} stroke="#8890a8" strokeWidth={sw * 0.4} />)}
      <rect x={-0.095 * T} y={-0.13 * T} width={0.19 * T} height={0.04 * T} rx={0.02 * T} fill={color} />
    </g>
  </g>
);

/** A tiny pair of headphones lying on the booth table (screen-space). */
const DeskHeadphones: FC<{at: Pt; T: number; sw: number; color: string}> = ({at, T, sw, color}) => (
  <g transform={`translate(${at.x} ${at.y})`}>
    <ellipse cx={0} cy={0.02 * T} rx={0.28 * T} ry={0.075 * T} fill={PAPER.shadow} />
    <path d={`M${-0.21 * T},${-0.02 * T} C${-0.26 * T},${-0.3 * T} ${0.26 * T},${-0.3 * T} ${0.21 * T},${-0.02 * T}`} fill="none" stroke={PAPER.ink} strokeWidth={sw * 1.5} strokeLinecap="round" />
    <path d={`M${-0.21 * T},${-0.02 * T} C${-0.26 * T},${-0.3 * T} ${0.26 * T},${-0.3 * T} ${0.21 * T},${-0.02 * T}`} fill="none" stroke={color} strokeWidth={sw * 0.9} strokeLinecap="round" />
    {[-0.21, 0.21].map((x) => <g key={x}>
      <rect x={x * T - 0.07 * T} y={-0.075 * T} width={0.14 * T} height={0.18 * T} rx={0.055 * T} fill={shade(color, -0.1)} {...ink(T, sw, 0.55)} />
      <ellipse cx={x * T} cy={0.015 * T} rx={0.035 * T} ry={0.05 * T} fill={shade(color, 0.3)} />
    </g>)}
  </g>
);

/** Acoustic foam: a diamond grid on a wall face. */
const Foam: FC<{x: number; y: number; w: number; h: number; color: string; T: number; sw: number}> = ({x, y, w, h, color, T, sw}) => {
  const s = 0.2, cols = Math.max(2, Math.floor(w / s)), rows = Math.max(2, Math.floor(h / s));
  const cw = w / cols, ch = h / rows;
  const cells = [];
  for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
    const cx = x + cw * (c + 0.5), cy = y + ch * (r + 0.5), on = (r + c) % 2 === 0;
    cells.push(<path key={`${r}-${c}`} d={`M${cx} ${cy - ch * 0.42} L${cx + cw * 0.42} ${cy} L${cx} ${cy + ch * 0.42} L${cx - cw * 0.42} ${cy} Z`}
      fill={on ? shade(color, 0.24) : shade(color, -0.05)} stroke={shade(color, -0.28)} strokeWidth={line(T, sw, 0.3)} />);
  }
  return <g>
    <rect x={x} y={y} width={w} height={h} rx={0.08} fill={shade(color, 0.05)} {...ink(T, sw, 0.5)} />
    {cells}
    <rect x={x} y={y} width={w} height={h} rx={0.08} fill="none" {...ink(T, sw, 0.6)} />
  </g>;
};

/** Podcast booth: an open studio corner with foam walls, ON AIR sign, table, mics and headphones. */
const PodcastBooth: FC<ArtProps> = (p) => {
  const {g, zz, T, o, sw, color} = p;
  const floorH = 0.18, wallH = g.h - floorH;
  const floor: Geo = {x: g.x, y: g.y, z: zz, w: g.w, d: g.d, h: floorH};
  const back: Geo = {x: g.x, y: g.y, z: zz + floorH, w: g.w, d: 0.16, h: wallH};
  const side: Geo = {x: g.x, y: g.y + 0.16, z: zz + floorH, w: 0.16, d: g.d - 0.16, h: wallH};
  const tableW = Math.min(1.85, g.w * 0.54), tableD = 0.82;
  const table: Geo = {x: g.x + (g.w - tableW) / 2, y: g.y + g.d - tableD - 0.52, z: zz + floorH, w: tableW, d: tableD, h: 0.5};
  const floorTop = zz + floorH, tableTop = floorTop + table.h;
  const micL = project(table.x + 0.4, table.y + tableD - 0.25, tableTop, T, o);
  const micR = project(table.x + tableW - 0.4, table.y + tableD - 0.25, tableTop, T, o);
  const hp = project(table.x + tableW / 2, table.y + 0.2, tableTop, T, o);
  const panelX = 0.18, panelY = 0.62, panelW = back.w - 0.36, panelH = wallH - 0.8;
  return <g>
    <IsoShadow x={g.x} y={g.y} w={g.w} d={g.d} opacity={0.6} T={T} o={o} sw={sw} />
    <IsoBox id={`${p.id}-floor`} {...floor} color={shade(color, -0.22)} T={T} o={o} sw={sw} radius={T * 0.06} />
    <g transform={face('top', floor, zz, p)}>
      <rect x={0.35} y={0.35} width={g.w - 0.7} height={g.d - 0.7} rx={0.22} fill={shade('#f7c6a3', 0.12)} {...ink(T, sw, 0.5)} />
      <rect x={0.55} y={0.55} width={g.w - 1.1} height={g.d - 1.1} rx={0.16} fill="none" stroke={shade('#f7c6a3', -0.3)} strokeWidth={line(T, sw, 0.6)} strokeDasharray={`${line(T, sw, 2.4)} ${line(T, sw, 1.6)}`} />
    </g>
    <IsoBox id={`${p.id}-back`} {...back} color={color} T={T} o={o} sw={sw} radius={T * 0.04} />
    <g transform={face('front', back, back.z, p)}>
      <rect x={0.1} y={0.12} width={back.w - 0.2} height={wallH - 0.24} rx={0.06} fill={shade(color, 0.14)} {...ink(T, sw, 0.45)} />
      <Foam x={panelX} y={panelY} w={panelW} h={panelH} color={color} T={T} sw={sw} />
      <g transform={`translate(${back.w / 2 - 0.62} ${0.2})`}>
        <rect x={-0.05} y={-0.03} width={1.34} height={0.4} rx={0.1} fill={PAPER.bad} opacity={0.18} />
        <rect width={1.24} height={0.34} rx={0.08} fill={PAPER.bad} {...ink(T, sw, 0.65)} />
        <circle cx={0.12} cy={0.17} r={0.035} fill="#fffaf1" opacity={0.9} />
        <text x={0.68} y={0.225} textAnchor="middle" fontFamily={PAPER.sans} fontWeight={800} fontSize={0.15} fill="#fffaf1" letterSpacing={0.02}>ON AIR</text>
        <circle cx={1.12} cy={0.17} r={0.035} fill="#fffaf1" opacity={0.9} />
      </g>
      <circle cx={0.4} cy={0.35} r={0.14} fill={PAPER.card} {...ink(T, sw, 0.45)} />
      <line x1={0.4} y1={0.35} x2={0.4} y2={0.26} stroke={PAPER.ink} strokeWidth={line(T, sw, 0.5)} strokeLinecap="round" />
      <line x1={0.4} y1={0.35} x2={0.47} y2={0.38} stroke={PAPER.ink} strokeWidth={line(T, sw, 0.4)} strokeLinecap="round" />
      <rect x={0.1} y={wallH - 0.26} width={back.w - 0.2} height={0.14} fill={shade(color, -0.25)} />
    </g>
    <IsoBox id={`${p.id}-side`} {...side} color={shade(color, -0.12)} T={T} o={o} sw={sw} radius={T * 0.04} />
    <g transform={face('side', side, side.z, p)}>
      <rect x={0.1} y={0.12} width={side.d - 0.2} height={wallH - 0.24} rx={0.06} fill={shade(color, 0.02)} {...ink(T, sw, 0.45)} />
      <Foam x={panelX} y={panelY} w={side.d - 0.36} h={panelH} color={color} T={T} sw={sw} />
      <rect x={0.32} y={0.24} width={side.d - 0.64} height={0.3} rx={0.05} fill={PAPER.card} {...ink(T, sw, 0.5)} />
      <path d={`M${0.42} ${0.39} q${0.12} ${-0.12} ${0.24} 0 q${0.12} ${0.12} ${0.24} 0 q${0.12} ${-0.12} ${0.24} 0`} fill="none" stroke={PAPER.bad} strokeWidth={line(T, sw, 0.6)} strokeLinecap="round" />
      <text x={side.d / 2} y={0.49} textAnchor="middle" fontFamily={PAPER.sans} fontWeight={700} fontSize={0.055} fill={PAPER.inkSoft}>PODCAST</text>
      <rect x={0.1} y={wallH - 0.26} width={side.d - 0.2} height={0.14} fill={shade(color, -0.3)} />
    </g>
    <IsoBox id={`${p.id}-table`} {...table} color="#f4da93" T={T} o={o} sw={sw} radius={T * 0.08} />
    <g transform={face('front', table, table.z, p)}>
      <rect x={0.12} y={0.1} width={table.w - 0.24} height={table.h - 0.2} rx={0.06} fill={shade('#f4da93', -0.18)} {...ink(T, sw, 0.5)} />
      <rect x={table.w / 2 - 0.42} y={table.h * 0.28} width={0.84} height={0.2} rx={0.05} fill={PAPER.card} {...ink(T, sw, 0.4)} />
      <text x={table.w / 2} y={table.h * 0.42} textAnchor="middle" fontFamily={PAPER.sans} fontWeight={800} fontSize={0.09} fill={PAPER.ink}>PODCAST</text>
    </g>
    <g transform={face('top', table, table.z, p)}>
      <rect x={0.14} y={0.12} width={table.w - 0.28} height={table.d - 0.24} rx={0.07} fill={shade('#f4da93', 0.24)} {...ink(T, sw, 0.35)} />
      <rect x={0.28} y={0.22} width={0.44} height={0.3} rx={0.03} fill={PAPER.card} {...ink(T, sw, 0.4)} />
      <rect x={0.34} y={0.28} width={0.32} height={0.045} fill={PAPER.ink} opacity={0.55} />
      <rect x={0.34} y={0.36} width={0.22} height={0.035} fill={PAPER.ink} opacity={0.3} />
    </g>
    <DeskMic at={micL} T={T} sw={sw} flip={1} color="#f4a596" />
    <DeskMic at={micR} T={T} sw={sw} flip={-1} color="#b8d6f3" />
    <DeskHeadphones at={hp} T={T} sw={sw} color="#cdc3ee" />
  </g>;
};

export const AudioArt: FC<ArtProps & {kind: AudioKind}> = (p) => {
  switch (p.kind) {
    case 'headphones': return <Headphones {...p} />;
    case 'mixingconsole': return <MixingConsole {...p} />;
    case 'boommic': return <BoomMic {...p} />;
    case 'speaker': return <Speaker {...p} />;
    case 'audiorecorder': return <AudioRecorder {...p} />;
    case 'podcastbooth': return <PodcastBooth {...p} />;
  }
};
