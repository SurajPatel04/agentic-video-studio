import {ChangeStage,tableSceneSchema} from '../database/changes';
import type {z} from 'zod';
export {tableSceneSchema};
export const tags=['database','table','insert','update','delete','rows'];
export const description='Animate INSERT, UPDATE and DELETE on sample data. Row indices start at zero and refer to the current rows.';
export function TableScene(input:z.input<typeof tableSceneSchema>){return <ChangeStage {...tableSceneSchema.parse(input)}/>;}
