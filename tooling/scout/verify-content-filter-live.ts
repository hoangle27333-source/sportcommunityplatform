/** Bounded acceptance. Saved session IDs are resumed, never replaced on retry. */
import {readFile,writeFile} from 'node:fs/promises';
import {createAdminClient} from '../../src/lib/supabase/admin';
import {requestSchema} from '../../src/lib/apify/sessions';
import {loadContentSettings} from '../../src/lib/apify/content-settings';
import {buildSearchPlan} from '../../src/lib/apify/search-plan';
import {executeSession} from '../../src/lib/apify/session-executor';
import {boundedScoutStep} from '../../src/lib/apify/execution-budget';
if(!process.argv.includes('--allow-paid'))throw new Error('Use --allow-paid for the bounded acceptance run.');
const db=createAdminClient(),path='artifacts/scout-top-posts/content-filter-live.json';
let receipt:any={};try{receipt=JSON.parse(await readFile(path,'utf8'));}catch(e:any){if(e.code!=='ENOENT')throw e;}
const save=()=>writeFile(path,JSON.stringify(receipt,null,2)+'\n');
if(!receipt.sessionId){
 const {data:source,error}=await db.from('scout_sessions').select('owner_id').eq('id','d5991f70-d799-40d9-8136-5ee52c8a5695').single();if(error)throw error;
 const params=requestSchema.parse({selectionMode:'top',rankingMode:'views-first',qualityFilter:await loadContentSettings(),keyword:'Running',searchMode:'keyword',platform:['Facebook'],geography:'Vietnam',limit:5,recentDays:30,maxSessionUsd:.15});
 const plan=await buildSearchPlan('trends',params);
 const {data:session,error:insertError}=await db.from('scout_sessions').insert({owner_id:source!.owner_id,kind:'trends',execution_engine:'legacy',runtime_version:3,params:{...params,searchPlan:plan,planHash:plan.hash,providerBuilds:Object.assign({},...plan.sources.map(s=>s.builds)),uiContext:{source:'content-filter-live-acceptance'}}}).select('id').single();if(insertError)throw insertError;
 receipt={sessionId:session.id,capUsd:plan.maxSessionUsd,qualityFilter:params.qualityFilter};await save();
}
const running=await boundedScoutStep(()=>executeSession(receipt.sessionId),receipt.sessionId);
const {data:session,error}=await db.from('scout_sessions').select('status,result').eq('id',receipt.sessionId).single();if(error)throw error;
const {data:runs,error:runError}=await db.from('scout_provider_runs').select('platform,state,build,build_id,provider_run_id,actual_usd,reserved_usd').eq('session_id',receipt.sessionId);if(runError)throw runError;
const ids=(session!.result?.savedPosts || []).map((p:any)=>p.id);
const persisted=ids.length?await db.from('scouted_posts').select('id,post_url,views,likes,comments,shares,scout_content_assessment').in('id',ids):{data:[],error:null};if(persisted.error)throw persisted.error;
Object.assign(receipt,{running,status:session!.status,result:session!.result,runs,persisted:persisted.data});await save();
console.log(JSON.stringify({sessionId:receipt.sessionId,running,status:receipt.status,counts:receipt.result?.counts,stopReason:receipt.result?.stopReason,searchCost:receipt.result?.searchCost,persisted:ids.length,runs:runs?.map(r=>({state:r.state,actualUsd:r.actual_usd}))}));
