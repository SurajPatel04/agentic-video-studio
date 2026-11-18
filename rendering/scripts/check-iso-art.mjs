import assert from 'node:assert/strict';
import {build} from 'esbuild';
import {mkdir} from 'node:fs/promises';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
const root=path.resolve(import.meta.dirname,'..');
await mkdir(path.join(root,'out'),{recursive:true});
const file=path.join(root,'out','iso-art-check.mjs');
await build({stdin:{resolveDir:root,loader:'tsx',contents:`export {createElement} from 'react'; export {renderToStaticMarkup} from 'react-dom/server'; export {IsoArt} from './src/iso/objects'; export {GENERAL_KINDS} from './src/iso/general'; export {ROAD_KINDS} from './src/iso/roads'; export {COMMUNICATION_KINDS} from './src/iso/communication'; export {AI_KINDS} from './src/iso/ai'; export {AUDIO_KINDS} from './src/iso/audio'; export {MEDIA_KINDS} from './src/iso/media'; export {isoSceneSchema} from './src/scenes/IsoScene'; export {IsoLink} from './src/iso/link'; export {curve} from './src/iso/curve';`},outfile:file,bundle:true,platform:'node',format:'esm',packages:'external',jsx:'automatic'});
const {createElement:h,renderToStaticMarkup:render,IsoArt,GENERAL_KINDS,ROAD_KINDS,COMMUNICATION_KINDS,AI_KINDS,MEDIA_KINDS,AUDIO_KINDS,isoSceneSchema,IsoLink,curve}=await import(pathToFileURL(file));
function art(kind,time=0,highlight=0){const [w,d,height]=(GENERAL_KINDS[kind]??ROAD_KINDS[kind]??COMMUNICATION_KINDS[kind]??AI_KINDS[kind]??MEDIA_KINDS[kind]??AUDIO_KINDS[kind])?.size??[2.8,1.5,2];return render(h('svg',{},h(IsoArt,{kind,id:kind,g:{x:0,y:0,z:0,w,d,h:height},zz:0,T:50,o:{x:150,y:200},sw:2,color:'#b8d6f3',time,highlight})));}
for(const kind of Object.keys(GENERAL_KINDS)){
 assert(isoSceneSchema.safeParse({objects:[{id:'a',kind,at:[0,0]}],links:[],steps:[]}).success,kind+' accepted by scene');
 for(const t of [0,.3,2,30]){const svg=art(kind,t);assert(!/NaN|Infinity|undefined/.test(svg),kind+' finite SVG');assert.equal(svg,art(kind,t),kind+' deterministic');}
}
for(const kind of ['clock','gear','chart','piechart','heartmonitor','ambulance']) assert.notEqual(art(kind,0),art(kind,.3),kind+' moves');
for(const kind of ['house','tree','chef','worker','police']) assert.equal(art(kind,0),art(kind,.3),kind+' remains static');
assert.notEqual(art('lightbulb',2,0),art('lightbulb',2,1),'bulb responds to highlight');
const parsed=isoSceneSchema.parse({objects:[{id:'a',kind:'house',at:[0,0]},{id:'b',kind:'factory',at:[8,-8]}],links:[{from:'a',to:'b',flow:'car'}],steps:[]});
assert.equal(parsed.links[0].flow,'car');
for(const [alias,kind] of [['bar-chart','chart'],['chat-bubble','chatbubble'],['police-officer','police'],['sun-and-cloud','weather']]) assert.equal(isoSceneSchema.parse({objects:[{id:'a',kind:alias,at:[0,0]}],links:[],steps:[]}).objects[0].kind,kind);
const link=(phase,progress=1)=>render(h('svg',{},h(IsoLink,{k:curve({x:0,y:50},{x:100,y:0},{x:250,y:50}),phase,progress,u:1,sw:2,T:50,flow:'car'})));
assert.notEqual(link(5),link(15),'car travels');
assert(!/link-car/.test(link(5,.5)),'car waits until link has drawn');
assert(!/NaN|Infinity/.test(link(5)),'car transform is finite');
console.log(`Checked ${Object.keys(GENERAL_KINDS).length} new kinds, aliases, deterministic motion, highlight and car links.`);

for(const kind of Object.keys(ROAD_KINDS)){
 assert(isoSceneSchema.safeParse({objects:[{id:'r',kind,at:[0,0]}],links:[],steps:[]}).success);
 assert(!/NaN|Infinity/.test(art(kind)));
 assert(art(kind).includes('data-road-kind="'+kind+'"'));
}
assert(!art('singlelane').includes('data-marking="center"'));
assert(art('twolane').includes('data-marking="center"'));
assert(art('fourlane').includes('data-marking="lane-dividers"'));
assert(art('highway').includes('highway-median'));
for(const [alias,kind] of [['single-lane-road','singlelane'],['two-lane-road','twolane'],['four-lane-road','fourlane'],['divided-highway','highway']]) assert.equal(isoSceneSchema.parse({objects:[{id:'r',kind:alias,at:[0,0]}],links:[],steps:[]}).objects[0].kind,kind);
console.log('Checked road variants, lane markings, median and aliases.');

for(const kind of Object.keys(COMMUNICATION_KINDS)){
 assert(isoSceneSchema.safeParse({objects:[{id:'c',kind,at:[0,0]}],links:[],steps:[]}).success);
 for(const t of [0,.3,2]) {assert(!/NaN|Infinity|undefined/.test(art(kind,t)));assert.equal(art(kind,t),art(kind,t));}
}
for(const kind of ['sender','receiver','feedback','noise']) assert.notEqual(art(kind,0),art(kind,.3),kind+' animated');
assert.notEqual(art('encoder'),art('decoder'),'encoding and decoding are distinct');
for(const [alias,kind] of [['message-envelope','envelope'],['sender-station','sender'],['receiver-station','receiver'],['feedback-loop','feedback'],['noise-interference','noise']]) assert.equal(isoSceneSchema.parse({objects:[{id:'c',kind:alias,at:[0,0]}],links:[],steps:[]}).objects[0].kind,kind);
console.log('Checked seven communication kinds, aliases and animated states.');

for(const kind of Object.keys(AI_KINDS)){
 assert(isoSceneSchema.safeParse({objects:[{id:'m',kind,at:[0,0]}],links:[],steps:[]}).success,kind+' accepted by scene');
 for(const t of [0,.3,2]){const svg=art(kind,t);assert(!/NaN|Infinity|undefined/.test(svg),kind+' finite SVG');assert.equal(svg,art(kind,t),kind+' deterministic');}
}
assert.notEqual(art('alteredimage'),art('verified'),'altered image and verified are distinct');
for(const [alias,kind] of [['ai-label','aigeneratedlabel'],['synthetic-voice','aivoice'],['provenance','verified'],['deepfake','alteredimage'],['recommendation-system','recommendation'],['verification-panel','verified']]) assert.equal(isoSceneSchema.parse({objects:[{id:'m',kind:alias,at:[0,0]}],links:[],steps:[]}).objects[0].kind,kind);
console.log('Checked five AI and emerging-media kinds and aliases.');

for(const kind of Object.keys(AUDIO_KINDS)){
 assert(isoSceneSchema.safeParse({objects:[{id:'s',kind,at:[0,0]}],links:[],steps:[]}).success,kind+' accepted by scene');
 for(const t of [0,.3,2]){const svg=art(kind,t);assert(!/NaN|Infinity|undefined/.test(svg),kind+' finite SVG');assert.equal(svg,art(kind,t),kind+' deterministic');}
}
assert.notEqual(art('mixingconsole'),art('audiorecorder'),'mixing console and recorder are distinct');
assert.notEqual(art('speaker'),art('headphones'),'speaker and headphones are distinct');
for(const [alias,kind] of [['headset','headphones'],['mixer','mixingconsole'],['sound-board','mixingconsole'],['boom-mic','boommic'],['studio-monitor','speaker'],['field-recorder','audiorecorder'],['podcast-studio','podcastbooth']]) assert.equal(isoSceneSchema.parse({objects:[{id:'s',kind:alias,at:[0,0]}],links:[],steps:[]}).objects[0].kind,kind);
console.log('Checked six radio, audio and podcast kinds and aliases.');

for(const kind of Object.keys(MEDIA_KINDS)){
 assert(isoSceneSchema.safeParse({objects:[{id:'m',kind,at:[0,0]}],links:[],steps:[]}).success,kind);
 for(const t of [0,.3,2]){assert(!/NaN|Infinity|undefined/.test(art(kind,t)),kind);assert.equal(art(kind,t),art(kind,t));}
}
assert.equal(isoSceneSchema.parse({objects:[{id:'a',kind:'tripod-camera',at:[0,0]}],links:[],steps:[]}).objects[0].kind,'studiocamera');
assert.equal(isoSceneSchema.parse({objects:[{id:'a',kind:'anchor-desk',at:[0,0]}],links:[],steps:[]}).objects[0].kind,'newsdesk');
console.log(`Checked ${Object.keys(MEDIA_KINDS).length} media objects and broadcast aliases.`);

for(const [alias,kind] of [['press-release','pressrelease'],['press-conference','pressconference'],['media-kit','mediakit'],['crisis-response-center','crisiscentre']]) assert.equal(isoSceneSchema.parse({objects:[{id:'a',kind:alias,at:[0,0]}],links:[],steps:[]}).objects[0].kind,kind);

for(const [alias,kind] of [['ballot-box','ballotbox'],['campaign-rally','campaignrally'],['public-meeting','publicmeeting'],['protest-placard','protestplacard'],['government-information-office','governmentoffice']]) assert.equal(isoSceneSchema.parse({objects:[{id:'a',kind:alias,at:[0,0]}],links:[],steps:[]}).objects[0].kind,kind);
