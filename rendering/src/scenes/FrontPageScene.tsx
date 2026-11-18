import type {FC} from 'react';
import {useCurrentFrame} from 'remotion';
import {z} from 'zod';
import {useSceneLength} from '../theme';
import {PaperStage, useStageBox, clamp01, ease} from './paperStage';
import {IsoProp} from './journalismStage';

export const frontPageSceneSchema = z.object({
  eyebrow: z.string().max(40).default('NEWS / EDITORIAL DESIGN'),
  title: z.string().max(70).default('How a front page comes together'),
  masthead: z.string().max(28).default('THE DAILY REPORT'),
  headline: z.string().max(75).default('Community opens a new public park'),
  photoCaption: z.string().max(65).default('Neighbours gather for opening day'),
  stories: z.array(z.string().max(45)).min(2).max(3).default(['Transport plans take shape', 'Local teams prepare for the final', 'Weekend arts guide']),
  leadShare: z.number().min(0.5).max(0.72).default(0.68),
}).strict();
export const description = 'An empty newspaper front page builds in stages: headline drops in, an illustrated photo arrives, text columns fill, then an editor enlarges the lead story and shrinks the others. Controls: masthead, headline, photoCaption, stories, leadShare.';
export const tags = ['news', 'journalism', 'newspaper', 'front page', 'editor', 'headline', 'layout', 'agenda setting'];

export const FrontPageScene: FC<z.input<typeof frontPageSceneSchema>> = (input) => {
  const p = frontPageSceneSchema.parse(input);
  const t = useCurrentFrame() / Math.max(1, useSceneLength() - 1);
  const {x, y, s} = useStageBox(1500, 760, true);
  const reveal = (at: number) => ease(clamp01((t - at) / 0.1));
  const edit = reveal(0.69), leadW = 510 + (p.leadShare * 850 - 510) * edit;
  const note = t < 0.12 ? 'Start with an empty page' : t < 0.29 ? 'Write the lead headline' : t < 0.44 ? 'Place the photograph' : t < 0.69 ? 'Fill the text columns' : 'Editor: give the lead story more space';
  return <PaperStage eyebrow={p.eyebrow} title={p.title}>
    <svg width={1500 * s} height={760 * s} viewBox="0 0 1500 760" style={{position:'absolute',left:x,top:y}}>
      <ellipse cx="610" cy="585" rx="470" ry="100" fill="rgba(70,50,30,.10)"/>
      <g transform="matrix(0.88 0.22 -0.40 0.65 300 5)">
      <rect x="90" y="22" width="930" height="635" fill="#c9bb9f" stroke="#6a5c4a" strokeWidth="3"/>
      <rect x="90" y="15" width="930" height="635" fill="#e2d7bf" stroke="#958773"/>
      <rect x="90" y="8" width="930" height="635" rx="4" fill="#fffdf6" stroke="#35313d" strokeWidth="3"/>
      <text x="555" y="65" textAnchor="middle" fontFamily="Georgia, serif" fontSize="40" fontWeight="bold">{p.masthead}</text>
      <path d="M125 88 H985 M125 94 H985" stroke="#35313d"/>
      <g opacity={reveal(0.12)} transform={`translate(0,${-45 * (1 - reveal(0.12))})`}>
        <foreignObject x="125" y="112" width="850" height="95"><div style={{fontFamily:'Georgia, serif',fontSize:34,fontWeight:800,lineHeight:1.12}}>{p.headline}</div></foreignObject>
      </g>
      <g opacity={reveal(0.29)}>
        <svg x="125" y="214" width={leadW} height="202" viewBox="0 0 580 230" preserveAspectRatio="xMidYMid slice">
          <rect width="580" height="230" fill="#c6e3ec"/>
          <circle cx="480" cy="45" r="24" fill="#f5cf7d"/>
          <path d="M0 145 Q100 80 220 150 T580 135 V230 H0Z" fill="#9bc7a1"/>
          {[70,190,330,450].map((cx,i)=><g key={cx}><rect x={cx-5} y="70" width="10" height="100" fill="#8c7060"/><circle cx={cx} cy="70" r="40" fill={i%2?'#6eaa85':'#84b58d'}/></g>)}
          {[150,270,390].map((cx,i)=><g key={cx}><circle cx={cx} cy="162" r="12" fill="#d9a782"/><path d={`M${cx-17} 210 V190 Q${cx} 165 ${cx+17} 190 V210`} fill={['#ad96cc','#f3b574','#6b95bc'][i]}/></g>)}
        </svg>
        <text x="125" y="440" fontSize="17" fill="#69616a">{p.photoCaption}</text>
      </g>
      <g opacity={reveal(0.44)}>
        {[0,1,2].map(c=><g key={c}>{Array.from({length:9},(_,i)=><rect key={i} x={125+c*leadW/3} y={465+i*15} width={leadW/3-(i===8?40:18)} height="4" fill="#b1aaa0"/>)}</g>)}
        {p.stories.map((story,i)=><g key={i} transform={`translate(${150+leadW},${216+i*128})`}>
          <foreignObject width={825-leadW} height="56"><div style={{fontFamily:'Georgia, serif',fontWeight:700,fontSize:21,lineHeight:1.1}}>{story}</div></foreignObject>
          {[0,1,2,3].map(j=><rect key={j} y={65+j*11} width={Math.max(70,805-leadW-(j===3?36:0))} height="3" fill="#b1aaa0"/>)}
        </g>)}
      </g>
      {edit>0 && <rect x="119" y="207" width={leadW+12} height="410" rx="5" fill="none" stroke="#dc7744" strokeWidth="3" strokeDasharray="9 6" opacity={edit}/>}
      </g>
      <IsoProp kind="editor" x={1240} y={420} w={310} h={350} id="front-page-editor" lift={edit*8}/>
      <IsoProp kind="newspaperbundle" x={1280} y={545} w={180} h={120} id="front-page-stack" opacity={reveal(.55)}/>
      <text x="1240" y="90" textAnchor="middle" fontSize="19" letterSpacing="4" fill="#8d6a54">THE EDITOR’S DESK</text>
      <path d="M1080 430 Q1000 390 900 360" fill="none" stroke="#d28b4f" strokeWidth="3" strokeDasharray="8 7" opacity={edit}/>
      <rect x="1050" y="585" width="380" height="90" rx="12" fill="#f0dfbe"/>
      <foreignObject x="1070" y="605" width="340" height="65"><div style={{fontSize:22,fontWeight:650,lineHeight:1.25}}>{note}</div></foreignObject>
      <path d="M100 710 H1400" stroke="#d6c9b8" strokeWidth="2"/>
      <path d={`M100 710 H${100+1300*t}`} stroke="#d58a4c" strokeWidth="3"/>
      <text x="100" y="750" fontSize="20" fontWeight="700" fill="#8d6a54">FRONT PAGE / ASSEMBLY TO HIERARCHY</text>
    </svg>
  </PaperStage>;
};
