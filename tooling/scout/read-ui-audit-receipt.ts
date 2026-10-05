/** Read only: inspect existing provider runs and the saved UI audit result. */
import {writeFile} from 'node:fs/promises';
import {createAdminClient} from '../../src/lib/supabase/admin';
import {apifyApi} from '../../src/lib/apify/runtime';
const id='0030c099-4b7f-4b65-826e-aeae7ee8d2c7',db=createAdminClient();
const {data:session,error}=await db.from('scout_sessions').select('status,result,warnings,params').eq('id',id).single();if(error)throw error;
const {data:runs,error:runError}=await db.from('scout_provider_runs').select('provider_run_id,state,actual_usd,input,task_key,build').eq('session_id',id).order('created_at');if(runError)throw runError;
const evidence=[];
for(const run of runs || []){const response=await apifyApi(`actor-runs/${run.provider_run_id}`);const state=response.data || response;evidence.push({runId:run.provider_run_id,storedState:run.state,providerState:state.status,chargedUsd:state.usageTotalUsd ?? null,build:run.build,window:run.input.onlyPostsNewerThan,taskKey:run.task_key});}
const receipt={recordedAt:new Date().toISOString(),sessionId:id,status:session.status,result:{success:session.result?.success,partial:session.result?.partial,counts:session.result?.counts,warnings:session.result?.warnings},sessionWarnings:session.warnings,runs:evidence};
await writeFile('artifacts/scout-workspace/chrome-live-readback.json',JSON.stringify(receipt,null,2)+'\n');console.log(JSON.stringify(receipt));
