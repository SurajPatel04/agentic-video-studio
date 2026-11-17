// Generate the built-in sound effects with code (no downloads, no third party), saved once and reused.
// Usage: npm run sfx   -> public/sfx/<name>.wav (stereo, 44.1 kHz)
// Deterministic: a seeded random generator, so the files are identical every run.
// Names must match sfxNames in src/audio/index.tsx.
import {mkdir, writeFile} from 'node:fs/promises';
import path from 'node:path';

const RATE = 44100;
const out = path.join(import.meta.dirname, '..', 'public', 'sfx');

let seed = 1234567;
const rand = () => {
  seed = (seed * 1664525 + 1013904223) >>> 0;
  return seed / 4294967296;
};
const noise = () => rand() * 2 - 1;
const TAU = Math.PI * 2;

/* ------------------------------------------------------------------ building blocks */

/** Buffer of `sec` seconds; fn(t, i) returns a sample in -1..1. */
const render = (sec, fn) => Float32Array.from({length: Math.round(sec * RATE)}, (_, i) => fn(i / RATE, i));
const mix = (...bufs) => {
  const len = Math.max(...bufs.map((b) => b.length));
  return Float32Array.from({length: len}, (_, i) => bufs.reduce((s, b) => s + (b[i] ?? 0), 0));
};
const delay = (buf, sec) => {
  const o = new Float32Array(buf.length + Math.round(sec * RATE));
  o.set(buf, Math.round(sec * RATE));
  return o;
};
const gain = (buf, g) => buf.map((v) => v * g);
const env = (t, attack, decay) => (t < attack ? t / attack : Math.exp(-(t - attack) / decay));
/** Smooth swell: 0 -> 1 -> 0 over `dur`, peaking at `peak` (0..1). */
const swell = (t, dur, peak = 0.5) => {
  const x = Math.min(1, Math.max(0, t / dur));
  return x < peak ? Math.sin((Math.PI / 2) * (x / peak)) ** 2 : Math.cos((Math.PI / 2) * ((x - peak) / (1 - peak))) ** 2;
};

/** Oscillator with a pitch that can change over time (phase-continuous). */
const tone = (sec, freqAt, amp = (t) => 1, shape = Math.sin) => {
  let ph = 0;
  return render(sec, (t) => {
    ph += (TAU * freqAt(t)) / RATE;
    return shape(ph) * amp(t);
  });
};
const soft = (ph) => Math.tanh(1.6 * Math.sin(ph)) / Math.tanh(1.6); // warm, slightly rounded sine
const tri = (ph) => (2 / Math.PI) * Math.asin(Math.sin(ph));

/** Biquad filter (RBJ cookbook); type lowpass | highpass | bandpass; cutoff may change over time. */
const biquad = (buf, type, cutoffAt, q = 0.707) => {
  const o = new Float32Array(buf.length);
  let x1 = 0, x2 = 0, y1 = 0, y2 = 0;
  for (let i = 0; i < buf.length; i++) {
    const f = Math.min(RATE * 0.45, Math.max(20, typeof cutoffAt === 'function' ? cutoffAt(i / RATE) : cutoffAt));
    const w = (TAU * f) / RATE, cw = Math.cos(w), al = Math.sin(w) / (2 * q);
    let b0, b1, b2;
    if (type === 'lowpass') [b0, b1, b2] = [(1 - cw) / 2, 1 - cw, (1 - cw) / 2];
    else if (type === 'highpass') [b0, b1, b2] = [(1 + cw) / 2, -(1 + cw), (1 + cw) / 2];
    else [b0, b1, b2] = [al, 0, -al];
    const a0 = 1 + al, a1 = -2 * cw, a2 = 1 - al;
    const y = (b0 * buf[i] + b1 * x1 + b2 * x2 - a1 * y1 - a2 * y2) / a0;
    x2 = x1; x1 = buf[i]; y2 = y1; y1 = y;
    o[i] = y;
  }
  return o;
};

/** Bell / glass tone: inharmonic partials, the high ones dying first. */
const bell = (f, dur = 1.2, bright = 1) => render(dur, (t) => (
  Math.sin(TAU * f * t) * env(t, 0.002, dur * 0.3)
  + 0.5 * bright * Math.sin(TAU * f * 2.0 * t) * env(t, 0.001, dur * 0.12)
  + 0.28 * bright * Math.sin(TAU * f * 2.76 * t) * env(t, 0.001, dur * 0.06)
  + 0.12 * bright * Math.sin(TAU * f * 5.4 * t) * env(t, 0.0005, dur * 0.03)
));
/** Marimba-ish mallet: warm fundamental + a quick 4th harmonic knock. */
const mallet = (f, dur = 0.6) => render(dur, (t) => (
  Math.sin(TAU * f * t) * env(t, 0.002, dur * 0.28) + 0.35 * Math.sin(TAU * f * 4 * t) * env(t, 0.001, 0.02)
));
const noiseBurst = (sec, decay, cutoff = 6000, type = 'lowpass') => biquad(render(sec, (t) => noise() * env(t, 0.0005, decay)), type, cutoff);

/** Small-room / hall reverb (Schroeder: 4 combs + 2 all-passes); different delays per side for width. */
const reverb = (buf, {size = 1, decay = 0.6, wet = 0.25, side = 0} = {}) => {
  const tail = Math.round(RATE * (0.3 + decay * 1.4));
  const x = new Float32Array(buf.length + tail);
  x.set(buf);
  const combs = [1116, 1188, 1277, 1356].map((d) => Math.round((d + side * 23) * size));
  const y = new Float32Array(x.length);
  for (const d of combs) {
    const line = new Float32Array(d);
    let idx = 0, lp = 0;
    const fb = Math.pow(0.001, d / RATE / (0.25 + decay * 2.2));
    for (let i = 0; i < x.length; i++) {
      const outS = line[idx];
      lp = outS * 0.7 + lp * 0.3; // damping: darker tail
      line[idx] = x[i] + lp * fb;
      idx = (idx + 1) % d;
      y[i] += outS / combs.length;
    }
  }
  for (const d of [556 + side * 7, 225 + side * 3]) {
    const line = new Float32Array(d);
    let idx = 0;
    for (let i = 0; i < y.length; i++) {
      const b = line[idx];
      const v = y[i] + b * -0.5;
      line[idx] = v;
      y[i] = b + v * 0.5;
      idx = (idx + 1) % d;
    }
  }
  return Float32Array.from(x, (v, i) => v * (1 - wet * 0.5) + y[i] * wet);
};

/** Stereo: dry signal panned (-1 left .. 1 right, may move over time) with a wide reverb. */
const stereo = (buf, {pan = () => 0, rev = {}} = {}) => {
  const p = typeof pan === 'function' ? pan : () => pan;
  const placed = (sideSign) => Float32Array.from(buf, (v, i) => v * Math.sqrt(0.5 * (1 + sideSign * p(i / RATE))));
  const L = reverb(placed(-1), {...rev, side: 0});
  const R = reverb(placed(1), {...rev, side: 1});
  return [L, R];
};

const normalize = ([L, R], peak = 0.8) => {
  const m = [L, R].reduce((a, b) => b.reduce((x, v) => Math.max(x, Math.abs(v)), a), 0) || 1;
  // trim the silent tail and fade the last 10 ms so files end cleanly
  let end = Math.max(L.length, R.length);
  while (end > RATE * 0.05 && Math.abs(L[end - 1] ?? 0) / m < 0.0008 && Math.abs(R[end - 1] ?? 0) / m < 0.0008) end--;
  const fade = Math.round(RATE * 0.01);
  const f = (b) => Float32Array.from({length: end}, (_, i) => ((b[i] ?? 0) / m) * peak * Math.min(1, (end - i) / fade));
  return [f(L), f(R)];
};

const wav = ([L, R]) => {
  const n = L.length;
  const data = Buffer.alloc(n * 4);
  const s16 = (v) => Math.max(-32768, Math.min(32767, Math.round(v * 32767)));
  for (let i = 0; i < n; i++) {
    data.writeInt16LE(s16(L[i]), i * 4);
    data.writeInt16LE(s16(R[i]), i * 4 + 2);
  }
  const h = Buffer.alloc(44);
  h.write('RIFF', 0); h.writeUInt32LE(36 + data.length, 4); h.write('WAVE', 8);
  h.write('fmt ', 12); h.writeUInt32LE(16, 16); h.writeUInt16LE(1, 20); h.writeUInt16LE(2, 22);
  h.writeUInt32LE(RATE, 24); h.writeUInt32LE(RATE * 4, 28); h.writeUInt16LE(4, 32); h.writeUInt16LE(16, 34);
  h.write('data', 36); h.writeUInt32LE(data.length, 40);
  return Buffer.concat([h, data]);
};

const ROOM = {size: 0.6, decay: 0.25, wet: 0.18};
const HALL = {size: 1, decay: 0.7, wet: 0.32};

/* ------------------------------------------------------------------ the sounds */

const sounds = {
  // UI click: crisp tick with a little body.
  click: () => normalize(stereo(mix(
    noiseBurst(0.015, 0.0018, 7000, 'highpass'),
    tone(0.04, () => 2400, (t) => env(t, 0.0003, 0.005) * 0.5),
    tone(0.05, () => 320, (t) => env(t, 0.001, 0.008) * 0.4),
  ), {rev: ROOM}), 0.6),

  // Pop: round bubble that drops in pitch.
  pop: () => normalize(stereo(mix(
    tone(0.14, (t) => 260 + 720 * Math.exp(-t * 32), (t) => env(t, 0.002, 0.035), soft),
    noiseBurst(0.01, 0.0015, 3000),
  ), {rev: ROOM}), 0.7),

  // Whoosh: airy band-passed noise that sweeps up and down and moves left to right.
  whoosh: () => normalize(stereo(gain(
    biquad(render(0.7, () => noise()), 'bandpass', (t) => 400 + 2600 * swell(t, 0.7, 0.55), 0.9).map((v, i) => v * swell(i / RATE, 0.7, 0.55) ** 1.4), 1,
  ), {pan: (t) => -0.7 + (t / 0.7) * 1.4, rev: {...ROOM, wet: 0.22}}), 0.55),

  // Typing: ~2 s of soft key presses at an uneven rhythm (looped while text types).
  typing: () => {
    const key = () => {
      const pitch = 1600 + rand() * 900;
      return mix(
        noiseBurst(0.03, 0.0035, 4500),
        tone(0.03, () => pitch, (t) => env(t, 0.0004, 0.0025) * 0.25),
        tone(0.05, () => 130 + rand() * 50, (t) => env(t, 0.001, 0.009) * 0.45),
      );
    };
    const parts = [];
    for (let t = 0.02; t < 1.93; t += 0.065 + rand() * 0.07) parts.push(gain(delay(key(), t), 0.7 + rand() * 0.3));
    const all = mix(...parts);
    const [L, R] = stereo(Float32Array.from({length: 2 * RATE}, (_, i) => all[i] ?? 0), {rev: {size: 0.5, decay: 0.12, wet: 0.12}});
    return normalize([L.slice(0, 2 * RATE), R.slice(0, 2 * RATE)], 0.5); // exactly 2 s so it loops cleanly
  },

  // Ding: clear bell with a hall tail.
  ding: () => normalize(stereo(bell(1318.5, 1.4), {rev: HALL}), 0.55),

  // Success: bright rising marimba arpeggio (C E G C) with a sparkle on top.
  success: () => normalize(stereo(mix(
    mallet(523.25), delay(mallet(659.25), 0.08), delay(mallet(783.99), 0.16), delay(mallet(1046.5, 0.9), 0.24),
    delay(gain(bell(2093, 0.8, 0.5), 0.25), 0.26),
  ), {rev: HALL}), 0.6),

  // Error: two soft falling tones (not harsh).
  error: () => normalize(stereo(mix(
    tone(0.22, (t) => 392 - t * 160, (t) => env(t, 0.004, 0.08), tri),
    delay(tone(0.3, (t) => 311 - t * 140, (t) => env(t, 0.004, 0.1), tri), 0.17),
  ), {rev: ROOM}), 0.5),

  // Lock: metallic latch click and a short ring.
  lock: () => normalize(stereo(mix(
    noiseBurst(0.04, 0.004, 5000, 'highpass'),
    tone(0.06, () => 3200, (t) => env(t, 0.0004, 0.008)),
    delay(mix(noiseBurst(0.05, 0.006, 3500), tone(0.25, () => 2400, (t) => env(t, 0.0005, 0.03)), tone(0.25, () => 4100, (t) => env(t, 0.0005, 0.02) * 0.5)), 0.07),
  ), {rev: ROOM}), 0.65),

  // Notification: soft two-tone glass pling.
  notify: () => normalize(stereo(mix(bell(880, 0.7, 0.6), delay(bell(1318.5, 1, 0.6), 0.11)), {rev: HALL}), 0.5),

  /* ---- new ---- */

  // Drop: something lands on the table (soft thump + wooden tap). For objects appearing.
  drop: () => normalize(stereo(mix(
    tone(0.25, (t) => 70 + 110 * Math.exp(-t * 30), (t) => env(t, 0.002, 0.06), soft),
    gain(noiseBurst(0.03, 0.004, 2200), 0.5),
    tone(0.06, () => 820, (t) => env(t, 0.0005, 0.01) * 0.25),
  ), {rev: ROOM}), 0.7),

  // Chime: gentle glass tone, for highlighting something.
  chime: () => normalize(stereo(mix(bell(1567.98, 1.2, 0.5), gain(bell(2349.3, 0.9, 0.3), 0.35)), {rev: HALL}), 0.45),

  // Blip: short friendly up-blip, for a note or label appearing.
  blip: () => normalize(stereo(tone(0.09, (t) => 900 + t * 5000, (t) => env(t, 0.003, 0.025), soft), {rev: ROOM}), 0.5),

  // Alert: two-tone warning pulse (overload, failure, danger).
  alert: () => {
    const beep = (f) => tone(0.13, () => f, (t) => swell(t, 0.13, 0.15), tri);
    return normalize(stereo(mix(beep(880), delay(beep(660), 0.16), delay(beep(880), 0.32), delay(beep(660), 0.48)), {rev: ROOM}), 0.5);
  },

  // Remove: falling zip, for something leaving or switching off.
  remove: () => normalize(stereo(mix(
    tone(0.35, (t) => 900 * Math.exp(-t * 6) + 120, (t) => swell(t, 0.35, 0.1) * 0.8, soft),
    gain(biquad(render(0.35, () => noise()), 'bandpass', (t) => 3000 * Math.exp(-t * 5) + 300, 1.2).map((v, i) => v * swell(i / RATE, 0.35, 0.1)), 0.6),
  ), {pan: (t) => 0.3 - t, rev: ROOM}), 0.5),

  // Rise: upward riser, for a reveal or zooming in.
  rise: () => normalize(stereo(mix(
    biquad(render(1, () => noise()), 'bandpass', (t) => 300 + 4000 * t * t, 1.5).map((v, i) => v * (i / RATE) ** 2),
    tone(1, (t) => 220 * 2 ** (t * 1.5), (t) => (t ** 2) * 0.35, soft),
  ), {rev: HALL}), 0.5),

  // Swipe: quick short swish, for a card or slide moving.
  swipe: () => normalize(stereo(
    biquad(render(0.25, () => noise()), 'bandpass', (t) => 1200 + 5000 * swell(t, 0.25, 0.4), 1.2).map((v, i) => v * swell(i / RATE, 0.25, 0.4) ** 1.5),
    {pan: (t) => -0.5 + t * 4, rev: ROOM}), 0.5),

  // Tick: clock tick, for counting or time passing.
  tick: () => normalize(stereo(mix(noiseBurst(0.02, 0.0012, 4000, 'highpass'), tone(0.03, () => 1900, (t) => env(t, 0.0002, 0.003) * 0.6)), {rev: {...ROOM, wet: 0.1}}), 0.5),

  // Sparkle: shimmering little glints, for something new or magical.
  sparkle: () => {
    const glints = [];
    for (let k = 0; k < 14; k++) glints.push(delay(gain(bell(2400 + rand() * 3200, 0.35, 0.3), 0.3 + rand() * 0.4), k * 0.045 + rand() * 0.02));
    return normalize(stereo(mix(...glints), {pan: (t) => Math.sin(t * 14) * 0.6, rev: HALL}), 0.45);
  },

  // Impact: deep boom for a big moment.
  impact: () => normalize(stereo(mix(
    tone(1.2, (t) => 40 + 70 * Math.exp(-t * 12), (t) => env(t, 0.003, 0.35), soft),
    gain(noiseBurst(0.6, 0.08, 900), 0.6),
    gain(noiseBurst(0.05, 0.006, 6000, 'highpass'), 0.3),
  ), {rev: HALL}), 0.75),

  // Data: quick digital chirps, for packets / data moving.
  data: () => {
    const chirps = [];
    for (let k = 0; k < 8; k++) {
      const f = 1200 + rand() * 1600;
      chirps.push(delay(tone(0.035, () => f, (t) => env(t, 0.001, 0.012), tri), k * 0.06 + rand() * 0.015));
    }
    return normalize(stereo(mix(...chirps), {pan: (t) => -0.6 + t * 2.2, rev: ROOM}), 0.4);
  },

  // Connect: two rising soft tones (a link comes up).
  connect: () => normalize(stereo(mix(mallet(659.25, 0.4), delay(mallet(987.77, 0.6), 0.09)), {rev: HALL}), 0.5),

  // Disconnect: two falling soft tones (a link goes down).
  disconnect: () => normalize(stereo(mix(mallet(987.77, 0.4), delay(mallet(587.33, 0.6), 0.1)), {rev: HALL}), 0.5),

  // Coin: bright two-note reward.
  coin: () => normalize(stereo(mix(
    tone(0.08, () => 1975.5, (t) => env(t, 0.001, 0.04), tri),
    delay(tone(0.5, () => 2637, (t) => env(t, 0.001, 0.12), tri), 0.07),
  ), {rev: ROOM}), 0.4),

  // Shutter: camera snapshot.
  shutter: () => normalize(stereo(mix(
    noiseBurst(0.05, 0.006, 3500), delay(noiseBurst(0.06, 0.008, 2500), 0.07),
    tone(0.04, () => 180, (t) => env(t, 0.001, 0.01) * 0.6),
  ), {rev: ROOM}), 0.6),

  // Logo: brand sting — a soft swell, a warm chord with sparkle, and a low bloom.
  logo: () => {
    const chord = [523.25, 659.25, 783.99, 1046.5].map((f, k) => delay(gain(bell(f, 2, 0.45), 0.5), 0.42 + k * 0.035));
    const glints = [];
    for (let k = 0; k < 10; k++) glints.push(delay(gain(bell(3000 + rand() * 2500, 0.3, 0.3), 0.12), 0.45 + k * 0.05));
    return normalize(stereo(mix(
      biquad(render(0.5, () => noise()), 'bandpass', (t) => 400 + 3000 * (t / 0.5) ** 2, 1.2).map((v, i) => v * ((i / RATE) / 0.5) ** 2 * 0.5),
      tone(1.8, (t) => 65.4, (t) => (t < 0.42 ? 0 : env(t - 0.42, 0.02, 0.5)) * 0.9, soft),
      ...chord, ...glints,
    ), {pan: (t) => (t < 0.5 ? -0.4 + t : Math.sin(t * 9) * 0.3), rev: {size: 1.1, decay: 0.9, wet: 0.38}}), 0.7);
  },
};

await mkdir(out, {recursive: true});
for (const [name, make] of Object.entries(sounds)) {
  const st = make();
  await writeFile(path.join(out, `${name}.wav`), wav(st));
  console.log(`public/sfx/${name}.wav  ${(st[0].length / RATE).toFixed(2)} s`);
}
