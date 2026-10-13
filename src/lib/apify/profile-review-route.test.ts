import { beforeEach, expect, it, vi } from 'vitest';
import { NextRequest, NextResponse } from 'next/server';
const state=vi.hoisted(()=>({session:{} as any,updates:[] as any[],tables:[] as string[]}));
vi.mock('@/lib/apify/sessions',()=>({scoutAccess:async()=> 'owner',scoutFailure:(error:any)=>NextResponse.json({success:false,error:error.message},{status:error.status || 400})}));
vi.mock('@/lib/supabase/admin',()=>({createAdminClient:()=>({from:(table:string)=>{
 state.tables.push(table);let updated=false;
 const query:any={select:()=>query,eq:()=>query,is:()=>query,or:()=>query,update:(value:any)=>{updated=true;state.updates.push(value);return query;},single:async()=>({data:state.session,error:null}),maybeSingle:async()=>({data:updated?{id:state.session.id}:null,error:null})};return query;
}})}));
import { POST } from '@/app/api/sport-hub/scout/review/route';
const sessionId='00000000-0000-4000-8000-000000000001';
const candidateId='00000000-0000-4000-8000-000000000002';
const otherId='00000000-0000-4000-8000-000000000003';
const request=(body:any)=>new NextRequest('http://localhost/api/sport-hub/scout/review',{method:'POST',body:JSON.stringify({sessionId,...body})});
beforeEach(()=>{state.tables=[];state.updates=[];state.session={id:sessionId,owner_id:'owner',kind:'preview',status:'complete',params:{assessmentRevision:7,targetType:'Individual KOLs'},candidates:[{candidateId,reviewState:'Excluded',assessment:{followers:{state:'failed'}}},{candidateId:otherId,reviewState:'Needs Review'}],review_decisions:{preserved:{decision:'approved'}},progress:{}};});
it('persists rejection of an excluded candidate without provider calls or evidence confirmation',async()=>{
 const response=await POST(request({candidateId,decision:'rejected'}));
 expect(response.status).toBe(200);expect((await response.json()).decision.decision).toBe('rejected');
 expect(state.updates[0].review_decisions).toMatchObject({preserved:{decision:'approved'},[candidateId]:{decision:'rejected',actorId:'owner'}});
 expect(state.tables).toEqual(['scout_sessions','scout_sessions']);
});
it('rejects a mixed batch of excluded and unverified candidates',async()=>{
 const response=await POST(request({reviews:[candidateId,otherId].map(candidateId=>({candidateId,decision:'rejected'}))}));
 expect(response.status).toBe(200);expect((await response.json()).count).toBe(2);
 expect(Object.values(state.updates[0].review_decisions).filter((d:any)=>d.decision==='rejected')).toHaveLength(2);
});
it('continues blocking approval with failed audience evidence',async()=>{
 const response=await POST(request({candidateId,decision:'approved',entityType:'Individual',typeConfirmed:true,relevant:true,locationConfirmed:true}));
 expect(response.status).toBe(400);expect(state.updates).toHaveLength(0);
});
it('continues blocking rejection after import',async()=>{
 state.session.progress.importedCandidateIds=[candidateId];
 const response=await POST(request({candidateId,decision:'rejected'}));
 expect(response.status).toBe(409);expect(state.updates).toHaveLength(0);
});
