import {ChangeStage,transactionSceneSchema} from '../database/changes';
import type {z} from 'zod';
export {transactionSceneSchema};
export const tags=['database','table','transaction','commit','rollback','rows'];
export const description='BEGIN a transaction, animate row changes and COMMIT or ROLLBACK to the original rows. Row indices start at zero and refer to the current rows.';
export function TransactionScene(input:z.input<typeof transactionSceneSchema>){return <ChangeStage {...transactionSceneSchema.parse(input)}/>;}
