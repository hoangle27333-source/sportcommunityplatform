import { beforeEach, expect, it, vi } from 'vitest';
import { NextRequest, NextResponse } from 'next/server';
const state=vi.hoisted(()=>({session:{} as any,updates:[] as any[],tables:[] as string[]}));
vi.mock('@/lib/apify/sessions',()=>({scoutAccess:async()=> 'owner',scoutFailure:(error:any)=>NextResponse.json({success:false,error:error.message},{status:error.status || 400})}));
vi.mock('@/lib/supabase/admin',()=>({createAdminClient:()=>({from:(table:string)=>{
 state.tables.push(table);let updated=false;
 if(table==='scout_feedback')return {select:()=>({order:async()=>({data:[],error:null})})};
 const query:any={select:()=>query,eq:()=>query,is:()=>query,or:()=>query,update:(value:any)=>{updated=true;state.updates.push(value);return query;},single:async()=>({data:state.session,error:null}),maybeSingle:async()=>({data:updated?{id:state.session.id}:null,error:null})};return query;
}})}));
import { POST } from '@/app/api/sport-hub/scout/attributes/route';
const sessionId='00000000-0000-4000-8000-000000000001';
const candidateId='00000000-0000-4000-8000-000000000002';
const otherId='00000000-0000-4000-8000-000000000003';
const request=(body:any)=>new NextRequest('http://localhost/api/sport-hub/scout/attributes',{method:'POST',body:JSON.stringify({sessionId,...body})});
beforeEach(()=>{state.tables=[];state.updates=[];state.session={id:sessionId,owner_id:'owner',kind:'preview',status:'complete',params:{keyword:'badminton',geography:'Ho Chi Minh City',assessmentRevision:7,targetType:'Individual KOLs',minFollowers:1000},candidates:[{candidateId,accountKey:'TikTok:https://tiktok.com/@fixture',url:'https://tiktok.com/@fixture',name:'Fixture',username:'fixture',platform:'TikTok',bio:'',category:'',entityType:'person',location:'',posts:[],followers:1200,reasons:[],entityAssessment:{suggestedType:'Individual',reviewedType:'Individual',status:'supported',source:'review',evidence:[],missingInformation:[]}},{candidateId:otherId,reviewState:'Needs Review'}],review_decisions:{preserved:{decision:'approved'}},progress:{}};});

it('saves manual attributes with actor/time and recomputes eligibility without approving',async()=>{
 const response=await POST(request({candidateId,topic:'passed',geography:'passed'}));
 expect(response.status).toBe(200);const body=await response.json();
 expect(body.candidate).toMatchObject({resultGroup:'Qualified',manualAttributeReview:{actorId:'owner',topic:'passed',geography:'passed'}});
 expect(state.updates[0].review_decisions).toEqual({preserved:{decision:'approved'}});
 expect(state.updates[0].result.candidates[0].manualAttributeReview.actorId).toBe('owner');
});
it('cannot override missing or failed follower measurements',async()=>{
 state.session.candidates[0].followers=null;
 const response=await POST(request({candidateId,topic:'passed',geography:'passed'}));
 expect(response.status).toBe(200);expect((await response.json()).candidate.resultGroup).toBe('Needs Verification');
});
it('prevents editing imported profiles',async()=>{
 state.session.progress.importedCandidateIds=[candidateId];
 const response=await POST(request({candidateId,topic:'passed',geography:'passed'}));
 expect(response.status).toBe(409);expect(state.updates).toHaveLength(0);
});
