import { expect,it } from 'vitest';
import { applyManualAttributes, type ManualAttributeReview } from './manual-attributes';
import { contextKey } from './discovery-quality';
import { assessReviewedProfile } from './search-assessment';
import { parseProfile } from './providers';
const review:ManualAttributeReview={contextKey:contextKey('badminton','Ho Chi Minh City'),topic:'passed',geography:'passed',actorId:'reviewer',confirmedAt:'2026-10-12T12:00:00Z'};
const base={assessment:{topic:{state:'unknown'},geography:{state:'unknown'},followers:{state:'passed'},entityType:{state:'passed'}},reasons:[],reviewState:'Needs Review'};
it('applies saved topic/location review with actor and time while preserving automatic evidence',()=>{
 const result=applyManualAttributes(base,review,'badminton','Ho Chi Minh City');
 expect(result).toMatchObject({reviewState:'Matched',resultGroup:'Qualified',relevant:true,locationMatch:true});expect((result.assessment.topic as any).evidence[0]).toContain('reviewer');expect(base.assessment.topic.state).toBe('unknown');
});
it('never bypasses missing or failed audience size',()=>{
 for(const state of ['unknown','failed'])expect(applyManualAttributes({...base,assessment:{...base.assessment,followers:{state}}},review,'badminton','Ho Chi Minh City').reviewState).not.toBe('Matched');
});
it('does not apply corrections to another topic or location',()=>expect(applyManualAttributes(base,review,'tennis','Hanoi')).toBe(base));
it('preserves unknown and negative reviewer choices',()=>{
 expect(applyManualAttributes(base,{...review,topic:'unknown'},'badminton','Ho Chi Minh City').reviewState).toBe('Needs Review');
 expect(applyManualAttributes(base,{...review,geography:'failed'},'badminton','Ho Chi Minh City').reviewState).toBe('Excluded');
});
it('review and pre-import reassessment replay saved manual confirmations without model/provider calls',()=>{
 const profile={...parseProfile({profileUrl:'https://tiktok.com/@fixture',followers:1200},'TikTok')!,manualAttributeReview:review};
 const options:any={version:7,minFollowers:1000,entityAssessment:{suggestedType:'Individual',reviewedType:'Individual',status:'supported',source:'review',evidence:[],missingInformation:[]}};
 expect(assessReviewedProfile(profile,'badminton','Ho Chi Minh City','Individual KOLs',options,[]).resultGroup).toBe('Qualified');
 expect(assessReviewedProfile({...profile,followers:null},'badminton','Ho Chi Minh City','Individual KOLs',options,[]).resultGroup).not.toBe('Qualified');
});

it('uses the most recent team judgement when older negative feedback exists',()=>{
 const profile={...parseProfile({profileUrl:'https://tiktok.com/@fixture',followers:1200},'TikTok')!,manualAttributeReview:review};
 const options:any={version:7,minFollowers:1000,entityAssessment:{suggestedType:'Individual',reviewedType:'Individual',status:'supported',source:'review',evidence:[],missingInformation:[]}};
 const feedback={account_key:`${profile.platform}:${profile.url}`,context_key:review.contextKey,reason:'Not Relevant',created_at:'2026-10-12T11:00:00Z'};
 expect(assessReviewedProfile(profile,'badminton','Ho Chi Minh City','Individual KOLs',options,[feedback]).resultGroup).toBe('Qualified');
 expect(assessReviewedProfile(profile,'badminton','Ho Chi Minh City','Individual KOLs',options,[{...feedback,created_at:'2026-10-12T13:00:00Z'}]).resultGroup).toBe('Excluded');
});
