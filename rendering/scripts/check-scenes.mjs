import {build} from 'esbuild';
import {writeFile, mkdir} from 'node:fs/promises';
import {pathToFileURL} from 'node:url';
import path from 'node:path';
import assert from 'node:assert/strict';
const root = path.resolve(import.meta.dirname, '..');
await mkdir(path.join(root, 'out'), {recursive: true});
const output = path.join(root, 'out', 'catalog-check.mjs');
await build({stdin: {contents: `export {sceneCatalog} from './src/registry'; export {networkLayout} from './src/components/networkLayout';`, resolveDir: root, loader: 'ts'}, outfile: output, bundle: true, platform: 'node', format: 'esm', packages: 'external', plugins: [{name:'bundle-world-map',setup(b){b.onResolve({filter:/^world-atlas\//},args=>({path:path.join(root,'node_modules',args.path),external:false}));}}], logLevel: 'silent'});
const {sceneCatalog, networkLayout} = await import(pathToFileURL(output));
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
assert(!sceneCatalog.ComparisonTableScene.schema.safeParse({columns:['A','B'],rows:[['one']]}).success);
assert(!sceneCatalog.QuizScene.schema.safeParse({correctIndex:4}).success);
assert(!sceneCatalog.NetworkScene.schema.safeParse({packetFrames:0}).success);
assert(!sceneCatalog.ZoomOutScene.schema.safeParse({cityAt:120,globeAt:100}).success);
assert.equal(sceneCatalog.BuildingScene.schema.parse({}).preset, 'city');
assert.equal(sceneCatalog.TechnologyScene.schema.parse({}).preset, 'technology');
const entries=Object.entries(sceneCatalog).map(([name,e])=>({name,version:'1.0.0',description:e.description,tags:e.tags,path:`rendering/src/scenes/${['BuildingScene','TechnologyScene'].includes(name)?'InfrastructureScene':name}.tsx`,propsSchema:z.toJSONSchema(e.schema),example:e.schema.parse({})}));
await mkdir(path.join(root,'../library'), {recursive:true});
await writeFile(path.join(root,'../library/registry.json'),JSON.stringify(entries,null,2)+'\n');
console.log(`Checked ${entries.length} scene contracts, topology wiring, and invalid-input handling. Exported library/registry.json.`);
