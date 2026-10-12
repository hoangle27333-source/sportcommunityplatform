import {beforeEach,expect,it,vi} from 'vitest';
const state=vi.hoisted(()=>({scrape:vi.fn(),checkpoints:new Map<string,any>()}));
vi.mock('./providers',async()=>({...await vi.importActual<any>('./providers'),scrape:state.scrape}));
vi.mock('./session-snapshot',()=>({sessionSnapshot:async()=> '2026-10-11T00:00:00.000Z'}));
vi.mock('./task-checkpoint',()=>({checkpointTask:async(_id:string,key:string,work:any)=>{if(state.checkpoints.has(key))return state.checkpoints.get(key);const value=await work();state.checkpoints.set(key,value);return value;}}));
vi.mock('@/lib/supabase/admin',()=>({createAdminClient:()=>({from:()=>({select:()=>({in:async()=>({data:[],error:null})})})})}));
import {collectPlannedSearch} from './planned-search';
import type {SearchPlan} from './search-plan';
const keys=['clockworks~tiktok-scraper:keyword:default','clockworks~tiktok-scraper:profiles:default','clockworks~tiktok-scraper:profile-details:default','clockworks~tiktok-scraper:profile-posts:default'];
const plan:SearchPlan={hash:'x',version:4,kind:'trends',criteria:{searchMode:'keyword'},maxSessionUsd:1,maxSearchRows:120,maxHydratedProfiles:10,maxPostsPerProfile:5,rounds:[{label:'Primary',queries:['running Vietnam']},{label:'More',queries:['Chạy bộ','Marathon']},{label:'Evidence',queries:['Runner']}],sources:[{platform:'TikTok',task:'keyword',keys:[keys[0]],builds:Object.fromEntries(keys.map(k=>[k,'0.0.612'])),options:{},authorSearch:true,warnings:[]}]};
const params={searchPlan:plan,keyword:'Running',geography:'Vietnam',platform:'TikTok',sessionId:'s',qualityMode:'high-engagement',searchMode:'keyword',limit:1};
const post=(id:string)=>({webVideoUrl:`https://tiktok.com/@runner/video/${id}`,authorMeta:{name:'runner'},text:'Chạy bộ Hanoi',createTimeISO:'2026-10-10',diggCount:100,commentCount:0});
beforeEach(()=>{state.scrape.mockReset();state.checkpoints.clear();});
it('stops when qualified new target is reached and reuses round checkpoints after reload',async()=>{
 state.scrape.mockResolvedValue([post('1')]);const first=await collectPlannedSearch(params,new Set());
 expect(first.stopReason).toBe('target-reached');expect(first.rounds).toHaveLength(1);expect(state.scrape).toHaveBeenCalledTimes(1);
 await collectPlannedSearch(params,new Set());expect(state.scrape).toHaveBeenCalledTimes(1);
});
it('does not count existing qualified records as new value and stops after two duplicate-only rounds',async()=>{
 state.scrape.mockResolvedValue([post('1')]);const result=await collectPlannedSearch(params,new Set(['TikTok:https://tiktok.com/@runner/video/1']));
 expect(result.stopReason).toBe('no-new-identities');expect(result.uniqueCount).toBe(1);expect(result.duplicateCount).toBe(3);expect(result.requestedRows).toBeLessThanOrEqual(120);
});
it('retains successful evidence if a later query exhausts the reviewed budget',async()=>{
 state.scrape.mockResolvedValueOnce([post('1')]).mockRejectedValue(Object.assign(new Error('Budget exhausted'),{code:'BUDGET_EXHAUSTED'}));
 const result=await collectPlannedSearch({...params,limit:5},new Set());expect(result.stopReason).toBe('budget-exhausted');expect(result.rows.TikTok).toHaveLength(1);
});
it('limits hydration to ten profiles and preserves richer evidence for the correct identity',async()=>{
 const profilePlan={...plan,kind:'preview' as const,sources:[{...plan.sources[0],task:'profiles' as const,keys:[keys[1]]}]};
 state.scrape.mockImplementation(async(_id,platform,task,query,limit)=>task==='profiles'?Array.from({length:20},(_,i)=>({profileUrl:`https://tiktok.com/@runner${i}`,name:`Runner ${i}`})):task==='profile-details'?[{profileUrl:query,name:'Runner',bio:'Running coach Hanoi',followers:0}]:[]);
 const result=await collectPlannedSearch({...params,searchPlan:profilePlan,targetType:'Individual KOLs',limit:20},new Set());
 expect(result.hydratedProfiles).toBe(10);expect(result.profiles.TikTok.filter(p=>p.bio).length).toBe(10);expect(result.requestedRows).toBeLessThanOrEqual(120);
});
it('does not hide an all-source failure as a successful empty result',async()=>{
 state.scrape.mockRejectedValue(Object.assign(new Error('Actor unavailable'),{code:'CAPABILITY_UNVERIFIED'}));
 await expect(collectPlannedSearch(params,new Set())).rejects.toMatchObject({code:'SEARCH_FAILED'});
});

it('replay keeps the original existing-record snapshot even if its own posts were saved before a retry',async()=>{
 state.scrape.mockResolvedValue([post('1')]);await collectPlannedSearch(params,new Set());
 const afterOwnSave=new Set(['TikTok:https://tiktok.com/@runner/video/1']);
 const replay=await collectPlannedSearch(params,afterOwnSave);
 expect(replay.stopReason).toBe('target-reached');expect(replay.rounds).toHaveLength(1);expect(state.scrape).toHaveBeenCalledTimes(1);
});

it('v5 enriches a wrong-profile-city account and fetches latest ten without topic/date filters',async()=>{
 const p:SearchPlan={...plan,kind:'preview',accountPolicyVersion:5,modelRevision:'rules-5',maxPostsPerProfile:10,criteria:{entityTypes:['Individual'],geographyMode:'profile-or-recent-posts'},sources:[{...plan.sources[0],task:'profiles',keys:[keys[1]]}]};
 state.scrape.mockImplementation(async(_id,platform,task,query)=>task==='profiles'?[{profileUrl:'https://tiktok.com/@runner',name:'Running Coach',bio:'Running athlete',location:'Hanoi'}]:task==='profile-details'?[{profileUrl:query,name:'Running Coach',bio:'Running athlete',location:'Hanoi'}]:task==='profile-posts'?[{...post('1'),locationMeta:{city:'HCMC'}}]:[]);
 const result=await collectPlannedSearch({...params,searchPlan:p,targetType:'Individual KOLs',geography:'Ho Chi Minh City'},new Set());
 expect(result.stopReason).toBe('target-reached');const call=state.scrape.mock.calls.find(call=>call[2]==='profile-posts');
 expect(call?.[4]).toBe(10);expect(call?.[6]).toMatchObject({latestSample:true});expect(call?.[6].newerThan).toBeUndefined();
 expect(result.profiles.TikTok[0].posts).toHaveLength(1);
});

it('v5 samples verified group-post capability without treating member posts as group location',async()=>{
 const groupKey='apify~facebook-groups-scraper:profile-posts:default';
 const source={platform:'Facebook',task:'communities' as const,keys:['search'],builds:{search:'build-1',[groupKey]:'build-1'},options:{},authorSearch:false,warnings:[]};
 const p:SearchPlan={...plan,kind:'preview',accountPolicyVersion:5,modelRevision:'rules-5',maxPostsPerProfile:10,criteria:{entityTypes:['Community'],geographyMode:'profile-or-recent-posts'},sources:[source],rounds:[plan.rounds[0]]};
 state.scrape.mockImplementation(async(_id,platform,task)=>task==='communities'?[{url:'https://facebook.com/groups/runners',name:'Running Community',description:'Running community',entityType:'group',location:'Hanoi'}]:[{url:'https://facebook.com/member/posts/1',user:{url:'https://facebook.com/member'},text:'Running HCMC',time:'2026-10-10',location:'HCMC'}]);
 const result=await collectPlannedSearch({...params,platform:'Facebook',searchPlan:p,targetType:'Communities & Clubs',geography:'Ho Chi Minh City'},new Set());
 expect(state.scrape.mock.calls.some(call=>call[2]==='profile-posts')).toBe(true);
 expect(result.profiles.Facebook[0].posts).toHaveLength(0);
 expect(result.stopReason).not.toBe('target-reached');
});
it('rejects a stale inference policy before any provider start',async()=>{
 const p:SearchPlan={...plan,kind:'preview',accountPolicyVersion:5,modelRevision:'rules-5',modelMode:'shadow'};
 await expect(collectPlannedSearch({...params,searchPlan:p},new Set())).rejects.toMatchObject({code:'MODEL_POLICY_STALE'});
 expect(state.scrape).not.toHaveBeenCalled();
});
