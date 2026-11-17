// Render a PNG preview of every scene, every 2D device and every 3D device.
// Usage: npm run previews            -> out/preview/
//        npm run previews -- scenes  -> only one group (scenes | devices-2d | devices-3d | overlays)
// Open out/preview/index.html to browse everything on one page.
import {bundle} from '@remotion/bundler';
import {openBrowser, renderStill, selectComposition} from '@remotion/renderer';
import {build} from 'esbuild';
import {mkdir, readdir, rm, writeFile} from 'node:fs/promises';
import path from 'node:path';
import {pathToFileURL} from 'node:url';

const root = path.resolve(import.meta.dirname, '..');
const outDir = path.join(root, 'out', 'preview');
const only = process.argv[2];

// Scene catalog + device kinds, loaded in plain Node.
const catalogFile = path.join(root, 'out', 'preview-catalog.mjs');
await mkdir(path.dirname(catalogFile), {recursive: true});
await build({
  stdin: {contents: `export {sceneCatalog} from './src/registry'; export {deviceKinds, device3DKinds} from './src/components/Device';`, resolveDir: root, loader: 'ts'},
  outfile: catalogFile, bundle: true, platform: 'node', format: 'esm', packages: 'external', loader: {'.css': 'empty'},
  plugins: [{name: 'world-map', setup(b) { b.onResolve({filter: /^world-atlas\//}, (a) => ({path: path.join(root, 'node_modules', a.path), external: false})); }}],
  logLevel: 'silent',
});
const {sceneCatalog, deviceKinds, device3DKinds} = await import(pathToFileURL(catalogFile));

const theme = {background: 'radial-gradient(circle at 50% 40%, #1b2f52 0%, #070d1c 75%)', accent: '#38bdf8'};
const spec = (component, props = {}, durationInFrames = 180) => ({
  fps: 30, width: 1920, height: 1080, theme, defaultTransition: {type: 'none'},
  scenes: [{id: 'preview', component, durationInFrames, props}],
});

// What to render: [group, file name, composition props, frame, scale]
const jobs = [];
for (const name of Object.keys(sceneCatalog)) jobs.push(['scenes', name, spec(name), 150, 0.5]);
for (let i = 0; i < deviceKinds.length; i += 12) {
  const kinds = deviceKinds.slice(i, i + 12);
  jobs.push(['devices-2d', `devices-2d-${i / 12 + 1}`, spec('DeviceGridScene', {
    title: `2D devices ${i + 1}–${i + kinds.length}`, columns: 6, size: 130, changes: [],
    devices: kinds.map((kind) => ({kind, label: kind, state: 'on'})),
  }), 120, 0.5]);
}
for (const kind of device3DKinds) {
  jobs.push(['devices-3d', kind, spec('Device3DScene', {devices: [{kind, label: kind, state: 'on'}], size: 760, motion: 'still'}), 60, 0.5]);
}
// One example of every overlay type (effects, UI, annotations), each on a BlankScene.
const P = (x, y) => ({x, y});
const overlayExamples = {
  'flow-packet': [{type: 'flow', points: [P(15, 55), P(85, 55)], effect: 'packet', label: 'GET /', count: 2}],
  'flow-current': [{type: 'flow', points: [P(15, 60), P(85, 60)], effect: 'current', bend: 0.2}],
  'flow-light': [{type: 'flow', points: [P(15, 55), P(85, 55)], effect: 'light', label: 'fibre'}],
  'flow-bits': [{type: 'flow', points: [P(15, 55), P(85, 55)], effect: 'bits'}],
  waves: [{type: 'waves', at: P(30, 55), toward: P(80, 55), count: 4}, {type: 'waves', at: P(50, 55), spread: 360, reach: 160, startAt: 9999}],
  'waves-rings': [{type: 'waves', at: 'center', spread: 360, reach: 300, count: 4}],
  callout: [{type: 'callout', at: 'center', label: 'A **callout** label'}],
  check: [{type: 'check', at: P(40, 55)}, {type: 'cross', at: P(60, 55)}],
  badge: [1, 2, 3].map((n) => ({type: 'badge', at: P(30 + (n - 1) * 20, 55), text: n})),
  arrow: [{type: 'arrow', from: P(25, 65), to: P(75, 45), label: 'data'}],
  pointer: [{type: 'pointer', path: [{x: 30, y: 70, at: 0}, {x: 55, y: 50, at: 60}], clicks: [70], variant: 'hand'}],
  highlight: [{type: 'highlight', at: 'center', width: 30, height: 30, spotlight: true, label: 'Look here'}],
  tooltip: [{type: 'tooltip', at: 'center', text: 'A **tooltip**'}],
  field: [{type: 'field', at: P(30, 55), kind: 'magnet', size: 300}, {type: 'field', at: P(75, 55), kind: 'positive', size: 200}],
  sound: [{type: 'sound', from: 'left', to: 'right'}],
  progress: [{type: 'progress', at: 'center', label: 'Uploading', to: 70, duration: 60}],
  lock: [{type: 'lock', at: 'center', text: 'my password', lockAt: 30}],
  terminal: [{type: 'terminal', at: 'center', width: 1100}],
  notification: [{type: 'notification', at: 'top-right', title: 'New message', text: 'Your file is **ready**', icon: 'phone'}],
  toggle: [{type: 'toggle', at: P(40, 55), label: 'Wi-Fi', flipAt: [40]}, {type: 'toggle', at: P(65, 55), label: 'Remember me', style: 'checkbox', flipAt: [40]}],
  chat: [{type: 'chat', at: 'center', width: 900, gap: 30}],
  zoom: [{type: 'zoom', at: P(56, 42), lensAt: P(80, 30), zoom: 2.5}],
};
for (const [name, overlays] of Object.entries(overlayExamples)) {
  const s = spec('BlankScene', {title: name, titleAt: 'top'});
  s.scenes[0].overlays = overlays.filter((o) => o.startAt !== 9999);
  if (name === 'zoom') { s.scenes[0].component = 'DeviceGridScene'; s.scenes[0].props = {title: 'zoom', changes: []}; }
  jobs.push(['overlays', name, s, 110, 0.5]);
}
const todo = only ? jobs.filter((j) => j[0] === only) : jobs;

// Only clear the groups being re-rendered; the others stay.
for (const g of new Set(todo.map((j) => j[0]))) await rm(path.join(outDir, g), {recursive: true, force: true});
console.log('Bundling...');
const serveUrl = await bundle({entryPoint: path.join(root, 'src/index.ts'), publicDir: path.join(root, 'public'), rootDir: root});
const browser = await openBrowser('chrome', {chromiumOptions: {gl: 'angle'}});
const done = [];
try {
  for (const [i, [group, name, inputProps, frame, scale]] of todo.entries()) {
    await mkdir(path.join(outDir, group), {recursive: true});
    const file = `${group}/${name}.png`;
    try {
      const composition = await selectComposition({serveUrl, id: 'VideoComposition', inputProps, puppeteerInstance: browser});
      await renderStill({serveUrl, composition, inputProps, frame, scale, output: path.join(outDir, file), imageFormat: 'png', puppeteerInstance: browser});
      done.push({group, name, file});
      console.log(`[${i + 1}/${todo.length}] ${file}`);
    } catch (e) {
      console.log(`[${i + 1}/${todo.length}] FAILED ${file}: ${String(e.message).split('\n')[0]}`);
    }
  }
} finally {
  await browser.close({silent: true});
  await rm(serveUrl, {recursive: true, force: true});
}

// One page to view everything.
const groups = ['scenes', 'devices-2d', 'devices-3d', 'overlays'];
// List what is on disk (so a one-group run keeps the other groups on the page).
const onDisk = [];
for (const g of ['scenes', 'devices-2d', 'devices-3d', 'overlays']) {
  const files = await readdir(path.join(outDir, g)).catch(() => []);
  for (const f of files.filter((x) => x.endsWith('.png')).sort()) onDisk.push({group: g, name: f.replace(/\.png$/, ''), file: `${g}/${f}`});
}
const section = (g) => {
  const items = onDisk.filter((d) => d.group === g);
  if (!items.length) return '';
  return `<h2>${g} <small>(${items.length})</small></h2><div class="grid ${g}">` +
    items.map((d) => `<figure><a href="${d.file}" target="_blank"><img src="${d.file}" loading="lazy"></a><figcaption>${d.name}</figcaption></figure>`).join('') + '</div>';
};
await writeFile(path.join(outDir, 'index.html'), `<!doctype html><meta charset="utf-8"><title>Component previews</title>
<style>body{margin:0;padding:24px;background:#0b1220;color:#e2e8f0;font:15px system-ui,sans-serif}h2{margin:32px 0 12px}small{color:#94a3b8}
.grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(360px,1fr));gap:16px}.devices-3d{grid-template-columns:repeat(auto-fill,minmax(240px,1fr))}
figure{margin:0;background:#111a2e;border-radius:10px;overflow:hidden}img{width:100%;display:block}figcaption{padding:8px 12px;color:#cbd5e1}</style>
<h1>Component previews</h1>${groups.map(section).join('')}`);
console.log(`\nDone: ${done.length}/${todo.length} images in out/preview/  ->  open out/preview/index.html`);
