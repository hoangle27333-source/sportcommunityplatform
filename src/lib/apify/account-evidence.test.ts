import { describe, expect, it } from 'vitest';
import { assessAccountEntity, assessAccountGeography, latestOwnedPosts, legacyEntityType } from './account-evidence';
import { parsePost, parseProfile } from './providers';
import { assessSearchProfile } from './search-assessment';
const profile=(values:Record<string,unknown>={})=>parseProfile({url:'https://instagram.com/alex',username:'alex',name:'Alex',bio:'Running athlete',location:'Hanoi',...values},'Instagram')!;
const post=(id:string,values:Record<string,unknown>={})=>parsePost({url:`https://instagram.com/p/${id}`,ownerUsername:'alex',caption:'Running today',timestamp:'2026-10-10',...values},'Instagram')!;
const options={version:5,geographyMode:'profile-or-recent-posts' as const};
describe('account taxonomy',()=>{
 it('maps legacy labels without inventing a club subtype',()=>{
  expect(['Club/Community','Community','Club'].map(legacyEntityType)).toEqual(['Community','Community','Community']);
  expect(legacyEntityType('Business')).toBe('Brand/Business');
  expect(legacyEntityType('Individual')).toBe('Individual');
  expect(legacyEntityType('Unclassified')).toBe('Unknown');
 });
 it('does not turn a person into a club from a bio mention or club-like name',()=>{
  expect(assessAccountEntity(profile({name:'Alex Running Club',category:'Athlete',bio:'Member of a running club'})).suggestedType).toBe('Individual');
 });
 it('requires organization evidence for club qualification',()=>{
  expect(assessAccountEntity(profile({name:'Saigon Running Club',bio:'Running Vietnam'}))).toMatchObject({suggestedType:'Club',status:'uncertain'});
  expect(assessAccountEntity(profile({name:'Saigon Running Club',bio:'Join us every Saturday. Running Vietnam'}))).toMatchObject({suggestedType:'Club',status:'supported'});
 });
 it('keeps groups as communities and identifies media',()=>{
  expect(assessAccountEntity(profile({name:'Runners',bio:'Running Vietnam',entityType:'group'})).suggestedType).toBe('Community');
  expect(assessAccountEntity(profile({name:'Running News',bio:''})).suggestedType).toBe('Media/Event');
 });
 it('prioritizes direct commerce but not a single sponsor post',()=>{
  expect(assessAccountEntity(profile({name:'Running Club',bio:'Book a session with our coaches'})).suggestedType).toBe('Brand/Business');
  const sponsored=profile();sponsored.posts=[post('1',{caption:'Sponsored. Buy now.'})];
  expect(assessAccountEntity(sponsored).suggestedType).toBe('Individual');
  sponsored.posts=[post('1',{caption:'Order now our running kit'}),post('2',{caption:'Buy now our running kit'})];
  expect(assessAccountEntity(sponsored).suggestedType).toBe('Brand/Business');
 });
 it('allows requested businesses in Scout but keeps the legacy classification',()=>{
  const result=assessSearchProfile(profile({name:'Running shop',bio:'Order now',location:'Hanoi'}),'Running','Hanoi','Individual KOLs',{...options,entityTypes:['Brand/Business']});
  expect(result).toMatchObject({classification:'Brand/Business',reviewState:'Matched',assessment:{entityType:{state:'passed'}}});
 });
});
describe('latest-10 geography',()=>{
 it('includes an account with a matching recent geotag despite a different profile address',()=>{
  const p=profile();p.posts=[post('1',{location:{name:'Saigon'}})];
  const result=assessSearchProfile(p,'Running','Ho Chi Minh City','Individual KOLs',options);
  expect(result).toMatchObject({reviewState:'Matched',locationMatch:true,verifiedGeography:'Ho Chi Minh City',geographyAssessment:{profileLocation:'Hanoi',coverage:{partial:true}}});
 });
 it('retains mentions for verification without treating them as residence',()=>{
  const p=profile();p.posts=[post('1',{caption:'Running #HCMC'})];
  expect(assessSearchProfile(p,'Running','Ho Chi Minh City','Individual KOLs',options)).toMatchObject({reviewState:'Needs Review',locationMatch:false,geographyAssessment:{mentionedMatch:true}});
 });
 it('does not use post geography in profile-only mode',()=>{
  const p=profile();p.posts=[post('1',{location:'HCMC'})];
  expect(assessAccountGeography(p,'Ho Chi Minh City','profile').state).not.toBe('passed');
 });
 it('sorts by publication date, dedupes, excludes reposts and wrong authors before taking ten',()=>{
  const p=profile();p.posts=Array.from({length:12},(_,i)=>post(String(i),{timestamp:`2026-10-${String(i+1).padStart(2,'0')}`}));
  p.posts.unshift(post('old-pin',{timestamp:'2020-01-01',location:'HCMC'}),post('repost',{isRepost:true,location:'HCMC'}),post('foreign',{ownerUsername:'other',location:'HCMC'}),p.posts[11]);
  expect(latestOwnedPosts(p)).toHaveLength(10);expect(latestOwnedPosts(p)[0].id).toBe(p.posts.find(p=>p.url.endsWith('/11'))?.id);
  expect(assessAccountGeography(p,'Ho Chi Minh City').state).not.toBe('passed');
 });
 it('preserves unresolved raw locations and missing timestamps',()=>{
  const p=profile();p.posts=[post('1',{timestamp:null,location:'Springfield'})];
  const geo=assessAccountGeography(p,'Vietnam');expect(geo.coverage).toMatchObject({collected:1,dated:0,partial:true});
  expect(geo.observations).toContainEqual(expect.objectContaining({raw:'Springfield',canonical:null,status:'unresolved'}));
 });
 it('keeps old assessment behavior when the policy version is absent',()=>{
  const p=profile();p.posts=[post('1',{location:'HCMC'})];
  expect(assessSearchProfile(p,'Running','Ho Chi Minh City','Individual KOLs').reviewState).toBe('Excluded');
 });
});
