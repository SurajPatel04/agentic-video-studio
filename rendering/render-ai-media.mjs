import {bundle} from '@remotion/bundler';
import {copyFile, mkdir, rm} from 'node:fs/promises';
import {openBrowser, renderStill, selectComposition} from '@remotion/renderer';
import path from 'node:path';

const root = path.resolve(import.meta.dirname);
const outDir = path.join(root, '..', 'test_picture', 'iso-icon', '16-ai-media');
const sheetsDir = path.join(root, '..', 'test_picture', 'iso-icon', 'sheets');
await mkdir(outDir, {recursive: true});
await mkdir(sheetsDir, {recursive: true});

const inputFor = (list, zoom, width, height, spread = false) => ({
  fps: 30, width, height, brand: false,
  theme: {background: 'radial-gradient(circle at 50% 40%, #1b2f52 0%, #070d1c 75%)', accent: '#38bdf8'},
  defaultTransition: {type: 'none'},
  scenes: [{id: 'preview', component: 'IsoScene', durationInFrames: 120, props: {
    objects: list.map((kind, i) => ({
      id: `${kind}${i}`, kind, label: kind,
      at: spread ? [i * 3.8, -i * 3.8] : [0, 0],
      enter: 'none', ghost: false, highlight: false,
    })),
    links: [], steps: [], zoom, sound: false,
  }}],
});

const all = ['aigeneratedlabel', 'aivoice', 'alteredimage', 'recommendation', 'verified'];
const jobs = [
  ...all.map((kind) => ({name: kind, list: [kind], zoom: 1.4, width: 900, height: 900, spread: false})),
  {name: 'sheet', list: all, zoom: 1.0, width: 1800, height: 600, spread: true},
];

console.log('Bundling...');
const serveUrl = await bundle({entryPoint: path.join(root, 'src/index.ts'), publicDir: path.join(root, 'public'), rootDir: root});
const browser = await openBrowser('chrome', {chromiumOptions: {gl: 'angle'}});
try {
  for (const job of jobs) {
    const inputProps = inputFor(job.list, job.zoom, job.width, job.height, job.spread);
    const composition = await selectComposition({serveUrl, id: 'VideoComposition', inputProps, puppeteerInstance: browser});
    const out = path.join(outDir, `${job.name}.png`);
    await renderStill({serveUrl, composition, inputProps, frame: 90, output: out, imageFormat: 'png', puppeteerInstance: browser});
    console.log('Rendered', out);
    if (job.name === 'sheet') {
      const numbered = path.join(sheetsDir, '16-ai-media.png');
      await copyFile(out, numbered);
      console.log('Copied', numbered);
    }
  }
} finally {
  await browser.close({silent: true});
  await rm(serveUrl, {recursive: true, force: true});
}
