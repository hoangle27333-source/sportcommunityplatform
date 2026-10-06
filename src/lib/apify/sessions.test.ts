import {beforeEach,describe,expect,it,vi} from 'vitest';
const state=vi.hoisted(()=>({enqueue:vi.fn(),updates:[] as any[],role:'editor'}));
const session={id:'00000000-0000-0000-0000-000000000001',status:'pending',progress:{stage:'queued'},warnings:[]};
vi.mock('@/lib/auth/financial-sanitizer',()=>({getServerUserRole:async()=>({userId:session.id,role:state.role})}));
vi.mock('@/lib/queue',()=>({QUEUE_NAMES:{socialScout:'social-scout'},enqueue:state.enqueue}));
vi.mock('./scout',()=>({}));vi.mock('./tasks',()=>({}));
vi.mock('@/lib/supabase/admin',()=>({createAdminClient:()=>({from:()=>({
 insert:()=>({select:()=>({single:async()=>({data:{id:session.id},error:null})})}),
 update:(value:any)=>{state.updates.push(value);return {eq:async()=>({error:null})};},
 select:()=>({eq:()=>({eq:()=>({single:async()=>({data:session,error:null})})})}),
})})}));
import {enqueueScoutSession,startSession} from './sessions';
beforeEach(()=>{vi.useFakeTimers();state.enqueue.mockReset();state.updates.length=0;state.role='editor';});
describe('durable session queue handoff',()=>{
 it('accepts multi-platform preview and rejects empty or duplicate platforms',async()=>{
  state.enqueue.mockResolvedValue({id:session.id});
  expect((await startSession('preview',{keyword:'running',platform:['Instagram','Facebook']})).status).toBe(202);
  for(const platform of [[],['Instagram','Instagram']])await expect(startSession('preview',{keyword:'running',platform})).rejects.toMatchObject({name:'ZodError'});
  expect(state.enqueue).toHaveBeenCalledTimes(1);vi.useRealTimers();
 });
 it('denies a viewer before enqueueing paid work',async()=>{state.role='viewer';await expect(startSession('inspect',{url:'https://instagram.com/nike',platform:'Instagram'})).rejects.toMatchObject({code:'FORBIDDEN'});expect(state.enqueue).not.toHaveBeenCalled();vi.useRealTimers();});
 it('rejects empty and duplicate comment selections before queueing',async()=>{for(const selectedPostIds of [[],[session.id,session.id]])await expect(startSession('comments',{kolId:session.id,selectedPostIds})).rejects.toMatchObject({name:'ZodError'});expect(state.enqueue).not.toHaveBeenCalled();vi.useRealTimers();});
 it('returns 202 and a persisted session when Redis never becomes ready',async()=>{
  state.enqueue.mockImplementation(()=>new Promise(()=>{}));
  const responsePromise=startSession('inspect',{url:'https://instagram.com/nike',platform:'Instagram'});
  await vi.advanceTimersByTimeAsync(3001);
  const response=await responsePromise;expect(response.status).toBe(202);expect((await response.json()).sessionId).toBe(session.id);
  expect(state.updates[0].warnings).toEqual(['Waiting for the worker queue to recover.']);
  expect(state.enqueue).toHaveBeenCalledTimes(1);vi.useRealTimers();
 });
 it('clears the deadline after successful enqueue',async()=>{
  state.enqueue.mockResolvedValue({id:session.id});await enqueueScoutSession(session.id);expect(vi.getTimerCount()).toBe(0);vi.useRealTimers();
 });
});
