import { expect, it } from 'vitest';
import { prepareReviewPackets } from './account-review-packets';
import { parseProfile, parsePost } from '../../src/lib/apify/providers';
const profile=()=>parseProfile({url:'https://instagram.com/alex',username:'alex',name:'Alex',bio:'Chạy bộ tại Hà Nội'},'Instagram')!;
it('preserves saved source content and never makes a proposal into a reviewer label',()=>{
 const p=profile();p.posts=[parsePost({url:'https://instagram.com/p/one',ownerUsername:'alex',caption:'Sáng nay chạy bộ #HCMC',timestamp:'2026-10-10'},'Instagram')!];
 const before=JSON.stringify(p),[packet]=prepareReviewPackets([p]);
 expect(packet.annotation).toMatchObject({label:null,subjectKey:null,reviewers:[],confirmedAt:null,evidenceUrls:[]});expect(packet.annotation.evidenceHash).toMatch(/^[a-f0-9]{64}$/);
 expect(packet.reviewContext.evidenceReferences).toContain(p.posts[0].url);expect(packet.profile.posts[0].caption).toBe(p.posts[0].caption);
 packet.profile.bio='Edited packet';expect(JSON.stringify(p)).toBe(before);
});
it('rejects duplicate source accounts instead of losing their evidence',()=>{
 const p=profile();expect(()=>prepareReviewPackets([p,p])).toThrow('Duplicate');
});
