/** Read-only persisted-session acceptance receipt; never starts a provider. */
import {writeFile} from 'node:fs/promises';
import {z} from 'zod';
import {createAdminClient} from '../../src/lib/supabase/admin';
const id=z.string().uuid().parse(process.argv.find(a=>a.startsWith('--session='))?.slice(10));
const db=createAdminClient();
const {data:session,error}=await db.from('scout_sessions').select('status,params,progress,result,warnings').eq('id',id).single();if(error)throw error;
const {data:runs,error:runError}=await db.from('scout_provider_runs').select('provider_run_id,state,input,build,actual_usd,normalized_rows').eq('session_id',id);if(runError)throw runError;
const postIds=(session.result?.posts || []).map((p:any)=>p.id);
const persisted=postIds.length ? await db.from('scouted_posts').select('id,post_url').in('id',postIds) : {data:[],error:null};if(persisted.error)throw persisted.error;
const receipt={recordedAt:new Date().toISOString(),sessionId:id,status:session.status,success:session.result?.success,partial:session.result?.partial,counts:session.result?.counts,warnings:session.warnings,providerRunCount:runs.length,runs:runs.map(r=>({id:r.provider_run_id,state:r.state,build:r.build,window:r.input.onlyPostsNewerThan,actualUsd:r.actual_usd,observations:r.normalized_rows?.length || 0})),retrievalWindows:session.params.retrievalWindows,providerBuilds:session.params.providerBuilds,persistedResultPostCount:persisted.data.length};
await writeFile('artifacts/scout-workspace/chrome-fixed-session.json',JSON.stringify(receipt,null,2)+'\n');console.log(JSON.stringify(receipt));
