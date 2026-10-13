/** Bounded live acceptance; keep saved IDs so retries never create replacement paid sessions. */
import {readFile,writeFile} from 'node:fs/promises';
import {createAdminClient} from '../../src/lib/supabase/admin';
import {requestSchema} from '../../src/lib/apify/sessions';
import {buildSearchPlan} from '../../src/lib/apify/search-plan';
import {buildEntityTopPlan} from '../../src/lib/apify/top-post-plan';
import {executeSession} from '../../src/lib/apify/session-executor';
import {boundedScoutStep} from '../../src/lib/apify/execution-budget';
if(!process.argv.includes('--allow-paid'))throw new Error('Supply --allow-paid for the reviewed bounded acceptance run.');
const db=createAdminClient();const output='artifacts/scout-top-posts/live-provider-receipt.json';
let receipt:any={checks:[]};try{receipt=JSON.parse(await readFile(output,'utf8'));}catch(e:any){if(e.code!=='ENOENT')throw e;}
const save=()=>writeFile(output,JSON.stringify(receipt,null,2)+'\n');
const {data:source,error}=await db.from('scout_sessions').select('owner_id').eq('id','d5991f70-d799-40d9-8136-5ee52c8a5695').single();if(error)throw error;
for(const test of [
 {name:'TikTok saved KOL',kind:'kol-posts',criteria:{platform:['TikTok'],kolId:'afe0f2d8-f6ac-4d2c-9b1f-785ff44a28d1',channelUrls:['https://tiktok.com/@dokimphuc.football'],maxSessionUsd:.5}},
 {name:'TikTok topic (global ranking check)',kind:'trends',criteria:{platform:['TikTok'],keyword:'Running',searchMode:'keyword',geography:'Any location',maxSessionUsd:.5}},
 {name:'Facebook topic',kind:'trends',criteria:{platform:['Facebook'],keyword:'Running',searchMode:'keyword',geography:'Vietnam',maxSessionUsd:.25}},
]) {
 let check=receipt.checks.find((c:any)=>c.name===test.name);
 if(!check){const params=requestSchema.parse({selectionMode:'top',rankingMode:'views-first',thresholdsEnabled:false,limit:5,recentDays:30,...test.criteria});
  const plan=test.kind==='trends'?await buildSearchPlan('trends',params):await buildEntityTopPlan(test.kind,params);
  const {data:session,error:insertError}=await db.from('scout_sessions').insert({owner_id:source!.owner_id,kind:test.kind,execution_engine:'legacy',runtime_version:3,params:{...params,planHash:plan.hash,searchPlan:plan,providerBuilds:Object.assign({},...plan.sources.map(s=>s.builds)),uiContext:{source:'top-post-live-acceptance'}}}).select('id').single();if(insertError)throw insertError;
  check={name:test.name,sessionId:session.id,capUsd:plan.maxSessionUsd};receipt.checks.push(check);await save();
 }
 const deadline=Date.now()+10*60000;
 while(await boundedScoutStep(()=>executeSession(check.sessionId),check.sessionId)){if(Date.now()>deadline)throw new Error(`Resume saved session ${check.sessionId}; do not replace it.`);await new Promise(resolve=>setTimeout(resolve,5000));}
 const {data:session,error:readError}=await db.from('scout_sessions').select('status,result').eq('id',check.sessionId).single();if(readError)throw readError;
 const {data:runs,error:runError}=await db.from('scout_provider_runs').select('platform,state,build,build_id,provider_run_id,actual_usd,reserved_usd,warnings').eq('session_id',check.sessionId);if(runError)throw runError;
 const result=session!.result;const ids=(result.posts || []).map((p:any)=>p.id);
 const persisted=ids.length?await db.from('scouted_posts').select('id,post_url,views,likes,comments,shares,scout_missing_metrics').in('id',ids):{data:[],error:null};if(persisted.error)throw persisted.error;
 Object.assign(check,{status:session!.status,success:result.success,error:result.error,counts:result.counts,stopReason:result.stopReason,searchCost:result.searchCost,posts:(result.posts || []).map((p:any)=>({id:p.id,url:p.url,views:p.views,likes:p.likes,comments:p.comments,shares:p.shares,rank:p.rank,saveState:p.saveState})),persisted:persisted.data,runs,warnings:result.warnings});await save();console.log(JSON.stringify(check));
}
