// Render review sheets and an interactive gallery for the isometric artwork.
import {build} from 'esbuild';
import {mkdir, writeFile} from 'node:fs/promises';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
const root = path.resolve(import.meta.dirname, '..');
const out = path.join(root, 'out', 'iso-collections');
await mkdir(out, {recursive:true});
await build({stdin:{contents:`import React from 'react'; import {renderToStaticMarkup} from 'react-dom/server'; import {IsoArt} from './src/iso/objects'; import {ISO_COLORS, PAPER} from './src/iso/iso'; import {GENERAL_KINDS} from './src/iso/general'; import {ROAD_KINDS} from './src/iso/roads'; import {COMMUNICATION_KINDS} from './src/iso/communication'; export {React,renderToStaticMarkup,IsoArt,ISO_COLORS,PAPER,GENERAL_KINDS,ROAD_KINDS,COMMUNICATION_KINDS};`,resolveDir:root,loader:'tsx'},bundle:true,platform:'node',format:'esm',packages:'external',outfile:path.join(out,'art.mjs'),jsx:'automatic'});
const {React,renderToStaticMarkup,IsoArt,ISO_COLORS,PAPER,GENERAL_KINDS,ROAD_KINDS,COMMUNICATION_KINDS} = await import(pathToFileURL(path.join(out,'art.mjs')));
const h = React.createElement;
const groups = {
 retail:[['shop',3.2,2,2.8,'cream'],['shoppingcart',2,1.4,1.8,'sky'],['conveyor',3.4,1.6,1.6,'slate'],['register',2.4,1.5,1.8,'peach'],['warehouse',2.6,1,3.2,'slate'],['pricetag',1.8,.6,1.8,'butter'],['shoppingbag',1.6,1,2,'coral'],['factory',3.2,2,2.8,'slate'],['officedesk',2.8,1.6,1.5,'butter'],['handshake',2.4,1.4,1.2,'lavender'],['meetingtable',3.4,2.4,1,'cream']],
 transport:[['car',2.8,1.5,1.5,'coral'],['truck',3.4,1.6,2,'sky'],['bus',4,1.6,2,'butter'],['train',4,1.6,1.8,'lavender'],['airplane',4,2.6,.9,'sky'],['ship',4,1.8,1.8,'slate'],['bicycle',2.4,1.4,1.4,'teal'],['trafficlight',.8,.8,2.6,'slate'],['fuelpump',1.6,1.2,2.4,'coral'],['mappin',1.6,.5,2.4,'coral']]
};
const general = Object.entries(GENERAL_KINDS).map(([kind,v]) => [kind,...v.size,v.color]);
groups.general = general.slice(0,12);
groups.print = general.filter(([kind])=>['printingpress','newspaperbundle','magazine','printingplates','newsstand','deliverystack'].includes(kind));
groups.symbols = [...general.slice(12), ['doctor',1.2,1.2,2.4,'sky'], ['teacher',3.2,1.4,2.4,'sky'], ['cloud',2.4,2.4,1.2,'sky'], ['factory',3.2,2,2.8,'slate']];
groups.motion = [['clock',2,.6,2.3,'sky'],['gear',2.2,.7,2.2,'slate'],['chart',2.6,1.6,2.4,'mint'],['piechart',2.4,2.4,.6,'lavender'],['heartmonitor',2.2,.9,2,'slate'],['ambulance',2.8,1.5,1.8,'cream'],['lightbulb',1.6,1.3,2.5,'butter']];
groups.roads = [['tree',2,2,3,'mint'],...Object.entries(ROAD_KINDS).map(([kind,v])=>[kind,...v.size,v.color])];
groups.communication = Object.entries(COMMUNICATION_KINDS).map(([kind,v])=>[kind,...v.size,v.color]);
const titles = {print:'Print & publishing',communication:'Communication fundamentals',roads:'Trees & road types',retail:'Retail & business',transport:'Transport & logistics',general:'Everyday objects',symbols:'Symbols & people',motion:'Moving parts'};
for (const [name,items] of Object.entries(groups)) {
 const sheetHeight = name === 'roads' ? 1200 : 850;
 const svg = renderToStaticMarkup(h('svg',{xmlns:'http://www.w3.org/2000/svg',width:1600,height:sheetHeight,viewBox:`0 0 1600 ${sheetHeight}`},
 h('rect',{width:1600,height:sheetHeight,fill:PAPER.bg}),
 h('text',{x:60,y:75,fontFamily:'sans-serif',fontSize:34,fontWeight:700,fill:PAPER.ink},titles[name]),
 ...items.map(([kind,w,d,height,color],i)=>{
 const cols=name==='print'?3:name==='communication'?4:name==='roads'?2:name === 'transport' ? 5 : 6, x=(name==='print'?265:name==='communication'?200:name==='roads'?400:140)+(i%cols)*(name==='print'?530:name==='communication'?400:name==='roads'?800:name === 'transport' ? 320 : 260),y=(name==='roads'?260:320)+Math.floor(i/cols)*(name==='roads'?330:350),T=42;
 return h('g',{key:kind},h('ellipse',{cx:x,cy:y+28,rx:65,ry:15,fill:PAPER.shadow,opacity:.5}),h(IsoArt,{kind,id:kind,g:{x:0,y:0,z:0,w,d,h:height},zz:0,T,o:{x:x-(w-d)*.866*T/2,y:y-(w+d)*T/4+height*T*.35},sw:1.8,color:ISO_COLORS[color],time:2,highlight:kind==='lightbulb'?1:0}),h('text',{x,y:y+(name==='roads'?Math.max(125,(w+d)*T/4+height*T*.35+30):125),textAnchor:'middle',fontFamily:'monospace',fontSize:17,fill:PAPER.ink},kind));
 })));
 await writeFile(path.join(out,`${name}.svg`),svg);
}
console.log(out);

// This is a local review page, using the same components as the video renderer.
await build({stdin:{resolveDir:root,loader:'tsx',contents:`
import React, {useEffect,useState} from 'react';
import {createRoot} from 'react-dom/client';
import {IsoArt} from './src/iso/objects';
import {IsoLink} from './src/iso/link';
import {curve} from './src/iso/curve';
import {ISO_COLORS,PAPER} from './src/iso/iso';
const groups=${JSON.stringify(groups)},titles=${JSON.stringify(titles)};
function Gallery(){
 const [time,setTime]=useState(2),[playing,setPlaying]=useState(true),[glow,setGlow]=useState(true);
 useEffect(()=>{if(!playing)return; const timer=setInterval(()=>setTime(t=>(t+1/20)%20),50);return ()=>clearInterval(timer)},[playing]);
 return <><header><h1>Isometric object library</h1><p>Live artwork from the video renderer</p><button onClick={()=>setPlaying(v=>!v)}>{playing?'Pause':'Play'}</button> <button onClick={()=>setTime(0)}>Restart</button> <label><input type="checkbox" checked={glow} onChange={e=>setGlow(e.target.checked)}/> Highlight bulb</label> <input aria-label="Time in seconds" type="range" min="0" max="20" step="0.05" value={time} onChange={e=>{setPlaying(false);setTime(Number(e.target.value))}}/> {time.toFixed(1)}s</header>
 {['print','communication','roads','general','symbols','motion','retail','transport'].map(name=><section key={name}><h2>{titles[name]}</h2><div className="grid">{groups[name].map(([kind,w,d,height,color])=><figure key={kind}><svg viewBox="0 0 240 230"><IsoArt kind={kind} id={name+'-'+kind} g={{x:0,y:0,z:0,w,d,h:height}} zz={0} T={Math.min(35,210/((w+d)*.866))} o={{x:120-(w-d)*.866*Math.min(35,210/((w+d)*.866))/2,y:140-(w+d)*Math.min(35,210/((w+d)*.866))/4+height*Math.min(35,210/((w+d)*.866))*.35}} sw={1.8} color={ISO_COLORS[color]} time={time} highlight={glow&&kind==='lightbulb'?1:0}/></svg><figcaption>{kind}</figcaption></figure>)}</div></section>)}
 <section><h2>Car travelling along a link</h2><svg viewBox="0 0 1200 200"><IsoLink k={curve({x:70,y:150},{x:600,y:-60},{x:1130,y:150})} progress={1} phase={time*30} u={1} sw={2} T={60} flow="car"/></svg></section></>;
}
createRoot(document.getElementById('root')).render(<Gallery/>);
`},bundle:true,platform:'browser',format:'iife',outfile:path.join(out,'gallery.js'),jsx:'automatic',minify:true});
await writeFile(path.join(out,'index.html'),`<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Isometric object library</title><style>body{background:#f4ede2;color:#2b2833;font:16px system-ui;margin:0 auto;max-width:1600px;padding:32px}header{position:sticky;top:0;background:#f4ede2f5;padding:16px;z-index:2;border-bottom:1px solid #d9cfc0}h1{margin:0}button{padding:8px 18px;border:1px solid #b5a99c;background:#fffaf1;border-radius:6px;cursor:pointer}section{padding:24px 0}.grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:16px}figure{margin:0;text-align:center;background:#fffaf155;border-radius:12px;padding-bottom:20px}svg{width:100%;display:block}figcaption{font:14px monospace}input{vertical-align:middle}</style><div id="root"></div><script src="gallery.js"></script></html>`);
