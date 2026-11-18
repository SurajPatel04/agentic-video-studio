import {bundle} from '@remotion/bundler';
import {mkdir, rm} from 'node:fs/promises';
import {openBrowser, renderStill, selectComposition} from '@remotion/renderer';
import path from 'node:path';

const root = path.resolve(import.meta.dirname);
const outDir = path.join(root, '..', 'test_picture', 'iso-icon', '18-media');
const sheetsDir = path.join(root, '..', 'test_picture', 'iso-icon', 'sheets');
await mkdir(outDir, {recursive: true});
await mkdir(sheetsDir, {recursive: true});

const inputFor = (list, zoom, width, height, spread = false) => ({
  fps: 30, width, height, brand: false,
  theme: {background: 'radial-gradient(circle at 50% 40%, #1b2f52 0%, #070d1c 75%)', accent: '#38bdf8'},
  defaultTransition: {type: 'none'},
  scenes: [{id: 'preview', component: 'IsoScene', durationInFrames: 120, props: {
    objects: list.map((kind, i) => ({
      id: `${kind}${i}`, kind, label: kind,
      at: spread ? [(i-(list.length-1)/2)*4.3, -(i-(list.length-1)/2)*4.3] : [0, 0],
      enter: 'none', ghost: false, highlight: false,
    })),
    links: [], steps: [], zoom, sound: false,
  }}],
});

const groups={publicaffairs:['parliament','ballotbox','campaignrally','publicmeeting','protestplacard','governmentoffice'],publicrelations:['pressrelease','podium','pressconference','spokesperson','mediakit','crisiscentre'],audio:['headphones','mixingconsole','boommic','speaker','audiorecorder','podcastbooth'],broadcast:['studiocamera','newsdesk','teleprompter','studiolights','controlmonitors','obvan'],film:['clapperboard','cinemaprojector','cinemascreen','filmreel','storyboard','editingtimeline','theatrestage'],digital:['socialpost','scrollingfeed','videoplayer','livestream','comments','repost','notification','hashtag'],advertising:['productdisplay','campaignboard','sponsoredpost','adplacement','paywall','adpayment']};
const jobs=Object.entries(groups).filter(([name])=>!process.argv[2]||name===process.argv[2]).map(([name,list])=>({name,list,zoom:1,width:2400,height:800,spread:true}));
console.log('Bundling...');
const serveUrl = await bundle({entryPoint: path.join(root, 'src/index.ts'), publicDir: path.join(root, 'public'), rootDir: root});
const browser = await openBrowser('chrome', {chromiumOptions: {gl: 'angle'}});
try {
  for (const job of jobs) {
    const inputProps = inputFor(job.list, job.zoom, job.width, job.height, job.spread);
    const composition = await selectComposition({serveUrl, id: 'VideoComposition', inputProps, puppeteerInstance: browser});
    const out = path.join(outDir, `${job.name}.png`);
    await renderStill({serveUrl, composition, inputProps, frame: 90, output: out, imageFormat: 'png', puppeteerInstance: browser});
    console.log('Rendered', out);

  }
} finally {
  await browser.close({silent: true});
  await rm(serveUrl, {recursive: true, force: true});
}
