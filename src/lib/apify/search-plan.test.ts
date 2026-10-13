import {afterEach,beforeEach,expect,it,vi} from 'vitest';
const state=vi.hoisted(()=>({policy:4,accountPolicy:5,receipts:[] as any[],budget:{enabled:true,session_usd:1,daily_usd:5,run_usd:.25,tiktok_run_usd:.5}}));
vi.mock('@/lib/supabase/admin',()=>({createAdminClient:()=>({rpc:async(name:string)=>({data:name==='scout_account_policy_version'?state.accountPolicy:state.policy,error:null}),from:(table:string)=>{const result={data:table==='scout_budget_settings'?state.budget:state.receipts,error:null};const q:any={select:()=>q,limit:()=>q,single:async()=>result,then:(resolve:any)=>Promise.resolve(result).then(resolve)};return q;}})}));
import {buildSearchPlan,suggestedQueries} from './search-plan';
const params={keyword:'Running',targetType:'Individual KOLs',platform:'Facebook',geography:'Vietnam',limit:5,searchMode:'keyword',qualityMode:'high-engagement',recentDays:7,minInteractions:100,minViews:10000};
it('hashes minimum followers and labels it as local verification without invented actor filters',async()=>{
 const base=await buildSearchPlan('preview',{...params,accountPolicyVersion:5});
 const p=await buildSearchPlan('preview',{...params,accountPolicyVersion:5,minFollowers:1000});
 expect(p.hash).not.toBe(base.hash);expect(p.criteria.minFollowers).toBe(1000);
 expect(p.appliedFilters).toContainEqual(expect.objectContaining({setting:'Followers range',mode:'Local verification'}));
 expect(p.sources).toEqual(base.sources);
});
beforeEach(()=>{state.policy=4;state.receipts=['profiles','pages'].map(searchType=>({capability_key:`apify~facebook-search-scraper:profiles:${searchType}`,verified:true,build:'0.0.333',receipt:{}}));});
it('scopes HYROX primary and supplementary retrieval by role and city',()=>{
 const people=suggestedQueries('HYROX','Individual KOLs','preview','Ho Chi Minh City');
 expect(people[0]).toBe('HYROX Ho Chi Minh City athlete');expect(people.every(q=>q.includes('Ho Chi Minh City'))).toBe(true);
 const clubs=suggestedQueries('HYROX','Communities & Clubs','preview','Ho Chi Minh City');expect(clubs[0]).toContain('club');expect(clubs).not.toEqual(people);
 expect(suggestedQueries('Pickleball Vietnam','Individual KOLs','preview','Vietnam')[0]).toBe('Pickleball Vietnam athlete');
});
it('creates stable v5 plans for every new account search and rejects excessive budgets',async()=>{
 const first=await buildSearchPlan('preview',params);const second=await buildSearchPlan('preview',params);
 expect(first.hash).toBe(second.hash);expect(first.version).toBe(5);expect(first.maxSessionUsd).toBe(1);expect(first.rounds[0].queries).toEqual(['Running Vietnam']);
 expect(first.rounds[1].queries).toEqual(['Running']);
 await expect(buildSearchPlan('preview',{...params,maxSessionUsd:2})).rejects.toMatchObject({code:'BUDGET_ABOVE_POLICY'});
 expect((await buildSearchPlan('preview',{...params,geography:'Hanoi'})).hash).not.toBe(first.hash);
 expect(suggestedQueries('Running','Communities & Clubs','preview','Vietnam')[0]).toContain('club');
});
it('never assumes optional filters are verified just because the actor has a receipt',async()=>{
 const first=await buildSearchPlan('preview',params);expect(Object.values(first.sources[0].options)).toEqual([{},{}]);
 state.receipts[0].receipt.verifiedSearchOptions={facebookLocations:true};
 expect((await buildSearchPlan('preview',params)).hash).not.toBe(first.hash);
});
it('requires budget migration and an immutable verified build',async()=>{
 state.policy=3;await expect(buildSearchPlan('preview',params)).rejects.toMatchObject({code:'SEARCH_POLICY_UNAVAILABLE'});
 state.policy=4;state.receipts.forEach(r=>r.build='latest');await expect(buildSearchPlan('preview',params)).rejects.toMatchObject({code:'CAPABILITY_UNVERIFIED'});
});
it('keeps exact hashtags to a single unchanged query',async()=>{
 state.receipts=[{capability_key:'apify~facebook-search-scraper:hashtag:posts',verified:true,build:'0.0.333',receipt:{}}];
 const plan=await buildSearchPlan('trends',{...params,keyword:'#running',searchMode:'hashtag'});
 expect(plan.rounds.flatMap(r=>r.queries)).toEqual(['#running']);
});

it('v5 exposes collection settings, neutral people queries and a broader final round',async()=>{
 const p=await buildSearchPlan('preview',{...params,accountPolicyVersion:5,geographyMode:'profile-or-recent-posts',entityTypes:['Individual']});
 expect(p.accountPolicyVersion).toBe(5);expect(p.maxPostsPerProfile).toBe(10);expect(p.modelRevision).toBe('rules-5');
 expect(p.sources[0].rounds?.[0].queries[0]).toBe('Running Vietnam');
 expect(p.sources[0].rounds?.flatMap(r=>r.queries)).toContain('Running');
 expect(p.appliedFilters?.some(f=>f.setting==='Recent locations' && f.mode==='Local verification')).toBe(true);
 const other=await buildSearchPlan('preview',{...params,accountPolicyVersion:5,entityTypes:['Brand/Business']});expect(other.hash).not.toBe(p.hash);expect(other.rounds[0].queries[0]).toContain('shop');
});
it('v5 fails before collection if its additive migration is missing',async()=>{
 state.accountPolicy=4;await expect(buildSearchPlan('preview',{...params,accountPolicyVersion:5})).rejects.toMatchObject({code:'ACCOUNT_POLICY_UNAVAILABLE'});state.accountPolicy=5;
});

afterEach(()=>{delete process.env.SCOUT_ACCOUNT_MODEL_MODE;delete process.env.SCOUT_ACCOUNT_MODEL_REVISION;});
it('hashes model mode and revision into account approval while trend plans stay unchanged',async()=>{
 state.receipts.push({capability_key:'apify~facebook-search-scraper:hashtag:posts',verified:true,build:'0.0.333',receipt:{}});
 const criteria={...params,accountPolicyVersion:5};const off=await buildSearchPlan('preview',criteria);const legacy=await buildSearchPlan('trends',{...params,searchMode:'hashtag'});
 process.env.SCOUT_ACCOUNT_MODEL_MODE='shadow';process.env.SCOUT_ACCOUNT_MODEL_REVISION='model-1';
 const shadow=await buildSearchPlan('preview',criteria);expect(shadow.modelMode).toBe('shadow');expect(shadow.hash).not.toBe(off.hash);expect((await buildSearchPlan('trends',{...params,searchMode:'hashtag'})).hash).toBe(legacy.hash);
 process.env.SCOUT_ACCOUNT_MODEL_MODE='active';expect((await buildSearchPlan('preview',criteria)).hash).not.toBe(shadow.hash);
});
it('plans four account rounds with adaptive quotas and verified author-only fallback',async()=>{
 state.receipts=['keyword','profile-details'].map(task=>({capability_key:`clockworks~tiktok-scraper:${task}:default`,verified:true,build:'pinned',receipt:{}}));
 const p=await buildSearchPlan('preview',{...params,platform:'TikTok',accountPolicyVersion:5,limit:50,maxFollowers:1000});
 expect(p).toMatchObject({version:5,maxSearchRows:600,maxHydratedProfiles:100,criteria:{assessmentRevision:6,maxFollowers:1000}});
 expect(p.sources[0].keys).toEqual([]);expect(p.sources[0].rounds?.[2]).toMatchObject({task:'keyword',queries:['Running Vietnam']});
 expect(p.rounds).toHaveLength(4);
 await expect(buildSearchPlan('preview',{...params,accountPolicyVersion:5,maxSessionUsd:2})).rejects.toMatchObject({code:'BUDGET_ABOVE_POLICY'});
});

it('hashes top ranking, thresholds and both dates and declares bounded native sorting',async()=>{
 state.receipts=[{capability_key:'clockworks~tiktok-scraper:keyword:default',verified:true,build:'0.0.612',receipt:{verifiedSearchOptions:{tiktokVideoFilters:true}}}];
 const criteria={...params,platform:'TikTok',selectionMode:'top',rankingMode:'views-first',thresholdsEnabled:false,publishedFrom:'2026-10-01T00:00:00.000Z',publishedTo:'2026-10-08T00:00:00.000Z'};
 const top=await buildSearchPlan('trends',criteria);expect(top.maxSearchRows).toBe(60);
 expect(top.sources[0].rounds?.map(r=>r.sorting)).toEqual(['MOST_LIKED','MOST_RELEVANT','MOST_LIKED','MOST_RELEVANT']);
 for(const change of [{publishedFrom:'2026-10-02T00:00:00.000Z'},{publishedTo:'2026-10-09T00:00:00.000Z'},{thresholdsEnabled:true}])expect((await buildSearchPlan('trends',{...criteria,...change})).hash).not.toBe(top.hash);
 state.receipts[0].receipt.verifiedSearchOptions.tiktokVideoSortings=['MOST_LIKED','MOST_RELEVANT','LATEST'];
 expect((await buildSearchPlan('trends',criteria)).sources[0].rounds?.[2].sorting).toBe('LATEST');
});
