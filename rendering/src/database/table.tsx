import {z} from 'zod';
import {LockKeyhole, ListTree, TriangleAlert} from 'lucide-react';
import {PAPER} from '../iso/iso';
import {fittedPaperText} from '../iso/textFit';

export const cell = z.union([z.string().max(28),z.number(),z.boolean(),z.null()]);
export const field = z.string().min(1).max(24);
export const tableSchema = z.object({
  name: field, columns: z.array(field).min(1).max(6), rows: z.array(z.array(cell)).max(8),
  indexed: z.array(field).optional(), locked: z.array(z.number().int().nonnegative()).optional(),
  duplicateKey: field.optional(),
}).strict().superRefine((t,ctx)=>{
  const bad = (message:string) => ctx.addIssue({code:'custom',message});
  if(new Set(t.columns).size!==t.columns.length) bad('Column names must be unique');
  if(t.rows.some(r=>r.length!==t.columns.length)) bad('Each row needs one value per column');
  if([...(t.indexed??[]),...(t.duplicateKey?[t.duplicateKey]:[])].some(c=>!t.columns.includes(c))) bad('Unknown badge column');
  if(t.locked?.some(i=>i>=t.rows.length)) bad('Unknown locked row (indices start at zero)');
});
export type Table = z.output<typeof tableSchema>;
export const users:Table={name:'users',columns:['id','name'],rows:[[1,'Asha'],[2,'Ravi'],[3,'Nina']],indexed:['id']};
export const orders:Table={name:'orders',columns:['order','user_id'],rows:[[101,1],[102,1],[103,3],[104,4]]};
export type Effect={row:number; column?:number; kind:'insert'|'update'|'delete'; progress:number};

export function TableCard({table,x=0,y=0,w=600,h=380,effect}:{table:Table;x?:number;y?:number;w?:number;h?:number;effect?:Effect}){
  const {columns,rows}=table;
  const rh=h/(rows.length+2), cw=w/columns.length, font=Math.min(28,rh*.50,cw*.22);
  const duplicate=columns.indexOf(table.duplicateKey??'');
  const text=(v:string,px:number,py:number,width:number,color=PAPER.ink)=>
    <text x={px} y={py} fill={color} fontSize={fittedPaperText(v,width,font,650)} fontWeight={650}>{v}</text>;
  return <g transform={`translate(${x} ${y})`} fontFamily={PAPER.sans}>
    <rect width={w} height={h} rx={10} fill={PAPER.card} stroke={PAPER.ink} strokeWidth={2}/>
    <rect x={2} y={2} width={w-4} height={rh-2} rx={8} fill="#e7ddf2"/>
    {text(table.name,12,rh*.68,w-24)}
    {columns.map((c,j)=><g key={c}>{text(c,j*cw+10,rh*1.68,cw-(table.indexed?.includes(c)?38:20))}
      {table.indexed?.includes(c)&&<ListTree x={(j+1)*cw-27} y={rh*1.22} width={21} height={rh*.5} color="#76589a"/>}</g>)}
    {rows.map((r,i)=>{
      const active=effect?.row===i?effect:undefined;
      const scale=active?.kind==='delete'?1-active.progress:1;
      const offset=effect?.kind==='delete'&&i>effect.row?-rh*effect.progress:0;
      const locked=table.locked?.includes(i);
      return <g key={i} transform={`translate(${active?.kind==='insert'?(1-active.progress)*30:0} ${(i+2)*rh+offset}) scale(1 ${scale})`} opacity={active?.kind==='insert'?active.progress:scale}>
        <path d={`M0 0 H${w}`} stroke={PAPER.track}/>
        {r.map((v,j)=>{
          const repeated=j===duplicate&&v!==null&&rows.filter(row=>row[j]===v).length>1;
          const marked=active && (active.column===undefined||active.column===j);
          const fill=marked?(active.kind==='delete'?'#faccc2':active.kind==='insert'?'#ccedd5':'#ffe6a6'):v===null?'#e9e5ef':undefined;
          return <g key={j}>{fill&&<rect x={j*cw+2} y={2} width={cw-4} height={rh-4} fill={fill}/>}
            {text(String(v??'NULL'),j*cw+10,rh*.66,cw-20-(locked&&j===0?24:0)-(repeated?24:0),v===null?'#72548e':PAPER.ink)}
            {locked&&j===0&&<LockKeyhole x={cw-25} y={rh*.25} width={20} height={rh*.5}/>}
            {repeated&&<TriangleAlert x={(j+1)*cw-(locked&&j===0?48:25)} y={rh*.25} width={20} height={rh*.5} fill="#ffca74"/>}</g>;
        })}</g>;
    })}
  </g>;
}
