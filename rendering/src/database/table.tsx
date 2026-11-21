import {z} from 'zod';
import {LockKeyhole, ListTree, TriangleAlert} from 'lucide-react';
import {PAPER} from '../iso/iso';
import {fittedPaperText, paperTextEmWidth} from '../iso/textFit';

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
  const rh=h/(rows.length+2);
  const duplicate=columns.indexOf(table.duplicateKey??'');
  const hasLocks = Boolean(table.locked?.length);
  const indexed = columns.map(c => table.indexed?.includes(c));
  const weights = columns.map((c,j) => Math.max(2.4,
    paperTextEmWidth(c,650) + (indexed[j] ? 1.3 : 0),
    ...rows.map(r => paperTextEmWidth(String(r[j]??'NULL'),650) + (hasLocks && j===0 ? 1.3 : 0) + (j===duplicate ? 1.3 : 0))
  ) + 1.2);
  const total = weights.reduce((a,b) => a+b,0);
  const font = Math.min(28,rh*.52,w/total);
  const pad = Math.min(12,font*.55);
  const badge = Math.min(20,font*.95);
  let left = 0;
  const cells = weights.map(weight => {
    const width = w * weight / total;
    const cell = {left,width};
    left += width;
    return cell;
  });
  const text=(v:string,px:number,py:number,width:number,color=PAPER.ink)=>
    <text x={px} y={py} fill={color} fontSize={fittedPaperText(v,width,font,650)} fontWeight={650}>{v}</text>;
  return <g transform={`translate(${x} ${y})`} fontFamily={PAPER.sans}>
    <rect width={w} height={h} rx={10} fill={PAPER.card} stroke={PAPER.ink} strokeWidth={2}/>
    <rect x={2} y={2} width={w-4} height={rh-2} rx={8} fill="#e7ddf2"/>
    {text(table.name,pad,rh*.68,w-2*pad)}
    {columns.map((c,j)=>{
      const {left,width}=cells[j];
      return <g key={c}>{text(c,left+pad,rh*1.68,width-2*pad-(indexed[j]?badge+pad:0))}
        {indexed[j]&&<ListTree x={left+width-pad-badge} y={rh*1.5-badge/2} width={badge} height={badge} color="#76589a"/>}</g>;
    })}
    {rows.map((r,i)=>{
      const active=effect?.row===i?effect:undefined;
      const scale=active?.kind==='delete'?1-active.progress:1;
      const offset=effect?.kind==='delete'&&i>effect.row?-rh*effect.progress:0;
      const locked=table.locked?.includes(i);
      return <g key={i} transform={`translate(${active?.kind==='insert'?(1-active.progress)*30:0} ${(i+2)*rh+offset}) scale(1 ${scale})`} opacity={active?.kind==='insert'?active.progress:scale}>
        <path d={`M0 0 H${w}`} stroke={PAPER.track}/>
        {r.map((v,j)=>{
          const {left,width}=cells[j];
          const showLock=locked&&j===0;
          const badgeX=left+width-pad-badge;
          const repeated=j===duplicate&&v!==null&&rows.filter(row=>row[j]===v).length>1;
          const marked=active && (active.column===undefined||active.column===j);
          const fill=marked?(active.kind==='delete'?'#faccc2':active.kind==='insert'?'#ccedd5':'#ffe6a6'):v===null?'#e9e5ef':undefined;
          return <g key={j}>{fill&&<rect x={left+1} y={1} width={Math.max(0,width-2)} height={Math.max(0,rh-2)} fill={fill}/>}
            {text(String(v??'NULL'),left+pad,rh*.66,width-2*pad-(showLock?badge+pad:0)-(repeated?badge+pad:0),v===null?'#72548e':PAPER.ink)}
            {showLock&&<LockKeyhole x={badgeX} y={rh*.5-badge/2} width={badge} height={badge}/>}
            {repeated&&<TriangleAlert x={badgeX-(showLock?badge+pad:0)} y={rh*.5-badge/2} width={badge} height={badge} fill="#ffca74"/>}</g>;
        })}</g>;
    })}
  </g>;
}
