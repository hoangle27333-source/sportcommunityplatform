import { expect,it } from 'vitest';
import { approvalBlockers } from './approval-readiness';
const candidate:any={reviewState:'Matched',classification:'Individual',assessmentVersion:7,resultGroup:'Qualified',entityAssessment:{suggestedType:'Individual',status:'supported'},assessment:{topic:{state:'passed'},geography:{state:'passed'},followers:{state:'passed'}}};
const edit={classification:'Individual',relevant:true,locationConfirmed:true};
it('allows a fully qualified profile without confirming type twice',()=>expect(approvalBlockers(candidate,'Individual',edit)).toEqual([]));
it('explains missing topic and geography even with manually confirmed fields',()=>{
 const c={...candidate,reviewState:'Needs Review',resultGroup:'Needs Verification',assessment:{topic:{state:'unknown',reason:'More owned content is needed.'},geography:{state:'unknown',reason:'Location is unverified.'}}};
 expect(approvalBlockers(c,'Individual',edit)).toEqual(['Topic: More owned content is needed.','Location: Location is unverified.']);
});
it('explains an unsaved type draft',()=>expect(approvalBlockers(candidate,'Individual',edit,'Community')).toContain('Save the account type correction first.'));
it('keeps unknown account type distinct from wrong type',()=>{
 const reasons=approvalBlockers({...candidate,entityAssessment:{suggestedType:'Unknown',status:'uncertain'}},'Individual',edit);
 expect(reasons).toContain('Confirm and save an account type.');expect(reasons.some(r=>r.includes('does not match'))).toBe(false);
});
it('explains audience failure and exclusion',()=>{
 const reasons=approvalBlockers({...candidate,reviewState:'Excluded',assessment:{...candidate.assessment,followers:{state:'failed',reason:'Observed followers are below 1,000.'}}},'Individual',edit);
 expect(reasons).toContain('Followers: Observed followers are below 1,000.');expect(reasons.some(r=>r.includes('system assessment excludes'))).toBe(true);
});
it('retains explicit confirmation for legacy Needs Review results',()=>{
 expect(approvalBlockers({...candidate,assessmentVersion:6,reviewState:'Needs Review'},'Individual',{classification:'Individual'})).toEqual(['Confirm topic relevance.','Confirm the target location.']);
});
