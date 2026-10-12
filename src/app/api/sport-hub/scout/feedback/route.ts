import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { scoutAccess, scoutFailure } from '@/lib/apify/sessions';
import { createAdminClient } from '@/lib/supabase/admin';
import { contextKey } from '@/lib/apify/discovery-quality';
import { ENTITY_TYPES, legacyClassification, type EntityType } from '@/lib/apify/account-evidence';
import { assessSearchProfile } from '@/lib/apify/search-assessment';
const schema = z.object({ sessionId: z.string().uuid(), candidateId: z.string().uuid(), reason: z.enum(['Wrong Entity Type','Not Relevant','Wrong Location','Correct Classification']), classification: z.enum(['Individual','Community','Brand/Business','Unknown']).optional(), entityType:z.enum(ENTITY_TYPES).optional() });
export async function POST(req: NextRequest) {
  try {
    const actor = await scoutAccess(); const b = schema.parse(await req.json()); const db = createAdminClient();
    const { data: s, error } = await db.from('scout_sessions').select('*').eq('id', b.sessionId).eq('owner_id', actor).single(); if (error) throw error;
    const c = s.candidates.find((c: any) => c.candidateId === b.candidateId); if (!c) return NextResponse.json({ success: false, error: 'Candidate not found' }, { status: 400 });
    if(s.status!=='complete' || (s.progress?.importedCandidateIds || []).includes(c.candidateId))return NextResponse.json({success:false,error:'This preview is not available for correction.'},{status:409});
    const type=b.entityType || b.classification;
    if (['Wrong Entity Type', 'Correct Classification'].includes(b.reason) && !type) return NextResponse.json({ success: false, error: 'Choose the corrected entity type' }, { status: 400 });
    const { error: writeError } = await db.from('scout_feedback').insert({ account_key: c.accountKey, context_key: contextKey(s.params.keyword, s.params.geography), reason: b.reason, classification: type?legacyClassification(type):null, ...(c.entityAssessment?{entity_type:type || null,evidence_hash:c.entityAssessment.evidenceHash || null,model_version:c.entityAssessment.modelVersion}:{}), actor_id: actor }); if (writeError) throw writeError;
    if(!c.entityAssessment)return NextResponse.json({success:true});
    let updated={...c};
    if(type && ['Wrong Entity Type','Correct Classification'].includes(b.reason)) updated={...c,...assessSearchProfile(c,s.params.keyword,s.params.geography,s.params.targetType,{...s.params.searchPlan?.criteria,...s.params,version:s.params.assessmentRevision===6 || s.params.searchPlan?.version===5?6:5,minFollowers:s.params.minFollowers ?? s.params.searchPlan?.criteria.minFollowers,entityTypes:s.params.entityTypes || s.params.searchPlan?.criteria.entityTypes,geographyMode:s.params.geographyMode || s.params.searchPlan?.criteria.geographyMode,entityAssessment:{...c.entityAssessment,suggestedType:type as EntityType,reviewedType:type as EntityType,status:type==='Unknown'?'uncertain':'supported',source:'review'}})};
    else updated={...c,reviewState:'Excluded',resultGroup:'Excluded',reasons:[...c.reasons,`Team feedback: ${b.reason}`],assessment:{...c.assessment,[b.reason==='Wrong Location'?'geography':'topic']:{state:'failed',reason:`Team feedback: ${b.reason}`,evidence:[]}}};
    const candidates=s.candidates.map((item:any)=>item.candidateId===c.candidateId?updated:item);
    const decisions={...(s.review_decisions || {})};delete decisions[c.candidateId];
    const groups={qualified:candidates.filter((item:any)=>item.reviewState==='Matched'),needsVerification:candidates.filter((item:any)=>item.reviewState==='Needs Review'),belowTarget:[],excluded:candidates.filter((item:any)=>item.reviewState==='Excluded')};
    const result={...s.result,candidates,groups,counts:{...s.result?.counts,qualifiedNew:groups.qualified.filter((item:any)=>!item.isExisting).length,shortfall:Math.max(0,(s.params.limit || 5)-groups.qualified.filter((item:any)=>!item.isExisting).length),qualified:groups.qualified.length,unverified:groups.needsVerification.length,excluded:groups.excluded.length}};
    const {data:saved,error:saveError}=await db.from('scout_sessions').update({candidates,result,review_decisions:decisions}).eq('id',s.id).eq('owner_id',actor).eq('candidates',JSON.stringify(s.candidates)).eq('review_decisions',JSON.stringify(s.review_decisions || {})).or(`import_lease_until.is.null,import_lease_until.lt.${new Date().toISOString()}`).select('id').maybeSingle();
    if(saveError)throw saveError;
    if(!saved)return NextResponse.json({success:false,error:'The preview changed. Reopen it before applying the correction.'},{status:409});
    return NextResponse.json({ success: true, candidate:updated, counts:result.counts });
  } catch (e) { return scoutFailure(e); }
}
