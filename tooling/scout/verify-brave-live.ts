/** At most six paid requests; all use the shared durable reservation ledger. Rerun reuses receipts. No CRM writes. */
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import {createAdminClient} from '../../src/lib/supabase/admin';
import {fetchExternal,resultIdentity} from '../../src/lib/scout-experimental/providers';
import {buildBraveRequest,BRAVE_ADAPTER_REVISION,BRAVE_PRICING_REVISION} from '../../src/lib/scout-experimental/brave';
import {hasDiscoveryLead} from '../../src/lib/scout-experimental/retrieval-admission';
import type {TrialCapability} from '../../src/lib/scout-experimental/types';
if(!process.argv.includes('--run'))throw new Error('Pass --run for the authorized six-request pilot.');
const db=createAdminClient();
const file='private/scout-dataset/brave-live-pilot.json';let saved:any;
try{saved=JSON.parse(await readFile(file,'utf8'));}catch(e:any){if(e.code!=='ENOENT')throw e;}
const platforms=['Facebook','TikTok','Instagram'];
const queries=['cầu lông huấn luyện viên Hồ Chí Minh','badminton coach Vietnam'];
if(!saved){
 const {data:owners,error}=await db.from('profiles').select('id').eq('role','admin');if(error || !owners?.length)throw error || new Error('Admin unavailable.');
 const {data:budget,error:be}=await db.rpc('scout_brave_budget');if(be)throw be;if(Number(budget.remainingUsd)<.03)throw new Error('Brave monthly budget has insufficient pilot allocation.');
 const {data:session,error:se}=await db.from('scout_sessions').insert({owner_id:owners[0].id,kind:'preview',runtime_version:3,execution_engine:'legacy',params:{searchStrategy:'seed_content_v1',keyword:'badminton',searchPlan:{maxSessionUsd:.03},uiContext:{source:'brave-adapter-verification'}},status:'pending'}).select('id').single();if(se)throw se;
 saved={sessionId:session.id,startedAt:new Date().toISOString(),raw:[],accountVerified:{plan:'Search prepaid, active',requestUsd:.005,grantedCreditUsd:5,purchasedCreditUsd:0,autoReload:false,source:'Authenticated Brave dashboard 2026-10-13'}};
 await mkdir('private/scout-dataset',{recursive:true});await writeFile(file,JSON.stringify(saved,null,2)+'\n');
 // Verified account/rate from dashboard, with only two units/platform for isolated verification.
 for(const platform of platforms){const {error}=await db.from('scout_trial_capabilities').insert({provider:'brave',operation:'discovery',platform,revision:'brave-pilot-20261013-1',verified:true,expires_at:'2026-10-31T17:00:00Z',total_units:2,units_per_request:1,max_value_usd:.005,config:{paidSearch:true,adapterRevision:BRAVE_ADAPTER_REVISION,pricingRevision:BRAVE_PRICING_REVISION,receiptUrl:'https://api-dashboard.search.brave.com/app/subscriptions/active'}});if(error)throw error;}
}
const summary:any={sessionId:saved.sessionId,accountVerified:saved.accountVerified,adapterRevision:BRAVE_ADAPTER_REVISION,pricingRevision:BRAVE_PRICING_REVISION,requests:0,platforms:{},crmWrites:0};
for(const platform of platforms){
 const {data:cap,error}=await db.from('scout_trial_capabilities').select('*').eq('provider','brave').eq('platform',platform).single();if(error)throw error;
 let usableLeads=0,unresolved=0,requestsSucceeded=0;const unique=new Set<string>();
 for(const query of queries){
  const request=buildBraveRequest(platform,query);const input={query,limit:15,method:'web-content',braveRequest:request};
  try{
   // Capability activation can change its revision. Pilot replay must never create new task identities.
   const {data:previous,error:lookupError}=await db.from('scout_external_runs').select('input,state,response').eq('session_id',saved.sessionId).eq('capability_id',cap.id);
   if(lookupError)throw lookupError;
   const existing=previous?.find(r=>r.input?.query===query && r.input?.method==='web-content');
   if(existing && existing.state!=='succeeded')throw new Error('Saved pilot request is unresolved or failed; no retry is allowed.');
   if(!existing && cap.revision!=='brave-pilot-20261013-1')throw new Error('Pilot capability revision changed; no new request is allowed.');
   const {count,error:countError}=await db.from('scout_external_runs').select('id',{count:'exact',head:true}).eq('session_id',saved.sessionId);
   if(countError)throw countError;if(!existing && Number(count)>=6)throw new Error('The six-request pilot limit is exhausted.');
   const rows=existing?existing.response:await fetchExternal(saved.sessionId,cap as TrialCapability,input);requestsSucceeded++;
   for(const row of rows){const p=resultIdentity(row,platform);if(p && hasDiscoveryLead(p,'badminton'))unique.add(p.url);if(!p)unresolved++;}
   saved.raw=saved.raw.filter((r:any)=>r.platform!==platform || r.request.approvedQuery!==query);saved.raw.push({platform,request,rows});
  }catch(e:any){saved.raw=saved.raw.filter((r:any)=>r.platform!==platform || r.request.approvedQuery!==query);saved.raw.push({platform,request,error:e.code || e.message});}
  summary.requests++;await writeFile(file,JSON.stringify(saved,null,2)+'\n');
 }
 usableLeads=unique.size;summary.platforms[platform]={requestsSucceeded,usableLeads,unresolved};
}
const {data:runs,error:re}=await db.from('scout_external_runs').select('id,state,actual_usd,reserved_usd,provider_receipt').eq('session_id',saved.sessionId);if(re)throw re;
summary.runs=runs;summary.apiValueUsd=runs?.reduce((sum,r)=>sum+Number(r.actual_usd ?? r.reserved_usd),0);summary.observedAt=new Date().toISOString();
const {data:current,error:currentError}=await db.from('scout_sessions').select('result').eq('id',saved.sessionId).single();if(currentError)throw currentError;
const {error:finish}=await db.from('scout_sessions').update({status:'complete',result:{...current.result,braveVerification:summary}}).eq('id',saved.sessionId);if(finish)throw finish;
await mkdir('docs/scout',{recursive:true});await writeFile('docs/scout/brave-live-receipt.json',JSON.stringify(summary,null,2)+'\n');console.log(JSON.stringify(summary));
