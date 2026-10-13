import { beforeEach,it,expect,vi } from 'vitest';
const state=vi.hoisted(()=>({run:null as any,reservations:0}));
vi.mock('../supabase/admin',()=>({createAdminClient:()=>({
 from:()=>{let mutation:any;const q:any={select:()=>q,eq:()=>q,maybeSingle:async()=>{if(mutation){if(state.run.state==='reserved'){state.run={...state.run,...mutation};return {data:{id:'run'},error:null};}return {data:null,error:null};}return {data:state.run,error:null};},update:(value:any)=>{mutation=value;return q;},then:(resolve:any)=>{state.run={...state.run,...mutation};return Promise.resolve({error:null}).then(resolve);}};return q;},
 rpc:async()=>{state.reservations++;state.run={id:'run',state:'reserved'};return {data:{claimed:true,run:state.run},error:null};},
})}));
vi.mock('../apify/execution-budget',()=>({takeProviderOperation:()=>{}}));
import { trialRequest } from './trial';
import type { TrialCapability } from './types';
const capability:TrialCapability={id:'cap',provider:'brave',operation:'discovery',platform:'Facebook',revision:'fixture',verified:true,expires_at:'2099-01-01',total_units:10,used_units:0,units_per_request:1,max_value_usd:.01,config:{trialOnly:true,billingDisabled:true,receiptUrl:'https://example.com/verified'}};
beforeEach(()=>{state.run=null;state.reservations=0;});
it('replays completed evidence after expiry without another reservation or request',async()=>{
 const send=vi.fn(async()=>({result:['evidence'],actualUsd:0}));
 expect(await trialRequest('session',capability,{query:'badminton'},send)).toEqual(['evidence']);
 expect(await trialRequest('session',{...capability,expires_at:'2020-01-01'},{query:'badminton'},send)).toEqual(['evidence']);
 expect(send).toHaveBeenCalledTimes(1);expect(state.reservations).toBe(1);
});
it('never repeats an uncertain start',async()=>{
 const send=vi.fn(async()=>{throw new Error('Connection lost');});
 await expect(trialRequest('session',capability,{},send)).rejects.toMatchObject({code:'START_UNKNOWN'});
 await expect(trialRequest('session',capability,{},send)).rejects.toMatchObject({code:'START_UNKNOWN'});
 expect(send).toHaveBeenCalledTimes(1);
});
it('polls an existing receipt after expiry without allocating another request',async()=>{
 state.run={id:'run',state:'running',provider_receipt:'snapshot'};
 expect(await trialRequest('session',{...capability,expires_at:'2020-01-01'},{},async(run:any)=>({result:[run.provider_receipt],actualUsd:0}))).toEqual(['snapshot']);
 expect(state.reservations).toBe(0);
});
