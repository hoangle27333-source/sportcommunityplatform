import { randomUUID } from 'node:crypto';
import { createAdminClient } from '@/lib/supabase/admin';
import { ScoutError } from './errors';

export async function dispatchScoutSession(id: string) {
  const db = createAdminClient();
  const token = randomUUID();
  const { data: claimed, error } = await db.rpc('claim_scout_dispatch', { p_session: id, p_token: token });
  if (error) throw new ScoutError('The Scout workflow migration is required.', 'WORKFLOW_NOT_CONFIGURED', 503);
  if (!claimed) return { dispatched: false };
  try {
    const [{ start }, { scoutWorkflow }] = await Promise.all([import('workflow/api'), import('@/workflows/scout')]);
    // A timeout is ambiguous: never assume start() failed and submit another run immediately.
    let timer: ReturnType<typeof setTimeout> | undefined;
    let run: { runId: string };
    try {
      run = await Promise.race([
        start(scoutWorkflow, [id, token]),
        new Promise<never>((_, reject) => { timer = setTimeout(() => reject(new Error('Workflow dispatch timed out.')), 10_000); }),
      ]);
    } finally { if (timer) clearTimeout(timer); }
    const { error: save } = await db.from('scout_sessions').update({
      workflow_run_id: run.runId, dispatch_state: 'submitted', dispatch_lease_until: null,
    }).eq('id', id).eq('dispatch_token', token).eq('dispatch_state', 'starting').in('status', ['pending', 'running']);
    if (save) throw save;
    return { dispatched: true, runId: run.runId };
  } catch (error) {
    // The first workflow step can register itself even if this HTTP request lost its response.
    const { error: mark } = await db.from('scout_sessions').update({
      dispatch_state: 'unknown', warnings: ['Dispatch needs reconciliation'],
    }).eq('id', id).eq('dispatch_token', token).is('workflow_run_id', null);
    if (mark) throw mark;
    throw error;
  }
}
