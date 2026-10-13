import { expect, it } from 'vitest';
import { profileReviewDecision } from './profile-review';
import type { DiscoveryCandidate } from './scout';
const excluded = {reviewState:'Excluded', classification:'Unknown', assessment:{followers:{state:'failed'}, topic:{state:'unknown'}}} as unknown as DiscoveryCandidate;
it.each(['rejected','pending'] as const)('allows %s for an excluded candidate without confirming missing evidence',decision=>{
 expect(profileReviewDecision(excluded,'Individual KOLs',{decision},'reviewer')).toMatchObject({decision,actorId:'reviewer'});
});
it('continues to block approving an excluded candidate even with manual confirmations',()=>{
 expect(()=>profileReviewDecision(excluded,'Individual KOLs',{decision:'approved',typeConfirmed:true,relevant:true,locationConfirmed:true,entityType:'Individual'},'reviewer')).toThrow('cannot be approved');
});
