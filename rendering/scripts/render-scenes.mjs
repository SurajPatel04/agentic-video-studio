// Capture video and lossless audio together for each range on the original timeline.
// Overlap frames belong to the incoming scene.
import {openBrowser, renderMedia, selectComposition} from '@remotion/renderer';
import {readFile, writeFile} from 'node:fs/promises';
import path from 'node:path';
import {cachedBundle} from './bundle-cache.mjs';

const [compositionPath, outputDir, startsJson, scaleArg, threadsArg, firstArg, stopArg] = process.argv.slice(2);
const inputProps = JSON.parse(await readFile(compositionPath, 'utf8'));
const starts = JSON.parse(startsJson);
const root = path.resolve(import.meta.dirname, '..');
console.log('PROGRESS Preparing Remotion bundle');
const bundleStarted = performance.now();
const {serveUrl, built} = await cachedBundle(root);  // shared by renders; not deleted afterwards
console.log(`PROGRESS Remotion bundle ${built ? 'built' : 'reused'} in ${((performance.now() - bundleStarted) / 1000).toFixed(1)}s`);
let browser;

try {
  browser = await openBrowser('chrome', {chromiumOptions: {gl: 'angle'}});
  const base = {serveUrl, inputProps, puppeteerInstance: browser};
  const composition = await selectComposition({...base, id: 'VideoComposition'});
  const boundaries = [0, ...starts.slice(1), composition.durationInFrames];
  if (starts.length !== inputProps.scenes.length ||
      boundaries.some((frame, i) => !Number.isInteger(frame) || (i > 0 && frame <= boundaries[i - 1]))) {
    throw new Error('Scene frame ranges must cover the composition in increasing order.');
  }
  const concurrency = Number(threadsArg) || undefined;
  const hasContinuousMusic = Boolean(inputProps.audio?.music);
  const concat = [];
  for (const [index, scene] of inputProps.scenes.entries()) {
    const start = boundaries[index];
    const end = boundaries[index + 1];
    const stem = `scene-${String(index + 1).padStart(5, '0')}`;
    const filename = stem + '.mp4';
    const sceneLabel = `Scene ${index + 1}/${inputProps.scenes.length} (${scene.id})`;
    concat.push(`file '${filename}'\nduration ${((end - start) / composition.fps).toFixed(9)}`);
    if (index < Number(firstArg || 0) || (stopArg !== undefined && index >= Number(stopArg))) continue;
    const started = performance.now();
    console.log(`PROGRESS ${sceneLabel}, frames ${start}–${end - 1}`);
    try {
      const audio = hasContinuousMusic ? {muted: true} : {
        audioCodec: 'pcm-16', sampleRate: 48000, separateAudioTo: path.join(outputDir, stem + '.wav'),
      };
      await renderMedia({...base, composition, codec: 'h264', frameRange: [start, end - 1], ...audio,
        scale: Number(scaleArg), concurrency, outputLocation: path.join(outputDir, filename)});
    } catch (error) {
      throw new Error(`Scene ${index + 1} (${scene.id}) failed to render: ${error.message}`, {cause: error});
    }
    const percent = Math.floor(100 * end / composition.durationInFrames);
    console.log(`PROGRESS ${sceneLabel} complete in ${((performance.now() - started) / 1000).toFixed(1)}s · ${percent}% of frames`);
  }
  await writeFile(path.join(outputDir, 'concat.txt'), concat.join('\n') + '\n');
  if (hasContinuousMusic && stopArg === undefined) {
    // A continuous source should be decoded from one timeline without per-range seek rounding.
    console.log('PROGRESS Mixing continuous background music and narration');
    await renderMedia({...base, composition, codec: 'wav', enforceAudioTrack: true, concurrency,
      outputLocation: path.join(outputDir, 'soundtrack.wav')});
  }
} finally {
  await browser?.close({silent: true});
}
