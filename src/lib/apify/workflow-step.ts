import { getWorkflowMetadata } from 'workflow';
import { createAdminClient } from '@/lib/supabase/admin';
import { executeSession } from './session-executor';
import { boundedScoutStep } from './execution-budget';

export async function runScoutStep(sessionId: string, token: string) {
  'use step';
  const db = createAdminClient();
  const { workflowRunId } = getWorkflowMetadata();
  const { data: registered, error } = await db.rpc('register_scout_workflow', {
    p_session: sessionId, p_token: token, p_run: workflowRunId,
  });
  if (error) throw error;
  if (!registered) return { done: true, delaySeconds: 5 };
  const pending = await boundedScoutStep(() => executeSession(sessionId), sessionId);
  if (!pending) return { done: true, delaySeconds: 5 };
  const { data: session, error: readError } = await db.from('scout_sessions')
    .select('next_poll_at').eq('id', sessionId).single();
  if (readError) throw readError;
  const remaining = session.next_poll_at ? Date.parse(session.next_poll_at) - Date.now() : 5000;
  return { done: false, delaySeconds: Math.max(5, Math.min(30, Math.ceil(remaining / 1000))) };
}
