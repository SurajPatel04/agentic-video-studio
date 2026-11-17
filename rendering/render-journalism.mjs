import {bundle} from '@remotion/bundler';
import {openBrowser, renderStill, selectComposition} from '@remotion/renderer';

const root = '/home/surajpatel/Desktop/text-to-video/rendering';
const inputFor = (list, zoom, spread = false) => ({
  fps: 30, width: 1920, height: 1080,
  theme: {background: 'radial-gradient(circle at 50% 40%, #1b2f52 0%, #070d1c 75%)', accent: '#38bdf8'},
  defaultTransition: {type: 'none'},
  scenes: [{id: 'preview', component: 'IsoScene', durationInFrames: 120, props: {
    title: 'Journalism & newsroom',
    objects: list.map((kind, i) => ({
      id: `${kind}${i}`, kind, label: kind,
      at: spread ? [(i % 4) * 6, -((i % 4) * 6) + Math.floor(i / 4) * 15] : [0, 0],
      enter: 'none', ghost: false, highlight: false,
    })),
    links: [], steps: [], zoom, sound: false,
  }}],
});

const all = ['reporter', 'editor', 'interview', 'presspass', 'recorder', 'newsdesk', 'newshub', 'sourcedocs'];
const jobs = [
  ...all.map((kind) => ({name: `iso-${kind}`, list: [kind], zoom: 1.4, spread: false})),
  {name: 'journalism', list: all, zoom: 1.0, spread: true},
  {name: 'journalism-close-a', list: all.slice(0, 4), zoom: 1.25, spread: true},
  {name: 'journalism-close-b', list: all.slice(4), zoom: 1.25, spread: true},
];

console.log('Bundling...');
const serveUrl = await bundle({entryPoint: `${root}/src/index.ts`, publicDir: `${root}/public`, rootDir: root});
const browser = await openBrowser('chrome', {chromiumOptions: {gl: 'angle'}});
try {
  for (const job of jobs) {
    const inputProps = inputFor(job.list, job.zoom, job.spread);
    const composition = await selectComposition({serveUrl, id: 'VideoComposition', inputProps, puppeteerInstance: browser});
    const out = `/tmp/opencode/${job.name}.png`;
    await renderStill({serveUrl, composition, inputProps, frame: 119, output: out, imageFormat: 'png', puppeteerInstance: browser});
    console.log('Rendered', out);
  }
} finally {
  await browser.close({silent: true});
  await import('node:fs/promises').then((m) => m.rm(serveUrl, {recursive: true, force: true}));
}
