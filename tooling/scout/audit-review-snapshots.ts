/** Read-only replay of saved review state. Never calls providers/models or writes to the database. */
import { createAdminClient } from '../../src/lib/supabase/admin';
import { assessReviewedProfile } from '../../src/lib/apify/search-assessment';
import { writeFile } from 'node:fs/promises';

async function main() {
  const db = createAdminClient();
  const { data: sessions, error } = await db.from('scout_sessions')
    .select('id,params,candidates,review_decisions,progress,created_at')
    .eq('kind', 'preview').eq('status', 'complete')
    .order('created_at', { ascending: false }).limit(5);
  if (error) throw error;
  const { data: feedback, error: feedbackError } = await db.from('scout_feedback')
    .select('*').order('created_at', { ascending: false });
  if (feedbackError) throw feedbackError;
  const report = {
    observedAt: new Date().toISOString(), mode: 'read-only stored evidence replay',
    providerCalls: 0, modelCalls: 0, databaseWrites: 0,
    sessions: (sessions || []).map(s => {
      const revision = s.params.assessmentRevision || (s.params.searchPlan?.version === 6 ? 7 : s.params.searchPlan?.version === 5 ? 6 : 5);
      const candidates = (s.candidates || []).map((c: any) => {
        const checked = assessReviewedProfile(c, s.params.keyword, s.params.geography, s.params.targetType,
          { ...s.params.searchPlan?.criteria, ...s.params, version: revision, entityAssessment: c.entityAssessment }, feedback || []);
        return { candidateId: c.candidateId, decision: s.review_decisions?.[c.candidateId]?.decision || 'pending',
          imported: (s.progress?.importedCandidateIds || []).includes(c.candidateId),
          manualReview: Boolean(c.manualAttributeReview), savedGroup: c.resultGroup, checkedGroup: checked.resultGroup };
      });
      return { sessionId: s.id, revision, total: candidates.length,
        approved: candidates.filter((c: any) => c.decision === 'approved').length,
        manualReviews: candidates.filter((c: any) => c.manualReview).length,
        staleApprovals: candidates.filter((c: any) => !c.imported && c.decision === 'approved' && revision === 7 && c.checkedGroup !== 'Qualified'),
        assessmentDrift: candidates.filter((c: any) => c.savedGroup !== c.checkedGroup) };
    }),
  };
  await writeFile('docs/scout/review-snapshot-read-audit.json', JSON.stringify(report, null, 2) + '\n');
  console.log(JSON.stringify(report));
}
main().catch(error => { console.error(error.message); process.exitCode = 1; });
