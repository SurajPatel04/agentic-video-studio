import {z} from 'zod';
import {accent, green, grid, indexAt, label, lesson, title} from './lessonKit';
import {fittedPaperText} from '../iso/textFit';

const stackSchema=z.object({title,n:z.number().int().min(0).max(7).default(4)}).strict();
const growthSchema=z.object({title,maxN:z.number().int().min(2).max(100).default(16)}).strict();
const line=z.string().min(1).max(60);
const frame=z.object({line:z.number().int().positive(),variables:z.record(z.string().min(1).max(18),z.union([z.number(),z.string().max(24),z.boolean(),z.null()]))}).strict()
  .refine(f=>Object.keys(f.variables).length<=6,'Show at most six variables');
const exampleCode = ['total = 0','for x in [2, 5]:','    total += x','print(total)'];
const exampleSteps = [{line:1,variables:{total:0}},{line:2,variables:{total:0,x:2}},{line:3,variables:{total:2,x:2}},
  {line:2,variables:{total:2,x:5}},{line:3,variables:{total:7,x:5}},{line:4,variables:{total:7,x:5}}];
const traceSchema=z.object({title,code:z.array(line).min(1).max(9).default(exampleCode),
  steps:z.array(frame).min(1).max(50).optional()}).strict()
  .refine(p=>p.steps!==undefined || JSON.stringify(p.code)===JSON.stringify(exampleCode),'Provide variable snapshots for custom code')
  .refine(p=>p.steps?.every(s=>s.line<=p.code.length) ?? true,'Trace lines must exist in code')
  .transform(p=>({...p,steps:p.steps ?? exampleSteps.map(step=>frame.parse(step))}));
const truthSchema=z.object({title,operator:z.enum(['AND','OR','XOR','NAND','NOR','IMPLIES','NOT']).default('XOR')}).strict();
const dpSchema=z.object({title,rows:z.number().int().min(1).max(6).default(4),columns:z.number().int().min(1).max(7).default(5)}).strict();

export const algorithmLessons = {
  RecursionScene:lesson(stackSchema,'How factorial uses the call stack',['recursion','factorial','call stack','dsa'],
    'Animate factorial(n) calls pushing stack frames, then return values unwinding from factorial(0) = 1.',({n},p)=>{
      const step=indexAt(p,2*n+2), returning=step>n, depth=returning?2*n+1-step:step;
      let result=1;
      for(let i=2;i<=n-depth;i++) result*=i;
      return <>{label(315,185,returning?'Returning':'Calling',32,accent)}
        {label(315,269,`factorial(${n-depth})`,48)}
        {label(315,338,returning?`return ${result}`:depth===n?'Base case reached':`wait for factorial(${n-depth-1})`,29)}
        {Array.from({length:depth+1},(_,i)=><g key={i}>
          <rect x={620} y={487-i*58} width={460} height={52} rx={8} fill={i===depth?'#dfd0ef':'#eee8de'}/>
          {label(850,522-i*58,`factorial(${n-i})`,27)}
        </g>)}</>;
    }),
  BigORaceScene:lesson(growthSchema,'How work grows with input size',['big o','complexity','growth rate','race','dsa'],
    'Compare representative work functions 1, ceil(log2 n), n, n ceil(log2 n), and n² on the same linear scale as n grows.',({maxN},p)=>{
      const n=1+Math.round(p*(maxN-1)), log=Math.ceil(Math.log2(n));
      return <>{label(600,65,`Input size   n = ${n}`,39)}
        {['1','⌈log₂ n⌉','n','n ⌈log₂ n⌉','n²'].map((name,i)=>{
          const value=[1,log,n,n*log,n*n][i], y=115+i*72;
          return <g key={name}>{label(235,y+23,name,30,accent,'end')}
            <rect x={265} y={y} width={705} height={27} rx={6} fill="#ece7dd"/>
            <rect x={265} y={y} width={705*value/(maxN**2)} height={27} rx={4} fill="#9d85c4"/>
            {label(1090,y+24,String(value),28,green,'end')}</g>;
        })}{label(600,534,'Illustrative operation counts on a fixed linear scale',25)}</>;
    }),
  CodeTraceScene:lesson(traceSchema,'Trace the variables',['code trace','variables','dry run','debugging','dsa'],
    'Step through supplied code and after-line variable snapshots. Give 1-based line numbers and the complete variables for each step.',({code,steps},p)=>{
      const i=indexAt(p,steps.length), state=steps[i];
      return <>{label(65,59,'Code',29,accent,'start')}{label(820,59,'Variables after this line',26,green,'start')}
        {code.map((text,j)=><g key={j}>
          {state.line===j+1 && <rect x={45} y={80+j*45} width={735} height={43} rx={7} fill="#e6d9f3"/>}
          <text x={62} y={110+j*45} xmlSpace="preserve" fontFamily="monospace" fontSize={Math.min(25,1060/(text.length+4))}>{j+1}   {text}</text></g>)}
        {Object.entries(state.variables).map(([name,v],j)=><g key={name}>{label(820,114+j*56,`${name} = ${JSON.stringify(v)}`,fittedPaperText(`${name} = ${JSON.stringify(v)}`,330,27,650),green,'start')}</g>)}
        {label(600,540,`Step ${i+1} of ${steps.length}`,25)}</>;
    }),
  TruthTableScene:lesson(truthSchema,'Build a truth table',['truth table','boolean','logic','propositional logic'],
    'Compute and reveal all Boolean input combinations for the chosen unary or binary operator.',({operator},p)=>{
      const unary=operator==='NOT', count=unary?2:4, active=indexAt(p,count);
      const rows=[unary?['A','NOT A']:['A','B',`A ${operator} B`]];
      for(let i=0;i<count;i++){
        const a=unary?!!i:i>=2,b=!!(i%2);
        const output={AND:a&&b,OR:a||b,XOR:a!==b,NAND:!(a&&b),NOR:!(a||b),IMPLIES:!a||b,NOT:!a}[operator];
        rows.push([...(unary?[a]:[a,b]).map(v=>v?'T':'F'),i<=active?(output?'T':'F'):'']);
      }
      return <>{grid(rows,(active+2)*rows[0].length-1,true)}{label(600,510,`Evaluate input combination ${active+1} of ${count}`,31)}</>;
    }),
  DPTableScene:lesson(dpSchema,'Count paths with dynamic programming',['dp table','dynamic programming','grid paths','recurrence'],
    'Fill a grid row by row with the number of right/down paths from the top left. Each new count uses the upper and left neighbors.',({rows,columns},p)=>{
      const active=indexAt(p,rows*columns), values:number[][]=[];
      for(let i=0;i<rows;i++){
        values.push([]);
        for(let j=0;j<columns;j++) values[i][j]=i===0||j===0?1:values[i-1][j]+values[i][j-1];
      }
      const r=Math.floor(active/columns), c=active%columns;
      return <>{grid(values.map((row,i)=>row.map((v,j)=>i*columns+j<=active?v:'')),active,false)}
        {label(600,510,r===0||c===0?'One path along the starting edge':`Above + left = ${values[r-1][c]} + ${values[r][c-1]} = ${values[r][c]}`,32,green)}</>;
    }),
};
