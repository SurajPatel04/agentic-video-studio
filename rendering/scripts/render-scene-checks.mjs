import {bundle} from '@remotion/bundler';
import {openBrowser, selectComposition, renderStill} from '@remotion/renderer';
import {mkdir, rm} from 'node:fs/promises';
import path from 'node:path';
const root=path.resolve(import.meta.dirname,'..');
const output=path.join(root,'out/scene-checks');
await mkdir(output,{recursive:true});
const serveUrl=await bundle({entryPoint:path.join(root,'src/index.ts'),publicDir:path.join(root,'public'),rootDir:root});
const browser=await openBrowser('chrome',{chromiumOptions:{gl:'angle'}});
const checks=[
 ['NetworkScene',{topology:'star'},100],['NetworkScene',{topology:'bus'},100],['NetworkScene',{topology:'ring'},100],['NetworkScene',{topology:'mesh'},100],
 ['CityNetworkScene',{},100],['ZoomOutScene',{},60],['ZoomOutScene',{},170],['ZoomOutScene',{},290],
 ['ComparisonTableScene',{},120],['PacketJourneyScene',{},160],['DefinitionScene',{},60],['ExampleCardScene',{},60],['StepsScene',{},120],['QuizScene',{},60],['QuizScene',{},150],['SummaryScene',{},120],
];
try {
 for (const [i,[component,props,frame]] of checks.entries()) {
  const inputProps={fps:30,width:1920,height:1080,scenes:[{id:'check',component,durationInFrames:360,props}]};
  const composition=await selectComposition({serveUrl,id:'VideoComposition',inputProps,puppeteerInstance:browser});
  await renderStill({serveUrl,composition,inputProps,puppeteerInstance:browser,frame,scale:0.5,output:path.join(output,`${String(i).padStart(2,'0')}.png`),imageFormat:'png'});
  console.log(`${i}: ${component} ${JSON.stringify(props)} frame=${frame}`);
 }
} finally {await browser.close({silent:true});await rm(serveUrl,{recursive:true,force:true});}
