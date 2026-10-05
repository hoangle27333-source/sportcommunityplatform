import {beforeEach,describe,it,expect,vi} from 'vitest';
const state=vi.hoisted(()=>({session:{id:'s',created_at:'2026-10-05T00:00:00Z',params:{}} as any,watermark:null as any,fail:false}));
vi.mock('@/lib/supabase/admin',()=>({createAdminClient:()=>({from(table:string){let value:any;const filters:[string,any][]=[];const q:any={select:()=>q,eq:(k:string,v:any)=>{filters.push([k,v]);return q;},update:(v:any)=>{value=v;return q;},single:async()=>({data:structuredClone(state.session),error:null}),maybeSingle:async()=>{
 if(table==='scout_watermarks')return {data:state.watermark,error:null};
 if(state.fail)return {data:null,error:Error('Write failed')};
 if(!filters.every(([k,v])=>k==='params'?JSON.stringify(state.session.params)===v:state.session[k]===v))return {data:null,error:null};
 Object.assign(state.session,value);return {data:{id:'s'},error:null};
}};return q;}})}));
import {retrievalWindow} from './collection';
import {sessionSnapshot} from './session-snapshot';
beforeEach(()=>{state.session={id:'s',created_at:'2026-10-05T00:00:00Z',params:{}};state.watermark=null;state.fail=false;});
describe('durable task input snapshots',()=>{
 it('keeps the same first window after clock movement and a later watermark',async()=>{
 const first=await retrievalWindow('Instagram','profile-posts','https://instagram.com/a','s');
 vi.spyOn(Date,'now').mockReturnValue(Date.parse('2026-10-06T00:00:00Z'));state.watermark={published_at:'2026-10-05T01:00:00Z'};
 expect(await retrievalWindow('Instagram','profile-posts','https://instagram.com/a','s')).toEqual(first);expect(first.newerThan).toBe('2026-09-05T00:00:00.000Z');vi.restoreAllMocks();
 });
 it('preserves two concurrently claimed scopes without losing either value',async()=>{
 const [a,b]=await Promise.all([sessionSnapshot('s','retrievalWindows','a',async()=> 'a-date'),sessionSnapshot('s','retrievalWindows','b',async()=> 'b-date')]);expect([a,b]).toEqual(['a-date','b-date']);expect(state.session.params.retrievalWindows).toEqual({a:'a-date',b:'b-date'});
 });
 it('pins a build even after the verified capability changes',async()=>{
 expect(await sessionSnapshot('s','providerBuilds','actor',async()=> '1.2.3')).toBe('1.2.3');expect(await sessionSnapshot('s','providerBuilds','actor',async()=> '1.2.4')).toBe('1.2.3');
 });
 it('fails before collection if the snapshot cannot be saved',async()=>{state.fail=true;await expect(retrievalWindow('Instagram','profile-posts','a','s')).rejects.toThrow('Write failed');});
});
