import {beforeEach,describe,expect,it,vi} from 'vitest';
const state=vi.hoisted(()=>({enqueue:vi.fn(),updates:[] as any[],inserts:[] as any[],role:'editor'}));
const session={id:'00000000-0000-0000-0000-000000000001',status:'pending',progress:{stage:'queued'},warnings:[]};
vi.mock('@/lib/auth/financial-sanitizer',()=>({getServerUserRole:async()=>({userId:session.id,role:state.role})}));
vi.mock('./search-plan',()=>({buildSearchPlan:async()=>({version:5,hash:'a'.repeat(64),sources:[]})}));
vi.mock('./workflow-dispatch',()=>({dispatchScoutSession:state.enqueue}));
vi.mock('./scout',()=>({}));vi.mock('./tasks',()=>({}));
vi.mock('@/lib/supabase/admin',()=>({createAdminClient:()=>({from:()=>({
 insert:(value:any)=>{state.inserts.push(value);return {select:()=>({single:async()=>({data:{id:session.id},error:null})})};},
 update:(value:any)=>{state.updates.push(value);return {eq:async()=>({error:null})};},
 select:()=>({eq:()=>({eq:()=>({single:async()=>({data:session,error:null})})})}),
})})}));
import {enqueueScoutSession,startSession} from './sessions';
beforeEach(()=>{vi.useFakeTimers();state.enqueue.mockReset();state.updates.length=0;state.inserts.length=0;state.role='editor';});
describe('durable session queue handoff',()=>{
 it('accepts multi-platform preview and rejects empty or duplicate platforms',async()=>{
  state.enqueue.mockResolvedValue({id:session.id});
  expect((await startSession('preview',{keyword:'running',platform:['Instagram','Facebook'],planHash:'a'.repeat(64)})).status).toBe(202);
  for(const platform of [[],['Instagram','Instagram']])await expect(startSession('preview',{keyword:'running',platform})).rejects.toMatchObject({name:'ZodError'});
  expect(state.enqueue).toHaveBeenCalledTimes(1);vi.useRealTimers();
 });
 it('denies a viewer before enqueueing paid work',async()=>{state.role='viewer';await expect(startSession('inspect',{url:'https://instagram.com/nike',platform:'Instagram'})).rejects.toMatchObject({code:'FORBIDDEN'});expect(state.enqueue).not.toHaveBeenCalled();vi.useRealTimers();});
 it('rejects empty and duplicate comment selections before queueing',async()=>{for(const selectedPostIds of [[],[session.id,session.id]])await expect(startSession('comments',{kolId:session.id,selectedPostIds})).rejects.toMatchObject({name:'ZodError'});expect(state.enqueue).not.toHaveBeenCalled();vi.useRealTimers();});
 it('retains the saved session when workflow dispatch needs reconciliation',async()=>{
  state.enqueue.mockRejectedValue(new Error('Dispatch needs reconciliation'));
  const response=await startSession('inspect',{url:'https://instagram.com/nike',platform:'Instagram'});
  expect(response.status).toBe(202);expect((await response.json()).sessionId).toBe(session.id);
  expect(state.enqueue).toHaveBeenCalledTimes(1);vi.useRealTimers();
 });
 it('delegates existing-session dispatch without a Redis connection',async()=>{
  state.enqueue.mockResolvedValue({id:session.id});await enqueueScoutSession(session.id);expect(vi.getTimerCount()).toBe(0);vi.useRealTimers();
 });
});

it('preserves submitted broadened criteria and canonicalizes geography before dispatch',async()=>{
 await startSession('trends',{keyword:'Running',platform:'Facebook',geography:'Toàn quốc',searchMode:'keyword',queryVariants:['Runner','Chạy bộ','Marathon'],recentDays:14,minInteractions:50,minViews:5000});
 expect(state.inserts[0].params).toMatchObject({keyword:'Running',geography:'Nationwide',queryVariants:['Runner','Chạy bộ','Marathon'],recentDays:14,minInteractions:50,minViews:5000});
 expect(state.enqueue).toHaveBeenCalledTimes(1);vi.useRealTimers();
});
it('blocks hashtag and unsupported-platform query variants before creating work',async()=>{
 for(const value of [{keyword:'#running',platform:'Facebook'},{keyword:'Running',platform:'Instagram'}])await expect(startSession('trends',{...value,queryVariants:['Runner']})).rejects.toMatchObject({code:'INVALID_QUERY'});
 expect(state.inserts).toHaveLength(0);expect(state.enqueue).not.toHaveBeenCalled();vi.useRealTimers();
});

it('requires a reviewed plan for every new profile search',async()=>{
 await expect(startSession('preview',{keyword:'Badminton',platform:'TikTok'})).rejects.toMatchObject({code:'PLAN_REQUIRED'});
 expect(state.inserts).toHaveLength(0);expect(state.enqueue).not.toHaveBeenCalled();vi.useRealTimers();
});
