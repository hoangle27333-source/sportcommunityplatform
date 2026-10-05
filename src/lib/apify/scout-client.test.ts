import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { scoutFetch } from './scout-client';
const storage = new Map<string,string>();
const events: any[] = [];
const response = (body: any, ok = true) => ({ ok, json: async () => body });
beforeEach(() => {
  vi.useFakeTimers(); storage.clear(); events.length = 0;
  vi.stubGlobal('localStorage', { get length(){return storage.size;}, key: (i:number)=>[...storage.keys()][i], getItem:(k:string)=>storage.get(k)||null, setItem:(k:string,v:string)=>storage.set(k,v),removeItem:(k:string)=>storage.delete(k) });
  vi.stubGlobal('window',{dispatchEvent:(e:any)=>events.push(e)}); vi.stubGlobal('CustomEvent',class {constructor(public type:string,public value:any){} });
});
afterEach(() => {vi.unstubAllGlobals();vi.useRealTimers();});
describe('durable Scout client', () => {
  it('keeps concurrent same-endpoint sessions separate and polls only their original IDs', async () => {
    const calls: string[] = [];let count=0;
    vi.stubGlobal('fetch',vi.fn(async (url:string,init:any) => {calls.push(url); if(init?.method==='POST') return response({success:true,pending:true,sessionId:`s${++count}`});return response({success:true,sessionId:url.endsWith('s1')?'s1':'s2'});}));
    const a=scoutFetch('/api/posts',{method:'POST',body:'{"id":"a"}'});const b=scoutFetch('/api/posts',{method:'POST',body:'{"id":"b"}'});
    await vi.advanceTimersByTimeAsync(0);expect(storage.size).toBe(2);
    await vi.advanceTimersByTimeAsync(5000);await Promise.all([a,b]);
    expect(calls).toEqual(['/api/posts','/api/posts','/api/sport-hub/scout?sessionId=s1','/api/sport-hub/scout?sessionId=s2']);expect(storage.size).toBe(0);
  });
  it('resume issues a read instead of a new provider task',async()=>{
    const fetchMock=vi.fn(async()=>response({success:true,sessionId:'saved'}));vi.stubGlobal('fetch',fetchMock);
    await scoutFetch('/api/sport-hub/scout',{method:'POST',body:'{"action":"resume","sessionId":"saved"}'});
    expect(fetchMock).toHaveBeenCalledExactlyOnceWith('/api/sport-hub/scout?sessionId=saved');
  });
  it('a polling network error preserves the original task and never retries a POST',async()=>{
    const fetchMock=vi.fn().mockResolvedValueOnce(response({success:true,pending:true,sessionId:'s1'})).mockRejectedValueOnce(new Error('Network error'));
    vi.stubGlobal('fetch',fetchMock);const pending=scoutFetch('/api/posts',{method:'POST',body:'{}'});const caught=pending.catch(e=>e.message);
    await vi.advanceTimersByTimeAsync(5000);expect(await caught).toBe('Network error');expect(storage.size).toBe(1);expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});
