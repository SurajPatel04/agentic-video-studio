// Generate the built-in sound effects with code (no downloads, no third party).
// Usage: npm run sfx   -> public/sfx/{click,pop,whoosh,typing,ding,success,error,lock,notify}.wav
// Deterministic: a seeded random generator, so the files are identical every run.
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

/** Make a buffer of `sec` seconds; fn(t, i) returns a sample in -1..1. */
const render = (sec, fn) => Float32Array.from({length: Math.round(sec * RATE)}, (_, i) => fn(i / RATE, i));
const mix = (...bufs) => {
  const len = Math.max(...bufs.map((b) => b.length));
  return Float32Array.from({length: len}, (_, i) => bufs.reduce((s, b) => s + (b[i] ?? 0), 0));
};
const delay = (buf, sec) => {
  const off = Math.round(sec * RATE);
  const o = new Float32Array(buf.length + off);
  o.set(buf, off);
  return o;
};
const lowpass = (buf, cutoffAt) => {
  // one-pole low-pass with a cutoff (Hz) that can change over time
  const o = new Float32Array(buf.length);
  let y = 0;
  for (let i = 0; i < buf.length; i++) {
    const a = 1 - Math.exp((-TAU * cutoffAt(i / RATE)) / RATE);
    y += a * (buf[i] - y);
    o[i] = y;
  }
  return o;
};
const env = (t, attack, decay) => (t < attack ? t / attack : Math.exp(-(t - attack) / decay));
const normalize = (buf, peak = 0.8) => {
  const m = buf.reduce((a, v) => Math.max(a, Math.abs(v)), 0) || 1;
  return buf.map((v) => (v / m) * peak);
};

const wav = (buf) => {
  const data = Buffer.alloc(buf.length * 2);
  buf.forEach((v, i) => data.writeInt16LE(Math.max(-32768, Math.min(32767, Math.round(v * 32767))), i * 2));
  const h = Buffer.alloc(44);
  h.write('RIFF', 0); h.writeUInt32LE(36 + data.length, 4); h.write('WAVE', 8);
  h.write('fmt ', 12); h.writeUInt32LE(16, 16); h.writeUInt16LE(1, 20); h.writeUInt16LE(1, 22);
  h.writeUInt32LE(RATE, 24); h.writeUInt32LE(RATE * 2, 28); h.writeUInt16LE(2, 32); h.writeUInt16LE(16, 34);
  h.write('data', 36); h.writeUInt32LE(data.length, 40);
  return Buffer.concat([h, data]);
};

/* ------------------------------------------------------------------ the sounds */

// Mouse click: tiny noise transient + short high "tick".
const click = () => normalize(mix(
  render(0.012, (t) => noise() * env(t, 0.0005, 0.002)),
  render(0.05, (t) => Math.sin(TAU * 2600 * t) * env(t, 0.0005, 0.006) * 0.6),
), 0.7);

// Pop: quick downward pitch sweep (bubble).
const pop = () => {
  let ph = 0;
  return normalize(render(0.12, (t) => {
    ph += (TAU * (900 * Math.exp(-t * 28) + 220)) / RATE;
    return Math.sin(ph) * env(t, 0.002, 0.03);
  }), 0.75);
};

// Whoosh: noise through a sweeping low-pass, swelling then fading.
const whoosh = () => {
  const n = render(0.55, () => noise());
  const f = lowpass(n, (t) => 300 + 2600 * Math.sin(Math.PI * Math.min(1, t / 0.55)));
  return normalize(f.map((v, i) => v * Math.sin(Math.PI * Math.min(1, i / RATE / 0.55)) ** 1.5), 0.6);
};

// Typing: ~2 s of key presses at an uneven rhythm (loop it while text types).
const typing = () => {
  const key = () => {
    const pitch = 1800 + rand() * 900;
    const thump = 140 + rand() * 60;
    return mix(
      lowpass(render(0.03, (t) => noise() * env(t, 0.0004, 0.004)), () => 5000),
      render(0.04, (t) => Math.sin(TAU * pitch * t) * env(t, 0.0004, 0.003) * 0.35),
      render(0.05, (t) => Math.sin(TAU * thump * t) * env(t, 0.001, 0.01) * 0.5),
    );
  };
  const parts = [];
  for (let t = 0.02; t < 1.95; t += 0.06 + rand() * 0.07) parts.push(delay(key(), t));
  const all = mix(...parts);
  return normalize(Float32Array.from({length: Math.round(2 * RATE)}, (_, i) => all[i] ?? 0), 0.55);
};

// Bell "ding": two partials with a long decay.
const bell = (f, dur = 1.2) => render(dur, (t) => (Math.sin(TAU * f * t) + 0.45 * Math.sin(TAU * f * 2.76 * t) * Math.exp(-t * 3)) * env(t, 0.003, 0.35));
const ding = () => normalize(bell(1318.5), 0.6);

// Success: rising three-note arpeggio (C6 E6 G6).
const success = () => normalize(mix(bell(1046.5, 0.7), delay(bell(1318.5, 0.7), 0.09), delay(bell(1568, 0.9), 0.18)), 0.6);

// Error: two low buzzy beeps.
const buzz = () => render(0.16, (t) => Math.tanh(3 * Math.sin(TAU * 170 * t)) * env(t, 0.005, 0.08) * 0.8);
const error = () => normalize(mix(buzz(), delay(buzz(), 0.19)), 0.55);

// Lock: metallic double click with a short ring.
const lock = () => normalize(mix(
  render(0.06, (t) => (noise() * 0.6 + Math.sin(TAU * 3200 * t)) * env(t, 0.0005, 0.008)),
  delay(render(0.25, (t) => (noise() * 0.5 + Math.sin(TAU * 2400 * t) + 0.5 * Math.sin(TAU * 4100 * t)) * env(t, 0.0005, 0.03)), 0.07),
), 0.7);

// Notification: soft two-tone "pling".
const notify = () => normalize(mix(bell(880, 0.6), delay(bell(1318.5, 0.9), 0.11)), 0.5);

const sounds = {click, pop, whoosh, typing, ding, success, error, lock, notify};
await mkdir(out, {recursive: true});
for (const [name, make] of Object.entries(sounds)) {
  const buf = make();
  await writeFile(path.join(out, `${name}.wav`), wav(buf));
  console.log(`public/sfx/${name}.wav  ${(buf.length / RATE).toFixed(2)} s`);
}
