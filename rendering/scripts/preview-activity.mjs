import {bundle} from '@remotion/bundler';
import {openBrowser, selectComposition, renderStill} from '@remotion/renderer';
import {mkdir, rm} from 'node:fs/promises';
import path from 'node:path';
const root = path.resolve(import.meta.dirname, '..');
const out = path.join(root, 'out/activity-animations');
await mkdir(out, {recursive: true});
const serveUrl = await bundle({entryPoint: path.join(root, 'src/index.ts'), publicDir: path.join(root, 'public'), rootDir: root});
const browser = await openBrowser('chrome', {chromiumOptions: {gl: 'angle'}});
try {
  for (const component of ['RaceScene', 'LiveDashboardScene', 'MapTrackingScene']) {
    const inputProps = {fps: 30, width: 1920, height: 1080, brand: false, scenes: [{id: 'preview', component, durationInFrames: 300, props: {}}]};
    const composition = await selectComposition({serveUrl, id: 'VideoComposition', inputProps, puppeteerInstance: browser});
    for (const frame of [30, 150, 285]) {
      await renderStill({serveUrl, composition, inputProps, puppeteerInstance: browser, frame, scale: 0.5, output: path.join(out, `${component}-${frame}.png`)});
      console.log(`${component}: frame ${frame}`);
    }
  }
} finally {
  await browser.close({silent: true});
  await rm(serveUrl, {recursive: true, force: true});
}
