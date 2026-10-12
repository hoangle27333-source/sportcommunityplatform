import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
const state = vi.hoisted(() => ({ session: {} as any, start: vi.fn(), claimError: null as any }));
vi.mock('workflow/api', () => ({ start: state.start }));
vi.mock('@/workflows/scout', () => ({ scoutWorkflow: vi.fn() }));
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: () => ({
  rpc: async (_name: string, params: any) => {
    if (state.claimError) return { error: state.claimError };
    if (state.session.dispatch_state === 'submitted' || state.session.dispatch_lease_until > Date.now() || ['complete', 'failed'].includes(state.session.status)) return { data: false };
    Object.assign(state.session, { dispatch_token: params.p_token, dispatch_state: 'starting', dispatch_lease_until: Date.now() + 120_000 });
    return { data: true };
  },
  from: () => {
    let update: any; const filters: ((s: any) => boolean)[] = [];
    const q: any = { update: (v: any) => { update = v; return q; }, eq: (k: string, v: any) => { filters.push(s => s[k] === v); return q; }, is: (k: string, v: any) => { filters.push(s => s[k] == v); return q; }, in: (k: string, v: any[]) => { filters.push(s => v.includes(s[k])); return q; }, then: (resolve: any) => { if (filters.every(f => f(state.session))) Object.assign(state.session, update); return Promise.resolve({ error: null }).then(resolve); } };
    return q;
  },
}) }));
import { dispatchScoutSession } from './workflow-dispatch';
beforeEach(() => { vi.useFakeTimers(); state.start.mockReset(); state.claimError = null; state.session = { id: 's', status: 'pending', dispatch_state: 'unsubmitted', workflow_run_id: null }; });
afterEach(() => vi.useRealTimers());
describe('workflow dispatch ownership', () => {
  it('claims before start, retains the run ID, and deduplicates simultaneous starts', async () => {
    state.start.mockResolvedValue({ runId: 'wrun_fixture' });
    await Promise.all([dispatchScoutSession('s'), dispatchScoutSession('s')]);
    expect(state.start).toHaveBeenCalledTimes(1); expect(state.session).toMatchObject({ dispatch_state: 'submitted', workflow_run_id: 'wrun_fixture' });
  });
  it('marks a lost start response ambiguous and does not immediately restart', async () => {
    state.start.mockImplementation(() => new Promise(() => {}));
    const pending = dispatchScoutSession('s'); const rejection = expect(pending).rejects.toThrow('timed out');
    await vi.advanceTimersByTimeAsync(10001); await rejection;
    expect(state.session.dispatch_state).toBe('unknown'); await dispatchScoutSession('s'); expect(state.start).toHaveBeenCalledTimes(1);
  });
  it('does not overwrite a workflow that registered while HTTP start failed', async () => {
    state.start.mockImplementation(async () => { Object.assign(state.session, { workflow_run_id: 'wrun_registered', dispatch_state: 'submitted' }); throw new Error('Response lost'); });
    await expect(dispatchScoutSession('s')).rejects.toThrow('Response lost'); expect(state.session.dispatch_state).toBe('submitted');
  });
  it('preserves warnings written by a workflow before the dispatch response returns', async () => {
    state.start.mockImplementation(async () => { Object.assign(state.session, { workflow_run_id: 'wrun_registered', dispatch_state: 'submitted', warnings: ['Partial provider coverage'] }); return { runId: 'wrun_registered' }; });
    await dispatchScoutSession('s'); expect(state.session.warnings).toEqual(['Partial provider coverage']);
  });
  it('fails closed without the migration and never starts completed/failed sessions', async () => {
    state.claimError = new Error('missing RPC'); await expect(dispatchScoutSession('s')).rejects.toMatchObject({ code: 'WORKFLOW_NOT_CONFIGURED' });
    state.claimError = null; state.session.status = 'failed'; await dispatchScoutSession('s'); expect(state.start).not.toHaveBeenCalled();
  });
});
