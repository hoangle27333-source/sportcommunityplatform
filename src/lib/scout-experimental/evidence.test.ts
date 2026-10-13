import { describe,it,expect } from 'vitest';
import { parseProfile,parsePost } from '../apify/providers';
import { assessReviewedProfile } from '../apify/search-assessment';
import { contextKey } from '../apify/discovery-quality';
import { validateContentEvidence } from './evidence';
import { historicalFollowers,ingestSeedRows,seedUrl } from './seeds';
import { candidatePriority } from './ranking';
import { experimentalApifyProfile,experimentalApifyPost } from './apify-adapter';
import { resultIdentity } from './providers';
import { assertTrial } from './trial';
import type { TrialCapability } from './types';
function profile(platform='Facebook',community=false,sport='badminton') {
 const url=platform==='Facebook'?'https://facebook.com/alex':platform==='TikTok'?'https://tiktok.com/@alex':'https://instagram.com/alex';
 const p=parseProfile({profileUrl:url,name:'Alex',followers:1000,entityType:community?'group':'person'},platform)!;
 p.posts=Array.from({length:3},(_,i)=>parsePost({url:platform==='Facebook'?`${p.url}/posts/${i+1}`:platform==='TikTok'?`${p.url}/video/${i+1}`:`https://instagram.com/p/post${i+1}`,authorUrl:p.url,caption:`Training ${sport} session ${i+1}`,location:i===0?'Ho Chi Minh City':''},platform)!);
 p.contentEvidence=validateContentEvidence({entityType:community?'Community':'Individual',identityEvidence:[p.url],posts:p.posts.map(post=>({url:post.url,topic:true,modality:'text',excerpt:post.caption}))},p,sport,'fixture');
 return p;
}
const assess=(p:ReturnType<typeof profile>,topic='badminton',feedback:any[]=[])=>assessReviewedProfile(p,topic,'Ho Chi Minh City','Individual KOLs',{version:7,minFollowers:1000},feedback);
describe('observed topic evidence without model output',()=>{
 it('counts explicit owned text without model output and preserves collected coverage',()=>{
  const p=profile();p.contentEvidence=undefined;
  const a=assess(p);
  expect(a.assessment.topic).toMatchObject({state:'passed',evidence:p.posts.map(post=>post.url)});
  expect(a).toMatchObject({geographyAssessment:{coverage:{collected:3,partial:true}}});
  // Sport proof does not replace missing account identity.
  expect(a.resultGroup).toBe('Needs Verification');
 });
 it('recognizes the reported Ransel caption while explaining the one-post threshold',()=>{
  const p=profile('TikTok');p.name='Ransel Alba';p.bio='🏸 | 🥒';p.contentEvidence=undefined;
  p.posts=[{...p.posts[0],caption:'Where to play Badminto in Ho Chi Minh, Vietnam part 2! #badminton #badmintonplayer',hashtags:['badminton','badmintonplayer'],publishedAt:'2026-06-25T07:59:55.000Z',location:''}];
  const a=assess(p);
  expect(a.assessment.topic).toMatchObject({state:'unknown',evidence:[p.posts[0].url]});
  expect(a.assessment.topic.reason).toContain('1 distinct owned post');
  expect(a).toMatchObject({geographyAssessment:{coverage:{collected:1,dated:1,partial:true},mentionedMatch:true}});
  expect(a.assessment.geography.state).toBe('unknown');
 });
 it('retains a name hint without counting an account-branded hashtag on an Apple Watch post',()=>{
  const p=profile('TikTok');p.name='Chú Lợn Cầu Lông 🐷🏸';p.contentEvidence=undefined;
  p.posts=[{...p.posts[0],caption:'#chuloncaulong #milanese #applewatch',hashtags:['chuloncaulong','milanese','applewatch'],publishedAt:'2026-10-12T04:08:59.000Z'}];
  const a=assess(p);
  expect(a.assessment.topic).toMatchObject({state:'unknown',evidence:[]});
  expect(a.assessment.topic.reason).toContain('Profile text contains a topic hint');
  expect(a).toMatchObject({geographyAssessment:{coverage:{collected:1,dated:1}}});
 });
 it('does not count duplicates, reposts or another author toward the threshold',()=>{
  const p=profile();p.contentEvidence=undefined;
  p.posts=[p.posts[0],p.posts[0],{...p.posts[1],isRepost:true},{...p.posts[2],authorUrl:'https://facebook.com/other'}];
  expect(assess(p).assessment.topic).toMatchObject({state:'unknown',evidence:[p.posts[0].url]});
 });
});
describe('experimental evidence policy',()=>{
 it('qualifies owned sport content without topic in name or bio and labels a visit accurately',()=>{
  const p=profile();const a=assess(p);expect(a.resultGroup).toBe('Qualified');expect('geographyAssessment' in a?a.geographyAssessment.reason:undefined).toBe('Content observed in Ho Chi Minh City.');
 });
 it('requires distinct owned posts; a seed or one-off appearance is insufficient',()=>{
  const p=profile();p.knownSeed=true;p.posts=[p.posts[0],p.posts[0],p.posts[0]];p.contentEvidence=validateContentEvidence({entityType:'Individual',identityEvidence:[p.url],posts:p.posts.map(post=>({url:post.url,topic:true,excerpt:post.caption}))},p,'badminton','fixture');
  expect(assess(p).resultGroup).toBe('Needs Verification');expect(p.contentEvidence.posts).toHaveLength(1);
 });
 it('does not turn tennis evidence or changed content into badminton proof',()=>{
  const p=profile('Facebook',false,'tennis');expect(assess(p).resultGroup).toBe('Needs Verification');
  const q=profile();q.posts[0].caption='Unrelated changed content';expect(assess(q).resultGroup).toBe('Needs Verification');
 });
 it('does not accept invented text, reposts or unprovided media',()=>{
  const p=profile();p.posts[0].isRepost=true;
  const e=validateContentEvidence({posts:[{url:p.posts[0].url,topic:true,modality:'text',excerpt:p.posts[0].caption},{url:p.posts[1].url,topic:true,modality:'image',excerpt:'Racket sports'},{url:'https://facebook.com/fake/posts/1',topic:true,excerpt:'badminton'}]},p,'badminton','fixture');
  expect(e.posts).toHaveLength(1);expect(e.posts[0].topic).toBe(false);
 });
 it('can use supplied visual evidence from captionless owned posts',()=>{
  const p=profile();p.posts.forEach(post=>post.caption='');
  p.contentEvidence=validateContentEvidence({entityType:'Individual',identityEvidence:[p.url],posts:p.posts.map(post=>({url:post.url,topic:true,modality:'image',excerpt:'Badminton racket and shuttlecock during play'}))},p,'badminton','fixture',p.posts.map(post=>post.url));
  expect(assess(p).resultGroup).toBe('Qualified');
 });
 it('keeps personal commercial activity separate from store identity',()=>{
  const p=profile();p.contentEvidence!.commercialActivity=true;expect(assess(p).resultGroup).toBe('Qualified');expect(assess(p).reasons).toContain('Commercial activity');
  p.contentEvidence!.entityType='Brand/Business';expect(assess(p).resultGroup).toBe('Excluded');
 });
 it('enforces audience independently and applies exclusion feedback before counting',()=>{
  const p=profile();p.followers=null;p.members=10000;expect(assess(p).resultGroup).toBe('Needs Verification');
  p.followers=999;expect(assess(p).resultGroup).toBe('Excluded');p.followers=1000;
  expect(assess(p,'badminton',[{account_key:`${p.platform}:${p.url}`,context_key:contextKey('badminton','Ho Chi Minh City'),reason:'Not Relevant'}]).resultGroup).toBe('Excluded');
 });
 for(const platform of ['Facebook','TikTok','Instagram'])for(const community of [false,true])it(`pilot fixture ${platform} ${community?'community':'KOL'}`,()=>{
  const p=profile(platform,community);expect(assessReviewedProfile(p,'badminton','Ho Chi Minh City',community?'Communities & Clubs':'Individual KOLs',{version:7,minFollowers:1000}).resultGroup).toBe('Qualified');
 });
 for(const platform of ['Facebook','TikTok'])it(`running fixture ${platform}`,()=>expect(assess(profile(platform,false,'running'),'running').resultGroup).toBe('Qualified'));
 it('retains author and caption when a provider row contains both profile metadata and a post',()=>{
  const p=resultIdentity({webVideoUrl:'https://tiktok.com/@alex/video/123',authorMeta:{name:'alex',fans:1000},text:'Training without profile keywords'},'TikTok')!;
  expect(p.posts).toHaveLength(1);expect(p.posts[0].caption).toContain('Training');
 });
});
describe('seed ingestion and trial preflight',()=>{
 it('parses compact historical values without inventing missing followers',()=>{
  expect(historicalFollowers('25K')).toBe(25000);expect(historicalFollowers('37,7k')).toBe(37700);expect(historicalFollowers(null)).toBeNull();expect(historicalFollowers('unknown')).toBeNull();
 });
 it('preserves duplicate sources and unresolved share links',()=>{
  const d=ingestSeedRows([['TIER 1'],['','Road','Alex','https://tiktok.com/@alex','25k'],['','Road','Alex','https://www.tiktok.com/@alex/','37,7k'],['','Trail','B','https://facebook.com/share/123']], 'Talent.xlsx','checksum','Talent Database');
  expect(d.profileRows).toBe(3);expect(d.records).toHaveLength(2);expect(d.records[0].sources).toHaveLength(2);expect(d.records[1].needsResolution).toBe(true);expect(()=>seedUrl('https://evil.com/alex')).toThrow();
 });
 it('blocks expired, unverified, exhausted and chargeable capabilities',()=>{
  const c={id:'cap',provider:'apify',operation:'discovery',platform:'Facebook',revision:'fixture',max_value_usd:0.1,verified:true,expires_at:new Date(Date.now()+60000).toISOString(),units_per_request:1,total_units:10,used_units:0,config:{trialOnly:true,billingDisabled:true,receiptUrl:'https://console.apify.com'}} as TrialCapability;
  expect(()=>assertTrial(c)).not.toThrow();
  for(const change of [{verified:false},{expires_at:'2020-01-01'},{used_units:10},{config:{trialOnly:true,billingDisabled:false}}])expect(()=>assertTrial({...c,...change})).toThrow();
 });
});

it('binds numeric Facebook authors only through observed profile account IDs',()=>{
 const p=experimentalApifyProfile({pageUrl:'https://facebook.com/alex',pageId:'123',current_city:'Lives in Ho Chi Minh City',categories:['Digital creator']},'Facebook')!;
 const raw={url:'https://facebook.com/alex/posts/1',user:{id:'123',profileUrl:'https://facebook.com/123'},text:'Badminton training'};
 expect(experimentalApifyPost(raw,p)?.authorUrl).toBe(p.url);expect(p.location).toContain('Ho Chi Minh City');
 expect(experimentalApifyPost({...raw,user:{id:'999',profileUrl:'https://facebook.com/999'}},p)?.authorUrl).not.toBe(p.url);
});
it('does not accept a generic product/event name as direct textual sport evidence',()=>{
 const p=profile();p.posts[0].caption='Gosen Award deadline';
 const e=validateContentEvidence({posts:[{url:p.posts[0].url,topic:true,excerpt:'Gosen Award deadline'}]},p,'badminton','fixture');
 expect(e.posts[0].topic).toBe(false);
});
it('extracts a Facebook search author from the observed numeric user ID, never the group or search URL',()=>{
 const p=resultIdentity({facebookUrl:'https://facebook.com/search/top?q=badminton',url:'https://facebook.com/groups/42/permalink/123',user:{id:'789',name:'Original author'},pageName:{id:'789',name:'Original author'},text:'Badminton training'},'Facebook')!;
 expect(p.url).toBe('https://facebook.com/789');expect(p.posts[0].authorUrl).toBe(p.url);expect(p.posts[0].url).toBe('https://facebook.com/groups/42/permalink/123');
});
it('keeps generic brand/product visuals unverified even when the model labels them badminton',()=>{
 const p=profile();p.posts[0].caption='Working on a deadline';
 const e=validateContentEvidence({posts:[{url:p.posts[0].url,topic:true,modality:'image',excerpt:'A man works at a desk with Gosen products and energy drinks'}]},p,'badminton','fixture',[p.posts[0].url]);
 expect(e.posts[0].topic).toBe(false);
});
it('keeps observed collaborator links as discovery candidates, never topic/type proof',()=>{
 const p=profile();
 const post=experimentalApifyPost({url:`${p.url}/posts/1`,authorUrl:p.url,text:'Training',collaborators:[{profileUrl:'https://facebook.com/collaborator'},{url:'https://evil.com/not-an-account'}]},p)!;
 expect(post.publicLinks).toEqual(['https://facebook.com/collaborator']);
 const linked=resultIdentity({profileUrl:post.publicLinks![0]},'Facebook')!;
 expect(assess(linked).resultGroup).toBe('Needs Verification');
});
it('prioritizes repeated distinct owned sport posts over a one-off mention',()=>{
 const repeated=profile(),one=profile();one.posts=one.posts.slice(0,1);one.contentEvidence=undefined;
 expect(candidatePriority(repeated,'badminton',[])).toBeGreaterThan(candidatePriority(one,'badminton',[]));
 const duplicate={...one,posts:[one.posts[0],one.posts[0],one.posts[0]]};
 expect(candidatePriority(duplicate,'badminton',[])).toBe(candidatePriority(one,'badminton',[]));
});

it('accepts a collected trusted role introduction but rejects model-invented role sources',async()=>{
 const {trustedRoleSource}=await import('./role-sources');
 const p=profile();p.posts=[];
 const introduction={...profile().posts[0],authorUrl:'https://facebook.com/federation',caption:'Badminton athlete Alex',publicLinks:[p.url],provenance:{runId:'observed-run',fetchedAt:'2026-10-12T00:00:00Z'}} as any;
 const source=trustedRoleSource(introduction,'badminton',['https://facebook.com/federation']);expect(source?.accountUrl).toBe(p.url);
 expect(trustedRoleSource(introduction,'badminton',[])).toBeNull();
 expect(trustedRoleSource({...introduction,publicLinks:[p.url,'https://facebook.com/other']},'badminton',['https://facebook.com/federation'])).toBeNull();
 p.contentEvidence=validateContentEvidence({entityType:'Individual',identityEvidence:[p.url],roleSources:[source]},p,'badminton','fixture');
 expect(p.contentEvidence.roleSources).toEqual([]);expect(assess(p).resultGroup).toBe('Needs Verification');
 p.trustedRoleSources=[source!];p.location='Ho Chi Minh City';
 p.contentEvidence=validateContentEvidence({entityType:'Individual',identityEvidence:[p.url]},p,'badminton','fixture');
 expect(assess(p).resultGroup).toBe('Qualified');
});
