/** Budgeted live acceptance sample. Isolated from hosted recovery; never imports or approves accounts. */
import {mkdir,writeFile} from 'node:fs/promises';
import {createAdminClient} from '../../src/lib/supabase/admin';
import {buildSearchPlan} from '../../src/lib/apify/search-plan';
import {requestSchema} from '../../src/lib/apify/sessions';
import {executeSession} from '../../src/lib/apify/session-executor';
import {apifyApi,knownCharge} from '../../src/lib/apify/runtime';
import {boundedScoutStep} from '../../src/lib/apify/execution-budget';
const arg=(name:string)=>process.argv.find(a=>a.startsWith(`--${name}=`))?.slice(name.length+3);
const budget=Number(arg('budget-usd'));
if(!process.argv.includes('--allow-paid') || !Number.isFinite(budget) || budget<=0 || budget>100)throw new Error('Supply the explicitly approved --allow-paid --budget-usd amount.');
const db=createAdminClient();
let id=arg('resume');
if(!id){
 const params:any=requestSchema.parse({assessmentRevision:6,accountPolicyVersion:5,keyword:arg('topic'),geography:arg('geography'),platform:arg('platform') || 'TikTok',targetType:'Individual KOLs',limit:Number(arg('limit') || 5),sizeMetric:'followers',maxSessionUsd:budget,geographyMode:'profile-or-recent-posts'});
 params.searchPlan=await buildSearchPlan('preview',params);
 const builds=[...new Set(Object.values(params.searchPlan.sources[0].builds))];
 if(builds.length!==1)throw new Error('Isolated provider verification requires one verified immutable build for this sample.');
 const {data:owner,error:ownerError}=await db.from('profiles').select('id').eq('role','admin').limit(1).single();if(ownerError)throw ownerError;
 // verification=true fences hosted maintenance. Every request still validates the plan's pinned capability/build.
 const {data:session,error}=await db.from('scout_sessions').insert({owner_id:owner.id,kind:'preview',runtime_version:3,execution_engine:'legacy',verification:true,params:{...params,verificationBuild:builds[0],acceptanceSample:true}}).select('id').single();if(error)throw error;id=session.id;
}
console.log(JSON.stringify({sessionId:id,approvedBudgetUsd:budget,mode:'isolated-acceptance',noImport:true}));
const deadline=Date.now()+20*60000;
for(;;){
 const {data:s,error}=await db.from('scout_sessions').select('status,params,result,next_poll_at').eq('id',id).single();if(error)throw error;
 if(!s.params.acceptanceSample || s.params.maxSessionUsd>budget)throw new Error('Resume requires this acceptance sample within the approved cap.');
 if(['complete','failed'].includes(s.status))break;
 if(Date.now()>deadline)throw new Error(`Sample remains saved; resume the SAME session with --resume=${id}.`);
 const wait=s.next_poll_at?Math.max(0,Date.parse(s.next_poll_at)-Date.now()):0;
 if(wait){await new Promise(resolve=>setTimeout(resolve,Math.min(wait,30000)));continue;}
 const pending=await boundedScoutStep(()=>executeSession(id!),id);
 console.log(JSON.stringify({sessionId:id,pending}));
 if(!pending)break;
}
// Settle only already-started provider receipts, including a run finishing after the session time limit.
// This block never calls a provider start endpoint.
const settleDeadline=Date.now()+4*60000;
for(;;){
 const {data:open,error}=await db.from('scout_provider_runs').select('id,provider_run_id').eq('session_id',id).in('state',['running','starting']);if(error)throw error;
 if(!open?.length || Date.now()>settleDeadline)break;
 for(const run of open){if(!run.provider_run_id)continue;const state=(await apifyApi(`actor-runs/${run.provider_run_id}`)).data;
  if(['SUCCEEDED','FAILED','ABORTED','TIMED-OUT'].includes(state.status)){const {error}=await db.rpc('settle_scout_run',{p_run:run.id,p_state:state.status.toLowerCase(),p_amount:knownCharge(state),p_pricing:state.pricingInfo || null,p_usage:state.usageUsd || state.usage?{usd:state.usageUsd,units:state.usage,totalUsd:state.usageTotalUsd}:null,p_events:state.chargedEventCounts || null});if(error)throw error;}
 }
 await new Promise(resolve=>setTimeout(resolve,5000));
}
const {data:s,error}=await db.from('scout_sessions').select('status,params,result').eq('id',id).single();if(error)throw error;
const {data:runs,error:runError}=await db.from('scout_provider_runs').select('actor,task,provider_run_id,build,input,state,actual_usd,reserved_usd,warnings').eq('session_id',id);if(runError)throw runError;
const actualUsd=(runs || []).some(r=>r.actual_usd==null)?null:(runs || []).reduce((n,r)=>n+Number(r.actual_usd),0);
const candidates=s.result?.candidates || [];
const qualifiedNew=candidates.filter((c:any)=>c.reviewState==='Matched' && !c.isExisting).length;
const receipt={sessionId:id,status:s.status,approvedBudgetUsd:budget,actualUsd,qualifiedNew,requested:s.params.limit,costPerQualifiedNew:actualUsd!==null && qualifiedNew?actualUsd/qualifiedNew:null,costPerApproved:null,reviewedPrecision:null,providerRuns:runs,noImport:true,result:s.result};
const output=arg('output') || 'artifacts/scout-criteria/live-sample.json';await mkdir(output.slice(0,output.lastIndexOf('/')),{recursive:true});await writeFile(output,JSON.stringify(receipt,null,2));
console.log(JSON.stringify({sessionId:id,status:s.status,actualUsd,qualifiedNew,reviewable:candidates.length,output,error:s.result?.error || null}));
