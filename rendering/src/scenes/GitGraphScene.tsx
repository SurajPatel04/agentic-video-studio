import {useVideoConfig} from 'remotion';
import {z} from 'zod';
import {LectureBoard, lectureColors, useLectureTiming} from '../components/LectureBoard';
import {PAPER} from '../iso/iso';
import {useUnit} from '../theme';
import {fraction, MONO} from './paperStage';

const commitId=z.string().min(1).max(12);
const commit=z.object({
  id:commitId, parents:z.array(commitId).max(4).default([]),
  lane:z.number().int().min(0).max(3).default(0),
  message:z.string().max(39).optional(),at:fraction.default(0),
}).strict();
const refs=z.record(z.string().min(1).max(24),commitId);
const checkpoint=z.object({
  at:fraction, refs:refs.optional(),head:z.string().min(1).max(24).optional(),
  hide:z.array(commitId).max(12).optional(),note:z.string().max(120).optional(),
}).strict();

export const gitGraphSceneSchema=z.object({
  title:z.string().max(78).default('What a merge commit connects'),
  commits:z.array(commit).min(1).max(12).default([
    {id:'a1',parents:[],lane:0,message:'Start the project',at:0},
    {id:'b2',parents:['a1'],lane:0,message:'Update the readme',at:0.18},
    {id:'c3',parents:['a1'],lane:1,message:'Add the feature',at:0.38},
    {id:'d4',parents:['b2','c3'],lane:0,message:'Merge the feature',at:0.68},
  ]),
  refs:refs.default({}),
  head:z.string().min(1).max(24).optional(),
  steps:z.array(checkpoint).max(10).default([]),
}).strict().superRefine((p,ctx)=>{
  const byId=new Map<string,z.output<typeof commit>>();
  p.commits.forEach((c,i)=>{
    if (byId.has(c.id)) ctx.addIssue({code:'custom',path:['commits',i,'id'],message:'Commit IDs must be unique.'});
    if (new Set(c.parents).size!==c.parents.length || c.parents.some(id=>!byId.has(id) || byId.get(id)!.at>c.at)) {
      ctx.addIssue({code:'custom',path:['commits',i,'parents'],message:'Use distinct parents listed before this commit and visible by its cue.'});
    }
    if (i && c.at<p.commits[i-1].at) ctx.addIssue({code:'custom',path:['commits',i,'at'],message:'List commits in reveal order.'});
    byId.set(c.id,c);
  });
  let currentRefs=p.refs, currentHead=p.head;
  const hidden=new Set<string>();
  const checkState=(at:number,path:(string|number)[])=>{
    const visible=(id:string)=>byId.has(id)&&byId.get(id)!.at<=at&&!hidden.has(id);
    for (const [name,id] of Object.entries(currentRefs)) {
      if (name==='HEAD' || !visible(id)) ctx.addIssue({
        code:'custom',path:[...path,'refs',name],message:'A branch needs a visible commit. Set HEAD separately.',
      });
    }
    if (currentHead && !visible(Object.hasOwn(currentRefs,currentHead)?currentRefs[currentHead]:currentHead)) ctx.addIssue({
      code:'custom',path:[...path,'head'],message:'Attach HEAD to a current branch or detach it at a visible commit.',
    });
    const broken=p.commits.find(c=>visible(c.id)&&c.parents.some(id=>!visible(id)));
    if (broken) ctx.addIssue({code:'custom',path:[...path,'hide'],message:`Keep the parents of visible commit ${broken.id}.`});
  };
  checkState(0,[]);
  p.steps.forEach((step,i)=>{
    const path=['steps',i];
    if (i && step.at<=p.steps[i-1].at) ctx.addIssue({code:'custom',path:[...path,'at'],message:'Order branch updates by cue.'});
    currentRefs=step.refs ?? currentRefs;
    currentHead=step.head ?? currentHead;
    step.hide?.forEach(id=>{
      if (!byId.has(id) || byId.get(id)!.at>step.at) ctx.addIssue({code:'custom',path:[...path,'hide'],message:`Unknown or unrevealed commit ${id}.`});
      hidden.add(id);
    });
    checkState(step.at,path);
    const next=p.steps[i+1]?.at ?? 1.01;
    p.commits.filter(c=>c.at>step.at&&c.at<next).forEach(c=>checkState(c.at,path));
  });
});

export const description='Teach Git history on a stable commit graph. Supply commits in parent-first order with a lane and reveal cue. Use full refs snapshots and branch or detached HEAD updates on steps. A merge has multiple parent IDs. For rebase, reveal the rewritten commits with new IDs, move the branch, and optionally hide its old path.';
export const tags=['git graph','git','version control','commit','branch','head','merge','rebase','cherry pick','detached head'];

export function GitGraphScene(input:z.input<typeof gitGraphSceneSchema>) {
  const p=gitGraphSceneSchema.parse(input);
  const timing=useLectureTiming(),u=useUnit();
  const {width,height}=useVideoConfig();
  const portrait=width<height;
  const active=p.steps.filter(step=>timing.cueFrame(step.at)<=timing.frame);
  const refsNow=active.filter(step=>step.refs).at(-1)?.refs ?? p.refs;
  const headNow=active.filter(step=>step.head).at(-1)?.head ?? p.head;
  const hidden=new Set(active.flatMap(step=>step.hide ?? []));
  const hasRefs=Boolean(p.head || Object.keys(p.refs).length || p.steps.some(step=>step.head || Object.keys(step.refs ?? {}).length));
  const minLane=Math.min(...p.commits.map(c=>c.lane)),maxLane=Math.max(...p.commits.map(c=>c.lane));
  const coords=new Map(p.commits.map((c,i)=>{
    const chronology=p.commits.length===1?0.5:0.07+0.86*i/(p.commits.length-1);
    const lane=maxLane===minLane?0.5:0.16+0.62*(c.lane-minLane)/(maxLane-minLane);
    return [c.id,{x:100*(portrait?lane:chronology),y:100*(portrait?chronology:lane),at:c.at}];
  }));
  return <LectureBoard title={p.title}>
    <div style={{display:'grid',gridTemplateRows:'auto minmax(0,1fr) auto',gap:14*u,padding:`${8*u}px 0`,
      maxWidth:1480*u,width:'100%'}}>
      <div style={{visibility:hasRefs?'visible':'hidden',display:'flex',alignItems:'center',flexWrap:'wrap',gap:`${5*u}px ${16*u}px`,minHeight:60*u,
        background:PAPER.card,border:`1px solid ${PAPER.track}`,borderRadius:11*u,padding:`${9*u}px ${15*u}px`,fontFamily:MONO}}>
        {headNow ? <strong style={{fontSize:20*u,color:lectureColors[0].ink}}>
          HEAD → {Object.hasOwn(refsNow,headNow)?headNow:`${headNow} (detached)`}
        </strong> : null}
        {Object.entries(refsNow).map(([name,id])=><span key={name} style={{fontSize:18*u,color:lectureColors[1].ink}}>
          {name} → {id}
        </span>)}
      </div>
      <div style={{position:'relative',background:PAPER.card,border:`1px solid ${PAPER.track}`,borderRadius:13*u,overflow:'hidden'}}>
        <svg width="100%" height="100%" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden style={{position:'absolute'}}>
          {p.commits.flatMap(c=>c.parents.map((id,index)=>{
            const from=coords.get(id)!,to=coords.get(c.id)!;
            const bend=portrait?(from.y+to.y)/2:(from.x+to.x)/2;
            const d=portrait?`M ${from.x} ${from.y} C ${from.x} ${bend},${to.x} ${bend},${to.x} ${to.y}`:
              `M ${from.x} ${from.y} C ${bend} ${from.y},${bend} ${to.y},${to.x} ${to.y}`;
            return <path key={`${id}-${c.id}`} d={d} fill="none" stroke={lectureColors[c.lane].ink}
              strokeDasharray={index>0?`${7*u} ${6*u}`:undefined} strokeWidth={3*u} vectorEffect="non-scaling-stroke"
              opacity={hidden.has(c.id)||hidden.has(id)?0:timing.progress(c.at)}/>;
          }))}
        </svg>
        {p.commits.map(c=>{
          const point=coords.get(c.id)!;
          const color=lectureColors[c.lane],labels=Object.keys(refsNow).filter(ref=>refsNow[ref]===c.id);
          const attached=headNow===c.id&&!Object.hasOwn(refsNow,c.id);
          const focus=attached || labels.includes(headNow ?? '');
          return <div key={c.id} style={{position:'absolute',left:`${point.x}%`,top:`${point.y}%`,
            transform:'translate(-50%,-50%)',opacity:hidden.has(c.id)?0:timing.progress(c.at),width:0,height:0}}>
            {labels.length||attached?<div style={{position:'absolute',right:portrait?20*u:undefined,left:portrait?undefined:0,
              bottom:portrait?undefined:21*u,top:portrait?0:undefined,transform:portrait?'translateY(-50%)':'translateX(-50%)',
              whiteSpace:'nowrap',background:color.fill,borderRadius:5*u,padding:`${3*u}px ${7*u}px`,
              fontFamily:MONO,fontSize:(p.commits.length>8?14:17)*u,fontWeight:750,color:color.ink}}>
              {[...labels,...(attached?['HEAD']:[])].join(' · ')}
            </div>:null}
            <div style={{width:29*u,height:29*u,background:color.ink,border:`${(focus?4:2)*u}px solid ${focus?'#e0aa66':PAPER.card}`,
              borderRadius:'50%',transform:'translate(-50%,-50%)'}}/>
            <div style={{position:'absolute',top:portrait?0:20*u,left:portrait?24*u:0,
              transform:portrait?'translateY(-35%)':'translateX(-50%)',width:(portrait?170:p.commits.length>8?90:129)*u,
              color:PAPER.ink,background:PAPER.card,textAlign:portrait?'left':'center',lineHeight:1.11,fontSize:16*u}}>
              <code style={{fontFamily:MONO,fontSize:19*u,fontWeight:750}}>{c.id}</code>
              {c.message?<div style={{marginTop:3*u,color:PAPER.inkSoft}}>{c.message}</div>:null}
            </div>
          </div>;
        })}
      </div>
      <div style={{minHeight:60*u,fontSize:25*u,fontWeight:650,lineHeight:1.2}}>{active.at(-1)?.note}</div>
    </div>
  </LectureBoard>;
}
