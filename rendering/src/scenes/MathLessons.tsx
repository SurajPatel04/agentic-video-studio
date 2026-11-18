import {z} from 'zod';
import {accent, arrow, fmt, green, indexAt, integer, label, lesson, title} from './lessonKit';

const side=z.number().int().min(1).max(20);
const point=z.tuple([integer,integer]);
const matrix=z.array(z.array(integer).min(1).max(3)).min(1).max(3)
  .refine(m=>m.every(row=>row.length===m[0].length),'Rows must have equal length');
const matrixSchema=z.object({title,left:matrix.default([[1,2],[3,4]]),right:matrix.default([[2,0],[1,3]])}).strict()
  .refine(({left,right})=>left[0].length===right.length,'Left columns must equal right rows');
const fractionSchema=z.object({title,numerator:z.number().int().min(0).max(16).default(3),denominator:z.number().int().min(1).max(16).default(4)}).strict()
  .refine(p=>p.numerator<=p.denominator,'Use a fraction between zero and one');
const probabilitySchema=z.object({title,favourable:z.number().int().min(0).max(36).default(2),total:z.number().int().min(1).max(36).default(6)}).strict()
  .refine(p=>p.favourable<=p.total,'Favourable outcomes cannot exceed total outcomes');
function axes(x:number,y:number,r:number){
  return <g stroke="#b0a9a1" strokeWidth={3}><line x1={x-r} y1={y} x2={x+r} y2={y}/><line x1={x} y1={y-r} x2={x} y2={y+r}/></g>;
}
export const mathLessons={
  GeometryScene:lesson(z.object({title,base:side.default(4),height:side.default(3)}).strict(),'Measure a right triangle',['geometry','triangle','area','pythagorean theorem'],
    'Draw a right triangle to scale and derive its area and hypotenuse from base and height.',({base,height},p)=>{
      const scale=Math.min(480/base,330/height), w=base*scale,h=height*scale;
      return <><path d={`M145 425 h${w} l-${w} -${h} Z`} fill="#e6ddf2" stroke={accent} strokeWidth={5} pathLength={1} strokeDasharray={`${Math.min(1,p*3)} 1`}/>
        <path d={`M145 410 h15 v15`} stroke={accent} fill="none"/>
        {label(145+w/2,469,String(base))}{label(112,425-h/2,String(height))}
        {p>.22&&label(850,230,`Area = ½ × ${base} × ${height}`)}{p>.4&&label(850,286,`= ${fmt(base*height/2)} square units`,31,green)}
        {p>.62&&label(850,370,`Hypotenuse = √(${base}² + ${height}²)`,28)}
        {p>.8&&label(850,422,`≈ ${fmt(Math.hypot(base,height))} units`,30,green)}</>;
    }),
  NumberLineScene:lesson(z.object({title,from:integer.default(-3),to:integer.default(4)}).strict(),'Move on the number line',['number line','integers','addition','displacement'],
    'Move a point from one integer to another on a labeled number line and calculate signed displacement.',({from,to},p)=>{
      const low=Math.min(from,to)-1,high=Math.max(from,to)+1;
      const x=(v:number)=>100+1000*(v-low)/(high-low);
      const step=Math.max(1,Math.ceil((high-low)/10)), position=from+(to-from)*p;
      return <><line x1={100} y1={290} x2={1100} y2={290} stroke={accent} strokeWidth={4}/>
        {Array.from({length:Math.floor((high-low)/step)+1},(_,i)=>low+i*step).map(v=><g key={v}><path d={`M${x(v)} 278 v24`} stroke={accent} strokeWidth={3}/>{label(x(v),342,String(v),27)}</g>)}
        {arrow(x(from),248,x(position)-x(from),0,green)}<circle cx={x(position)} cy={290} r={13} fill={green}/>
        {label(600,437,`From ${from} to ${to}   ·   displacement ${to-from>=0?'+':''}${to-from}`,34)}</>;
    }),
  UnitCircleScene:lesson(z.object({title,degrees:z.number().min(-360).max(360).default(60)}).strict(),'Rotate a radius on the unit circle',['unit circle','radians','degrees','sine','cosine','trigonometry'],
    'Rotate from zero to the supplied angle and display the moving point’s cosine and sine coordinates.',({degrees},p)=>{
      const angle=degrees*p, t=angle*Math.PI/180, x=350+178*Math.cos(t), y=288-178*Math.sin(t);
      return <>{axes(350,288,215)}<circle cx={350} cy={288} r={178} stroke={accent} fill="none" strokeWidth={5}/>
        <path d={`M350 288 L${x} ${y} V288`} fill="none" stroke={green} strokeWidth={4}/><circle cx={x} cy={y} r={10} fill={green}/>
        {label(860,196,`θ = ${fmt(angle)}°`,44)}{label(860,281,`x = cos θ ≈ ${fmt(Math.cos(t))}`,31,accent)}
        {label(860,344,`y = sin θ ≈ ${fmt(Math.sin(t))}`,31,green)}{label(860,423,'Radius = 1',26)}</>;
    }),
  VectorScene:lesson(z.object({title,a:point.default([3,1]),b:point.default([-1,2])}).strict(),'Add two vectors tip to tail',['vectors','vector addition','components'],
    'Draw vector a, add b at its tip, then draw their resultant on equally scaled axes.',({a,b},p)=>{
      const sum=[a[0]+b[0],a[1]+b[1]], s=195/Math.max(1,...[...a,...sum].map(Math.abs));
      const grow=(offset:number)=>Math.min(1,Math.max(0,p*3-offset));
      return <>{axes(350,290,218)}{arrow(350,290,a[0]*s*grow(0),-a[1]*s*grow(0),accent)}
        {p>1/3&&arrow(350+a[0]*s,290-a[1]*s,b[0]*s*grow(1),-b[1]*s*grow(1),'#ba733a')}
        {p>2/3&&arrow(350,290,sum[0]*s*grow(2),-sum[1]*s*grow(2),green)}
        {label(860,200,`a = (${a.join(', ')})`,38,accent)}{label(860,280,`b = (${b.join(', ')})`,38,'#965221')}
        {p>2/3&&label(860,365,`a + b = (${sum.join(', ')})`,35,green)}</>;
    }),
  MatrixMultiplyScene:lesson(matrixSchema,'Multiply a row by a column',['matrix multiply','matrix multiplication','dot product','linear algebra'],
    'Multiply two conforming matrices up to 3 × 3. Highlight the source row and column and fill each resulting cell.',({left,right},p)=>{
      const cols=right[0].length, k=indexAt(p,left.length*cols), r=Math.floor(k/cols), c=k%cols;
      const dot=(i:number,j:number)=>left[i].reduce((sum,v,n)=>sum+v*right[n][j],0);
      function block(data:(number|string)[][],x:number,selected:(i:number,j:number)=>boolean){
        return data.map((row,i)=>row.map((v,j)=><g key={i+'-'+j} transform={`translate(${x+(j-(row.length-1)/2)*95} ${235+(i-(data.length-1)/2)*68})`}>
          <rect x={-46} y={-35} width={92} height={65} rx={6} fill={selected(i,j)?'#dfd2ef':'#eee9df'}/>{label(0,10,String(v),24)}</g>));
      }
      return <>{block(left,218,i=>i===r)}{label(411,245,'×',40)}{block(right,600,(_,j)=>j===c)}{label(795,245,'=',40)}
        {block(left.map((_,i)=>right[0].map((_,j)=>i*cols+j<=k?dot(i,j):'')),983,(i,j)=>i===r&&j===c)}
        {label(600,436,`Row ${r+1} × column ${c+1}`,28,accent)}
        {label(600,500,left[r].map((v,i)=>`(${v} × ${right[i][c]})`).join(' + ')+` = ${dot(r,c)}`,34,green)}</>;
    }),
  ProbabilityScene:lesson(probabilitySchema,'Count equally likely outcomes',['probability','sample space','favourable outcomes'],
    'Reveal favourable outcomes in a finite equiprobable sample space and calculate their probability.',({favourable,total},p)=>{
      const n=Math.round(p*favourable), cols=Math.min(total,9);
      return <>{label(600,80,'Equally likely outcomes',34)}
        {Array.from({length:total},(_,i)=><g key={i}><circle cx={600+(i%cols-(cols-1)/2)*82} cy={158+Math.floor(i/cols)*67} r={27} fill={i<n?'#abcfb4':'#e7e2d9'}/>
          {label(600+(i%cols-(cols-1)/2)*82,166+Math.floor(i/cols)*67,String(i+1),23)}</g>)}
        {label(600,466,`${n} favourable outcomes marked out of ${total}`,29)}
        {p>=.99&&label(600,528,`P(event) = ${favourable}/${total} ≈ ${fmt(100*favourable/total)}%`,34,green)}</>;
    }),
  FractionScene:lesson(fractionSchema,'Build a fraction from equal parts',['fractions','numerator','denominator','equal parts'],
    'Partition one whole into equal pieces, then shade the requested numerator.',({numerator,denominator},p)=>{
      const n=Math.round(numerator*p), w=960/denominator;
      return <>{label(600,130,`One whole divided into ${denominator} equal parts`,34)}
        {Array.from({length:denominator},(_,i)=><rect key={i} x={120+i*w} y={206} width={w} height={139} fill={i<n?'#b29acb':'#efeade'} stroke={accent} strokeWidth={3}/>)}
        {label(600,457,`${n} / ${denominator}`,55,accent)}</>;
    }),
  AlgebraStepsScene:lesson(z.object({title,a:integer.refine(n=>n!==0,'Use a nonzero coefficient').default(3),b:integer.default(5),c:integer.default(17)}).strict(),
    'Solve a linear equation',['algebra steps','equations','solve for x','inverse operations'],
    'Solve ax + b = c by applying inverse operations to both sides. Show the exact ratio and its decimal approximation.',({a,b,c},p)=>{
      const term=b<0?`− ${-b}`:`+ ${b}`, delta=c-b;
      const steps=[[`${a}x ${term} = ${c}`,'Original equation'],[`${a}x = ${c} − (${b})`,'Subtract the constant from both sides'],
        [`${a}x = ${delta}`,'Simplify'],[`x = ${delta} / ${a}`,'Divide both sides by the coefficient'],
        [`x ${delta%a===0?'=':'≈'} ${fmt(delta/a)}`,'Solution']];
      const active=indexAt(p,steps.length);
      return <>{steps.slice(0,active+1).map(([eq,note],i)=><g key={i}>
        <rect x={87} y={65+i*93} width={1026} height={73} rx={11} fill={i===active?'#e4d8f1':'#f4efe5'}/>
        {label(135,112+i*93,eq,33,accent,'start')}{label(612,112+i*93,note,24,green,'start')}</g>)}</>;
    }),
};
