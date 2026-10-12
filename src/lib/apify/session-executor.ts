import { executeStoredReassessment } from './reassessment';
import { createAdminClient } from '@/lib/supabase/admin';
import { randomUUID } from 'node:crypto';
import { ScoutError, PendingScout } from './providers';
import { previewDiscoveryCandidates, scoutMarketTrends, scoutSingleKolPosts, scoutSingleCommunityPosts, scoutLatestCommunityPosts } from './scout';
import { executeExtendedSession } from './tasks';
import { workflowExecution } from './execution-budget';
import { withStoredEvidence } from './stored-evidence';

export async function executeSession(id: string) {
  const db=createAdminClient(); const {data:s,error}=await db.from('scout_sessions').select('*').eq('id',id).single(); if(error) throw error;
  if(['complete','failed'].includes(s.status)) return false;
  if(s.execution_engine==='workflow' && !workflowExecution()) throw new ScoutError('This session is managed by Vercel Workflows.', 'WORKFLOW_MANAGED', 409);
  if(s.next_poll_at && Date.parse(s.next_poll_at)>Date.now()) return true;
  const now=new Date().toISOString(); const leaseToken=randomUUID();
  const executionStartedAt=s.execution_started_at || now;
  let leaseClaim=db.from('scout_sessions').update({lease_until:new Date(Date.now()+120000).toISOString(),status:'running',lease_token:leaseToken,execution_started_at:executionStartedAt,warnings:(s.warnings || []).filter((warning:string)=>warning!=='Waiting for the worker queue to recover.')}).eq('id',id).in('status',['pending','running']).or(`lease_until.is.null,lease_until.lt.${now}`);
  // Dispatch and the old consumer must not claim the same session across an engine switch.
  if(s.execution_engine) leaseClaim=leaseClaim.eq('execution_engine',s.execution_engine);
  const {data:claim,error:claimError}=await leaseClaim.select('id').maybeSingle(); if(claimError) throw claimError; if(!claim) return true;
  const heartbeat=setInterval(()=>void db.from('scout_sessions').update({lease_until:new Date(Date.now()+120000).toISOString()}).eq('id',id).eq('lease_token',leaseToken).then(({error})=>{if(error) console.error('[social-scout] Lease renewal failed',error.code);}),30000);
  try {
    const {data:profile,error:roleError}=await db.from('profiles').select('role').eq('id',s.owner_id).single(); if(roleError || !['admin','editor'].includes(profile?.role)) throw new ScoutError('Editor access required.','FORBIDDEN',403);
    const p={...s.params,sessionId:id}; let result:any;
    if(p.searchPlan && Date.now()-Date.parse(executionStartedAt)>=15*60000 && ['preview','trends'].includes(s.kind)) {
      const {data:saved,error:savedError}=await db.from('scout_provider_runs').select('platform,task,state,normalized_rows,raw_rows,warnings').eq('session_id',id).eq('state','succeeded');
      if(savedError)throw savedError;
      if(saved?.some(run=>(run.normalized_rows || run.raw_rows || []).length)) {
        result=await withStoredEvidence<any>(saved,()=>s.kind==='preview'?previewDiscoveryCandidates(p):scoutMarketTrends(p));
        result={...result,partial:true,stopReason:'time-limit',diagnostics:{...result.diagnostics,stopReason:'time-limit'},...(result.searchExecution?{searchExecution:{...result.searchExecution,stopReason:'time-limit'}}:{}),warnings:[...(result.warnings || []).filter((w:string)=>!w.startsWith('Found ')),s.kind==='preview'?`The search time limit was reached. ${result.counts?.qualifiedNew ?? 0}/${s.params.limit} qualified new accounts are retained for review; no further provider runs were started.`:'The search time limit was reached. Available results are retained for review; no further provider runs were started.']};
      } else result={success:false,code:'SEARCH_TIME_LIMIT',error:'The search time limit was reached before usable provider evidence was available.',httpStatus:408};
    }
    else if(p.executionMode==='stored-evidence') result=await executeStoredReassessment(s);
    else if(s.kind==='preview') result=await previewDiscoveryCandidates(p);
    else if(s.kind==='trends') result=await scoutMarketTrends(p);
    else if(s.kind==='kol-posts') result=await scoutSingleKolPosts(p.kolId,p.limit,p.platform,id);
    else if(s.kind==='community-posts') result=p.collectionMode==='latest-30' ? await scoutLatestCommunityPosts(p.communityId,p.platform,id,p.channelUrls) : await scoutSingleCommunityPosts(p.communityId,p.limit,p.platform,id);
    else result=await executeExtendedSession(s);
    const {data:runs,error:runError}=await db.from('scout_provider_runs').select('warnings,state,observed_at,actual_usd,reserved_usd').eq('session_id',id); if(runError) throw runError;
    const {data:latest,error:warningError}=await db.from('scout_sessions').select('warnings').eq('id',id).single(); if(warningError) throw warningError;
    const runWarnings=(runs || []).flatMap(r=>r.warnings || []);
    const evidence=[...(result.candidates || []),...(result.posts || []),...(result.updatedRecords || []),...(result.data ? [result.data] : [])];
    const warnings=[...new Set([...(latest?.warnings || []).filter((w:string)=>!['Starting Scout workflow.','Dispatch needs reconciliation','Waiting for the worker queue to recover.'].includes(w)),...runWarnings,...evidence.flatMap(e=>e.provenance?.warnings || e.scout_provenance?.warnings || [])])] as string[];
    const sourceFreshness=[...new Set([...(runs || []).map(r=>r.observed_at),...evidence.map(e=>e.provenance?.fetchedAt || e.scout_provenance?.fetchedAt)].filter(Boolean))];
    const coverage={tasks:(runs || []).length,completedTasks:(runs || []).filter(r=>r.state==='succeeded').length,warningCount:warnings.length,cachedEvidence:evidence.filter(e=>e.provenance?.cached).length,missingFields:evidence.flatMap(e=>e.missingMetrics || e.provenance?.missingFields || [])};
    const actualUsd=(runs || []).some(r=>r.actual_usd==null)?null:(runs || []).reduce((sum,r)=>sum+Number(r.actual_usd),0);
    const qualifiedNew=s.kind==='preview' ? result.groups?.qualified?.filter((c:any)=>!c.isExisting).length || 0 : result.counts?.inserted || 0;
    result={...result,...(s.params.searchPlan?{searchCost:{actualUsd,reservedUsd:(runs || []).reduce((sum,r)=>sum+Number(r.reserved_usd || 0),0),approvedCapUsd:s.params.searchPlan.maxSessionUsd,costPerQualifiedNew:actualUsd!==null && qualifiedNew?actualUsd/qualifiedNew:null}}:{}),progress:{stage:'complete'},coverage,counts:result.counts || {found:result.totalFound || 0,excluded:result.excludedCount || 0},sessionId:id,partial:!!result.partial || warnings.length>0,warnings:[...(result.warnings || []),...warnings],sourceFreshness};
    const outcome=result.success===false ? 'failed' : 'complete';
    const {error:save}=await db.from('scout_sessions').update({status:outcome,result,warnings:result.warnings,lease_until:null,lease_token:null,progress:{stage:outcome}}).eq('id',id).eq('lease_token',leaseToken); if(save) throw save;
    return false;
  } catch(e:any) {
    const transient=e instanceof PendingScout || ['RATE_LIMITED','PROVIDER_UNAVAILABLE'].includes(e.code) || e.name==='TimeoutError';
    const age=Date.now()-Date.parse(executionStartedAt);
    if(transient && (age<15*60000 || (e instanceof PendingScout && s.params?.searchPlan && ['preview','trends'].includes(s.kind)))) {
      const attempts=(s.progress?.polls || 0)+1;
      const delayMs = e instanceof PendingScout ? Math.min(10000, 5000 + (attempts % 3) * 2000) : Math.min(30000, 5000 * attempts);
      const {error}=await db.from('scout_sessions').update({lease_until:null,lease_token:null,progress:{...s.progress,stage:'running',polls:attempts},next_poll_at:new Date(Date.now()+delayMs).toISOString()}).eq('id',id).eq('lease_token',leaseToken); if(error) throw error;
      return true;
    }
    const {error}=await db.from('scout_sessions').update({status:'failed',warnings:[],lease_until:null,lease_token:null,result:{success:false,error:e.message,code:e.code || 'SCOUT_ERROR',httpStatus:e.status || 502,...(e.approvalUrl ? {approvalUrl:e.approvalUrl} : {})}}).eq('id',id).eq('lease_token',leaseToken); if(error) throw error;
    return false;
  } finally { clearInterval(heartbeat); }
}
