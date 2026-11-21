import {build} from 'esbuild';
import {writeFile, mkdir} from 'node:fs/promises';
import {pathToFileURL} from 'node:url';
import path from 'node:path';
import assert from 'node:assert/strict';
import './export-react-icons.mjs';
const root = path.resolve(import.meta.dirname, '..');
await mkdir(path.join(root, 'out'), {recursive: true});
const output = path.join(root, 'out', 'catalog-check.mjs');
await build({stdin: {contents: `export {terminalTimeline} from './src/scenes/TerminalScene'; export {formatJsonExample, formatJsonExamples, httpResponseStatus, jsonFieldRange, previewJsonExample} from './src/components/JsonExample'; export {sceneCatalog, overlaySchema} from './src/registry'; export {networkLayout} from './src/components/networkLayout'; export {algorithmLessons} from './src/scenes/AlgorithmLessons'; export {mathLessons} from './src/scenes/MathLessons';`, resolveDir: root, loader: 'ts'}, outfile: output, bundle: true, platform: 'node', format: 'esm', packages: 'external', loader: {'.css': 'empty'}, plugins: [{name:'bundle-world-map',setup(b){b.onResolve({filter:/^world-atlas\//},args=>({path:path.join(root,'node_modules',args.path),external:false}));}}], logLevel: 'silent'});
const {sceneCatalog, overlaySchema, networkLayout, algorithmLessons, mathLessons, terminalTimeline, formatJsonExample, formatJsonExamples, httpResponseStatus, jsonFieldRange, previewJsonExample} = await import(pathToFileURL(output));
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
const customDiagram = iso.parse({objects: [{id: 'client', kind: 'client', at: [0, 0]}]});
assert.deepEqual(customDiagram.links, []);
assert.deepEqual(customDiagram.steps, []);
assert(iso.parse({}).steps.length > 0);
const crowded = iso.safeParse({objects: [{id: 'a', kind: 'server', at: [0, 0]}, {id: 'b', kind: 'server', at: [1, 1]}], links: [], steps: []});
assert.equal(crowded.success, false);
assert.match(crowded.error.issues[0].message, /covers "a" on screen/);
assert.equal(iso.safeParse({objects: [{id: 'a', kind: 'server', at: [0, 0]}, {id: 'b', kind: 'database', at: [3.5, -3.5]}], links: [{from: 'a', to: 'b'}], steps: [{at: 0.5, target: 'b', highlight: true}]}).success, true);
assert.equal(iso.safeParse({objects: [{id: 'a', kind: 'server', at: [0, 0]}], links: [{from: 'a', to: 'x'}], steps: []}).success, false);
const reactTile = icon => ({objects: [{id: 'icon', kind: 'tile', icon, at: [0, 0]}], links: [], steps: []});
for (const icon of ['react-icons/fa6/FaReact', 'react-icons/vsc/VscVscode', 'react-icons/gi/GiCoffeeCup']) {
  assert(iso.safeParse(reactTile(icon)).success, icon);
}
assert(!iso.safeParse(reactTile('react-icons/fa6/FaInventedIcon')).success);
assert.equal(iso.parse({objects: [], links: [], steps: [], title: 'Card'}).objects.length, 0);
// Tables fit instead of failing: short rows are padded, extra cells / columns / rows dropped.
assert.deepEqual(sceneCatalog.ComparisonTableScene.schema.parse({columns:['A','B'],rows:[['one'],['x','y','z']]}).rows, [['one',''],['x','y']]);
assert.equal(sceneCatalog.ComparisonTableScene.schema.parse({columns:['A','B','C','D','E','F','G'],rows:[['1','2','3','4','5','6','7']]}).columns.length, 6);
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
const [post, created] = terminalTimeline([
  {at: 0.1, do: 'run', text: 'curl -X POST /watches'},
  {at: 0.4, do: 'output', text: '201 Created\n{"id":"w-104"}'},
], 300, 30);
assert.equal(post.typeEnd, 30);
assert.equal(created.start, 120);
const [pageRequest, pageResponse] = terminalTimeline([
  {at: 0.8, do: 'run', text: "curl -i '/watches?limit=2'"},
  {at: 0.18, do: 'output', text: 'HTTP/1.1 200 OK\n{"data":[]}'},
], 342, 30);
assert.equal(pageRequest.do, 'run');
assert.equal(pageRequest.typeEnd, 0);
assert.equal(pageResponse.start, 62);
const ed = sceneCatalog.EditorScene.schema.parse({code: ['a = 1', 'print(b)'], actions: [{action: 'underline', lineNumber: '2', message: 'b is not defined'}]});
assert.deepEqual([ed.actions[0].do, ed.actions[0].line], ['error', 2]);
const annotation = sceneCatalog.AnnotatedTextScene.schema;
const request = {text: 'GET /watches', steps: [
  {at: 0.2, focus: 'GET', explanation: 'Read.'},
  {at: 0.5, focus: '/watches', explanation: 'The watch list.'},
  {at: 0.75, explanation: 'Read the watch list.'},
]};
assert(annotation.safeParse(request).success);
assert(!annotation.safeParse({...request, text: 'GET /watchs'}).success);
assert(!annotation.safeParse({...request, steps: [...request.steps].reverse()}).success);
const repeated = {layout: 'text', text: 'The rain stopped, then the rain returned.', steps: [
  {at: 0.3, focus: 'rain', occurrence: 2, explanation: 'The rain returned.'},
]};
assert(annotation.safeParse(repeated).success);
assert(!annotation.safeParse({...repeated, steps: [{...repeated.steps[0], occurrence: 3}]}).success);
const requestWithJson = 'POST /watches\n{"model":"5 Sports","price_cents":-1,"amount":9007199254740993}';
const prettyRequest = formatJsonExample(requestWithJson);
assert.equal(prettyRequest.header, 'POST /watches');
assert.deepEqual(prettyRequest.lines, ['{', '  "model": "5 Sports",', '  "price_cents": -1,', '  "amount": 9007199254740993', '}']);
assert.equal(prettyRequest.pieces.find(piece => piece.text === '-1').start, requestWithJson.indexOf('-1'));
assert(annotation.safeParse({layout:'editor', text:requestWithJson, steps:[{at:0.5, focus:'-1', explanation:'Check the price.'}]}).success);
assert.deepEqual(formatJsonExample('200 OK\n{"data":[{"ok":true}],"meta":{}}').lines,
  ['{','  "data": [','    {','      "ok": true','    }','  ],','  "meta": {}','}']);
const responseWithHeaders = 'HTTP/1.1 200 OK\nContent-Type: application/json\n\n{\n  "id": 42,\n  "name": "Trail Bottle",\n  "price": 24.99,\n  "currency": "USD"\n}';
const prettyResponse = formatJsonExample(responseWithHeaders);
assert.equal(prettyResponse.header, 'HTTP/1.1 200 OK\nContent-Type: application/json');
assert.equal(prettyResponse.pieces.find(piece => piece.text === '"Trail Bottle"').start, responseWithHeaders.indexOf('"Trail Bottle"'));
assert(annotation.safeParse({layout:'editor', text:responseWithHeaders, steps:[
  {at:0.1, focus:'HTTP/1.1 200 OK', explanation:'Check the status.'},
  {at:0.5, focus:'"Trail Bottle"', explanation:'Read the product name.'},
]}).success);
const collectionJson = '200 OK\n{"data":[{"id":"w-104"},{"id":"w-105","a/b~":true}]}';
const prettyCollection = formatJsonExample(collectionJson);
for (const [pointer, expected] of [['/data', '"data"'], ['/data/1/id', '"id":"w-105"'], ['/data/1/a~1b~0', '"a/b~":true']]) {
  const range = jsonFieldRange(prettyCollection, pointer);
  assert.equal(collectionJson.slice(range.start, range.start + range.length), expected);
  assert(annotation.safeParse({layout:'editor', text:collectionJson,
    steps:[{at:0.5, focusPath:pointer, explanation:'Read the response.'}]}).success);
}
assert(!annotation.safeParse({layout:'editor', text:collectionJson,
  steps:[{at:0.5, focusPath:'/data/2/id', explanation:'Read the response.'}]}).success);
const inlineResponse = formatJsonExample('200 OK · {"id":"w-104","available":true}');
assert.equal(inlineResponse.header, '200 OK');
for (const status of ['HTTP 200', 'HTTP/2 200', '200', '200 OK']) {
  const text = `GET /watches/w-104\n\n${status}\n{"data":{"id":"w-104"}}`;
  const example = formatJsonExample(text);
  assert.equal(httpResponseStatus(example.header).label, 'Status 200 OK');
  const range = jsonFieldRange(example, '/data/id');
  assert.equal(text.slice(range.start, range.start + range.length), '"id":"w-104"');
}
const collectionResponse = '200 {"data":[{"id":42,"brand":"Northstar","model":"Field 38"}]}';
const bareStatusResponse = formatJsonExample(collectionResponse);
assert.equal(httpResponseStatus(bareStatusResponse.header).label, 'Status 200 OK');
assert.deepEqual(JSON.parse(bareStatusResponse.lines.join('\n')).data[0], {id:42, brand:'Northstar', model:'Field 38'});
assert(iso.safeParse({exampleLines:[{at:0, text:'GET /catalogs/7/watches'}, {at:0.5,
  text:'200 '+JSON.stringify({data:[{id:42, brand:'Northstar', model:'Field 38', currency:'USD', available:true}]})}]}).success);

assert.deepEqual(inlineResponse.lines, ['{', '  "id": "w-104",', '  "available": true', '}']);
const exchanges = 'GET /watches/w-104\n200 OK\n{"id":"w-104"}\n\nGET /getWatch?id=w-104\n200 OK\n{"watchId":"w-104"}';
const formattedExchanges = formatJsonExamples(exchanges);
assert.equal(formattedExchanges.length, 2);
assert.equal(formattedExchanges[1].headerStart, exchanges.indexOf('GET /getWatch'));
const field = jsonFieldRange(formattedExchanges[1], '/watchId');
assert.equal(exchanges.slice(field.start, field.start + field.length), '"watchId":"w-104"');
for (const status of ['Response · 422', 'HTTP/1.1 422 Unprocessable Content', '422']) {
  const text = `POST /watches\n{ "price": -5 }\n\n${status}\n{"price":-5,"error":{"fields":{"price":"must be greater than 0"}}}`;
  const [request, response] = formatJsonExamples(text);
  assert.equal(request.header, 'POST /watches');
  assert.equal(response.header, status);
  const errorField = jsonFieldRange(response, '/error/fields/price');
  assert.equal(text.slice(errorField.start, errorField.start + errorField.length), '"price":"must be greater than 0"');
  const steps = [
    {at: 0.28, focusPath: '/price', explanation: 'Check the submitted price.'},
    {at: 0.63, focusPath: '/error/fields/price', explanation: 'Read the error.'},
    {at: 0.8, focusPath: '/price', occurrence: 2, explanation: 'Check the price echoed in the response.'},
  ];
  assert(annotation.safeParse({layout: 'editor', text, steps}).success);
  assert(!annotation.safeParse({layout: 'editor', text, steps: [{...steps[2], occurrence: 3}]}).success);
}
const errorResponse = '{"error":{"code":"validation_failed","message":"Price must be greater than 0","fields":[{"field":"price","issue":"must_be_positive"}]}}';
const prettyError = formatJsonExample(errorResponse);
const arrayItem = jsonFieldRange(prettyError, '/error/fields/0');
assert.equal(errorResponse.slice(arrayItem.start, arrayItem.start + arrayItem.length), '{"field":"price","issue":"must_be_positive"}');
assert.equal(previewJsonExample(prettyError, arrayItem.start, arrayItem.length, 80, 16).abbreviated, false);
assert.equal(formatJsonExample('Use {sample} to see the idea'), null);
assert.equal(formatJsonExample('{"id": ...}'), null);
const outcome = sceneCatalog.OutcomeComparisonScene.schema;
const comparison = {
  rows: [{parts: [{text: 'GET /watches'}], result: '[]'},
    {parts: [{text: 'GET /watches'}, {text: '/w-104'}], result: '{"id":"w-104"}'}],
  steps: [{at: 0.1, row: 0, reveal: true}, {at: 0.5, row: 1, part: 1, reveal: true}],
};
assert(outcome.safeParse(comparison).success);
assert(outcome.safeParse({...comparison, layout: 'editor', rows: [
  {...comparison.rows[0], parts: [{text: 'GET /watches\n→ {"data":[]}' }]},
  {...comparison.rows[1], parts: [{text: 'GET /watches/w-104\n'}, {text: '→ ' + 'long example '.repeat(20)}]},
]}).success);
assert(outcome.safeParse({...comparison, steps: [{at: 0.5, row: 0, part: 1}]}).success); // missing part: no highlight, not an error
assert(!outcome.safeParse({...comparison, steps: [...comparison.steps].reverse()}).success);
assert(outcome.safeParse({...comparison, steps: [{at: 0.5, row: 1, reveal: true, resultFocus: 'w-104'}]}).success);
assert(!outcome.safeParse({...comparison, steps: [{at: 0.5, row: 1, reveal: true, resultFocus: 'w-105'}]}).success);
// DrawScene forgives what a small model gets wrong instead of failing the plan
const draw = sceneCatalog.DrawScene.schema;
const drawn = draw.parse({shapes: [
  {id: 'a', type: 'rectangle', position: [10, 10], fill: 'grey', text: 'Box'},
  {id: 'b', kind: 'rocket', at: [30, 10]},
  {id: 'c', kind: 'teleporter', at: [50, 10], color: 'chartreuse'},
  {id: 'd', kind: 'arrow', from: 'a', to: 'b'},
  {id: 'e', kind: 'arrow', from: 'a', to: 'hydrogen-right'},
], steps: [{shape: 'a', action: 'highlight'}, {target: 'ghost', do: 'move', to: [1, 1]}]});
assert.deepEqual(drawn.shapes.map((s) => s.kind), ['box', 'icon', 'box', 'arrow']);
assert.equal(drawn.shapes[0].color, 'gray');
assert.equal(drawn.shapes[0].label, 'Box');
assert.equal(drawn.shapes[2].color, 'blue');
assert.equal(drawn.shapes[3].at, 'a');
assert.deepEqual(drawn.steps.map((s) => [s.target, s.do]), [['a', 'focus']]);
const layers = sceneCatalog.LayersScene.schema;
assert(!sceneCatalog.DatasetScene.schema.safeParse({features:['Area','Rooms']}).success);
assert(!sceneCatalog.ModelTrainingScene.schema.safeParse({rate:0.5}).success);
assert(!sceneCatalog.NeuralNetworkScene.schema.safeParse({steps:[
  {at:0.8,mode:'backward',layer:0,neuron:0},
]}).success);
assert(sceneCatalog.NeuralNetworkScene.schema.safeParse({target:3,steps:[
  {at:0.62,mode:'backward',layer:0,neuron:0},{at:0.8,mode:'update',layer:0,neuron:0},
]}).success);
assert(!sceneCatalog.TreeScene.schema.safeParse({tree:{label:'Question',children:['Yes']},
  decisionPath:[{at:0,reason:'Root'},{at:0.6,child:1,reason:'Choose a missing child'}]}).success);
assert(!sceneCatalog.MLScatterScene.schema.safeParse({mode:'clustering'}).success);
assert(!sceneCatalog.TextGenerationScene.schema.safeParse({turns:[
  {at:0.1,selection:{at:0.3},selected:0,choices:[{text:'x',prob:0.5},{text:'y',prob:0.6}]},
]}).success);
assert(!sceneCatalog.AttentionScene.schema.safeParse({queryIndex:4}).success);
assert(sceneCatalog.RAGScene.schema.safeParse({evidenceFocus:'6 p.m.'}).success);
assert(!sceneCatalog.RAGScene.schema.safeParse({evidenceFocus:'three weeks'}).success);
assert(!sceneCatalog.RAGScene.schema.safeParse({queryVector:[0,0,0]}).success);
assert(!sceneCatalog.RAGScene.schema.safeParse({search:{at:0.2}}).success);
assert(layers.safeParse({levels:[{label:'Views',value:120},{label:'Orders',value:0}]}).success);
assert(!layers.safeParse({levels:[{label:'Views',value:120},{label:'Orders',value:121}]}).success);
assert(!layers.safeParse({levels:[{label:'Views',value:120},{label:'Orders'}]}).success);
assert(sceneCatalog.MatrixScene.schema.safeParse({mode:'spectrum',markers:[
  {label:'Message',x:0.2,at:0,moves:[{x:0.8,at:0.4}]},
]}).success);
assert(!sceneCatalog.MatrixScene.schema.safeParse({markers:[
  {label:'Message',x:0.2,at:0.4,moves:[{x:0.8,at:0.2}]},
]}).success);
assert(!sceneCatalog.ImageScene.schema.safeParse({hotspots:[{x:0.4,y:0.6,at:0.2,label:'Feature'}]}).success);
assert(sceneCatalog.ImageScene.schema.safeParse({src:'earth/blue-marble.png',hotspots:[
  {x:0.4,y:0.6,at:0.2,label:'Feature'},
]}).success);
assert(!sceneCatalog.FactCheckScene.schema.safeParse({verdict:{status:'supported',reason:'See evidence',at:0.1}}).success);
assert(!sceneCatalog.CaseStudyScene.schema.safeParse({lesson:{text:'Read the case',at:0.1}}).success);
assert(!sceneCatalog.AnalogyScene.schema.safeParse({limitation:{text:'Where it breaks down',at:0.32}}).success);
assert(!sceneCatalog.ConceptMapScene.schema.safeParse({links:[{from:'media',to:'missing'}]}).success);
const commitHistory = sceneCatalog.GitGraphScene.schema;
const commits = [{id:'a'}, {id:'b',parents:['a']}, {id:'c',parents:['a'],lane:1},
  {id:'d',parents:['b','c'],at:0.6}];
assert(commitHistory.safeParse({commits,refs:{main:'b'},head:'main',
  steps:[{at:0.7,refs:{main:'d'},head:'d'}]}).success);
assert(!commitHistory.safeParse({commits,refs:{main:'d'}}).success);
assert(!commitHistory.safeParse({commits,steps:[{at:0.25,hide:['b']}]}).success);
assert(!commitHistory.safeParse({commits:[{id:'a',parents:['b']},{id:'b',parents:['a']}]}).success);
assert(sceneCatalog.TreeScene.schema.safeParse({kind:'tree',tree:{label:'Editor',children:['Reporter']}}).success);
const numericChart = {chartType: 'line', categories: ['1,000', '2,000'], xValues: [1000, 2000],
  series: [{name: 'Known prices', values: [200, 350]}], markers: [{at: 0.4, x: 1800, y: 320, label: 'Prediction'}],
  growFrames: 0};
assert(sceneCatalog.ChartScene.schema.safeParse(numericChart).success);
assert(!sceneCatalog.ChartScene.schema.safeParse({...numericChart, xValues: [1000, 1200]}).success);
assert(!sceneCatalog.ChartScene.schema.safeParse({...numericChart, xValues: [2000, 1000]}).success);
const ph = sceneCatalog.PhoneScene.schema.parse({screens: [{id: 'a', blocks: [{id: 'go', type: 'button', label: 'Go'}]}, {id: 'b', blocks: [{type: 'heading', label: 'Done'}]}], actions: [{action: 'click', target: 'go'}, {action: 'navigate', to: 'b'}, {action: 'loading', duration: 1500}]});
assert.deepEqual(ph.actions.map((x) => x.do), ['tap', 'open', 'wait']);
assert.equal(ph.actions[2].seconds, 1.5);
const scr = sceneCatalog.ScreenScene.schema.parse({page: [{id: 'q', type: 'input', label: 'Search'}], actions: [{action: 'fill', target: 'q', value: 'shoes'}, {action: 'tap', target: 'chat'}], chat: [{role: 'user', content: 'Hi'}]});
assert.deepEqual(scr.actions.map((x) => x.do), ['type', 'click']);
assert.equal(sceneCatalog.ScreenScene.schema.parse({page: [{type: 'heading', label: 'Own page'}]}).actions.length, 0); // own page: no demo script
assert(!sceneCatalog.FormScene.schema.safeParse({fields: [{id: 'p', label: 'P', type: 'password'}], actions: [{at: 0.2, do: 'submit', errors: [{to: 'p', text: 'short'}]}, {at: 0.5, do: 'submit', text: 'ok'}]}).success); // success before the fix
// A valid row index can still update the wrong logical record.
const worked = sceneCatalog.WorkedExampleScene.schema;
const initial = {at:0, action:'Select', explanation:'Read row A.', rows:[['A','12']], focusRow:0, focusColumn:1};
assert(worked.safeParse({columns:['ID','Value'], stages:[initial]}).success);
assert(!worked.safeParse({columns:['ID'], stages:[initial]}).success);
assert(!worked.safeParse({columns:['ID','Value'], stages:[{...initial,focusRow:1}]}).success);
assert(!worked.safeParse({columns:['ID','Value'], stages:[initial,initial]}).success);
// 5 columns (once over the limit of 4) now fit; rows follow the columns; 7 columns keep the first 6.
const wide = worked.parse({columns:['id','name','maker','price','available'], stages:[{...initial, rows:[['1','A','B','9','yes'],['2','C']]}]});
assert.deepEqual(wide.stages[0].rows, [['1','A','B','9','yes'],['2','C','','','']]);
const seven = worked.parse({columns:['a','b','c','d','e','f','g'], stages:[{...initial, rows:[['1','2','3','4','5','6','7']], focusColumn:5}]});
assert.equal(seven.columns.length, 6);
assert.equal(seven.stages[0].rows[0].length, 6);
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
// Stage rows without columns keep the source columns; a short row is padded.
const pf = sceneCatalog.PipelineScene.schema.parse({source: {columns: ['id', 'x'], rows: [[1, 2], [2]]}, stages: [{label: 'Keep', op: 'filter', rows: [[1]]}]});
assert.deepEqual([pf.source.rows[1], pf.stages[0].columns, pf.stages[0].rows[0]], [[2, ''], ['id', 'x'], [1, '']]);
assert.deepEqual(sceneCatalog.QueryScene.schema.parse({query: 'SELECT * FROM t', table: {columns: ['a', 'b'], rows: [[1, 2, 3], [4]]}}).table.rows, [[1, 2], [4, '']]);
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
  DatasetScene:'MLFoundations', ModelTrainingScene:'MLFoundations', ModelEvaluationScene:'MLFoundations',
  TokenizationScene:'LLMMechanics', TextGenerationScene:'LLMMechanics', AttentionScene:'LLMMechanics',
  ...Object.fromEntries(Object.keys(algorithmLessons).map(name => [name,'AlgorithmLessons'])),
  ...Object.fromEntries(Object.keys(mathLessons).map(name => [name,'MathLessons'])),
};
const entries=Object.entries(sceneCatalog).map(([name,e])=>({name,version:'1.0.0',description:e.description,tags:e.tags,path:existsSync(path.join(root,`src/staging/${name}.tsx`))?`rendering/src/staging/${name}.tsx`:`rendering/src/scenes/${sceneSources[name]??name}.tsx`,staged:existsSync(path.join(root,`src/staging/${name}.tsx`)),propsSchema:z.toJSONSchema(e.schema,{io:'input'}),example:e.example?e.schema.parse(e.example):e.schema.parse({})}));
const emptyExamples=entries.filter(e=>!Object.keys(e.example).length).map(e=>e.name);
assert.deepEqual(emptyExamples,[],`scenes with empty example props (export an "example"): ${emptyExamples}`);
await mkdir(path.join(root,'../library'), {recursive:true});
await writeFile(path.join(root,'../library/registry.json'),JSON.stringify(entries,null,2)+'\n');
const overlays=overlaySchema.options.map((o)=>{const s=z.toJSONSchema(o,{io:'input'});const type=s.properties.type.const;delete s.properties.type;s.required=(s.required??[]).filter((k)=>k!=='type');return {type,propsSchema:s};});
await writeFile(path.join(root,'../library/overlays.json'),JSON.stringify(overlays,null,2)+'\n');
// Lucide icon names for the backend (icon-first lookup before designing new iso art).
const lucide=await import('lucide-react');
const iconNames=[...new Set(Object.keys(lucide.icons).map((k)=>k.replace(/([a-z0-9])([A-Z])/g,'$1-$2').replace(/([A-Za-z])([0-9])/g,'$1-$2').toLowerCase()))].sort();
await writeFile(path.join(root,'../library/lucide-icons.json'),JSON.stringify(iconNames)+'\n');
console.log(`Checked ${entries.length} scene contracts, topology wiring, and invalid-input handling. Exported library/registry.json + ${overlays.length} overlays to library/overlays.json.`);
