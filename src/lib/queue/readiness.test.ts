import {EventEmitter} from 'node:events';
import {afterEach,describe,expect,it,vi} from 'vitest';
const state=vi.hoisted(()=>({client:null as any,add:vi.fn()}));
vi.mock('ioredis',()=>({default:class extends EventEmitter {status='connect';constructor(){super();state.client=this;}async quit(){} }}));
vi.mock('bullmq',()=>({Queue:class {add=state.add;async close(){} }}));
import {enqueue,closeQueues,QUEUE_NAMES} from './index';
afterEach(async()=>{await closeQueues();vi.useRealTimers();state.add.mockReset();});
describe('queue readiness handoff',()=>{
 it('does not treat a connecting socket as ready or leak listeners after timeout',async()=>{vi.useFakeTimers();const pending=enqueue(QUEUE_NAMES.socialScout,'session',{});const failure=expect(pending).rejects.toThrow('The queue is unavailable.');await vi.advanceTimersByTimeAsync(3000);await failure;expect(state.add).not.toHaveBeenCalled();expect(state.client.listenerCount('ready')).toBe(0);expect(state.client.listenerCount('error')).toBe(0);});
 it('enqueues only after readiness and cleans its deadline/listeners',async()=>{vi.useFakeTimers();state.add.mockResolvedValue({id:'s'});const pending=enqueue(QUEUE_NAMES.socialScout,'session',{});state.client.status='ready';state.client.emit('ready');expect(await pending).toEqual({id:'s'});expect(vi.getTimerCount()).toBe(0);expect(state.client.listenerCount('error')).toBe(0);expect(state.add).toHaveBeenCalledTimes(1);});
});
