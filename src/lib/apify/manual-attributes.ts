import { contextKey } from './discovery-quality';
export type ManualAttributeReview={contextKey:string;topic:'passed'|'failed'|'unknown';geography:'passed'|'failed'|'unknown';actorId:string;confirmedAt:string;previous?:ManualAttributeReview};
/** Reviewer statements are separate from provider observations and scoped to the criteria. */
export function applyManualAttributes<T extends Record<string,any>>(assessment:T,review:ManualAttributeReview | undefined,keyword:string,geography:string):T {
 if(!review || review.contextKey!==contextKey(keyword,geography))return assessment;
 const dimensions={...assessment.assessment};
 for(const [key,state] of [['topic',review.topic],['geography',review.geography]] as const){
  dimensions[key]={state,reason:`${key==='topic'?'Topic':'Location'} ${state==='passed'?'confirmed':state==='failed'?'rejected':'left unverified'} by team review.`,evidence:[`Team review by ${review.actorId} at ${review.confirmedAt}`]};
 }
 const states=Object.values(dimensions) as {state:string}[];
 const reviewState=states.some(d=>d.state==='failed')?'Excluded':states.every(d=>d.state==='passed')?'Matched':'Needs Review';
 return {...assessment,assessment:dimensions,relevant:review.topic==='passed',locationMatch:review.geography==='passed',reasons:[...assessment.reasons,...['topic','geography'].map(k=>dimensions[k].reason)],reviewState,resultGroup:reviewState==='Matched'?'Qualified':reviewState==='Excluded'?'Excluded':'Needs Verification'};
}
