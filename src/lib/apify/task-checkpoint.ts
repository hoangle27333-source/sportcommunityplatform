import { createAdminClient } from '@/lib/supabase/admin';
import { workflowExecution, checkStepDeadline } from './execution-budget';

/** Persist completed units so a suspended step does not repeat CRM writes. */
export async function checkpointTask<T>(sessionId: string, key: string, work: () => Promise<T>): Promise<T> {
  if (!workflowExecution()) return work();
  const db = createAdminClient();
  const { data, error } = await db.from('scout_task_checkpoints').select('result')
    .eq('session_id', sessionId).eq('task_key', key).maybeSingle();
  if (error) throw error;
  if (data) return data.result as T;
  checkStepDeadline();
  const result = await work();
  const { error: save } = await db.from('scout_task_checkpoints').upsert({
    session_id: sessionId, task_key: key, result,
  }, { onConflict: 'session_id,task_key' });
  if (save) throw save;
  return result;
}
