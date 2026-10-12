import { createAdminClient } from '@/lib/supabase/admin';
import { dispatchScoutSession } from './workflow-dispatch';
import { reconcileProviderBilling } from './runtime';

export async function recoverScoutSessions(sessionId?: string) {
  const db = createAdminClient();
  let query = db.from('scout_sessions').select('id,status,params,result,workflow_run_id,dispatch_state,dispatch_lease_until')
    .eq('verification', false).in('status', sessionId ? ['pending', 'running', 'failed'] : ['pending', 'running']).order('created_at').limit(10);
  if (sessionId) query = query.eq('id', sessionId);
  const { data, error } = await query;
  if (error) throw error;
  const results: { sessionId: string; status: string }[] = [];
  for (const session of data || []) {
    try {
      if(session.status==='failed') {
        if(session.result?.code!=='PENDING' || !session.params?.searchPlan) {
          results.push({sessionId:session.id,status:'This failure cannot be recovered automatically'});continue;
        }
        const {error:reopen}=await db.from('scout_sessions').update({status:'pending',result:null,next_poll_at:null,progress:{stage:'pending'},dispatch_state:'unsubmitted',dispatch_lease_until:null}).eq('id',session.id).eq('status','failed');
        if(reopen)throw reopen;
      }
      if (session.workflow_run_id) {
        const { getRun } = await import('workflow/api');
        const run = getRun(session.workflow_run_id);
        const status = await run.status;
        if (status === 'pending' || status === 'running') {
          results.push({ sessionId: session.id, status: 'Already running' }); continue;
        }
        // A stopped orchestration can resume the same session and provider ledger.
        const { error: reset } = await db.from('scout_sessions').update({
          dispatch_state: 'unsubmitted', dispatch_lease_until: null,
        }).eq('id', session.id).eq('workflow_run_id', session.workflow_run_id);
        if (reset) throw reset;
      }
      const result = await dispatchScoutSession(session.id);
      results.push({ sessionId: session.id, status: result.dispatched ? 'Dispatched' : 'Dispatch lease is active' });
    } catch {
      // Unknown run status must not be treated as evidence that no run exists.
      results.push({ sessionId: session.id, status: 'Dispatch needs reconciliation' });
    }
  }
  return results;
}

export async function maintainScoutWorkflows() {
  const recovery = await recoverScoutSessions();
  await reconcileProviderBilling(5);
  const db = createAdminClient();
  const { error: cache } = await db.from('scout_provider_cache').delete().lt('expires_at', new Date().toISOString());
  if (cache) throw cache;
  const { error: raw } = await db.from('scout_provider_runs').update({ raw_rows: null })
    .lt('created_at', new Date(Date.now() - 30 * 86400000).toISOString()).not('raw_rows', 'is', null);
  if (raw) throw raw;
  return recovery;
}
