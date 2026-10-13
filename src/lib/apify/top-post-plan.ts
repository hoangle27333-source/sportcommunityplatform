import { createHash } from 'node:crypto';
import { createAdminClient } from '@/lib/supabase/admin';
import { canonicalUrl, platformMatches, urlKind } from './discovery-quality';
import { providerPlans } from './providers';
import { capabilityKey, stableJson } from './runtime';
import { ScoutError } from './errors';
import { topCandidateBudget } from './top-post-quality';
import type { SearchPlan } from './search-plan';
import { savedAccountUrls } from './post-accounts';
export async function assertTopPostSchema() {
 const {error}=await createAdminClient().from('scouted_posts').select('shares,scout_content_assessment').limit(0);
 if(error)throw new ScoutError('Top posts require the content settings database migration. No collection was started.','TOP_POST_SCHEMA_UNAVAILABLE',503);
}
export async function buildEntityTopPlan(kind: string, params: Record<string, any>): Promise<SearchPlan> {
 await assertTopPostSchema();
 const db=createAdminClient();const community=kind==='community-posts';
 const id=community?params.communityId:params.kolId;
 if(!id)throw new ScoutError('Select a saved account.','INVALID_TASK',400);
 const {data:entity,error}=await db.from(community?'communities':'kols').select('*').eq('id',id).single();
 if(error || !entity)throw new ScoutError('Account not found.','NOT_FOUND',404);
 const platforms=Array.isArray(params.platform)?params.platform:[params.platform];
 const connected=savedAccountUrls(entity,community?'community':'kol').filter(url=>platforms.some((p:string)=>platformMatches(p,url)) && ['profile','group'].includes(urlKind(url)));
 const urls=params.channelUrls?params.channelUrls.map((u:string)=>canonicalUrl(u)):connected;
 if(!urls.length || urls.some((u:string)=>!connected.includes(u)))throw new ScoutError('Choose connected account channels.','INVALID_PROFILE_URL',400);
 const [{data:settings,error:budgetError},{data:receipts,error:capError}]=await Promise.all([
  db.from('scout_budget_settings').select('enabled,session_usd,daily_usd').single(),
  db.from('scout_provider_capabilities').select('capability_key,verified,build,receipt'),
 ]);
 if(budgetError || capError || !settings?.enabled)throw new ScoutError('Top-post collection is unavailable.','NOT_CONFIGURED',503);
 const allowedMaxSessionUsd=Math.min(Number(settings.session_usd),Number(settings.daily_usd));
 const maxSessionUsd=Math.min(allowedMaxSessionUsd,params.maxSessionUsd ?? allowedMaxSessionUsd);
 if(!Number.isFinite(maxSessionUsd) || maxSessionUsd<=0)throw new ScoutError('Scout budget is unavailable.','BUDGET_EXHAUSTED',409);
 const sources=urls.map((url:string)=>{
  const platform=platforms.find((p:string)=>platformMatches(p,url))!;
  const keys=providerPlans(platform,'profile-posts',url,1).map(p=>capabilityKey(p,'profile-posts'));
  const builds:Record<string,string>={},options:SearchPlan['sources'][number]['options']={};
  for(const key of keys){const receipt=receipts?.find(r=>r.capability_key===key && r.verified && r.build && !['latest','stable','beta'].includes(r.build));if(!receipt)throw new ScoutError(`${platform}: Channel collection is unverified.`,'CAPABILITY_UNVERIFIED',503);builds[key]=receipt.build;options[key]=receipt.receipt?.verifiedSearchOptions || {};}
  return {platform,task:'profile-posts' as const,keys,builds,options,authorSearch:false,rounds:Array.from({length:4},()=>({task:'profile-posts' as const,queries:[url]})),warnings:[]};
 });
 const criteria={...(params.qualityFilter?{qualityFilter:params.qualityFilter}:{}),channelUrls:urls,selectionMode:'top',rankingMode:'views-first',platform:params.platform,limit:params.limit,kolId:params.kolId,communityId:params.communityId,recentDays:params.recentDays,publishedFrom:params.publishedFrom,publishedTo:params.publishedTo,thresholdsEnabled:params.thresholdsEnabled ?? false,minViews:params.minViews,minInteractions:params.minInteractions};
 const base={version:4 as const,kind:'trends' as const,criteria,maxSessionUsd,allowedMaxSessionUsd,maxSearchRows:topCandidateBudget(params.limit || 10),maxHydratedProfiles:0,maxPostsPerProfile:5 as const,rounds:Array.from({length:4},(_,i)=>({label:`Channel collection ${i+1}`,queries:urls})),sources};
 return {...base,hash:createHash('sha256').update(stableJson(base)).digest('hex')};
}
