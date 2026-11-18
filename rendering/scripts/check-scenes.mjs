import {build} from 'esbuild';
import {writeFile, mkdir} from 'node:fs/promises';
import {pathToFileURL} from 'node:url';
import path from 'node:path';
import assert from 'node:assert/strict';
const root = path.resolve(import.meta.dirname, '..');
await mkdir(path.join(root, 'out'), {recursive: true});
const output = path.join(root, 'out', 'catalog-check.mjs');
await build({stdin: {contents: `export {terminalTimeline} from './src/scenes/TerminalScene'; export {sceneCatalog, overlaySchema} from './src/registry'; export {networkLayout} from './src/components/networkLayout'; export {algorithmLessons} from './src/scenes/AlgorithmLessons'; export {mathLessons} from './src/scenes/MathLessons';`, resolveDir: root, loader: 'ts'}, outfile: output, bundle: true, platform: 'node', format: 'esm', packages: 'external', loader: {'.css': 'empty'}, plugins: [{name:'bundle-world-map',setup(b){b.onResolve({filter:/^world-atlas\//},args=>({path:path.join(root,'node_modules',args.path),external:false}));}}], logLevel: 'silent'});
const {sceneCatalog, overlaySchema, networkLayout, algorithmLessons, mathLessons, terminalTimeline} = await import(pathToFileURL(output));
const {existsSync} = await import('node:fs');
const {z} = await import('zod');
for (const [name, entry] of Object.entries(sceneCatalog)) {
  assert(entry.description && entry.tags.length, name + ' metadata');
  assert(entry.schema.safeParse({}).success, name + ' default props');
}
for (const count of [3, 5, 8]) {
  for (const [topology, paths] of [['star', count-1], ['ring', count], ['mesh', count*(count-1)/2], ['bus', count+1]]) {
    const layout = networkLayout(topology, count);
    assert.equal(layout.positions.length, count);
    assert.equal(layout.paths.length, paths, topology);
    assert(layout.paths.every(p => p.flat().every(Number.isFinite)));
    if (topology === 'ring') assert.deepEqual(layout.paths.at(-1)[1], layout.positions[0]);
    if (topology === 'star') assert(layout.paths.every(p => p[0] === layout.positions[0]));
  }
}
// Definitions must not silently reuse a networking badge or footer on unrelated topics.
const definition = sceneCatalog.DefinitionScene.schema.parse({term:'Callback',meaning:'A function called later.'});
assert.equal(definition.abbreviation, '');
assert.equal(definition.detail, '');
assert.equal(sceneCatalog.DefinitionScene.schema.parse({abbreviation:'LAN'}).abbreviation, 'LAN');
assert.equal(sceneCatalog.BlankScene.schema.parse({}).focusOverlay, true);
assert.equal(sceneCatalog.BlankScene.schema.parse({focusOverlay:false}).focusOverlay, false);
// IsoScene: objects that cover each other on screen, and links/steps to unknown ids, are rejected with a fix hint.
const iso = sceneCatalog.IsoScene.schema;
const crowded = iso.safeParse({objects: [{id: 'a', kind: 'server', at: [0, 0]}, {id: 'b', kind: 'server', at: [1, 1]}], links: [], steps: []});
assert.equal(crowded.success, false);
assert.match(crowded.error.issues[0].message, /covers "a" on screen/);
assert.equal(iso.safeParse({objects: [{id: 'a', kind: 'server', at: [0, 0]}, {id: 'b', kind: 'database', at: [3.5, -3.5]}], links: [{from: 'a', to: 'b'}], steps: [{at: 0.5, target: 'b', highlight: true}]}).success, true);
assert.equal(iso.safeParse({objects: [{id: 'a', kind: 'server', at: [0, 0]}], links: [{from: 'a', to: 'x'}], steps: []}).success, false);
assert.equal(iso.parse({objects: [], links: [], steps: [], title: 'Card'}).objects.length, 0);
assert(!sceneCatalog.ComparisonTableScene.schema.safeParse({columns:['A','B'],rows:[['one']]}).success);
assert(!sceneCatalog.QuizScene.schema.safeParse({correctIndex:4}).success);
assert(!sceneCatalog.NetworkScene.schema.safeParse({packetFrames:0}).success);
assert(!sceneCatalog.ZoomOutScene.schema.safeParse({cityAt:120,globeAt:100}).success);
assert.equal(sceneCatalog.BuildingScene.schema.parse({}).preset, 'city');
assert.equal(sceneCatalog.TechnologyScene.schema.parse({}).preset, 'technology');
// Forgiving input: names AIs often use are understood instead of failing the plan.
const chat = sceneCatalog.ChatScene.schema.parse({device: 'mobile', messages: [{role: 'user', content: 'hi'}, {role: 'assistant', content: 'hello'}]});
assert.deepEqual([chat.device, chat.messages[0].from, chat.messages[1].from, chat.messages[1].text], ['phone', 'me', 'them', 'hello']);
const term = sceneCatalog.TerminalScene.schema.parse({commands: ['$ npm test'], device: 'computer'});
assert.deepEqual([term.device, term.actions[0].do, term.actions[0].text], ['laptop', 'run', 'npm test']);
const [command, response] = terminalTimeline([
  {at: 0.15, do: 'run', text: 'x'.repeat(120)},
  {at: 0.38, do: 'output', text: 'HTTP 400\nInvalid title'},
], 420, 30);
assert(command.typeEnd < response.start);
assert.equal(response.start, Math.round(0.38 * 420));
assert.equal(response.end, response.start);
const ed = sceneCatalog.EditorScene.schema.parse({code: ['a = 1', 'print(b)'], actions: [{action: 'underline', lineNumber: '2', message: 'b is not defined'}]});
assert.deepEqual([ed.actions[0].do, ed.actions[0].line], ['error', 2]);
const ph = sceneCatalog.PhoneScene.schema.parse({screens: [{id: 'a', blocks: [{id: 'go', type: 'button', label: 'Go'}]}, {id: 'b', blocks: [{type: 'heading', label: 'Done'}]}], actions: [{action: 'click', target: 'go'}, {action: 'navigate', to: 'b'}, {action: 'loading', duration: 1500}]});
assert.deepEqual(ph.actions.map((x) => x.do), ['tap', 'open', 'wait']);
assert.equal(ph.actions[2].seconds, 1.5);
const scr = sceneCatalog.ScreenScene.schema.parse({page: [{id: 'q', type: 'input', label: 'Search'}], actions: [{action: 'fill', target: 'q', value: 'shoes'}, {action: 'tap', target: 'chat'}], chat: [{role: 'user', content: 'Hi'}]});
assert.deepEqual(scr.actions.map((x) => x.do), ['type', 'click']);
assert.equal(sceneCatalog.ScreenScene.schema.parse({page: [{type: 'heading', label: 'Own page'}]}).actions.length, 0); // own page: no demo script
assert(!sceneCatalog.FormScene.schema.safeParse({fields: [{id: 'p', label: 'P', type: 'password'}], actions: [{at: 0.2, do: 'submit', errors: [{to: 'p', text: 'short'}]}, {at: 0.5, do: 'submit', text: 'ok'}]}).success); // success before the fix
// A valid row index can still update the wrong logical record.
const transaction = sceneCatalog.TransactionScene.schema;
for (const outcome of ['commit', 'rollback']) {
  const change = {
    outcome, table: {name: 'sink', columns: ['kind', 'value'], rows: [['checkpoint', 102]]},
    steps: [{op: 'insert', values: ['order', 31]}, {op: 'update', row: 0, column: 'value', value: 103}],
    expectedPendingRows: [['checkpoint', 103], ['order', 31]],
  };
  assert(transaction.safeParse(change).success);
  change.steps[1].row = 1;
  assert(!transaction.safeParse(change).success);
}
const qs = sceneCatalog.QueryScene.schema.parse({sql: 'SELECT name FROM people WHERE age >= 30', rows: [{name: 'A', age: 31}, {name: 'B', age: 20}], mode: 'full scan'});
assert.deepEqual([qs.mode, qs.table.columns.join()], ['scan', 'name,age']);
assert(!sceneCatalog.QueryScene.schema.safeParse({query: 'SELECT * FROM t WHERE nope = 1', table: {columns: ['a'], rows: [[1]]}}).success); // unknown WHERE column
const pl = sceneCatalog.PipelineScene.schema.parse({data: [{id: 1, x: 2}, {id: 2, x: 0}], steps: [{name: 'Keep big', type: 'where', condition: 'x > 1', output: [{id: 1, x: 2}]}]});
assert.deepEqual([pl.stages[0].op, pl.stages[0].detail, pl.stages[0].rows.length], ['filter', 'x > 1', 1]);
const pk = sceneCatalog.PacketScene.schema.parse({devices: ['Laptop', 'Router', 'Server'], headers: {'Dst IP': '1.2.3.4', TTL: 64},
  actions: [{action: 'travel', target: 'Router'}, {action: 'inspect', key: 'Dst IP'}, {action: 'decrement', key: 'TTL', new: 63}, {action: 'forward', target: 'server'}]});
assert.deepEqual(pk.steps.map((x) => x.do + ':' + (x.to ?? x.field ?? '')), ['send:router', 'read:Dst IP', 'change:TTL', 'send:server']);
// Data-structure scenes: AI-style input is understood.
const ar = sceneCatalog.ArrayScene.schema.parse({array: '5, 3, 8', algo: 'Bubble Sort'});
assert.deepEqual([ar.values.join(), ar.algorithm], ['5,3,8', 'bubble']);
assert(!sceneCatalog.ArrayScene.schema.safeParse({values: [1, 2], algorithm: 'binary search'}).success); // search without target
const sk = sceneCatalog.StackScene.schema.parse({type: 'FIFO', operations: [{action: 'enqueue', item: 'A'}, {op: 'push', values: ['B', 'C']}, 'dequeue']});
assert.deepEqual([sk.kind, sk.steps.map((s) => s.do).join()], ['queue', 'push,push,push,pop']);
const hs = sceneCatalog.HashScene.schema.parse({buckets: 5, keys: ['cat', 'act'], entries: {dog: 'woof'}});
assert.deepEqual([hs.size, hs.steps.length, hs.entries[0].key], [5, 2, 'dog']);
const tr = sceneCatalog.TreeScene.schema.parse({type: 'AVL', keys: [10, 20], actions: [{action: 'add', key: 30}, {action: 'traverse', type: 'in-order'}]});
assert.deepEqual([tr.kind, tr.steps[0].do, tr.steps[1].order], ['avl', 'insert', 'inorder']);
const gr = sceneCatalog.GraphScene.schema.parse({edges: ['A-B', 'B-C 4'], algorithm: 'dijkstra', start: 'A', goal: 'C'});
assert.deepEqual([gr.nodes.length, gr.edges[1].weight, gr.steps[0].do, gr.steps[0].to], [3, 4, 'dijkstra', 'C']);
assert(!sceneCatalog.GraphScene.schema.safeParse({edges: [['A', 'B']], steps: [{do: 'bfs', from: 'Z'}]}).success); // unknown node
const ll = sceneCatalog.LinkedListScene.schema.parse({nodes: [1, 2], operations: ['append 3', {action: 'remove', node: 1}]});
assert.deepEqual(ll.steps.map((s) => s.do + ':' + s.value), ['append:3', 'delete:1']);
const ev = sceneCatalog.EventLoopScene.schema.parse({env: 'browser', events: [{action: 'call', label: 'main'}, {action: 'setTimeout', fn: 'cb', delay: '10ms'}, {action: 'then', name: 'p'}, 'tick', {action: 'console.log', output: 'hi'}]});
assert.deepEqual([ev.runtime, ...ev.steps.map((s) => s.do)], ['browser', 'call', 'api', 'queue', 'tick', 'log']);
assert.equal(ev.steps[2].to, 'micro');
// Graph scenes: forgiving formulas/steps, bad formulas rejected with a reason.
const plot = sceneCatalog.PlotScene.schema.parse({equation: 'y = m*x + c', parameters: [{name: 'm', value: 2}], xRange: '-5..5', animation: ['set m=3', {action: 'slope', at: 1}, {action: 'integral', start: 0, end: 2}]});
assert.deepEqual([plot.curves[0].expr, plot.params.m, plot.x[0], plot.steps.map((s) => s.do).join()], ['y = m*x + c', 2, -5, 'set,tangent,area']);
const badPlot = sceneCatalog.PlotScene.schema.safeParse({curves: ['2x +* 3']});
assert(!badPlot.success && /cannot read the formula/.test(badPlot.error.issues[0].message));
const lc = sceneCatalog.LiveChartScene.schema.parse({type: 'bar race', data: {India: 140, China: 141, USA: 33}, actions: [{action: 'increase', bar: 'India', amount: 5}, 'sort']});
assert.deepEqual([lc.kind, lc.labels.join(), lc.series[0].values[0], lc.steps[0].do, lc.steps[0].label, lc.steps[0].by], ['race', 'India,China,USA', 140, 'add', 'India', 5]);
assert(!sceneCatalog.LiveChartScene.schema.safeParse({labels: ['a', 'b'], values: [1]}).success); // count mismatch
assert(!sceneCatalog.LiveChartScene.schema.safeParse({formula: 'P*(1+r)^t', from: 0, to: 100}).success); // too many points
assert.equal(sceneCatalog.LiveChartScene.schema.parse({}).formula, 'P*(1 + r)^t');
// Journalism controls: reject invalid layouts and keep broadcast events in order.
assert(!sceneCatalog.FrontPageScene.schema.safeParse({leadShare: 0.9}).success);
assert(!sceneCatalog.PrintDeliveryScene.schema.safeParse({homes: ['Only one']}).success);
assert(!sceneCatalog.NewsCycleScene.schema.safeParse({stories: [{label: 'A', selected: true}]}).success);
const studio = sceneCatalog.StudioScene.schema.parse({liveAt: 0.4, switchAt: 0.45, homeAt: 0.72});
assert(studio.liveAt < studio.switchAt && studio.switchAt < studio.homeAt);
assert(!sceneCatalog.StudioScene.schema.safeParse({switchAt: 0.2}).success);
assert.equal(sceneCatalog.NewsCycleScene.schema.parse({output: 'broadcast'}).output, 'broadcast');
// Activity animations: timing, comparisons, and route geometry must stay meaningful.
assert(!sceneCatalog.RaceScene.schema.safeParse({lanes: [{label: 'A', seconds: 0}, {label: 'B', seconds: 2}]}).success);
assert(!sceneCatalog.RaceScene.schema.safeParse({lanes: [{label: 'A', seconds: 1}]}).success);
assert(sceneCatalog.RaceScene.schema.safeParse({lanes: [{label: 'A', seconds: 2}, {label: 'B', seconds: 2}]}).success); // tied finish
assert(!sceneCatalog.LiveDashboardScene.schema.safeParse({failureAt: 0.5, recoveryAt: 0.4}).success);
assert(!sceneCatalog.LiveDashboardScene.schema.safeParse({baselineMs: 500, peakMs: 100}).success);
assert(!sceneCatalog.MapTrackingScene.schema.safeParse({route: [[0.5, 0.5], [0.5, 0.5]]}).success);
assert(!sceneCatalog.MapTrackingScene.schema.safeParse({route: [[0, 0], [2, 1]]}).success);
assert(sceneCatalog.MapTrackingScene.schema.safeParse({route: [[0, 0], [0, 0], [1, 1]]}).success); // zero-length segment is safe
const sceneSources = {
  BuildingScene:'InfrastructureScene', TechnologyScene:'InfrastructureScene',
  CircuitScene:'ConnectionScene', WirelessScene:'ConnectionScene', GraphScene:'TreeScene',
  ...Object.fromEntries(Object.keys(algorithmLessons).map(name => [name,'AlgorithmLessons'])),
  ...Object.fromEntries(Object.keys(mathLessons).map(name => [name,'MathLessons'])),
};
const entries=Object.entries(sceneCatalog).map(([name,e])=>({name,version:'1.0.0',description:e.description,tags:e.tags,path:existsSync(path.join(root,`src/staging/${name}.tsx`))?`rendering/src/staging/${name}.tsx`:`rendering/src/scenes/${sceneSources[name]??name}.tsx`,staged:existsSync(path.join(root,`src/staging/${name}.tsx`)),propsSchema:z.toJSONSchema(e.schema,{io:'input'}),example:e.schema.parse({})}));
await mkdir(path.join(root,'../library'), {recursive:true});
await writeFile(path.join(root,'../library/registry.json'),JSON.stringify(entries,null,2)+'\n');
const overlays=overlaySchema.options.map((o)=>{const s=z.toJSONSchema(o,{io:'input'});const type=s.properties.type.const;delete s.properties.type;s.required=(s.required??[]).filter((k)=>k!=='type');return {type,propsSchema:s};});
await writeFile(path.join(root,'../library/overlays.json'),JSON.stringify(overlays,null,2)+'\n');
// Lucide icon names for the backend (icon-first lookup before designing new iso art).
const lucide=await import('lucide-react');
const iconNames=[...new Set(Object.keys(lucide.icons).map((k)=>k.replace(/([a-z0-9])([A-Z])/g,'$1-$2').replace(/([A-Za-z])([0-9])/g,'$1-$2').toLowerCase()))].sort();
await writeFile(path.join(root,'../library/lucide-icons.json'),JSON.stringify(iconNames)+'\n');
console.log(`Checked ${entries.length} scene contracts, topology wiring, and invalid-input handling. Exported library/registry.json + ${overlays.length} overlays to library/overlays.json.`);
