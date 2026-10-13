import { legacyClassification, type EntityType } from './account-evidence';
import { ScoutError } from './providers';
import type { DiscoveryCandidate } from './scout';

export type ProfileReviewDecision = {
  decision: 'approved' | 'rejected' | 'pending';
  classification?: 'Individual' | 'Community';
  entityType?: EntityType;
  evidenceHash?:string;
  relevant?: boolean;
  locationConfirmed?: boolean;
  actorId: string;
  confirmedAt: string;
};

export function profileReviewDecision(candidate: DiscoveryCandidate, targetType: string, input: {
  decision: ProfileReviewDecision['decision']; entityType?:EntityType; typeConfirmed?: boolean; relevant?: boolean; locationConfirmed?: boolean;
}, actorId: string): ProfileReviewDecision {
  const classification = targetType === 'Communities & Clubs' ? 'Community' : 'Individual';
  const entityType=input.entityType || candidate.entityAssessment?.reviewedType || candidate.entityAssessment?.suggestedType;
  if (input.decision === 'approved') {
    if (candidate.reviewState === 'Excluded') throw new ScoutError('An excluded candidate cannot be approved.', 'INVALID_SELECTION', 400);
    for(const metric of ['followers','members'])if(candidate.assessment?.[metric] && candidate.assessment[metric].state!=='passed')throw new ScoutError(`Observed ${metric} must meet the selected range before approval.`, 'FOLLOWER_THRESHOLD_REQUIRED',400);
    if(entityType && (legacyClassification(entityType)!==classification || !['Individual','Community','Club'].includes(entityType))) throw new ScoutError('Choose an importable account type matching this CRM destination.', 'WRONG_TYPE',400);
    if(candidate.entityAssessment?.status!=='supported' && candidate.entityAssessment && (!input.entityType || !input.typeConfirmed))throw new ScoutError('Explicitly confirm the account type before import.', 'REVIEW_REQUIRED',400);
    if (candidate.reviewState === 'Needs Review' && (!input.typeConfirmed || !input.relevant || !input.locationConfirmed)) {
      throw new ScoutError('Confirm profile type, topic relevance and target location before approving.', 'REVIEW_REQUIRED', 400);
    }
    if (candidate.reviewState === 'Matched' && candidate.classification !== classification) throw new ScoutError('This candidate has the wrong profile type.', 'WRONG_TYPE', 400);
  }
  return { decision: input.decision, ...(input.decision === 'approved' ? { classification, ...(entityType?{entityType}:{}), ...(candidate.entityAssessment?.evidenceHash?{evidenceHash:candidate.entityAssessment.evidenceHash}:{}), relevant: true, locationConfirmed: true } : {}), actorId, confirmedAt: new Date().toISOString() };
}
