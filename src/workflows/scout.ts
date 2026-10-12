import { sleep } from 'workflow';
import { runScoutStep } from '@/lib/apify/workflow-step';

export async function scoutWorkflow(sessionId: string, dispatchToken: string) {
  'use workflow';
  for (;;) {
    const result = await runScoutStep(sessionId, dispatchToken);
    if (result.done) return;
    await sleep(`${result.delaySeconds}s`);
  }
}
