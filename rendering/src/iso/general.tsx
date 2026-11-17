/** Everyday props. Motion is a pure function of scene time, so stills and video agree. */
import type {FC, ReactNode} from 'react';
import type {ArtProps} from './objects';
import {IsoBox, IsoCylinder} from './shapes';
import {PAPER, project, poly, shade} from './iso';
import {PublishingArt} from './publishing';

export const GENERAL_KINDS = {
  printingpress: {size:[3,2,2.2],color:'slate'},
  newspaperbundle: {size:[2.2,1.6,.7],color:'cream'},
  magazine: {size:[1.8,1.2,.35],color:'coral'},
  printingplates: {size:[2.2,1.5,.35],color:'slate'},
  newsstand: {size:[2.4,1.8,2.5],color:'butter'},
  deliverystack: {size:[2,1.6,1.5],color:'peach'},
  house: {size: [2.6, 2.2, 2.8], color: 'peach'},
  tree: {size: [2, 2, 3], color: 'mint'},
  clock: {size: [2, 0.6, 2.3], color: 'sky'},
  chart: {size: [2.6, 1.6, 2.4], color: 'mint'},
  piechart: {size: [2.4, 2.4, 0.6], color: 'lavender'},
  chatbubble: {size: [2.6, 0.7, 2], color: 'sky'},
  sun: {size: [2, 0.6, 2.2], color: 'butter'},
  weather: {size: [2.8, 1, 2.3], color: 'sky'},
  trophy: {size: [2, 1.3, 2.6], color: 'butter'},
  flag: {size: [2.3, 0.6, 2.8], color: 'coral'},
  lightbulb: {size: [1.6, 1.3, 2.5], color: 'butter'},
  gear: {size: [2.2, 0.7, 2.2], color: 'slate'},
  magnifier: {size: [2, 0.7, 2.2], color: 'sky'},
  warning: {size: [2.2, 0.6, 2.2], color: 'butter'},
  checkmark: {size: [1.8, 0.6, 1.8], color: 'mint'},
  cross: {size: [1.8, 0.6, 1.8], color: 'coral'},
  chef: {size: [1.4, 1, 2.6], color: 'cream'},
  worker: {size: [1.4, 1, 2.6], color: 'butter'},
  police: {size: [1.4, 1, 2.6], color: 'sky'},
} as const;
export type GeneralKind = keyof typeof GENERAL_KINDS;

const House: FC<ArtProps> = (p) => {
  const {g, zz, T, o, sw, id, color} = p;
  const wallH = g.h * 0.65;
  const P = (x: number,y: number,z: number) => project(g.x+x*g.w,g.y+y*g.d,zz+z*g.h,T,o);
  const polygon = (pts: number[][], fill: string) => <polygon points={poly(pts.map(([x,y,z])=>P(x,y,z)))} fill={fill} stroke={PAPER.ink} strokeWidth={sw} strokeLinejoin="round" />;
  const front = P(0,1,.65), side = P(1,1,.65);
  return <g>
    <IsoBox {...p} id={id} x={g.x} y={g.y} z={zz} w={g.w} d={g.d} h={wallH} color={color} />
    {polygon([[0,1,.65],[.5,1,1],[1,1,.65]],shade(color,.2))}
    {polygon([[0,0,.65],[.5,0,1],[.5,1,1],[0,1,.65]],'#e9ab91')}
    {polygon([[.5,0,1],[1,0,.65],[1,1,.65],[.5,1,1]],'#c87667')}
    <g transform={`matrix(${.866*T} ${.5*T} 0 ${T} ${front.x} ${front.y})`}>
      <rect x={g.w*.42} y={wallH*.35} width={g.w*.25} height={wallH*.65} rx={.04} fill="#806b69" stroke={PAPER.ink} strokeWidth={sw/T*.7} />
      <circle cx={g.w*.61} cy={wallH*.72} r={.04} fill="#f4da93" />
      <rect x={g.w*.1} y={wallH*.28} width={g.w*.22} height={wallH*.3} fill="#b8d6f3" stroke={PAPER.ink} strokeWidth={sw/T*.7} />
    </g>
    <g transform={`matrix(${.866*T} ${-.5*T} 0 ${T} ${side.x} ${side.y})`}>
      {[.16,.6].map(v=><rect key={v} x={g.d*v} y={wallH*.3} width={g.d*.24} height={wallH*.32} fill="#b8d6f3" stroke={PAPER.ink} strokeWidth={sw/T*.7} />)}
    </g>
  </g>;
};
/** Tapered branching trunk and an irregular, shaded broadleaf crown. */
const Tree: FC<ArtProps> = ({g,zz,T,o,sw,color,id}) => {
  const c=project(g.x+g.w/2,g.y+g.d/2,zz,T,o);
  const width=Math.min(g.w,g.d)*T, height=g.h*T;
  const ink=sw/width;
  // Fixed shapes: no randomness, so foliage remains stable across video frames.
  const clusters=[[-.24,-.61,.23], [.2,-.66,.25], [.02,-.8,.27], [-.3,-.76,.19], [.28,-.8,.18], [-.13,-.88,.2], [.08,-.88,.16], [-.06,-.64,.24], [.25,-.58,.15]];
  const leafPath=(x:number,y:number,r:number)=>{
    const points=Array.from({length:12},(_,i)=>{const a=i*Math.PI/6,rr=r*(i%3===0?1:i%3===1?.9:1.06);return [x+Math.cos(a)*rr,y+Math.sin(a)*rr*.7];});
    return points.map(([px,py],i)=>{const [nx,ny]=points[(i+1)%points.length];return `${i===0?`M${px} ${py}`:''} Q${(px+nx)/2+(px-x)*.12} ${(py+ny)/2+(py-y)*.12} ${nx} ${ny}`;}).join(' ')+' Z';
  };
  return <g transform={`translate(${c.x} ${c.y}) scale(${width} ${height})`}>
    <defs>
      <linearGradient id={`${id}-bark`}><stop stopColor="#b39473"/><stop offset=".48" stopColor="#927252"/><stop offset="1" stopColor="#624c3c"/></linearGradient>
      <radialGradient id={`${id}-foliage`} cx="30%" cy="20%" r="85%"><stop stopColor={shade(color,.02)}/><stop offset=".5" stopColor={shade(color,-.2)}/><stop offset="1" stopColor={shade(color,-.48)}/></radialGradient>
    </defs>
    <path d="M-.13 0 Q-.06 -.05 -.065 -.2 L-.05 -.5 L-.14 -.66 L-.1 -.68 L.015 -.5 L.11 -.73 L.145 -.71 L.055 -.43 Q.04 -.18 .065 -.04 L.13 0 L.025 -.015 L-.025 .01 Z" fill={`url(#${id}-bark)`} stroke="#514638" strokeWidth={ink*.65} strokeLinejoin="round"/>
    <path d="M-.025 -.07 Q.01 -.25 -.005 -.4 M.015 -.3 Q.08 -.49 .22 -.58 M-.03 -.37 Q-.16 -.44 -.24 -.58" fill="none" stroke="#6b533e" strokeWidth={ink*.75} strokeLinecap="round"/>
    {clusters.map(([x,y,r],i)=><path key={i} d={leafPath(x,y,r)} fill={`url(#${id}-foliage)`} stroke={shade(color,-.53)} strokeWidth={ink*.5}/>)}
    {Array.from({length:28},(_,i)=>{const a=i*2.39996,r=.07+.28*Math.sqrt(i/28),x=Math.cos(a)*r,y=-.77+Math.sin(a)*r*.55;return <path key={i} d={`M${x-.025} ${y+.008} q.018 -.025 .043 -.012`} fill="none" stroke={i%3?shade(color,.08):shade(color,-.48)} opacity={.5} strokeWidth={ink*.6} strokeLinecap="round"/>;})}
  </g>;
};

const Chart: FC<ArtProps & {pie?: boolean}> = (p) => {
  const {g,zz,T,o,sw,id,pie,time=0} = p;
  const grow = .15+.85*(1-Math.pow(1-Math.min(1,Math.max(0,time)/1.2),3));
  const colors=['#b8d6f3','#f4a596','#f4da93','#b9e2c7'];
  if(pie) {
    const c=project(g.x+g.w/2,g.y+g.d/2,zz+g.h,T,o),r=Math.min(g.w,g.d)*T*.5;
    let angle=-Math.PI/2;
    return <g>
      <IsoCylinder {...p} cx={g.x+g.w/2} cy={g.y+g.d/2} z={zz} r={Math.min(g.w,g.d)*.5} h={g.h} bands={0} />
      <g transform={`translate(${c.x} ${c.y}) scale(1 .577)`}>
        {[.38,.27,.2,.15].map((v,i)=>{const a=angle,b=a+v*Math.PI*2*grow; angle=b;return <path key={i} d={`M0 0 L${r*Math.cos(a)} ${r*Math.sin(a)} A${r} ${r} 0 ${b-a>Math.PI?1:0} 1 ${r*Math.cos(b)} ${r*Math.sin(b)} Z`} fill={colors[i]} stroke={PAPER.ink} strokeWidth={sw} />;})}
      </g>
    </g>;
  }
  return <g>
    <IsoBox {...p} id={`${id}-base`} x={g.x} y={g.y} z={zz} w={g.w} d={g.d} h={g.h*.06} color="#f2e9da" />
    {[.45,.7,.55,.95].map((v,i)=><IsoBox {...p} key={i} id={`${id}-bar-${i}`} x={g.x+g.w*(.08+i*.23)} y={g.y+g.d*.23} z={zz+g.h*.06} w={g.w*.15} d={g.d*.5} h={g.h*.9*v*grow} color={colors[i]} radius={T*.03} />)}
  </g>;
};

/** A shallow extruded upright symbol, drawn in normalized coordinates. */
const SymbolArt: FC<ArtProps & {kind: GeneralKind}> = (p) => {
  const {g,zz,T,o,sw,color,kind,time=0,highlight=0,id} = p;
  const c=project(g.x+g.w/2,g.y+g.d/2,zz+g.h*.5,T,o);
  const scale=Math.min(g.w,g.h)*T/100, stroke=sw/scale;
  const ink={stroke:PAPER.ink,strokeWidth:stroke,strokeLinejoin:'round' as const,strokeLinecap:'round' as const};
  let art:ReactNode;
  const disk=(fill:string)=><circle r={40} fill={fill} {...ink} />;
  const sun=<g>{Array.from({length:12},(_,i)=><path key={i} d="M0 -35 V-45" transform={`rotate(${i*30})`} fill="none" {...ink} />)}<circle r={26} fill="#f4da93" {...ink}/><path d="M-16 -8 Q-10 -22 4 -20" fill="none" stroke="#fff5d0" strokeWidth={4} strokeLinecap="round" /></g>;
  switch(kind) {
    case 'clock': art=<>{disk(color)}<circle r={34} fill={PAPER.card} {...ink}/>{Array.from({length:12},(_,i)=><path key={i} d="M0 -28 V-31" transform={`rotate(${i*30})`} {...ink}/>)}<path d="M0 0 V-19" transform={`rotate(${300+time*6})`} {...ink} strokeWidth={stroke*2}/><path d="M0 0 V-27" transform={`rotate(${60+time*72})`} {...ink}/><circle r={3} fill={PAPER.ink}/></>;break;
    case 'chatbubble': art=<><path d="M-43 -35 H33 Q43 -35 43 -25 V20 Q43 30 33 30 H-12 L-32 44 V30 H-33 Q-43 30 -43 20 Z" fill={color} {...ink}/>{[-22,0,22].map(x=><circle key={x} cx={x} cy={-2} r={5} fill={PAPER.card} {...ink}/>)}</>;break;
    case 'sun':art=sun;break;
    case 'weather':art=<><g transform="translate(18 -19) scale(.75)">{sun}</g><path d="M-37 30 C-60 24 -54 -3 -34 -4 C-36 -30 -2 -35 8 -12 C27 -24 46 -9 42 7 C61 17 48 33 34 33 Z" fill="#e5eff9" {...ink}/><path d="M-25 43 l-4 8 M-4 43 l-4 8 M17 43 l-4 8" stroke="#7aabc6" strokeWidth={stroke*2}/></>;break;
    case 'trophy':art=<><path d="M-25 -30 H-43 V-13 Q-43 4 -20 4 M25 -30 H43 V-13 Q43 4 20 4" fill="none" {...ink} strokeWidth={stroke*3}/><path d="M-28 -40 H28 L23 -6 Q17 13 0 14 Q-17 13 -23 -6 Z" fill={color} {...ink}/><path d="M0 14 V34" {...ink} strokeWidth={8}/><rect x={-25} y={33} width={50} height={12} rx={3} fill="#8f7760" {...ink}/><path d="M0 -29 L4 -19 L15 -19 L6 -12 L9 -1 L0 -7 L-9 -1 L-6 -12 L-15 -19 L-4 -19 Z" fill={PAPER.card}/></>;break;
    case 'flag':art=<><path d="M-29 45 V-45" {...ink} strokeWidth={stroke*2}/><circle cx={-29} cy={-45} r={4} fill="#f4da93" {...ink}/><path d="M-27 -39 Q-10 -48 8 -37 Q25 -26 42 -37 V9 Q24 19 7 7 Q-10 -4 -27 5 Z" fill={color} {...ink}/><ellipse cx={-29} cy={45} rx={13} ry={5} fill="#d2d5de" {...ink}/></>;break;
    case 'lightbulb':art=<>{highlight>0&&<circle r={47} fill="#ffd86c" opacity={highlight*(.18+.06*Math.sin(time*4))}/>}<path d="M-17 20 C-18 7 -33 0 -33 -18 A33 33 0 0 1 33 -18 C33 0 18 7 17 20 Z" fill={highlight>0?'#ffe595':color} {...ink}/><path d="M-7 20 V-1 L-15 -12 M7 20 V-1 L15 -12 M-7 -1 H7" fill="none" {...ink}/><rect x={-17} y={20} width={34} height={22} rx={5} fill="#aeb3bf" {...ink}/>{[26,32,38].map(y=><path key={y} d={`M-15 ${y} H15`} {...ink}/>)}<path d="M-10 -38 Q-22 -33 -23 -21" fill="none" stroke={PAPER.card} strokeWidth={4} strokeLinecap="round"/></>;break;
    case 'gear': {const pts=Array.from({length:48},(_,i)=>{const a=i*Math.PI/24,r=i%4===0||i%4===3?34:43;return {x:r*Math.cos(a),y:r*Math.sin(a)};});art=<g transform={`rotate(${time*25})`}><polygon points={poly(pts)} fill={color} {...ink}/><circle r={17} fill={PAPER.bg} {...ink}/><circle r={25} fill="none" stroke={shade(color,-.25)} strokeWidth={stroke*.6}/></g>;break;}
    case 'magnifier':art=<><path d="M16 17 L43 45" {...ink} strokeWidth={12}/><circle cx={-8} cy={-9} r={30} fill={color} {...ink}/><circle cx={-8} cy={-9} r={23} fill="#e2f2f3" {...ink}/><path d="M-23 -8 Q-23 -25 -8 -25" fill="none" stroke={PAPER.card} strokeWidth={4}/></>;break;
    case 'warning':art=<><path d="M0 -44 L47 37 Q49 42 42 42 H-42 Q-49 42 -47 37 Z" fill={color} {...ink}/><path d="M0 -19 V12" {...ink} strokeWidth={6}/><circle cy={27} r={3.5} fill={PAPER.ink}/></>;break;
    case 'checkmark':case 'cross':art=<>{disk(color)}<path d={kind==='checkmark'?'M-23 0 L-7 17 L24 -19':'M-16 -16 L16 16 M16 -16 L-16 16'} fill="none" stroke={PAPER.card} strokeWidth={7} strokeLinecap="round" strokeLinejoin="round"/></>;break;
    default:art=null;
  }
  return <g transform={`translate(${c.x} ${c.y}) scale(${scale})`}>
    <defs><filter id={`${id}-depth`} x="-25%" y="-25%" width="160%" height="160%"><feDropShadow dx="5" dy="4" stdDeviation="0" floodColor={shade(color,-.35)} floodOpacity="1" /></filter></defs>
    <g transform="skewY(8)" filter={`url(#${id}-depth)`}>{art}</g>
  </g>;
};

const RolePerson: FC<ArtProps & {role: 'chef'|'worker'|'police'}> = ({g,zz,T,o,sw,color,role}) => {
  const c=project(g.x+g.w/2,g.y+g.d/2,zz,T,o),s=g.h*T/110;
  const ink={stroke:PAPER.ink,strokeWidth:sw/s,strokeLinejoin:'round' as const};
  const coat=role==='chef'?PAPER.card:role==='police'?'#647b9c':color;
  return <g transform={`translate(${c.x} ${c.y}) scale(${s})`}>
    <path d="M-12 -31 L-15 -3 M12 -31 L15 -3" fill="none" stroke={PAPER.ink} strokeWidth={10} strokeLinecap="round"/>
    <path d="M-18 -68 L-27 -36 M18 -68 L28 -36" fill="none" stroke={coat} strokeWidth={12} strokeLinecap="round"/>
    <rect x={-19} y={-73} width={38} height={44} rx={8} fill={coat} {...ink}/>
    <circle cy={-85} r={14} fill="#eac3a5" {...ink}/>
    {role==='chef'?<><path d="M-15 -96 C-27 -101 -19 -115 -9 -110 C-6 -122 10 -122 13 -110 C26 -112 29 -98 16 -96 V-90 H-15 Z" fill={PAPER.card} {...ink}/>{[-60,-50,-40].map(y=><g key={y}><circle cx={-5} cy={y} r={1.7} fill={PAPER.ink}/><circle cx={6} cy={y} r={1.7} fill={PAPER.ink}/></g>)}<path d="M29 -35 V-65" {...ink} strokeWidth={3}/><ellipse cx={29} cy={-69} rx={5} ry={8} fill="#b28b6c" {...ink}/></>:role==='worker'?<><path d="M-17 -87 Q-19 -109 0 -109 Q19 -109 17 -87 Z" fill="#f4c178" {...ink}/><path d="M-21 -87 H21 M0 -108 V-90" {...ink}/><path d="M-11 -69 V-33 M11 -69 V-33 M-18 -43 H18" stroke="#fff3b0" strokeWidth={5}/><path d="M28 -32 V-61 M24 -70 V-61 H32 V-70" fill="none" {...ink} strokeWidth={4}/></>:<><path d="M-17 -94 L-20 -103 L0 -110 L20 -103 L17 -94 Z" fill="#415877" {...ink}/><path d="M-17 -94 Q0 -87 17 -94" {...ink}/><path d="M8 -65 L14 -62 L12 -53 L8 -50 L4 -53 L2 -62 Z" fill="#f4da93" {...ink}/><path d="M-18 -37 H18" stroke={PAPER.ink} strokeWidth={5}/><rect x={22} y={-53} width={10} height={18} rx={2} fill={PAPER.ink}/><path d="M27 -53 V-64" {...ink}/></>}
  </g>;
};

export const GeneralArt: FC<ArtProps & {kind: GeneralKind}> = (p) => {
  switch(p.kind) {
    case 'printingpress':case 'newspaperbundle':case 'magazine':case 'printingplates':case 'newsstand':case 'deliverystack':return <PublishingArt {...p} kind={p.kind}/>;
    case 'house':return <House {...p}/>;
    case 'tree':return <Tree {...p}/>;
    case 'chart':return <Chart {...p}/>;
    case 'piechart':return <Chart {...p} pie/>;
    case 'chef':case 'worker':case 'police':return <RolePerson {...p} role={p.kind}/>;
    default:return <SymbolArt {...p}/>;
  }
};
