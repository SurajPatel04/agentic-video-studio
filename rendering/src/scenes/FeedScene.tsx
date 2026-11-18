import {useCurrentFrame} from 'remotion';
import {z} from 'zod';
import {useSceneLength} from '../theme';
import {JournalismStage,IsoProp,Caption,Label,reveal} from './journalismStage';
export const feedSceneSchema=z.object({title:z.string().max(70).default('Inside a social media feed'),mode:z.enum(['scroll','ranking']).default('scroll'),posts:z.array(z.object({author:z.string().max(22),text:z.string().max(65),score:z.number().min(0).max(100),likes:z.number().int().min(0).max(999999),shares:z.number().int().min(0).max(99999)}).strict()).min(3).max(5).default([{author:'City desk',text:'A new park opens in our neighbourhood',score:62,likes:320,shares:45},{author:'Weekend guide',text:'Five things to explore this weekend',score:94,likes:840,shares:120},{author:'Local voices',text:'Meet the people behind the community garden',score:78,likes:540,shares:72}]),comment:z.string().max(60).default('Love seeing our community come together!')}).strict();
export const description='Isometric phone feed: scroll mode moves posts with growing like/share counters and a comment; ranking mode displays illustrative scores and visibly reorders the same posts by descending score. Not a model of any specific platform algorithm.';
export const tags=['social media','feed','phone','scroll','likes','shares','algorithm','ranking'];
export const FeedScene:React.FC<z.input<typeof feedSceneSchema>>=(input)=>{
 const p=feedSceneSchema.parse(input),t=useCurrentFrame()/Math.max(1,useSceneLength()-1),rank=reveal(t,.38,.26),engage=reveal(t,.12,.67);
 const order=p.posts.map((_,i)=>i).sort((a,b)=>p.posts[b].score-p.posts[a].score||a-b);
 return <JournalismStage title={p.title} eyebrow="SOCIAL MEDIA / THE FEED">
 <g transform="translate(300 15) matrix(1 .12 -.22 .9 0 0)"><path d="M0 12 L24 0 H444 V680 L420 700 H0Z" fill="#82778e" stroke="#393443" strokeWidth="3"/><rect x="0" y="10" width="420" height="690" rx="40" fill="#34323f"/><rect x="16" y="30" width="388" height="650" rx="25" fill="#faf6ed"/><rect x="157" y="38" width="110" height="17" rx="8" fill="#34323f"/><text x="40" y="92" fontSize="25" fontWeight="800">Your daily feed</text>
 <svg x="28" y="115" width="364" height="545" viewBox="0 0 364 545">
 {p.posts.map((post,i)=>{const pos=p.mode==='ranking'?i+(order.indexOf(i)-i)*rank:i;const cardScale=p.mode==='ranking'?Math.min(1,535/(p.posts.length*205)):1;const y=pos*205*cardScale-(p.mode==='scroll'?reveal(t,.28,.5)*(p.posts.length*205-470):0);return <g key={i} transform={`translate(0 ${y}) scale(1 ${cardScale})`}><rect x="3" y="3" width="354" height="193" rx="15" fill={['#e4dcef','#e0eadc','#f1e2c6','#dae6ec','#eddae1'][i]} stroke="#c0b3a1"/><text x="20" y="32" fontSize="17" fontWeight="800">{post.author}</text><foreignObject x="20" y="45" width="317" height="70"><div style={{fontSize:20,fontWeight:650,lineHeight:1.2}}>{post.text}</div></foreignObject><path d="M20 125 H334" stroke="#c4b6a4"/><text x="20" y="153" fontSize="16">♥ {Math.round(post.likes*engage)}    Shares {Math.round(post.shares*engage)}</text>{p.mode==='ranking'?<text x="20" y="179" fontSize="15" fontWeight="700">Ranking score: {Math.round(post.score*reveal(t,.1,.2))}</text>:null}</g>;})}
 </svg></g>
 <IsoProp kind="recommendation" x={1150} y={355} w={290} h={240} id="feed-ranking"/>
 <Label x={1140} y={420} text={p.mode==='ranking'?'Scores change what rises':'Scroll • react • share'} detail={p.mode==='ranking'?'Illustrative scores, not platform data':'Engagement grows as the post circulates'}/>
 <g opacity={reveal(t,.72)}><rect x="850" y="485" width="570" height="130" rx="22" fill="#fffaf1" stroke="#b9a9ca" strokeWidth="2"/><text x="880" y="521" fontSize="18" fontWeight="800">{p.mode==='ranking'?'TOP-RANKED POST':'NEW COMMENT'}</text><foreignObject x="880" y="540" width="505" height="65"><div style={{fontSize:24,lineHeight:1.2}}>{p.mode==='ranking'?p.posts[order[0]].text:p.comment}</div></foreignObject></g>
 <Caption progress={t} step={p.mode==='ranking'?'FEED RANKING':'FEED SCROLL'} text={p.mode==='ranking'?'Posts keep their identity as higher scores move them upward.':'A feed scrolls while likes, shares and conversation grow.'}/>
 </JournalismStage>;
};
