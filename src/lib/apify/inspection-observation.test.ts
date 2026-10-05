import { beforeEach, describe, expect, it, vi } from 'vitest';
const state=vi.hoisted(()=>({session:null as any,error:null as any,owner:''}));
vi.mock('@/lib/supabase/admin',()=>({createAdminClient:()=>({from(){const q:any={select:()=>q,eq:(key:string,v:string)=>{if(key==='owner_id')state.owner=v;return q;},single:async()=>({data:state.session,error:state.error})};return q;}})}));
import { inspectionObservation } from './inspection-observation';
const id='00000000-0000-0000-0000-000000000001';
beforeEach(()=>{state.error=null;state.session={kind:'inspect',status:'complete',params:{url:'https://instagram.com/a'},result:{data:{followers:0,avgViews:null,er:null,provenance:{runId:'real-run'}}}};});
describe('server-owned inspection provenance',()=>{
 it('preserves real zero observations and checks ownership',async()=>{expect(await inspectionObservation({inspectSessionId:id,profileUrl:'https://www.instagram.com/a/',followers:0,avgViews:null,er:null},'owner')).toMatchObject({source:'apify',runId:'real-run'});expect(state.owner).toBe('owner');});
 it('does not label edited metrics as provider observations',async()=>{expect(await inspectionObservation({inspectSessionId:id,profileUrl:'https://instagram.com/a',followers:5},'owner')).toBeNull();});
 it('rejects a different URL and a missing owned session',async()=>{await expect(inspectionObservation({inspectSessionId:id,profileUrl:'https://instagram.com/b'},'owner')).rejects.toMatchObject({code:'INSPECTION_URL_MISMATCH'});state.session=null;await expect(inspectionObservation({inspectSessionId:id},'owner')).rejects.toMatchObject({code:'INSPECTION_NOT_FOUND'});});
 it('does not trust arbitrary client provenance',async()=>{expect(await inspectionObservation({scoutProvenance:{runId:'fake'}},'owner')).toBeNull();});
});
