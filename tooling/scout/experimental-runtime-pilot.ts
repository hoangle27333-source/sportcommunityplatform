/** Bounded live v6 executor acceptance. Explicit opt-in; durable resume; no review/import. */
import { readFile,writeFile,mkdir } from 'node:fs/promises';
import { createAdminClient } from '../../src/lib/supabase/admin';
import { requestSchema,executeSession } from '../../src/lib/apify/sessions';
import { buildExperimentalPlan } from '../../src/lib/scout-experimental/plan';
import { boundedScoutStep } from '../../src/lib/apify/execution-budget';
if(!process.argv.includes('--run'))throw new Error('Pass --run for the authorized bounded live pilot.');
const db=createAdminClient();const full=process.argv.includes('--verified-minimum');const second=process.argv.includes('--retry-prestart');const file=full?'private/scout-dataset/experimental-runtime-pilot-v3.json':second?'private/scout-dataset/experimental-runtime-pilot-v2.json':'private/scout-dataset/experimental-runtime-pilot.json';
let receipt:any;try{receipt=JSON.parse(await readFile(file,'utf8'));}catch(e:any){if(e.code!=='ENOENT')throw e;}
if(!receipt){
 const {data:owners,error}=await db.from('profiles').select('id').eq('role','admin');if(error)throw error;
 let owner=owners?.[0];
 for(const p of owners || []){const {data}=await db.auth.admin.getUserById(p.id);if(/super admin/i.test(JSON.stringify(data.user?.user_metadata || {})))owner=p;}
 if(!owner)throw new Error('Pilot admin is unavailable.');
 const params=requestSchema.parse({searchStrategy:'seed_content_v1',keyword:'badminton',platform:['TikTok'],targetType:'Individual KOLs',geography:'Ho Chi Minh City',limit:5,minFollowers:1000,keywordsApproved:true,approvedKeywords:['cầu lông Ho Chi Minh City'],seedUrls:[],maxSessionUsd:full?1:.3,maxModelUsd:.02});
 const plan=await buildExperimentalPlan(params);
 const {data:session,error:se}=await db.from('scout_sessions').insert({owner_id:owner.id,kind:'preview',runtime_version:3,execution_engine:'legacy',params:{...params,searchPlan:plan,planHash:plan.hash,assessmentRevision:7,uiContext:{source:'bounded-v6-executor-pilot'}}}).select('id').single();if(se)throw se;
 receipt={sessionId:session.id,startedAt:new Date().toISOString(),scope:'Real database/provider/model with bounded local executor; not a hosted Vercel Workflow run',approvedCapUsd:full?1:.3};
 await mkdir('private/scout-dataset',{recursive:true});await writeFile(file,JSON.stringify(receipt,null,2)+'\n');
}
const deadline=Date.now()+10*60000;
while(await boundedScoutStep(()=>executeSession(receipt.sessionId),receipt.sessionId)){
 if(Date.now()>deadline)throw new Error(`Session ${receipt.sessionId} remains pending; rerun the same command to resume receipts.`);
 await new Promise(resolve=>setTimeout(resolve,7000));
}
const {data:s,error}=await db.from('scout_sessions').select('status,result,review_decisions').eq('id',receipt.sessionId).single();if(error)throw error;
const {data:runs,error:re}=await db.from('scout_provider_runs').select('id,provider_run_id,state,actual_usd,reserved_usd').eq('session_id',receipt.sessionId);if(re)throw re;
const {data:models,error:me}=await db.from('scout_external_runs').select('id,state,actual_usd,reserved_usd,capability_id').eq('session_id',receipt.sessionId);if(me)throw me;
const starts=runs?.length;
await boundedScoutStep(()=>executeSession(receipt.sessionId),receipt.sessionId);
const {count,error:ce}=await db.from('scout_provider_runs').select('id',{count:'exact',head:true}).eq('session_id',receipt.sessionId);if(ce)throw ce;if(count!==starts)throw new Error('Completed-session replay started a provider.');
receipt={...receipt,status:s.status,result:s.result,runs,externalRuns:models,finishedAt:new Date().toISOString(),completedReplayProviderStarts:0,crmWrites:0};await writeFile(file,JSON.stringify(receipt,null,2)+'\n');
const summary={...receipt,result:undefined,counts:s.result?.counts,stopReason:s.result?.stopReason,warnings:s.result?.warnings,searchCost:s.result?.searchCost};
await writeFile(full?'docs/scout/runtime-pilot-v3-receipt.json':second?'docs/scout/runtime-pilot-v2-receipt.json':'docs/scout/runtime-pilot-receipt.json',JSON.stringify(summary,null,2)+'\n');console.log(JSON.stringify(summary));
if(s.status!=='complete')process.exitCode=1;
