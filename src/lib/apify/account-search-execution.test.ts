import {beforeEach,expect,it,vi} from 'vitest';
const state=vi.hoisted(()=>({scrape:vi.fn(),checkpoints:new Map<string,any>(),existing:[] as any[]}));
vi.mock('./providers',async()=>({...await vi.importActual<any>('./providers'),scrape:state.scrape}));
vi.mock('./task-checkpoint',()=>({checkpointTask:async(_id:string,key:string,work:any)=>{if(state.checkpoints.has(key))return state.checkpoints.get(key);const value=await work();state.checkpoints.set(key,value);return value;}}));
vi.mock('@/lib/supabase/admin',()=>({createAdminClient:()=>({from:()=>({select:()=>({in:async()=>({data:state.existing,error:null})})})})}));
import {collectPlannedSearch} from './planned-search';
import {providerPlans} from './providers';
import {capabilityKey} from './runtime';
import type {SearchPlan} from './search-plan';
function source(platform='TikTok') {
 const tasks=['profiles','keyword','profile-details','profile-posts'] as const;
 const url=platform==='TikTok'?'https://tiktok.com/@test':'https://facebook.com/test';
 const builds=Object.fromEntries(tasks.flatMap(task=>providerPlans(platform,task,task.startsWith('profile-')?url:'Running',1).map(p=>[capabilityKey(p,task),'pinned'])));
 return {platform,task:'profiles' as const,keys:providerPlans(platform,'profiles','Running',1).map(p=>capabilityKey(p,'profiles')),builds,options:{},authorSearch:true,warnings:[],rounds:[{task:'profiles' as const,queries:['Running Hanoi']},{task:'profiles' as const,queries:['Running']},{task:'keyword' as const,queries:['Running']},{task:'profiles' as const,queries:['chạy bộ']}]};
}
function plan(sources=[source()]):SearchPlan {
 return {version:5,hash:'hash',kind:'preview',accountPolicyVersion:5,modelRevision:'rules-5',modelMode:'off',criteria:{assessmentRevision:6,keyword:'Running',geography:'Any location',targetType:'Individual KOLs',limit:1,minFollowers:100,maxFollowers:1000},maxSessionUsd:1,maxSearchRows:120,maxHydratedProfiles:10,maxPostsPerProfile:10,sources,rounds:['Scoped','Broad','Authors','Additional'].map(label=>({label,queries:[]}))};
}
const profile=(url:string,bio='Running athlete',followers:number|null=500)=>({url,name:'Alex',bio,category:'Athlete',followers});
const params=(p:SearchPlan)=>({...p.criteria,sessionId:'session',searchPlan:p});
beforeEach(()=>{state.scrape.mockReset();state.checkpoints.clear();state.existing=[];});
it('stops at qualified new accounts without unnecessary details or posts and replays without provider starts',async()=>{
 state.scrape.mockResolvedValue([profile('https://tiktok.com/@alex')]);
 const p=plan();const first=await collectPlannedSearch(params(p),new Set());
 expect(first.stopReason).toBe('target-reached');expect(first.hydratedProfiles).toBe(0);expect(state.scrape).toHaveBeenCalledTimes(1);
 await collectPlannedSearch(params(p),new Set());expect(state.scrape).toHaveBeenCalledTimes(1);
});
it('finds a creator from topic posts when profile search returns nothing',async()=>{
 state.scrape.mockImplementation(async(_id,platform,task,query)=>task==='keyword'?[{webVideoUrl:'https://tiktok.com/@alex/video/1',authorMeta:{name:'alex'},text:'Chạy bộ'}]:task==='profile-details'?[profile(query)]:[]);
 const result=await collectPlannedSearch(params(plan()),new Set());
 expect(result.stopReason).toBe('target-reached');expect(result.profiles.TikTok[0].url).toBe('https://tiktok.com/@alex');
 expect(state.scrape.mock.calls.some(c=>c[2]==='profile-details')).toBe(true);
 expect(state.scrape.mock.calls.some(c=>c[2]==='profile-posts')).toBe(false);
});
it('preserves capacity for later candidates and does not enrich known out-of-range observations',async()=>{
 let searches=0;state.scrape.mockImplementation(async(_id,platform,task,query)=>task==='profiles'?++searches===1?Array.from({length:20},(_,i)=>profile(`https://tiktok.com/@weak${i}`,'Running athlete',99)):[profile('https://tiktok.com/@good','',null)]:task==='profile-details'?[profile(query)]:[]);
 const result=await collectPlannedSearch(params(plan()),new Set());
 expect(result.stopReason).toBe('target-reached');expect(state.scrape.mock.calls.filter(c=>c[2]==='profile-details').map(c=>c[3])).toEqual(['https://tiktok.com/@good']);
});
it('shares hydration between platforms rather than consuming it all on the first source',async()=>{
 const p=plan([source('Facebook'),source()]);p.criteria.limit=50;p.maxHydratedProfiles=10;
 state.scrape.mockImplementation(async(_id,platform,task,query)=>task==='profiles'?Array.from({length:20},(_,i)=>profile(platform==='TikTok'?`https://tiktok.com/@weak${i}`:`https://facebook.com/weak${i}`,'',null)):task==='profile-details'?[profile(query,'',null)]:[]);
 const result=await collectPlannedSearch(params(p),new Set());
 const calls=state.scrape.mock.calls.filter(c=>c[2]==='profile-details');
 expect(calls.slice(0,2).map(c=>c[1])).toEqual(['Facebook','TikTok']);expect(result.hydratedProfiles).toBeLessThanOrEqual(10);
});
it('retains richer evidence across duplicate observations and excludes existing or team-rejected matches from the target',async()=>{
 state.scrape.mockResolvedValue([profile('https://tiktok.com/@alex')]);
 const feedback=[{account_key:'TikTok:https://tiktok.com/@alex',context_key:'running|any location',reason:'Not Relevant'}];
 const existing=new Set(['TikTok:https://tiktok.com/@alex']);
 const result=await collectPlannedSearch(params(plan()),existing,feedback);
 expect(result.stopReason).toBe('no-new-identities');expect(result.rounds.every(r=>r.qualifiedNew===0)).toBe(true);
});
it('applies reviewed entity corrections when deciding that the target is reached',async()=>{
 state.scrape.mockResolvedValue([profile('https://tiktok.com/@alex','Running',500)]);
 const feedback=[{account_key:'TikTok:https://tiktok.com/@alex',classification:'Brand/Business',entity_type:'Brand/Business',reason:'Wrong Entity Type'}];
 const result=await collectPlannedSearch(params(plan()),new Set(),feedback);
 expect(result.stopReason).not.toBe('target-reached');expect(result.hydratedProfiles).toBe(0);
});
it('retains successful evidence on budget exhaustion and propagates stale builds',async()=>{
 let calls=0;state.scrape.mockImplementation(async(_id,platform,task)=>{if(++calls===1)return [profile('https://tiktok.com/@alex')];throw Object.assign(new Error('Budget reached'),{code:'BUDGET_EXHAUSTED'});});
 const p=plan();p.criteria.limit=5;const result=await collectPlannedSearch(params(p),new Set());
 expect(result.stopReason).toBe('budget-exhausted');expect(result.profiles.TikTok).toHaveLength(1);
 state.checkpoints.clear();state.scrape.mockRejectedValue(Object.assign(new Error('Changed build'),{code:'PLAN_STALE'}));
 await expect(collectPlannedSearch(params(p),new Set())).rejects.toMatchObject({code:'PLAN_STALE'});
});

it('does not fetch posts merely because an audience count is unknown',async()=>{
 state.scrape.mockImplementation(async(_id,platform,task,query)=>task==='profiles'?[profile('https://tiktok.com/@alex','Running athlete',null)]:task==='profile-details'?[profile(query,'Running athlete',null)]:[]);
 const result=await collectPlannedSearch(params(plan()),new Set());
 expect(result.stopReason).not.toBe('target-reached');expect(state.scrape.mock.calls.some(c=>c[2]==='profile-details')).toBe(true);expect(state.scrape.mock.calls.some(c=>c[2]==='profile-posts')).toBe(false);
});

it('prioritizes supported local creators over ambiguous topic-only accounts',async()=>{
 const p=plan();p.criteria.geography='Ho Chi Minh City';
 state.scrape.mockImplementation(async(_id,platform,task,query)=>task==='profiles'?[{...profile('https://tiktok.com/@global','Badminton',500),category:''},{...profile('https://tiktok.com/@coach','Running coach Ho Chi Minh City',500),category:'Coach'}]:task==='profile-details'?[{...profile(query,'Running coach Ho Chi Minh City',500),location:'Ho Chi Minh City'}]:[]);
 const result=await collectPlannedSearch(params(p),new Set());
 expect(state.scrape.mock.calls.find(c=>c[2]==='profile-details')?.[3]).toBe('https://tiktok.com/@coach');expect(result.stopReason).toBe('target-reached');
});
