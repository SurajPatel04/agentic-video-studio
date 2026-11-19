import {Img, useVideoConfig} from 'remotion';
import {z} from 'zod';
import {LectureBoard, lectureColors, useLectureTiming} from '../components/LectureBoard';
import {resolveImageSource} from '../components/imageSource';
import {PAPER} from '../iso/iso';
import {useUnit} from '../theme';
import {fraction, Icon} from './paperStage';

const field = z.object({label:z.string().min(1).max(28),value:z.string().min(1).max(100),at:fraction}).strict();
export const profileSceneSchema = z.object({
  title:z.string().max(78).default('Meet the audience for a local newsletter'),
  name:z.string().min(1).max(48).default('First-time readers'),
  context:z.string().max(70).default('Illustrative audience segment'),
  image:z.string().max(500).optional(),
  imageAlt:z.string().max(100).optional(),
  icon:z.string().max(48).default('users'),
  fields:z.array(field).min(1).max(5).default([
    {label:'Goal',value:'Find one local event to attend this weekend.',at:0},
    {label:'Constraint',value:'They may be reading on a phone with limited time.',at:0.28},
    {label:'What helps',value:'A short headline with the date, location and signup link.',at:0.60},
  ]),
}).strict();

export const description = 'Profile a person, character or audience segment with an optional portrait or icon and timed labeled facts. Choose fields that explain the person’s role, goals or choices. Label fictional personas as illustrative.';
export const tags = ['persona', 'profile', 'biography', 'character', 'audience segment', 'historical figure', 'portrait'];

export function ProfileScene(input: z.input<typeof profileSceneSchema>) {
  const p = profileSceneSchema.parse(input);
  const u = useUnit(), timing = useLectureTiming();
  const {width,height}=useVideoConfig();
  const portrait=width<height;
  const image=resolveImageSource(p.image ?? '');
  const tone=lectureColors[0];
  return <LectureBoard title={p.title}>
    <div style={{alignSelf:'center',display:'grid',width:'100%',maxWidth:1320*u,gridTemplateColumns:portrait?'1fr':'minmax(0,1fr) minmax(0,1.55fr)',
      gap:28*u,alignItems:'stretch'}}>
      <div style={{display:'grid',gridTemplateColumns:portrait?`${200*u}px minmax(0,1fr)`:'1fr',alignContent:'center',
        alignItems:'center',gap:18*u,background:tone.fill,color:tone.ink,borderRadius:17*u,padding:25*u}}>
        <div style={{display:'grid',placeItems:'center',borderRadius:12*u,overflow:'hidden',height:(portrait?185:300)*u}}>
          {image ? <Img src={image} alt={p.imageAlt || p.name} style={{width:'100%',height:'100%',objectFit:'contain'}}/> :
            <Icon name={p.icon} size={(portrait?105:155)*u} color={tone.ink}/>}
        </div>
        <div>
          <div style={{fontSize:42*u,lineHeight:1.1,fontWeight:800,overflowWrap:'anywhere'}}>{p.name}</div>
          {p.context ? <div style={{fontSize:24*u,marginTop:7*u,lineHeight:1.2}}>{p.context}</div> : null}
        </div>
      </div>
      <div style={{display:'grid',gap:10*u,alignContent:'center'}}>
        {p.fields.map((item,i)=><div key={i} style={{display:'grid',gap:5*u,padding:`${11*u}px ${18*u}px`,
          opacity:timing.progress(item.at),background:PAPER.card,border:`1px solid ${PAPER.track}`,borderRadius:10*u}}>
          <strong style={{fontSize:19*u,color:tone.ink}}>{item.label}</strong>
          <span style={{fontSize:24*u,lineHeight:1.2,overflowWrap:'anywhere'}}>{item.value}</span>
        </div>)}
      </div>
    </div>
  </LectureBoard>;
}
