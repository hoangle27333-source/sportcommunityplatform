/** Read-only saved-evidence audit. Never starts providers/models or writes to the database. */
import { writeFile } from 'node:fs/promises';
import { createAdminClient } from '../../src/lib/supabase/admin';
import { assessReviewedProfile, EXPERIMENTAL_TOPIC_POLICY_REVISION } from '../../src/lib/apify/search-assessment';
import { contentInputHash } from '../../src/lib/scout-experimental/evidence';
import { CONTENT_PROMPT_REVISION } from '../../src/lib/scout-experimental/types';

const db=createAdminClient();
const [{data:sessions,error},{data:feedback,error:feedbackError}]=await Promise.all([
 db.from('scout_sessions').select('id,params,candidates,review_decisions,progress,created_at,result')
  .eq('kind','preview').eq('status','complete').order('created_at',{ascending:false}).limit(12),
 db.from('scout_feedback').select('*').order('created_at',{ascending:false}),
]);
if(error || feedbackError)throw error || feedbackError;
const report={
 observedAt:new Date().toISOString(),mode:'read-only saved evidence',providerCalls:0,modelCalls:0,databaseWrites:0,
 topicPolicyRevision:EXPERIMENTAL_TOPIC_POLICY_REVISION,promptRevision:CONTENT_PROMPT_REVISION,
 sessions:(sessions || []).map(s=>{
  const revision=s.params.assessmentRevision || (s.params.searchPlan?.version===6?7:s.params.searchPlan?.version===5?6:5);
  const candidates=((s.candidates || []) as any[]).map((c:any)=>{
   const checked=assessReviewedProfile(c,s.params.keyword,s.params.geography,s.params.targetType,
    {...s.params.searchPlan?.criteria,...s.params,version:revision,entityAssessment:c.entityAssessment},feedback || []);
   const dimensions=Object.entries(checked.assessment).filter(([,d])=>d?.state!=='passed').map(([key,d])=>({key,state:d!.state}));
   return {
    accountUrl:c.url,groupBefore:c.resultGroup,groupAfter:checked.resultGroup,blockers:dimensions,
    imported:(s.progress?.importedCandidateIds || []).includes(c.candidateId),
    manualReview:!!c.manualAttributeReview,topic:checked.assessment.topic,
    collectedPosts:'geographyAssessment' in checked?checked.geographyAssessment.coverage.collected:c.posts.length,
    staleModelEvidence:!!c.contentEvidence && c.contentEvidence.inputHash!==contentInputHash(c,s.params.keyword),
   };
  });
  return {
   sessionId:s.id,revision,createdAt:s.created_at,candidateCount:candidates.length,
   groups:Object.fromEntries(['Qualified','Needs Verification','Excluded'].map(group=>[group,candidates.filter(c=>c.groupAfter===group).length])),
   blockerCounts:Object.fromEntries(['topic','entityType','geography','followers','members'].map(key=>[key,candidates.filter(c=>c.blockers.some(b=>b.key===key)).length])),
   staleModelEvidence:candidates.filter(c=>c.staleModelEvidence).length,
   drift:candidates.filter(c=>c.groupBefore!==c.groupAfter).map(c=>({accountUrl:c.accountUrl,from:c.groupBefore,to:c.groupAfter,imported:c.imported})),
   reportedAccounts:candidates.filter(c=>/ranselalba|chuloncaulong/.test(c.accountUrl)),
   collectionWarnings:s.result?.warnings || [],
  };
 }),
};
const output='docs/scout/full-topic-audit-2026-10-13.json';
await writeFile(output,JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify({output,sessions:report.sessions.map(s=>({id:s.sessionId,candidates:s.candidateCount,groups:s.groups,blockers:s.blockerCounts,staleModelEvidence:s.staleModelEvidence,drift:s.drift.length}))}));
