// Render the reported chapter scenes using saved props, without changing the original jobs.
import {bundle} from '@remotion/bundler';
import {openBrowser, selectComposition, renderStill} from '@remotion/renderer';
import {mkdir, readFile, rm} from 'node:fs/promises';
import path from 'node:path';
const root = path.resolve(import.meta.dirname, '..');
const source = path.resolve(process.argv[2] ?? path.join(root, '../workspace/long/1048084103'));
const output = path.join(root, '../workspace/layout-previews');
await mkdir(output, {recursive: true});
const checks = [];
for (const chapter of ['ch01.plan.json', 'ch02.plan.json']) {
 let spec = JSON.parse(await readFile(path.join(source, chapter), 'utf8'));
 try {spec = JSON.parse(await readFile(path.join(source, '../../jobs', `long-${path.basename(source)}-${chapter.slice(0,4)}`, 'composition.json'), 'utf8'));} catch { /* Plans without audio still produce previews. */ }
 for (const scene of spec.scenes) {
  if (['DefinitionScene', 'FlowchartScene', 'BlankScene'].includes(scene.component)) checks.push([chapter.slice(0, 4), scene]);
 }
}
checks.push(['regression', {id: 'explicit-abbreviation', component: 'DefinitionScene', durationInFrames: 360,
 props: {term: 'Local Area Network', abbreviation: 'LAN', meaning: 'Devices connected within a small area, such as a home or school.'}}]);
checks.push(['regression', {id: 'branch-labels', component: 'FlowchartScene', durationInFrames: 360,
 props: {title: 'A decision with labeled branches', nodes: [
  {id: 'a', label: 'Start', kind: 'start'}, {id: 'b', label: 'Check the result', kind: 'decision'},
  {id: 'c', label: 'Continue', kind: 'end'}, {id: 'd', label: 'Try another approach', kind: 'end'}],
 edges: [{from: 'a', to: 'b', label: 'read the input'}, {from: 'b', to: 'c', label: 'when successful'}, {from: 'b', to: 'd', label: 'otherwise'}]}}]);
checks.push(['regression', {id: 'vertical-labels', component: 'FlowchartScene', durationInFrames: 360,
 props: {title: 'Three steps, read from top to bottom', direction: 'vertical', nodes: [
  {id: 'a', label: 'Observe', kind: 'start'}, {id: 'b', label: 'Compare'}, {id: 'c', label: 'Conclude', kind: 'end'}],
 edges: [{from: 'a', to: 'b', label: 'collect evidence'}, {from: 'b', to: 'c', label: 'test the explanation'}]}}]);
const serveUrl = await bundle({entryPoint: path.join(root, 'src/index.ts'), publicDir: path.join(root, 'public'), rootDir: root});
const browser = await openBrowser('chrome', {chromiumOptions: {gl: 'angle'}});
try {
 for (const [chapter, scene] of checks) {
  const inputProps = {fps: 30, width: 1920, height: 1080, audio: {effects: false}, captions: true,
   scenes: [{...scene, durationInFrames: Math.max(360, scene.durationInFrames)}]};
  const composition = await selectComposition({serveUrl, id: 'VideoComposition', inputProps, puppeteerInstance: browser});
  await renderStill({serveUrl, composition, inputProps, puppeteerInstance: browser, frame: 150, scale: 0.75,
   output: path.join(output, `${chapter}-${scene.id}.png`), imageFormat: 'png'});
  console.log(`${chapter}: ${scene.id}`);
 }
} finally {await browser.close({silent: true}); await rm(serveUrl, {recursive: true, force: true});}
