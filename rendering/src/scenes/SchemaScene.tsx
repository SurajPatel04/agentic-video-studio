import {z} from 'zod';
import {field,TableCard,type Table} from '../database/table';
import {ActivityStage,useActivityProgress} from './activityStage';

const entity=z.object({name:field,fields:z.array(z.object({name:field,type:field,key:z.enum(['PK','FK']).optional()}).strict()).min(1).max(6)}).strict();
const endpoint=z.object({table:field,column:field}).strict();
export const schemaSceneSchema=z.object({title:z.string().default('Users and their orders'),
  tables:z.array(entity).min(2).max(4).default([
    {name:'users',fields:[{name:'id',type:'int',key:'PK'},{name:'name',type:'text'}]},
    {name:'orders',fields:[{name:'id',type:'int',key:'PK'},{name:'user_id',type:'int',key:'FK'}]}]),
  relationships:z.array(z.object({from:endpoint,to:endpoint,cardinality:z.enum(['1:1','1:many','many:many']).default('1:many')}).strict()).max(8)
    .default([{from:{table:'users',column:'id'},to:{table:'orders',column:'user_id'},cardinality:'1:many'}])}).strict().superRefine((p,ctx)=>{
    if(new Set(p.tables.map(t=>t.name)).size!==p.tables.length)ctx.addIssue({code:'custom',message:'Table names must be unique'});
    p.tables.forEach((t,i)=>{if(new Set(t.fields.map(f=>f.name)).size!==t.fields.length)ctx.addIssue({code:'custom',path:['tables',i],message:'Field names must be unique'});});
    p.relationships.forEach((r,i)=>{for(const e of [r.from,r.to])if(!p.tables.find(t=>t.name===e.table)?.fields.some(f=>f.name===e.column))ctx.addIssue({code:'custom',path:['relationships',i],message:'Unknown relationship endpoint'});});
  });
export const description='Entity relationship diagram with named table cards, field types, PK and FK labels, and animated relationships connecting specific fields.';
export const tags=['ER diagram','database schema','foreign key','primary key','relationships'];
export function SchemaScene(input:z.input<typeof schemaSceneSchema>){
  const p=schemaSceneSchema.parse(input),t=useActivityProgress();
  const boxes=p.tables.map((entity,i)=>{
    const table:Table={name:entity.name,columns:['Field','Type','Key'],rows:entity.fields.map(f=>[f.name,f.type,f.key??''])};
    return {x:i%2?1000:50,y:Math.floor(i/2)*335+(p.tables.length===2?110:0),table};
  });
  function anchor(e:z.output<typeof endpoint>){
    const i=p.tables.findIndex(t=>t.name===e.table),b=boxes[i];
    return {x:b.x+(i%2?0:550),y:b.y+(p.tables[i].fields.findIndex(f=>f.name===e.column)+2.5)*38};
  }
  return <ActivityStage title={p.title} eyebrow="DATABASE SCHEMA">
    {boxes.map(b=><TableCard key={b.table.name} {...b} w={550} h={(b.table.rows.length+2)*38}/>)}
    {p.relationships.map((r,i)=>{
      const a=anchor(r.from),b=anchor(r.to),mid=765+22*i;
      const draw=Math.min(1,Math.max(0,t*(p.relationships.length+1)-i));
      return <g key={i} opacity={Math.min(1,draw*4)}><path d={`M${a.x} ${a.y} H${mid} V${b.y} H${b.x}`} pathLength={1} strokeDasharray={`${draw} 1`} fill="none" stroke="#77599a" strokeWidth={3}/>
        <text x={a.x+(a.x<mid?15:-15)} y={a.y-9} textAnchor={a.x<mid?'start':'end'} fontSize={24}>{r.cardinality.split(':')[0]}</text>
        <text x={b.x+(b.x<mid?15:-15)} y={b.y-9} textAnchor={b.x<mid?'start':'end'} fontSize={24}>{r.cardinality.split(':')[1]}</text></g>;
    })}
  </ActivityStage>;
}
