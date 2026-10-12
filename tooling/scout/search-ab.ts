/** Explicitly approved paid A/B sample; persists evidence, never approves/imports profiles. */
import {createAdminClient} from '../../src/lib/supabase/admin';
import {buildSearchPlan} from '../../src/lib/apify/search-plan';
import {requestSchema} from '../../src/lib/apify/sessions';
import {executeSession} from '../../src/lib/apify/session-executor';
const arg=(name:string)=>process.argv.find(a=>a.startsWith(`--${name}=`))?.split('=').slice(1).join('=');
const total=Number(arg('total-budget-usd'));
if(!process.argv.includes('--allow-paid') || !Number.isFinite(total) || total<=0 || total>4)throw new Error('Supply --allow-paid --total-budget-usd=<approved total up to 4>. Four arms share equal caps.');
const db=createAdminClient();const {data:policy,error:policyError}=await db.rpc('scout_search_budget_policy');if(policyError || policy!==4)throw new Error('Apply the search budget migration first.');
const {data:owner,error}=await db.from('profiles').select('id').eq('role','admin').limit(1).single();if(error)throw error;
for(const keyword of ['Running','HYROX'])for(const variant of ['baseline','planned']){
 const params:any=requestSchema.parse({keyword,platform:'Facebook',targetType:'Individual KOLs',geography:'Vietnam',limit:5,maxSessionUsd:total/4});
 if(variant==='planned')params.searchPlan=await buildSearchPlan('preview',params);
 const {data:session,error:insertError}=await db.from('scout_sessions').insert({owner_id:owner.id,kind:'preview',runtime_version:3,params:{...params,abVariant:variant}}).select('id').single();if(insertError)throw insertError;
 const deadline=Date.now()+15*60000;
 while(await executeSession(session.id)){if(Date.now()>deadline)throw new Error(`Timed out; resume the SAME session ${session.id}.`);await new Promise(resolve=>setTimeout(resolve,30000));}
 const {data:s,error:readError}=await db.from('scout_sessions').select('status,result').eq('id',session.id).single();if(readError)throw readError;
 const {data:runs,error:ledgerError}=await db.from('scout_provider_runs').select('actual_usd,reserved_usd').eq('session_id',session.id);if(ledgerError)throw ledgerError;
 const cost=(runs || []).some(r=>r.actual_usd==null)?null:(runs || []).reduce((n,r)=>n+Number(r.actual_usd),0);
 const qualified=s.result?.candidates?.filter((c:any)=>c.reviewState==='Matched' && !c.isExisting).length || 0;
 console.log(JSON.stringify({sessionId:session.id,keyword,variant,status:s.status,qualifiedNew:qualified,reviewable:s.result?.candidates?.length || 0,actualUsd:cost,costPerQualifiedNew:cost!==null && qualified?cost/qualified:null,precision:'Requires human review; not yet measured.'}));
}
