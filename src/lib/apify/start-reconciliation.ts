import { createAdminClient } from '@/lib/supabase/admin';
import { apifyApi } from './runtime';
import { ScoutError } from './errors';

/** Read-only provider checks. Never starts, retries, deletes, or adopts an unidentified run. */
export async function reconcileUnconfirmedStarts(sessionId: string, owner: string) {
  const db = createAdminClient();
  const {data: session,error: sessionError} = await db.from('scout_sessions').select('*').eq('id',sessionId).eq('owner_id',owner).single();
  if(sessionError || !session)throw new ScoutError('Scout session not found.','NOT_FOUND',404);
  if(session.result?.code === 'START_NOT_CREATED')return {success:true,reconciled:true,message:session.result.error};
  if(session.result?.code !== 'START_UNKNOWN')throw new ScoutError('This task does not need start reconciliation.','INVALID_TASK',409);
  const {data: runs,error} = await db.from('scout_provider_runs').select('*').eq('session_id',sessionId).eq('state','start-unknown').is('provider_run_id',null);
  if(error)throw error;
  const receipts: any[] = [];
  for(const run of runs || []) {
    const created = Date.parse(run.created_at), age = Date.now()-created;
    // Leave young starts and old/possibly expired provider history unresolved.
    if(!Number.isFinite(created) || age < 5*60000 || age > 24*3600000)continue;
    const listing = (await apifyApi(`acts/${run.actor}/runs?desc=1&limit=100`)).data;
    const items = listing?.items;
    if(!Array.isArray(items) || listing.offset !== 0 || listing.desc !== true || !Number.isInteger(listing.total) || listing.count !== items.length)continue;
    const dates = items.map((item:any)=>Date.parse(item.startedAt));
    if(dates.some((value:number)=>!Number.isFinite(value)))continue;
    const cutoff = created-2*60000;
    // Require a complete recent time window, and NO run of this Actor in it.
    // Matching names/input alone cannot prove a run belongs to this reservation.
    const completeWindow = listing.total === items.length || dates.some((value:number)=>value < cutoff);
    if(!completeWindow || dates.some((value:number)=>value >= cutoff))continue;
    const receipt = {checkedAt:new Date().toISOString(),actor:run.actor,reservationId:run.id,cutoff:new Date(cutoff).toISOString(),total:listing.total,recentRunIds:items.map((item:any)=>item.id),outcome:'no-provider-run-in-start-window'};
    const {error: settlementError} = await db.rpc('settle_scout_run',{p_run:run.id,p_state:'rejected:START_NOT_CREATED',p_amount:0,p_pricing:null,p_usage:{reconciliation:receipt},p_events:null});
    if(settlementError)throw settlementError;
    receipts.push(receipt);
  }
  const {data: unresolved,error: remainingError} = await db.from('scout_provider_runs').select('id').eq('session_id',sessionId).eq('state','start-unknown').is('provider_run_id',null);
  if(remainingError)throw remainingError;
  const {data: allRuns,error: allRunsError} = await db.from('scout_provider_runs').select('*').eq('session_id',sessionId);
  if(allRunsError)throw allRunsError;
  const resolvedRuns = (allRuns || []).filter((run:any)=>run.state === 'rejected:START_NOT_CREATED');
  let blockedTaskCleared = false;
  if(!allRuns?.length && session.kind === 'preview') {
    const {data: blockers,error: blockerError} = await db.from('scout_provider_runs').select('platform,input').eq('state','start-unknown').is('provider_run_id',null);
    if(blockerError)throw blockerError;
    const platforms = Array.isArray(session.params.platform) ? session.params.platform : [session.params.platform];
    blockedTaskCleared = !(blockers || []).some((run:any)=>platforms.includes(run.platform) && [run.input?.search,...(run.input?.categories || []),...(run.input?.searchQueries || [])].includes(session.params.keyword));
  }
  if(unresolved?.length || !resolvedRuns.length && !blockedTaskCleared) return {success:true,reconciled:false,remaining:unresolved?.length || 0,message:'Provider history cannot yet rule out an existing run. No new collection was started.'};
  const result = {success:false,code:'START_NOT_CREATED',httpStatus:409,error:blockedTaskCleared ? 'The earlier provider reservation has been reconciled. This task did not start a collection. You can retry it now.' : 'Provider history confirms no run was created in the start window. The reserved budget has been released. You can retry this task.',reconciliation:resolvedRuns.map((run:any)=>run.usage?.reconciliation || receipts.find(receipt=>receipt.reservationId===run.id)).filter(Boolean)};
  const {error: saveError} = await db.from('scout_sessions').update({status:'failed',result,warnings:[]}).eq('id',sessionId).eq('owner_id',owner);
  if(saveError)throw saveError;
  return {success:true,reconciled:true,message:result.error};
}
