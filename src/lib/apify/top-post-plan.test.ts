import {beforeEach,it,expect,vi} from 'vitest';
const state=vi.hoisted(()=>({schema:true,entity:{id:'k',profile_url:'https://facebook.com/runner',channels:[{url:'https://instagram.com/runner'}]},receipts:[{capability_key:'apify~facebook-posts-scraper:profile-posts:default',verified:true,build:'0.0.398',receipt:{}}]}));
vi.mock('@/lib/supabase/admin',()=>({createAdminClient:()=>({from(table:string){const result=()=>({data:table==='scouted_posts'?[]:table==='scout_budget_settings'?{enabled:true,session_usd:1,daily_usd:2}:table==='scout_provider_capabilities'?state.receipts:state.entity,error:table==='scouted_posts'&&!state.schema?{message:'missing shares'}:null});const q:any={select:()=>q,limit:()=>q,eq:()=>q,single:async()=>result(),then:(resolve:any)=>Promise.resolve(result()).then(resolve)};return q;}})}));
import {buildEntityTopPlan,assertTopPostSchema} from './top-post-plan';
const params={kolId:'k',platform:['Facebook'],limit:10,recentDays:7,selectionMode:'top',rankingMode:'views-first',thresholdsEnabled:false};
beforeEach(()=>{state.schema=true;state.receipts[0].verified=true;});
it('blocks before any collection if shares schema is unavailable',async()=>{state.schema=false;await expect(assertTopPostSchema()).rejects.toMatchObject({code:'TOP_POST_SCHEMA_UNAVAILABLE'});});
it('hashes channel, date and ranking criteria but ignores UI source context',async()=>{
 const plan=await buildEntityTopPlan('kol-posts',params);expect(plan.maxSearchRows).toBe(60);expect(plan.criteria.channelUrls).toEqual(['https://facebook.com/runner']);
 expect((await buildEntityTopPlan('kol-posts',{...params,uiContext:{source:'/kols'},planHash:'a'.repeat(64)})).hash).toBe(plan.hash);
 expect((await buildEntityTopPlan('kol-posts',{...params,recentDays:30})).hash).not.toBe(plan.hash);
});
it('rejects unrelated channels and unverified builds',async()=>{
 await expect(buildEntityTopPlan('kol-posts',{...params,channelUrls:['https://facebook.com/other']})).rejects.toMatchObject({code:'INVALID_PROFILE_URL'});
 state.receipts[0].verified=false;await expect(buildEntityTopPlan('kol-posts',params)).rejects.toMatchObject({code:'CAPABILITY_UNVERIFIED'});
});
