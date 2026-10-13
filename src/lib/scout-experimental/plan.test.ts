import { beforeEach,afterEach,it,expect,vi } from 'vitest';
const state=vi.hoisted(()=>({caps:[] as any[],verified:[] as any[],records:[] as any[]}));
vi.mock('../supabase/admin',()=>({createAdminClient:()=>({from:(table:string)=>{
 const data=table==='scout_budget_settings'?{enabled:true,session_usd:1,daily_usd:10}:table==='scout_trial_capabilities'?state.caps:table==='scout_provider_capabilities'?state.verified:state.records;
 const q:any={select:()=>q,eq:()=>q,single:async()=>({data,error:null}),then:(resolve:any)=>Promise.resolve({data,error:null}).then(resolve)};return q;
}})}));
import { buildExperimentalPlan,keywordSuggestions } from './plan';
const params={searchStrategy:'seed_content_v1',keyword:'badminton',platform:['Facebook'],targetType:'Individual KOLs',geography:'Ho Chi Minh City',limit:5,minFollowers:1000,keywordsApproved:true,approvedKeywords:['badminton'],seedUrls:[],providerSelection:{discovery:'apify',profile:'apify',posts:'apify'}};
const keys={discovery:['apify~facebook-search-scraper:keyword:posts','apify~facebook-search-scraper:profiles:profiles'],profile:['apify~facebook-pages-scraper:profile-details:default'],posts:['apify~facebook-posts-scraper:profile-posts:default']};
beforeEach(()=>{
 vi.stubEnv('APIFY_TOKEN','fixture');vi.stubEnv('GEMINI_API_KEY','fixture');
 state.verified=Object.values(keys).flat().map(capability_key=>({capability_key,build:'fixture-build',verified:true}));
 state.records=[];
 state.caps=['discovery','profile','posts','analysis'].map(operation=>({id:operation,provider:operation==='analysis'?'gemini':'apify',operation,platform:'Facebook',revision:'fixture',verified:true,expires_at:'2099-01-01',total_units:100,used_units:0,units_per_request:1,max_value_usd:.01,config:{trialOnly:true,billingDisabled:true,receiptUrl:'https://example.com/verified',builds:Object.fromEntries((keys[operation as keyof typeof keys] || []).map(key=>[key,'fixture-build'])),model:operation==='analysis'?'gemini-2.5-flash-lite':undefined}}));
});
afterEach(()=>vi.unstubAllEnvs());
it('plans content authors even with one approved keyword and no paid requests',async()=>{
 const plan=await buildExperimentalPlan(params);
 expect(plan.version).toBe(6);expect(plan.criteria.assessmentRevision).toBe(7);
 expect(plan.experimental?.units.map(u=>u.method)).toEqual(['content-author','profile']);
 expect(plan.criteria.promptRevision).toBe('content-json-4');
});
it('pins only verified builds and falls back to author discovery when profile search is unavailable',async()=>{
 state.verified.find(v=>v.capability_key.includes(':profiles:'))!.verified=false;
 const plan=await buildExperimentalPlan(params);
 expect(plan.experimental?.units.map(u=>u.method)).toEqual(['content-author']);
 const builds=plan.experimental?.capabilities.find(c=>c.operation==='discovery')?.config.builds;
 expect(Object.keys(builds)).toEqual(['apify~facebook-search-scraper:keyword:posts']);
});
it('hashes evidence policy, budget and seed snapshot while usage counters do not drift the plan',async()=>{
 const first=await buildExperimentalPlan(params);
 state.caps.forEach(c=>c.used_units=1);expect((await buildExperimentalPlan(params)).hash).toBe(first.hash);
 expect((await buildExperimentalPlan({...params,maxSessionUsd:.3})).hash).not.toBe(first.hash);
 state.records=[{url:'https://facebook.com/known',record:{url:'https://facebook.com/known',name:'Seed Coach',sport:'Running/Road'}}];
 const seeded=await buildExperimentalPlan({...params,seedDatasetId:'a'.repeat(64)});
 expect(seeded.hash).not.toBe(first.hash);expect(seeded.experimental?.knownSeedUrls).toContain('https://facebook.com/known');
});
it('keeps disabled configuration blocked and rejects unknown group-detail capabilities before collection',async()=>{
 await expect(buildExperimentalPlan({...params,seedUrls:['https://facebook.com/groups/123']})).rejects.toMatchObject({code:'CAPABILITY_UNAVAILABLE'});
 state.caps=[];await expect(buildExperimentalPlan(params)).rejects.toMatchObject({code:'CAPABILITY_UNAVAILABLE'});
});
it('seed-informed query proposals preserve original names and remain separate from synonyms',()=>{
 const suggestions=keywordSuggestions('Running','Ho Chi Minh City','Individual KOLs',[{name:'Tên gốc',sport:'Running/Road'},{name:'Unrelated',sport:'Triathlon'}]);
 expect(suggestions.seedBranches).toEqual(['Running Tên gốc Ho Chi Minh City']);expect(suggestions.synonyms).not.toContain(suggestions.seedBranches[0]);
});

it('keeps the approved plan identity stable when the UI adds routing metadata at start',async()=>{
 const planned=await buildExperimentalPlan(params);
 expect((await buildExperimentalPlan({...params,planHash:planned.hash,uiContext:{source:'/scout'},notes:'reviewer original note'})).hash).toBe(planned.hash);
});

it('blocks a cap below the verified actor minimum before creating provider reservations',async()=>{state.caps.filter(c=>c.provider==='apify').forEach(c=>c.config.minimumRunCapUsd=.5);await expect(buildExperimentalPlan({...params,maxSessionUsd:.3})).rejects.toMatchObject({code:'BUDGET_BELOW_PROVIDER_MINIMUM'});expect((await buildExperimentalPlan({...params,maxSessionUsd:1})).maxSessionUsd).toBe(1);});
