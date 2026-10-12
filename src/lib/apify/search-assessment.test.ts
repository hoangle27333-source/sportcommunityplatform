import {expect,it} from 'vitest';
import {parsePost,parseProfile,mergeProfileEvidence} from './providers';
import {assessSearchContent,assessSearchProfile} from './search-assessment';
import {profileReviewDecision} from './profile-review';
import {requestSchema} from './sessions';
const criteria={keyword:'Running',searchMode:'keyword',geography:'Vietnam',newerThan:'2026-10-04',qualityMode:'high-engagement' as const};
const post=parsePost({url:'https://facebook.com/runner/posts/1',text:'Chạy bộ Hanoi',time:'2026-10-10',likes:100,comments:0},'Facebook')!;
it('retains low engagement and older relevant posts as Below Target',()=>{
 expect(assessSearchContent({...post,likes:0},criteria).resultGroup).toBe('Below Target');
 expect(assessSearchContent({...post,publishedAt:'2026-09-10'},criteria).resultGroup).toBe('Below Target');
 expect(assessSearchContent(post,criteria).resultGroup).toBe('Qualified');
});
it('keeps missing measurements unknown and never uses the query as location evidence',()=>{
 expect(assessSearchContent({...post,publishedAt:undefined},criteria).resultGroup).toBe('Needs Verification');
 expect(assessSearchContent({...post,comments:null},criteria).resultGroup).toBe('Needs Verification');
 expect(assessSearchContent({...post,caption:'Running',location:undefined},{...criteria,keyword:'Running Vietnam'}).resultGroup).toBe('Needs Verification');
 expect(assessSearchContent({...post,comments:null,views:10000},criteria).resultGroup).toBe('Qualified');
});
it('excludes wrong topics and cities and preserves exact hashtag semantics',()=>{
 expect(assessSearchContent({...post,caption:'Football Hanoi'},criteria).resultGroup).toBe('Excluded');
 expect(assessSearchContent({...post,location:'United States'},criteria).resultGroup).toBe('Excluded');
 expect(assessSearchContent(post,{...criteria,geography:'Ho Chi Minh City'}).resultGroup).toBe('Excluded');
 expect(assessSearchContent(post,{...criteria,keyword:'#running',searchMode:'hashtag'}).resultGroup).toBe('Excluded');
});
it('retains sparse profiles and merges detail evidence only for the identical account',()=>{
 const sparse=parseProfile({url:'https://facebook.com/alex',name:'Alex'},'Facebook')!;
 expect(assessSearchProfile(sparse,'Running','Vietnam','Individual KOLs').resultGroup).toBe('Needs Verification');
 const detail=parseProfile({url:sparse.url,name:'Alex',bio:'Running coach Hanoi',followers:0},'Facebook')!;
 expect(assessSearchProfile(mergeProfileEvidence(sparse,detail),'Running','Vietnam','Individual KOLs').resultGroup).toBe('Qualified');
 expect(mergeProfileEvidence(sparse,{...detail,url:'https://facebook.com/other'})).toBe(sparse);
});
it('rejects observed wrong entity types even when topic evidence is missing',()=>{
 const group=parseProfile({url:'https://facebook.com/groups/123',name:'Alex'},'Facebook')!;
 expect(assessSearchProfile(group,'Running','Vietnam','Individual KOLs').resultGroup).toBe('Excluded');
});
it('filters by observed followers inclusively and keeps unknown counts unverified',()=>{
 const p=parseProfile({url:'https://instagram.com/alex',username:'alex',name:'Alex',bio:'Running athlete',category:'Athlete',followers:1000},'Instagram')!;
 const assess=(followers:number|null,minimum=1000)=>assessSearchProfile({...p,followers},'Running','Nationwide','Individual KOLs',{version:5,minFollowers:minimum});
 expect(assess(1000)).toMatchObject({resultGroup:'Qualified',assessment:{followers:{state:'passed'}}});
 expect(assess(999)).toMatchObject({resultGroup:'Excluded',assessment:{followers:{state:'failed'}}});
 expect(assess(0)).toMatchObject({assessment:{followers:{state:'failed'}}});
 expect(assess(null)).toMatchObject({resultGroup:'Needs Verification',assessment:{followers:{state:'unknown'}}});
 expect(assess(0,0).resultGroup).toBe('Qualified');
 expect(assessSearchProfile({...p,followers:null,members:50000},'Running','Nationwide','Individual KOLs',{version:5,minFollowers:1000})).toMatchObject({assessment:{followers:{state:'unknown'}}});
 const unknown={...p,...assess(null),candidateId:'c',accountKey:'Instagram:'+p.url,isExisting:false,provenance:{}};
 expect(()=>profileReviewDecision(unknown as any,'Individual KOLs',{decision:'approved',typeConfirmed:true,relevant:true,locationConfirmed:true,entityType:'Individual'},'reviewer')).toThrow('Observed followers');
 expect(profileReviewDecision(unknown as any,'Individual KOLs',{decision:'rejected'},'reviewer').decision).toBe('rejected');
});
it('validates follower thresholds without changing requests that omit them',()=>{
 expect(requestSchema.parse({}).minFollowers).toBeUndefined();
 for(const value of [-1,1.5,1000000001,'1000'])expect(requestSchema.safeParse({minFollowers:value}).success).toBe(false);
 expect(requestSchema.parse({minFollowers:1000}).minFollowers).toBe(1000);
});

it('v6 validates inclusive audience ranges, true zero and exclusive metric selection',()=>{
 const p=parseProfile({url:'https://facebook.com/groups/running',name:'Running Community',description:'Running community',membersCount:1000},'Facebook')!;
 const options={version:6,sizeMetric:'members' as const,minMembers:1000,maxMembers:1000};
 expect(p).toMatchObject({followers:null,members:1000});
 expect(assessSearchProfile(p,'Running','Any location','Communities & Clubs',options)).toMatchObject({resultGroup:'Qualified',assessment:{members:{state:'passed'}}});
 expect(assessSearchProfile({...p,members:1001},'Running','Any location','Communities & Clubs',options)).toMatchObject({resultGroup:'Excluded'});
 expect(assessSearchProfile({...p,members:null},'Running','Any location','Communities & Clubs',options)).toMatchObject({resultGroup:'Needs Verification'});
 expect(assessSearchProfile(p,'Running','Any location','Communities & Clubs',{version:6,minFollowers:0,maxFollowers:1000})).toMatchObject({assessment:{followers:{state:'unknown'}}});
 expect(assessSearchProfile({...p,followers:0},'Running','Any location','Communities & Clubs',{version:6,minFollowers:0,maxFollowers:0})).toMatchObject({assessment:{followers:{state:'passed'}}});
 for(const criteria of [{minFollowers:2,maxFollowers:1},{sizeMetric:'members',minFollowers:1},{minFollowers:1,minMembers:1},{minMembers:1},{maxMembers:-1}])expect(requestSchema.safeParse(criteria).success).toBe(false);
 expect(requestSchema.safeParse({sizeMetric:'members',minMembers:0,maxMembers:1000}).success).toBe(true);
});
it('v6 needs observed topic activity rather than an account name or a repost',()=>{
 const p=parseProfile({url:'https://instagram.com/alex',name:'Running Coach',category:'Athlete',bio:'',followers:1000},'Instagram')!;
 expect(assessSearchProfile(p,'Running','Any location','Individual KOLs',{version:6}).resultGroup).not.toBe('Qualified');
 const owned={...post,authorUrl:p.url,url:'https://instagram.com/p/one',caption:'Tập chạy bộ',hashtags:['chaybo']};
 expect(assessSearchProfile({...p,posts:[owned]},'Running','Any location','Individual KOLs',{version:6}).resultGroup).toBe('Qualified');
 expect(assessSearchProfile({...p,posts:[{...owned,isRepost:true}]},'Running','Any location','Individual KOLs',{version:6}).resultGroup).not.toBe('Qualified');
 expect(assessSearchProfile({...p,bio:'Running athlete'},'Running shoes','Any location','Individual KOLs',{version:6}).resultGroup).not.toBe('Qualified');
});
