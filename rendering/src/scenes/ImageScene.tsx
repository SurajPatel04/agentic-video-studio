import {useState} from 'react';
import {PAPER} from '../iso/iso';
import {Easing, Img, interpolate, useCurrentFrame, useVideoConfig} from 'remotion';
import {z} from 'zod';
import {LectureBoard, lectureColors, useLectureTiming} from '../components/LectureBoard';
import {resolveImageSource} from '../components/imageSource';
import {StudyFrame} from '../components/StudyFrame';
import {useTheme, useUnit} from '../theme';
import {fraction} from './paperStage';

const nonnegative = z.number().int().nonnegative();
const positive = z.number().int().positive();
const hotspot = z.object({
  x: fraction, y: fraction, label: z.string().min(1).max(48),
  detail: z.string().max(90).optional(), at: fraction,
}).strict();

export const imageSceneSchema = z.object({
  title: z.string().default('A figure from your source'),
  eyebrow: z.string().default('FIGURE / LOOK CLOSELY'),
  src: z.string().default(''),
  alt: z.string().default(''),
  caption: z.string().default('Add a caption that tells the viewer what to notice.'),
  credit: z.string().default(''),
  fit: z.enum(['cover', 'contain']).default('cover'),
  motion: z.enum(['none', 'pan-left', 'pan-right', 'zoom-in', 'zoom-out']).default('zoom-in'),
  zoom: z.number().min(1).max(1.5).default(1.12),
  startAt: nonnegative.default(0),
  motionFrames: positive.default(150),
  footer: z.string().default(''),
  hotspots: z.array(hotspot).max(6).default([]),
}).superRefine((p, ctx) => {
  if (p.hotspots.length && !p.src.trim()) ctx.addIssue({
    code: 'custom', path: ['src'], message: 'Give the hotspots an image source.',
  });
});

export const description = 'A full-width figure or image with a caption, credit, and optional pan or zoom. Add timed numbered hotspots with x/y in 0–1 measured from the source image’s top-left, a label and optional explanation. Markers follow the image when fitted and during camera motion. Use contain to keep the whole figure visible.';
export const tags = ['image', 'figure', 'diagram', 'photo', 'pdf', 'source material', 'hotspots', 'image annotation', 'ad anatomy', 'ui breakdown'];

const clamp = (value: number) => Math.min(1, Math.max(0, value));

function HotspotImage({p, src, transform, opacity}: {
  p: z.output<typeof imageSceneSchema>; src: string; transform: string; opacity: number;
}) {
  const [image, setImage] = useState<{src: string; width: number; height: number}>();
  const size = image?.src === src ? image : undefined;
  const u = useUnit(), timing = useLectureTiming();
  const {width, height} = useVideoConfig();
  const portrait = width < height;
  const active = p.hotspots.reduce<number>((index, point, i) =>
    timing.cueFrame(point.at) <= timing.frame && (index < 0 || point.at >= p.hotspots[index].at) ? i : index, -1);
  const radius = size ? Math.min(size.width, size.height) * 0.034 : 0;
  return <LectureBoard title={p.title} subtitle={p.caption || undefined}>
    <div style={{display:'grid',width:'100%',maxWidth:1510*u,alignSelf:'center',
      gridTemplateColumns:portrait?'1fr':'minmax(0,2fr) minmax(0,1fr)',gap:24*u,alignItems:'center'}}>
      <div style={{position:'relative',height:(portrait?720:535)*u,background:PAPER.card,
        border:`1px solid ${PAPER.track}`,borderRadius:16*u,overflow:'hidden'}}>
        <div style={{position:'absolute',inset:0,transform,opacity,transformOrigin:'center'}}>
          <Img src={src} alt={p.alt || p.title} onLoad={({currentTarget}) =>
            setImage({src,width:currentTarget.naturalWidth,height:currentTarget.naturalHeight})}
            style={{width:'100%',height:'100%',objectFit:p.fit}}/>
          {size && radius>0 ? <svg aria-hidden width="100%" height="100%" viewBox={`0 0 ${size.width} ${size.height}`}
            preserveAspectRatio={p.fit==='cover'?'xMidYMid slice':'xMidYMid meet'}
            style={{position:'absolute',inset:0,display:'block'}}>
            {p.hotspots.map((point,i)=>{
              const tone=lectureColors[i%lectureColors.length];
              return <g key={i} transform={`translate(${point.x*size.width} ${point.y*size.height})`}
                opacity={timing.progress(point.at)}>
                {i===active?<circle r={radius*1.44} fill="white" opacity={0.58}/>:null}
                <circle r={radius} fill={tone.ink} stroke="white" strokeWidth={radius*0.12}/>
                <text textAnchor="middle" dominantBaseline="central" fill="white"
                  fontSize={radius*1.17} fontWeight={800}>{i+1}</text>
              </g>;
            })}
          </svg>:null}
        </div>
        {p.credit?<div style={{position:'absolute',bottom:8*u,right:10*u,background:PAPER.card,borderRadius:7*u,
          padding:`${4*u}px ${8*u}px`,fontSize:15*u}}>{p.credit}</div>:null}
      </div>
      <div style={{display:'grid',gap:8*u}}>
        {p.hotspots.map((point,i)=>{
          const tone=lectureColors[i%lectureColors.length];
          return <div key={i} style={{display:'flex',alignItems:'flex-start',gap:10*u,padding:`${8*u}px ${10*u}px`,
            border:`1px solid ${i===active?tone.ink:PAPER.track}`,background:i===active?tone.fill:PAPER.card,
            borderRadius:9*u,opacity:timing.progress(point.at)}}>
            <span style={{background:tone.ink,color:'white',width:31*u,height:31*u,borderRadius:'50%',
              fontSize:17*u,fontWeight:750,display:'grid',placeItems:'center',flex:'0 0 auto'}}>{i+1}</span>
            <div style={{minWidth:0,lineHeight:1.15,overflowWrap:'anywhere'}}>
              <strong style={{fontSize:23*u}}>{point.label}</strong>
              {point.detail?<div style={{fontSize:18*u,color:PAPER.inkSoft,marginTop:4*u}}>{point.detail}</div>:null}
            </div>
          </div>;
        })}
      </div>
    </div>
  </LectureBoard>;
}

export const ImageScene: React.FC<z.input<typeof imageSceneSchema>> = (input) => {
  const p = imageSceneSchema.parse(input);
  const frame = useCurrentFrame();
  const theme = useTheme();
  const src = resolveImageSource(p.src);
  const progress = interpolate(frame, [p.startAt, p.startAt + p.motionFrames], [0, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
    easing: Easing.inOut(Easing.cubic),
  });

  const transform = (() => {
    switch (p.motion) {
      case 'pan-left':
        return `scale(${p.zoom}) translateX(${(progress - 0.5) * -8}%)`;
      case 'pan-right':
        return `scale(${p.zoom}) translateX(${(progress - 0.5) * 8}%)`;
      case 'zoom-in':
        return `scale(${1 + (p.zoom - 1) * progress})`;
      case 'zoom-out':
        return `scale(${p.zoom - (p.zoom - 1) * progress})`;
      case 'none':
      default:
        return 'scale(1)';
    }
  })();

  if (src && p.hotspots.length) return <HotspotImage p={p} src={src} transform={transform} opacity={clamp((frame-p.startAt)/10)}/>;

  return (
    <StudyFrame title={p.title} eyebrow={p.eyebrow} footer={p.footer || undefined}>
      <div style={{height: '100%', display: 'flex', flexDirection: 'column'}}>
        <div style={{position: 'relative', flex: 1, minHeight: 0, borderRadius: 18, overflow: 'hidden', border: `1px solid ${PAPER.track}`, background: PAPER.card}}>
          {src ? (
            <Img
              src={src}
              alt={p.alt || p.title}
              style={{width: '100%', height: '100%', objectFit: p.fit, transform, transformOrigin: 'center', opacity: clamp((frame - p.startAt) / 10)}}
            />
          ) : (
            <div style={{position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 18, color: theme.muted}}>
              <svg width="80" height="80" viewBox="0 0 80 80" fill="none" aria-hidden="true">
                <rect x="7" y="13" width="66" height="54" rx="9" stroke="currentColor" strokeWidth="3" />
                <circle cx="29" cy="33" r="7" stroke="currentColor" strokeWidth="3" />
                <path d="M12 58 L31 42 L45 53 L57 40 L69 53" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
              <div style={{fontSize: 24}}>Image source not set</div>
              <div style={{fontSize: 18, opacity: 0.7}}>Pass a local <code>public/</code> path or an HTTPS URL.</div>
            </div>
          )}
          {p.credit ? (
            <div style={{position: 'absolute', right: 14, bottom: 12, padding: '5px 10px', borderRadius: 7, background: PAPER.card, color: PAPER.ink, fontSize: 15}}>
              {p.credit}
            </div>
          ) : null}
        </div>
        {p.caption ? (
          <div style={{flex: '0 0 auto', paddingTop: 16, fontSize: 23, lineHeight: 1.35, color: theme.muted}}>{p.caption}</div>
        ) : null}
      </div>
    </StudyFrame>
  );
};
