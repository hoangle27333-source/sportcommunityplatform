import { AsyncLocalStorage } from 'node:async_hooks';
import { PendingScout } from './errors';

// Node-only context used inside a Workflow step, never in the deterministic workflow.
const execution = new AsyncLocalStorage<{ deadline: number; operations: number; sessionId: string }>();
export function workflowExecution() { return execution.getStore(); }
export function boundedScoutStep<T>(work: () => Promise<T>, sessionId = '') {
  return execution.run({ deadline: Date.now() + 90_000, operations: 0, sessionId }, work);
}
export function takeProviderOperation() {
  const context = execution.getStore();
  if (!context) return;
  if (context.operations >= 1 || Date.now() >= context.deadline) throw new PendingScout();
  context.operations++;
}
export function checkStepDeadline() {
  const context = execution.getStore();
  if (context && Date.now() >= context.deadline) throw new PendingScout();
}
