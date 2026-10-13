import { guardReviewSnapshot, nextReviewProgress } from '@/lib/apify/review-snapshot';
import { NextRequest,NextResponse } from 'next/server';
import { z } from 'zod';
import { createAdminClient } from '@/lib/supabase/admin';
import { scoutAccess,scoutFailure } from '@/lib/apify/sessions';
import { ScoutError } from '@/lib/apify/providers';
import { contextKey } from '@/lib/apify/discovery-quality';
import { assessReviewedProfile } from '@/lib/apify/search-assessment';
const schema=z.object({sessionId:z.string().uuid(),candidateId:z.string().uuid(),topic:z.enum(['passed','failed','unknown']),geography:z.enum(['passed','failed','unknown'])});
export async function POST(req:NextRequest){try{
 const actorId=await scoutAccess(),input=schema.parse(await req.json()),db=createAdminClient();
 const {data:s,error}=await db.from('scout_sessions').select('*').eq('id',input.sessionId).eq('owner_id',actorId).single();
 if(error || !s)throw new ScoutError('Preview not found.','NOT_FOUND',404);
 if(s.kind!=='preview'||s.status!=='complete')throw new ScoutError('Preview is not ready for correction.','INVALID_PREVIEW',400);
 if((s.progress?.importedCandidateIds || []).includes(input.candidateId))throw new ScoutError('This profile has already been imported.','ALREADY_IMPORTED',409);
 const c=s.candidates?.find((c:any)=>c.candidateId===input.candidateId);if(!c)throw new ScoutError('Candidate not found.','INVALID_SELECTION',400);
 const profile={...c,manualAttributeReview:{contextKey:contextKey(s.params.keyword,s.params.geography),topic:input.topic,geography:input.geography,actorId,confirmedAt:new Date().toISOString(),previous:c.manualAttributeReview}};
 const {data:feedback,error:feedbackError}=await db.from('scout_feedback').select('*').order('created_at',{ascending:false});if(feedbackError)throw feedbackError;
 const version=s.params.assessmentRevision || (s.params.searchPlan?.version===6?7:s.params.searchPlan?.version===5?6:5);
 const updated={...profile,...assessReviewedProfile(profile,s.params.keyword,s.params.geography,s.params.targetType,{...s.params.searchPlan?.criteria,...s.params,version,entityAssessment:c.entityAssessment},feedback || [])};
 const candidates=s.candidates.map((p:any)=>p.candidateId===c.candidateId?updated:p),decisions={...(s.review_decisions || {})};delete decisions[c.candidateId];
 const groups={qualified:candidates.filter((p:any)=>p.reviewState==='Matched'),needsVerification:candidates.filter((p:any)=>p.reviewState==='Needs Review'),belowTarget:[],excluded:candidates.filter((p:any)=>p.reviewState==='Excluded')};
 const qualifiedNew=groups.qualified.filter((p:any)=>!p.isExisting).length;
 const counts={...s.result?.counts,qualifiedNew,shortfall:Math.max(0,(s.params.limit || 5)-qualifiedNew),qualified:groups.qualified.length,unverified:groups.needsVerification.length,excluded:groups.excluded.length};
 const {data:saved,error:saveError}=await guardReviewSnapshot(db.from('scout_sessions').update({candidates,result:{...s.result,candidates,groups,counts},review_decisions:decisions,progress:nextReviewProgress(s)}).eq('id',s.id).eq('owner_id',actorId),s).or(`import_lease_until.is.null,import_lease_until.lt.${new Date().toISOString()}`).select('id').maybeSingle();
 if(saveError)throw saveError;if(!saved)throw new ScoutError('The preview changed. Reopen it before saving.','REVIEW_STALE',409);
 return NextResponse.json({success:true,candidate:updated,counts});
 }catch(error){return scoutFailure(error);}}
