import { beforeEach, expect, it, vi } from 'vitest';
const state = vi.hoisted(() => ({ sessions: [] as any[], runStatus: vi.fn(), dispatch: vi.fn(), billing: vi.fn() }));
vi.mock('./workflow-dispatch', () => ({ dispatchScoutSession: state.dispatch }));
vi.mock('./runtime', () => ({ reconcileProviderBilling: state.billing }));
vi.mock('workflow/api', () => ({ getRun: () => ({ get status() { return state.runStatus(); } }) }));
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: () => ({ from: () => {
  const filters: ((s:any)=>boolean)[] = []; let update: any;
  const q:any = { select:()=>q, eq:(k:string,v:any)=>{filters.push(s=>s[k]===v);return q;}, in:(k:string,v:any[])=>{filters.push(s=>v.includes(s[k]));return q;}, order:()=>q, limit:()=>q,
    update:(v:any)=>{update=v;return q;}, then:(resolve:any)=>{ const rows=state.sessions.filter(s=>filters.every(f=>f(s)));if(update)rows.forEach(s=>Object.assign(s,update));return Promise.resolve({data:rows,error:null}).then(resolve); } };
  return q;
} }) }));
import { recoverScoutSessions } from './workflow-maintenance';
beforeEach(() => { state.runStatus.mockReset();state.dispatch.mockReset().mockResolvedValue({dispatched:true});state.sessions=[{id:'s',status:'pending',verification:false,workflow_run_id:null,dispatch_state:'unknown'}]; });
it('recovers omitted dispatch using the original session ID', async()=>{
  expect(await recoverScoutSessions('s')).toEqual([{sessionId:'s',status:'Dispatched'}]);expect(state.dispatch).toHaveBeenCalledWith('s');
});
it('never resubmits a known active workflow', async()=>{
  state.sessions[0].workflow_run_id='wrun_active';state.runStatus.mockResolvedValue('running');
  expect((await recoverScoutSessions())[0].status).toBe('Already running');expect(state.dispatch).not.toHaveBeenCalled();
});
it('does not treat a failed status lookup as proof that no run exists', async()=>{
  state.sessions[0].workflow_run_id='wrun_unknown';state.runStatus.mockRejectedValue(new Error('Queue unavailable'));
  expect((await recoverScoutSessions())[0].status).toBe('Dispatch needs reconciliation');expect(state.dispatch).not.toHaveBeenCalled();expect(state.sessions[0].dispatch_state).toBe('unknown');
});
it('resumes stopped orchestration with the same pending session and preserves the provider ledger', async()=>{
  state.sessions[0].workflow_run_id='wrun_stopped';state.runStatus.mockResolvedValue('failed');
  await recoverScoutSessions();expect(state.sessions[0].dispatch_state).toBe('unsubmitted');expect(state.dispatch).toHaveBeenCalledWith('s');
});
it('excludes failed/completed tasks and verification sessions from recovery',async()=>{
  state.sessions=[{id:'failed',status:'failed',verification:false},{id:'complete',status:'complete',verification:false},{id:'verify',status:'pending',verification:true}];
  expect(await recoverScoutSessions()).toEqual([]);expect(state.dispatch).not.toHaveBeenCalled();
});

it('recovers only the explicit adaptive task incorrectly failed with PENDING while preserving its deadline',async()=>{
 state.sessions[0]={id:'s',status:'failed',verification:false,params:{searchPlan:{version:4}},result:{code:'PENDING'},workflow_run_id:'old',execution_started_at:'2026-10-11T00:00:00Z'};
 state.runStatus.mockResolvedValue('completed');await recoverScoutSessions('s');
 expect(state.sessions[0]).toMatchObject({status:'pending',result:null,next_poll_at:null,execution_started_at:'2026-10-11T00:00:00Z'});expect(state.dispatch).toHaveBeenCalledWith('s');
});
it('does not reopen permanent failures through explicit recovery',async()=>{
 state.sessions[0]={id:'s',status:'failed',verification:false,params:{searchPlan:{}},result:{code:'FORBIDDEN'}};
 await recoverScoutSessions('s');expect(state.sessions[0].status).toBe('failed');expect(state.dispatch).not.toHaveBeenCalled();
});
