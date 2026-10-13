import { currentAccountModelPolicy, accountModelPolicyKey } from './account-model-policy';
import { createHash } from 'node:crypto';
import { EXPERIMENTAL_TOPIC_POLICY_REVISION } from './search-assessment';
import { createAdminClient } from '@/lib/supabase/admin';
import { stableJson } from './runtime';
import { ScoutError } from './errors';
import { requestSchema, scoutAccess, resumeSession, enqueueScoutSession } from './sessions';
import { canonicalScopes } from './geography';
import { withStoredEvidence, type SavedProviderRun } from './stored-evidence';
import { previewDiscoveryCandidates, scoutMarketTrends } from './scout';

export async function reassessSession(sessionId:string) {
 const owner=await scoutAccess(); const db=createAdminClient();
 const {data:parent,error}=await db.from('scout_sessions').select('*').eq('id',sessionId).eq('owner_id',owner).single();
 if(error || !parent)throw new ScoutError('Scout session not found.','NOT_FOUND',404);
 if(parent.status!=='complete' || parent.result?.success===false || !['preview','trends'].includes(parent.kind) || parent.params?.executionMode==='stored-evidence') throw new ScoutError('Reassessment requires a completed search task.','INVALID_REASSESSMENT',409);
 const experimental=parent.params.searchPlan?.version===6 || parent.params.assessmentRevision===7;const accountV5=parent.kind==='preview';const strict=parent.params.assessmentRevision===6 || parent.params.searchPlan?.version===5;const assessmentVersion=accountV5?(experimental?7:strict?6:5):4;
 const criteriaHash=createHash('sha256').update(stableJson(experimental?{criteria:requestSchema.parse(parent.params),sourcePlanHash:parent.params.searchPlan?.hash,assessmentRevision:7,topicPolicyRevision:EXPERIMENTAL_TOPIC_POLICY_REVISION}:requestSchema.parse(parent.params))).digest('hex');
 const modelPolicy=accountV5?(experimental?{version:5 as const,mode:'off' as const,revision:'rules-5'}:currentAccountModelPolicy()):undefined;
 const modelPolicyKey=modelPolicy?accountModelPolicyKey(modelPolicy):undefined;
 let lookupQuery=db.from('scout_sessions').select('id').eq('owner_id',owner).eq('params->>parentSessionId',sessionId).eq('params->>executionMode','stored-evidence').eq('params->>assessmentVersion',String(assessmentVersion));
 if(parent.kind==='preview')lookupQuery=lookupQuery.eq('params->>profileScopeRevision',String(assessmentVersion)).eq('params->>accountModelPolicyKey',modelPolicyKey).eq('params->>criteriaHash',criteriaHash);
 const {data:existing,error:lookup}=await lookupQuery.in('status',['pending','running','complete']).order('created_at',{ascending:false}).limit(1).maybeSingle();
 if(lookup)throw lookup; if(existing)return resumeSession(existing.id,owner);
 const {data:runs,error:read}=await db.from('scout_provider_runs').select('id').eq('session_id',sessionId).eq('state','succeeded').limit(1);if(read)throw read;
 if(!runs?.length && !experimental)throw new ScoutError('No saved provider evidence is available.','EVIDENCE_UNAVAILABLE',409);
 const digest=createHash('sha256').update(`scout-reassess:${assessmentVersion}:${sessionId}${parent.kind==='preview'?`:profile-scope-${assessmentVersion}:${modelPolicyKey}:${criteriaHash}`:''}`).digest('hex').slice(0,32);
 const childId=`${digest.slice(0,8)}-${digest.slice(8,12)}-5${digest.slice(13,16)}-a${digest.slice(17,20)}-${digest.slice(20)}`;
 const params={...requestSchema.parse(parent.params),...(parent.kind==='preview'?{accountModelPolicy:modelPolicy,accountModelPolicyKey:modelPolicyKey,criteriaHash,profileScopeRevision:assessmentVersion,...(assessmentVersion>=6?{assessmentRevision:assessmentVersion}:{}),...(experimental?{searchPlan:parent.params.searchPlan}:{}),accountPolicyVersion:5,geographyMode:parent.params.geographyMode || 'profile-or-recent-posts'}:{}),geography:canonicalScopes(parent.params.geography || 'Nationwide'),retrievalWindows:parent.params.retrievalWindows || {},parentSessionId:sessionId,executionMode:'stored-evidence',assessmentVersion,evidenceCreatedAt:parent.created_at};
 const {data:child,error:save}=await db.from('scout_sessions').insert({id:childId,owner_id:owner,kind:parent.kind,params,runtime_version:3,execution_engine:'workflow'}).select('id').single();if(save) { if(save.code==='23505') { const {data:concurrent}=await db.from('scout_sessions').select('status,owner_id').eq('id',childId).single(); if(concurrent?.owner_id===owner && concurrent.status!=='failed')return resumeSession(childId,owner); } throw save; }
 try { await enqueueScoutSession(child.id); } catch { /* The durable dispatch state remains recoverable. */ }
 return resumeSession(child.id,owner);
}

export async function executeStoredReassessment(session:any) {
 const db=createAdminClient();const {data:parent,error}=await db.from('scout_sessions').select('id,owner_id,kind,status,result').eq('id',session.params.parentSessionId).single();
 if(error || !parent || parent.owner_id!==session.owner_id || parent.kind!==session.kind || parent.status!=='complete' || parent.result?.success===false)throw new ScoutError('Source evidence is unavailable.','EVIDENCE_UNAVAILABLE',409);
 const runs:SavedProviderRun[]=[];
 for(let offset=0;offset<1000;offset+=100){const {data,error:read}=await db.from('scout_provider_runs').select('platform,task,state,normalized_rows,raw_rows,warnings').eq('session_id',parent.id).eq('state','succeeded').order('id').range(offset,offset+99);if(read)throw read;runs.push(...(data || []));if(!data || data.length<100)break;if(offset===900)throw new ScoutError('Source evidence exceeds the reassessment limit.','EVIDENCE_LIMIT',409);}
 const p={...session.params,sessionId:session.id,...(session.params.assessmentRevision===7?{savedExperimentalProfiles:parent.result.candidates || []}:{})};
 const result:any=await withStoredEvidence<any>(runs,()=>session.kind==='preview' ? previewDiscoveryCandidates(p) : scoutMarketTrends(p));
 return {...result,...(session.params.accountModelPolicy?{accountModelPolicy:session.params.accountModelPolicy,accountModelPolicyKey:session.params.accountModelPolicyKey}:{}),parentSessionId:parent.id,executionMode:'stored-evidence',providerStarts:0,assessmentVersion:session.params.assessmentVersion || 4,warnings:[...(result.warnings || []),...new Set(runs.flatMap(r=>r.warnings || []))]};
}
