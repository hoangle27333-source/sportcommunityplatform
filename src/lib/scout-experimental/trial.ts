import { BRAVE_ADAPTER_REVISION, BRAVE_PRICING_REVISION, BRAVE_REQUEST_USD } from './brave';
import { createHash } from 'node:crypto';
import { createAdminClient } from '../supabase/admin';
import { stableJson } from '../apify/runtime';
import { PendingScout, ScoutError } from '../apify/errors';
import { takeProviderOperation } from '../apify/execution-budget';
import type { TrialCapability } from './types';
export function assertTrial(c:TrialCapability) {
 const paidModel=c.provider==='gemini' && c.operation==='analysis' && c.config.paidModel===true && c.config.model==='gemini-2.5-flash-lite' && c.config.pricingRevision==='2026-10-12-flash-lite-0.10-0.40' && c.max_value_usd<=0.005;
 const paidSearch=c.provider==='brave' && c.operation==='discovery' && c.config.paidSearch===true && c.config.pricingRevision===BRAVE_PRICING_REVISION && c.config.adapterRevision===BRAVE_ADAPTER_REVISION && Number(c.max_value_usd)===BRAVE_REQUEST_USD && Number(c.units_per_request)===1;
 if(!c.verified || (!Number.isFinite(Date.parse(c.expires_at)) || Date.parse(c.expires_at)<=Date.now()) || (!paidModel && !paidSearch && (c.config.trialOnly!==true || c.config.billingDisabled!==true)) || !c.config.receiptUrl || !Number.isFinite(c.units_per_request) || c.units_per_request<=0 || Number(c.used_units)+Number(c.units_per_request)>Number(c.total_units))throw new ScoutError('A verified trial, budgeted search or light-model capability is required.','TRIAL_UNAVAILABLE',409);
}
export async function trialRequest<T>(sessionId:string,c:TrialCapability,input:unknown,send:(run:any)=>Promise<{result:T;receipt?:string;pending?:boolean;actualUsd?:number}>):Promise<T> {
 const key=createHash('sha256').update(stableJson({capability:c.id,revision:c.revision,input})).digest('hex');const db=createAdminClient();
 // Receipt lookup precedes trial checks: completed requests remain replayable after trial expires.
 const {data:existing,error:read}=await db.from('scout_external_runs').select('*').eq('session_id',sessionId).eq('task_key',key).maybeSingle();if(read)throw read;
 if(existing?.state==='succeeded')return existing.response as T;
 if(existing && ['starting','start-unknown'].includes(existing.state))throw new ScoutError('Provider start is unresolved. Reconcile the saved request before retrying.','START_UNKNOWN',409);
 if(existing?.state==='failed')throw new ScoutError(existing.error || 'The saved provider request failed.','PROVIDER_FAILED',502);
 if(!existing || existing.state==='reserved')assertTrial(c);takeProviderOperation();
 let run=existing;
 if(!run){const {data,error}=await db.rpc('reserve_scout_external',{p_session:sessionId,p_key:key,p_capability:c.id,p_revision:c.revision,p_input:input});if(error)throw new ScoutError(error.message,error.message.includes('QUOTA')?'QUOTA_EXHAUSTED':/BUDGET|TRIAL/.test(error.message)?'BUDGET_EXHAUSTED':'TRIAL_UNAVAILABLE',409);run=data.run;if(!data.claimed)throw new PendingScout();}
 if(run.state==='reserved'){
  const {data,error}=await db.from('scout_external_runs').update({state:'starting'}).eq('id',run.id).eq('state','reserved').select('id').maybeSingle();if(error)throw error;if(!data)throw new PendingScout();
 }
 let response;
 try{response=await send(run);}catch(e:any){
  // An interrupted POST may already have incurred usage. Never assume it did not start.
  const {error}=await db.from('scout_external_runs').update({state:'start-unknown',error:String(e.message).slice(0,500)}).eq('id',run.id);if(error)throw error;
  throw new ScoutError('Provider request is unresolved; no duplicate request was sent.','START_UNKNOWN',409);
 }
 const {error}=await db.from('scout_external_runs').update({state:response.pending?'running':'succeeded',response:response.result,provider_receipt:response.receipt || run.provider_receipt,actual_usd:response.actualUsd ?? null}).eq('id',run.id);if(error)throw error;
 if(response.pending)throw new PendingScout();return response.result;
}
