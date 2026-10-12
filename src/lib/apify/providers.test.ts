import { beforeEach, describe, expect, it, vi } from 'vitest';
const run = vi.hoisted(()=>vi.fn());
const receipt=vi.hoisted(()=>({verified:true,build:'0.0.612',receipt:{supportsDateFilter:false}}));
vi.mock('@/lib/supabase/admin',()=>({createAdminClient:()=>({from:()=>({select:()=>({eq:()=>({maybeSingle:async()=>({data:receipt,error:null})})}),update:()=>({eq:async()=>({error:null})})})})}));
vi.mock('./runtime',()=>({executePlan:run,capabilityKey:()=> 'fixture'}));
import { scrape, PendingScout, ScoutError, parseProfile } from './providers';
beforeEach(()=>{process.env.APIFY_TOKEN='test-token';run.mockReset();receipt.verified=true;receipt.receipt.supportsDateFilter=false;});
describe('Provider planning and dispatch',()=>{
 it('dispatches separate Facebook profile and page inputs',async()=>{run.mockResolvedValue([]);await scrape('s','Facebook','profiles','run',5,'Hanoi');expect(run).toHaveBeenCalledTimes(2);expect(run.mock.calls.map(c=>c[3].input.searchType)).toEqual(['profiles','pages']);expect(run.mock.calls.every(c=>c[3].input.locations.length===0)).toBe(true);});
 it('omits Actor date filters until their capability is verified',async()=>{run.mockResolvedValue([]);await scrape('s','Instagram','profile-posts','https://instagram.com/nike',1,'',{newerThan:'2026-10-01'});expect(run.mock.calls[0][3].input.onlyPostsNewerThan).toBeUndefined();});
 it('uses verified date filters and rejects an unverified receipt',async()=>{run.mockResolvedValue([]);receipt.receipt.supportsDateFilter=true;await scrape('s','Instagram','profile-posts','https://instagram.com/nike',1,'',{newerThan:'2026-10-01'});expect(run.mock.calls[0][3].input.onlyPostsNewerThan).toBe('2026-10-01');receipt.verified=false;await scrape('s','Instagram','profile-posts','https://instagram.com/nike',1,'',{newerThan:'2026-10-01'});expect(run.mock.calls[1][3].input.onlyPostsNewerThan).toBeUndefined();});
 it('preserves pending semantics',async()=>{run.mockRejectedValue(new PendingScout());await expect(scrape('s','Instagram','profiles','run',1)).rejects.toBeInstanceOf(PendingScout);});
 it('does not dispatch when token is absent',async()=>{delete process.env.APIFY_TOKEN;await expect(scrape('s','Instagram','profiles','run',1)).rejects.toMatchObject({code:'NOT_CONFIGURED'});expect(run).not.toHaveBeenCalled();});
});

describe('Facebook details fields',()=>{
 it('parses the documented page identity and audience fields',()=>{expect(parseProfile({pageUrl:'https://facebook.com/nike',pageName:'nike',title:'Nike',intro:'Sports',followers:39000000},'Facebook')).toMatchObject({url:'https://facebook.com/nike',username:'nike',name:'Nike',bio:'Sports',followers:39000000});});
 it('preserves observed zero and never substitutes likes',()=>{expect(parseProfile({pageUrl:'https://facebook.com/nike',followers:0,likes:500},'Facebook')?.followers).toBe(0);expect(parseProfile({pageUrl:'https://facebook.com/nike',likes:500},'Facebook')?.followers).toBeNull();});
});


describe('Facebook community branch coverage',()=>{
 it.each(['pages','groups'])('returns the available source when %s fails',async(failed)=>{
  run.mockImplementation(async(_session,_platform,_task,plan)=>{
   if((failed==='pages' && plan.input.searchType==='pages') || (failed==='groups' && plan.actor.includes('groups-search'))) throw new ScoutError('Unverified source','CAPABILITY_UNVERIFIED',503);
   return [{url:'https://facebook.com/groups/123',name:'Running community'}];
  });
  const rows=await scrape('s','Facebook','communities','running',5);
  expect(rows).toHaveLength(1);expect(rows[0]._provenance.warnings[0]).toContain('partial');expect(run).toHaveBeenCalledTimes(2);
 });
 it('keeps provider-start uncertainty fail-closed even when another source has results',async()=>{
  run.mockImplementation(async(_s,_p,_t,plan)=>{if(plan.actor.includes('groups-search'))throw new ScoutError('Unconfirmed paid start','START_UNKNOWN',409);return [{url:'https://facebook.com/club'}];});
  await expect(scrape('s','Facebook','communities','running',5)).rejects.toMatchObject({code:'START_UNKNOWN'});
 });
});

it('replays saved evidence with no token and no provider execution',async()=>{
 const {withStoredEvidence}=await import('./stored-evidence');delete process.env.APIFY_TOKEN;
 const rows=await withStoredEvidence([{platform:'Facebook',task:'profiles',state:'succeeded',normalized_rows:[{url:'https://facebook.com/runner',name:'Runner'}]}],()=>scrape('child','Facebook','profiles','Running',5,'Hanoi'));
 expect(rows).toHaveLength(1);expect(run).not.toHaveBeenCalled();
});
it('uses explicitly chosen keyword variants without appending geography',async()=>{
 run.mockResolvedValue([]);await scrape('s','Facebook','profiles','Running',5,'Hanoi',{queryVariants:['Runner','Chạy bộ']});
 for(const call of run.mock.calls){expect(call[3].input.categories).toEqual(['Running','Runner','Chạy bộ']);expect(call[3].input.locations).toEqual([]);}
});

it('keeps new TikTok filters disabled without a pinned verified options receipt',async()=>{
 run.mockResolvedValue([]);
 await scrape('s','TikTok','keyword','running Vietnam',5,'Vietnam',{qualityMode:'high-engagement',recentDays:14});
 expect(run.mock.calls[0][3].input).not.toHaveProperty('videoSearchSorting');
 expect(run.mock.calls[0][3].input).not.toHaveProperty('videoSearchDateFilter');
});
it('splits a bounded Facebook search quota across actor branches rather than doubling it',async()=>{
 run.mockResolvedValue([]);await scrape('s','Facebook','profiles','running coach Vietnam',5,'Vietnam',{boundedSearch:true});
 expect(run.mock.calls.map(c=>c[3].input.resultsLimit)).toEqual([3,2]);
});

it('applies TikTok sorting and covering dates only for the reviewed pinned capability',async()=>{
 run.mockResolvedValue([]);
 const searchPlan={keys:['fixture'],builds:{fixture:'0.0.612'},options:{fixture:{tiktokVideoFilters:true}}};
 await scrape('s','TikTok','keyword','chạy bộ Vietnam',5,'Vietnam',{searchPlan,qualityMode:'high-engagement',recentDays:14});
 expect(run.mock.calls[0][3].input).toMatchObject({searchSection:'/video',videoSearchSorting:'MOST_LIKED',videoSearchDateFilter:'PAST_MONTH'});
 receipt.build='0.0.613';await expect(scrape('s','TikTok','keyword','running',5,'Vietnam',{searchPlan})).rejects.toMatchObject({code:'PLAN_STALE'});receipt.build='0.0.612';
});
