import {z} from 'zod';
import {ActivityStage,useActivityProgress} from './activityStage';
import {TableCard,field,tableSchema,users,orders,type Table} from '../database/table';

export const joinSceneSchema=z.object({title:z.string().optional(),kind:z.enum(['inner','left','right']).default('inner'),
  left:tableSchema.default(users),right:tableSchema.default(orders),leftKey:field.default('id'),rightKey:field.default('user_id')}).strict()
  .superRefine((p,ctx)=>{for(const side of ['left','right'] as const) if(!p[side].columns.includes(p[side==='left'?'leftKey':'rightKey'])) ctx.addIssue({code:'custom',path:[side+'Key'],message:'Key must name a column in this table'});});
export const description='Compute INNER, LEFT or RIGHT equality joins. Connect matching key values and progressively assemble the result, preserving unmatched rows on the selected side. NULL keys do not match.';
export const tags=['join','inner join','left join','right join','relational database'];
export function JoinScene(input:z.input<typeof joinSceneSchema>){
  const p=joinSceneSchema.parse(input),t=useActivityProgress();
  const pairs:{l:number;r:number}[]=[];
  const lk=p.left.columns.indexOf(p.leftKey),rk=p.right.columns.indexOf(p.rightKey);
  p.left.rows.forEach((row,l)=>{
    const hits=p.right.rows.flatMap((other,r)=>row[lk]!==null&&row[lk]===other[rk]?[r]:[]);
    for(const r of hits)pairs.push({l,r});
    if(!hits.length&&p.kind==='left')pairs.push({l,r:-1});
  });
  if(p.kind==='right')p.right.rows.forEach((_,r)=>{if(!pairs.some(pair=>pair.r===r))pairs.push({l:-1,r});});
  const shown=Math.min(pairs.length,Math.floor(Math.max(0,t-.1)/.78*(pairs.length+1)));
  const first=Math.max(0,shown-4);
  const result:Table={name:`Result · ${shown} of ${pairs.length} rows`,columns:[...p.left.columns.map(c=>p.left.name+'.'+c),...p.right.columns.map(c=>p.right.name+'.'+c)],
    rows:pairs.slice(first,shown).map(({l,r})=>[...(p.left.rows[l]??p.left.columns.map(()=>null)),...(p.right.rows[r]??p.right.columns.map(()=>null))])};
  const rowY=(table:Table,i:number)=>300/(table.rows.length+2)*(2.5+i);
  return <ActivityStage title={p.title??p.kind.toUpperCase()+' JOIN'} eyebrow={p.left.name+'.'+p.leftKey+' = '+p.right.name+'.'+p.rightKey}>
    <TableCard table={p.left} w={640} h={300}/><TableCard table={p.right} x={960} w={640} h={300}/>
    {pairs.slice(0,shown).map(({l,r},i)=>l>=0&&r>=0&&<line key={i} x1={640} x2={960} y1={rowY(p.left,l)} y2={rowY(p.right,r)} stroke={i===shown-1?'#754d9a':'#aa97ba'} strokeWidth={i===shown-1?5:2}/>)}
    <TableCard table={result} x={160} y={360} w={1280} h={(result.rows.length+2)*48}/>
  </ActivityStage>;
}
