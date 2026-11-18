import {bundle} from '@remotion/bundler';
import {openBrowser, selectComposition, renderStill} from '@remotion/renderer';
import {mkdir,rm} from 'node:fs/promises';
import path from 'node:path';
const root=path.resolve(import.meta.dirname,'..'),out=path.join(root,'out/social-media');
await mkdir(out,{recursive:true});
const serveUrl=await bundle({entryPoint:path.join(root,'src/index.ts'),publicDir:path.join(root,'public'),rootDir:root});
const browser=await openBrowser('chrome',{chromiumOptions:{gl:'angle'}});
try {
 const jobs=[['FeedScene','scroll'],['FeedScene','ranking'],['SpreadScene','viral'],['SpreadScene','race'],['CreatorWorkflowScene',null],...['communication','agenda','two-step','gratifications'].map(m=>['MediaTheoryScene',m])];
 for(const [component,mode] of jobs) {
  const inputProps={fps:30,width:1920,height:1080,brand:false,scenes:[{id:'preview',component,durationInFrames:300,props:mode?{mode}:{}}]};
  const composition=await selectComposition({serveUrl,id:'VideoComposition',inputProps,puppeteerInstance:browser});
  for(const frame of [150,285]) {
   await renderStill({serveUrl,composition,inputProps,puppeteerInstance:browser,frame,scale:0.5,output:path.join(out,`${component}-${mode??"default"}-${frame}.png`)});
   console.log(`${component} frame ${frame}`);
  }
 }
} finally {await browser.close({silent:true});await rm(serveUrl,{recursive:true,force:true});}
