import { ScoutError } from './providers';
import type { DiscoveryCandidate } from './scout';

export type ProfileReviewDecision = {
  decision: 'approved' | 'rejected' | 'pending';
  classification?: 'Individual' | 'Community';
  relevant?: boolean;
  locationConfirmed?: boolean;
  actorId: string;
  confirmedAt: string;
};

export function profileReviewDecision(candidate: DiscoveryCandidate, targetType: string, input: {
  decision: ProfileReviewDecision['decision']; typeConfirmed?: boolean; relevant?: boolean; locationConfirmed?: boolean;
}, actorId: string): ProfileReviewDecision {
  if (candidate.reviewState === 'Excluded') throw new ScoutError('This candidate cannot be reviewed.', 'INVALID_SELECTION', 400);
  const classification = targetType === 'Communities & Clubs' ? 'Community' : 'Individual';
  if (input.decision === 'approved') {
    if (candidate.reviewState === 'Needs Review' && (!input.typeConfirmed || !input.relevant || !input.locationConfirmed)) {
      throw new ScoutError('Confirm profile type, topic relevance and target location before approving.', 'REVIEW_REQUIRED', 400);
    }
    if (candidate.reviewState === 'Matched' && candidate.classification !== classification) throw new ScoutError('This candidate has the wrong profile type.', 'WRONG_TYPE', 400);
  }
  return { decision: input.decision, ...(input.decision === 'approved' ? { classification, relevant: true, locationConfirmed: true } : {}), actorId, confirmedAt: new Date().toISOString() };
}
