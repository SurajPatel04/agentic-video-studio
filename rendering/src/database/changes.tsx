import {z} from 'zod';
import {cell,field,tableSchema,TableCard,users,type Table,type Effect} from './table';
import {ActivityStage,useActivityProgress} from '../scenes/activityStage';

const row=z.number().int().nonnegative();
const operation=z.discriminatedUnion('op',[
  z.object({op:z.literal('insert'),values:z.array(cell)}).strict(),
  z.object({op:z.literal('update'),row,column:field,value:cell}).strict(),
  z.object({op:z.literal('delete'),row}).strict(),
]);
type Operation=z.output<typeof operation>;
const example:Operation[]=[{op:'insert',values:[4,'Mira']},{op:'update',row:1,column:'name',value:'Ravi S.'},{op:'delete',row:0}];
const props={table:tableSchema.default(users),steps:z.array(operation).min(1).max(12).default(example)};
function validate(p:{table:Table;steps:Operation[]},ctx:z.RefinementCtx){
  let n=p.table.rows.length;
  p.steps.forEach((s,i)=>{
    const bad=(message:string)=>ctx.addIssue({code:'custom',path:['steps',i],message});
    if(s.op==='insert'){if(s.values.length!==p.table.columns.length) bad('Insert requires a value for every column'); if(++n>10) bad('Maximum 10 visible rows');}
    else {if(s.row>=n) bad('Row index is outside the current table');if(s.op==='delete') n--;else if(!p.table.columns.includes(s.column)) bad('Unknown update column');}
  });
}
export const tableSceneSchema=z.object({...props,title:z.string().default('Changing the users table')}).strict().superRefine(validate);
export const transactionSceneSchema=z.object({...props,title:z.string().default('A transaction on users'),outcome:z.enum(['commit','rollback']).default('rollback'),
  expectedPendingRows:z.array(z.array(cell)).max(10).optional(),
}).strict().superRefine(validate).superRefine((p,ctx)=>{
  if (!p.expectedPendingRows) return;
  const pending = p.steps.reduce(apply, p.table);
  if (JSON.stringify(pending.rows) !== JSON.stringify(p.expectedPendingRows)) {
    ctx.addIssue({code:'custom',path:['expectedPendingRows'],message:'Steps produce different rows before commit or rollback. Check which logical row each update targets.'});
  }
});
function apply(table:Table,s:Operation):Table{
  if(s.op==='insert') return {...table,rows:[...table.rows,s.values]};
  if(s.op==='delete') return {...table,rows:table.rows.filter((_,i)=>i!==s.row),locked:table.locked?.filter(i=>i!==s.row).map(i=>i>s.row?i-1:i)};
  return {...table,rows:table.rows.map((r,i)=>i===s.row?r.map((v,j)=>table.columns[j]===s.column?s.value:v):r)};
}
export function ChangeStage({table,steps,title,outcome}:{table:Table;steps:Operation[];title:string;outcome?:'commit'|'rollback'}){
  const t=useActivityProgress(), phases=steps.length+(outcome?2:1);
  const position=Math.min(t*phases,phases-.00001), index=Math.floor(position)-(outcome?1:0);
  const progress=Math.min(1,(position%1)*2);
  let current=table, effect:Effect|undefined;
  for(let i=0;i<Math.min(index,steps.length);i++) current=apply(current,steps[i]);
  const s=steps[index];
  let label='BEGIN';
  if(s){
    label=s.op.toUpperCase()+(s.op==='update'?' · '+s.column:'');
    effect={kind:s.op,row:s.op==='insert'?current.rows.length:s.row,column:s.op==='update'?current.columns.indexOf(s.column):undefined,progress};
    if(s.op==='insert'||(s.op==='update'&&progress>=.35)) current=apply(current,s);
    if(s.op==='delete'&&progress>=1){current=apply(current,s);effect=undefined;}
  }else if(index>=steps.length){label=outcome?.toUpperCase()??'Final rows';if(outcome==='rollback')current=table;}
  return <ActivityStage title={title} eyebrow={outcome?'TRANSACTION':'ROW CHANGES'}>
    <text x={180} y={45} fontSize={32} fontWeight={800} fill={label==='COMMIT'?'#348257':label==='ROLLBACK'?'#a94939':'#71569f'}>{label}</text>
    <TableCard table={current} x={180} y={75} w={1240} h={Math.min(540,(current.rows.length+2)*68)} effect={effect}/>
  </ActivityStage>;
}
