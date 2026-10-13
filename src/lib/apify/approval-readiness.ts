import type { DiscoveryCandidate } from './scout';
import { legacyClassification, type EntityType } from './account-evidence';

export function approvalBlockers(candidate: DiscoveryCandidate, expected: string, edit: {classification:string;relevant?:boolean;locationConfirmed?:boolean}, draftType?:EntityType):string[] {
 const reasons:string[]=[];
 const entity=candidate.entityAssessment;
 const savedType=entity?.reviewedType || entity?.suggestedType;
 if(draftType && draftType!==savedType)reasons.push('Save the account type correction first.');
 const classification=entity?legacyClassification(savedType!):edit.classification;
 if(classification==='Unknown' || entity && entity.status!=='supported' && !entity.reviewedType)reasons.push('Confirm and save an account type.');
 else if(classification!==expected)reasons.push(`The saved account type does not match ${expected==='Community'?'Community / Club':'Individual Creator'}.`);
 for(const metric of ['followers','members']) {
  const dimension=candidate.assessment?.[metric];
  if(dimension && dimension.state!=='passed')reasons.push(`${metric==='followers'?'Followers':'Members'}: ${dimension.reason || (dimension.state==='unknown'?'the observed count is missing.':'the observed count is outside the selected range.')}`);
 }
 if(candidate.assessmentVersion===7) {
  for(const [key,label] of [['topic','Topic'],['geography','Location']] as const){
   const dimension=candidate.assessment?.[key];
   if(dimension?.state!=='passed')reasons.push(`${label}: ${dimension?.reason || 'supporting evidence is missing.'}`);
  }
  if((candidate as any).resultGroup!=='Qualified' && !reasons.length)reasons.push('This experimental profile must qualify on every criterion before approval.');
 } else if(candidate.reviewState==='Needs Review') {
  if(edit.relevant!==true)reasons.push('Confirm topic relevance.');
  if(edit.locationConfirmed!==true)reasons.push('Confirm the target location.');
 }
 if(edit.relevant===false)reasons.push('Topic is marked off-topic.');
 if(edit.locationConfirmed===false)reasons.push('Location is marked outside the target area.');
 if(candidate.reviewState==='Excluded')reasons.push('The system assessment excludes this profile. Correct the failed criteria before approving.');
 return [...new Set(reasons)];
}
