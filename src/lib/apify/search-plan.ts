import {sizeRange, topicQueries} from './account-criteria';
import { currentAccountModelPolicy, type AccountModelPolicy } from './account-model-policy';
import { selectedEntityTypes, type EntityType } from './account-evidence';
import { createHash } from 'node:crypto';
import { createAdminClient } from '@/lib/supabase/admin';
import { canonicalScopes, unrestrictedGeography } from './geography';
import { normalized, tokens } from './discovery-quality';
import { providerPlans, type ScoutTask } from './providers';
import { capabilityKey, stableJson } from './runtime';
import { ScoutError } from './errors';
import type { VerifiedSearchOptions } from './search-input';
export type SearchPlan = {
 version:4 | 5; hash:string; kind:'preview'|'trends'; criteria:Record<string,any>;
 maxSessionUsd:number; allowedMaxSessionUsd?:number; maxSearchRows:number; maxHydratedProfiles:number; maxPostsPerProfile:5 | 10; accountPolicyVersion?:5; modelRevision?:string; modelMode?:AccountModelPolicy['mode']; appliedFilters?:{platform:string;setting:string;mode:'Provider filter'|'Search hint'|'Local verification';detail:string}[];
 rounds:{label:string;queries:string[]}[];
 sources:{platform:string; task:ScoutTask; keys:string[]; builds:Record<string,string>; options:Record<string,VerifiedSearchOptions>; authorSearch:boolean; rounds?:{task:ScoutTask;queries:string[]}[]; warnings:string[]}[];
};
export function suggestedQueries(keyword:string,target:string,kind:string,geography:string|string[],exact=false):string[] {
 if(exact)return [keyword];
 const scopes=Array.isArray(geography)?geography:[geography];
 const places=scopes.filter(s=>!unrestrictedGeography(s));const place=places[0] || '';
 const running=tokens(keyword).includes('running') || normalized(keyword)==='chaybo';
 if(!running){
  const topic=tokens(keyword).includes('vietnam') && place==='Vietnam'?keyword:place && !tokens(place).every(t=>tokens(keyword).includes(t))?`${keyword} ${place}`:keyword;
  if(kind==='preview')return target==='Communities & Clubs'?[`${topic} club`,`${topic} community`,`${topic} câu lạc bộ`]:[`${topic} athlete`,`${topic} coach`,`${topic} vận động viên`,`${topic} creator`];
  return [topic];
 }
 const suffix=place?` ${place}`:'';
 if(kind==='preview' && target==='Communities & Clubs')return [`running club${suffix}`,`câu lạc bộ chạy bộ${suffix}`,`nhóm chạy bộ${suffix}`,`marathon club${suffix}`];
 if(kind==='preview')return [`running coach${suffix}`,`vận động viên chạy bộ${suffix}`,`marathon runner${suffix}`,`runner${suffix}`];
 return [`chạy bộ${suffix}`,`running${suffix}`,`marathon${suffix}`,`runner${suffix}`];
}
export function instagramTopicTags(keyword:string) {
 return tokens(keyword).includes('running') || normalized(keyword)==='chaybo' ? ['chaybo','runningvietnam','marathonvietnam'] : [normalized(keyword).replace(/ /g,'')];
}
export async function buildSearchPlan(kind:'preview'|'trends',params:Record<string,any>):Promise<SearchPlan> {
 const db=createAdminClient();
 const {data:policy,error:policyError}=await db.rpc('scout_search_budget_policy');
 if(policyError || policy!==4)throw new ScoutError('Adaptive search requires the Scout budget migration.', 'SEARCH_POLICY_UNAVAILABLE',503);
 const [{data:settings,error:budgetError},{data:receipts,error}]=await Promise.all([
 db.from('scout_budget_settings').select('enabled,session_usd,daily_usd,run_usd,tiktok_run_usd').single(),
 db.from('scout_provider_capabilities').select('capability_key,verified,build,receipt')]);
 if(error || budgetError)throw new ScoutError('Scout configuration is unavailable.','NOT_CONFIGURED',503);
 if(!settings?.enabled)throw new ScoutError('New collections are paused.','SCOUT_DISABLED',409);
 const allowedMaxSessionUsd=Math.min(Number(settings.session_usd),Number(settings.daily_usd));
 const strictAccount=kind==='preview';
 if(strictAccount && params.maxSessionUsd!==undefined && params.maxSessionUsd>allowedMaxSessionUsd)throw new ScoutError(`Session budget exceeds the allowed maximum of $${allowedMaxSessionUsd.toFixed(2)}.`, 'BUDGET_ABOVE_POLICY',400);
 const maxSessionUsd=Math.min(Number(settings.session_usd),Number(settings.daily_usd),params.maxSessionUsd ?? Number(settings.session_usd));
 if(!Number.isFinite(maxSessionUsd) || maxSessionUsd<=0)throw new ScoutError('Scout budget is unavailable.','BUDGET_EXHAUSTED',409);
 const geography=canonicalScopes(params.geography || 'Vietnam');
 const exact=kind==='trends' && (params.searchMode || (params.keyword?.startsWith('#')?'hashtag':'keyword'))==='hashtag';
 const accountV5=strictAccount;
 if(accountV5){const {data:accountPolicy,error:accountError}=await db.rpc('scout_account_policy_version');if(accountError || accountPolicy!==5)throw new ScoutError('Account classification requires the Scout account assessment migration.', 'ACCOUNT_POLICY_UNAVAILABLE',503);}
 const entityTypes=selectedEntityTypes(params.targetType,params.entityTypes);
 const criteria={...(accountV5?{accountPolicyVersion:5,assessmentRevision:6,sizeMetric:params.sizeMetric || 'followers',minFollowers:params.minFollowers,maxFollowers:params.maxFollowers,minMembers:params.minMembers,maxMembers:params.maxMembers,entityTypes,geographyMode:params.geographyMode || 'profile-or-recent-posts'}:{}),keyword:params.keyword,targetType:params.targetType,platform:params.platform,geography,limit:params.limit,searchMode:exact?'hashtag':'keyword',qualityMode:params.qualityMode,minInteractions:params.minInteractions,minViews:params.minViews,recentDays:params.recentDays,queryVariants:params.queryVariants,sport:params.sport};
 let queries=exact?[params.keyword]:params.queryVariants!==undefined ? [...new Set([suggestedQueries(params.keyword,params.targetType,kind,geography)[0],...params.queryVariants])] : suggestedQueries(params.keyword,params.targetType,kind,geography);
 if(accountV5) {
  const scopes=Array.isArray(geography)?geography:[geography];
  const place=scopes.filter(s=>!unrestrictedGeography(s)).join(' ');
  const role:Record<string,string>={Individual:'',Community:'community cộng đồng',Club:'club câu lạc bộ','Brand/Business':'shop services','Media/Event':'news event',Other:'',Unknown:''};
  const neutral=params.keyword;
  queries=params.queryVariants!==undefined ? [suggestedQueries(params.keyword,params.targetType,'trends',geography)[0],...params.queryVariants] : [...new Set([`${neutral} ${place} ${role[entityTypes[0]]}`.trim(),...entityTypes.slice(1,3).map((type:EntityType)=>`${neutral} ${place} ${role[type]}`.trim()),`${neutral} ${role[entityTypes[0]]}`.trim(),neutral])].slice(0,4);
 }
 const selected=Array.isArray(params.platform)?params.platform:[params.platform];
 const sources=selected.map((platform:string)=>{
 const task:ScoutTask=kind==='preview'?(params.targetType==='Communities & Clubs'?'communities':'profiles'):exact || platform==='Instagram'?'hashtag':'keyword';
 const keys=providerPlans(platform,task,params.keyword,1).map(p=>capabilityKey(p,task));
 const usable=keys.filter(key=>receipts?.some(r=>r.capability_key===key && r.verified && r.build && !['latest','beta','stable'].includes(r.build)));
 if(!usable.length && !accountV5)throw new ScoutError(`${platform}: This search capability is unavailable.`, 'CAPABILITY_UNVERIFIED',503);
 const builds:Record<string,string>={},options:Record<string,VerifiedSearchOptions>={};
 for(const key of usable){const r=receipts!.find(r=>r.capability_key===key)!;builds[key]=r.build;options[key]=r.receipt?.verifiedSearchOptions || {};}
 const fallbackTask=platform==='Instagram'?'hashtag':'keyword';
 const fallbackKeys=providerPlans(platform,fallbackTask,'running',1).map(p=>capabilityKey(p,fallbackTask));
 const detailKeys=providerPlans(platform,'profile-details',platform==='TikTok'?'https://tiktok.com/@example':`https://${platform.toLowerCase()}.com/example`,1).map(p=>capabilityKey(p,'profile-details'));
 const postKeys=providerPlans(platform,'profile-posts',platform==='TikTok'?'https://tiktok.com/@example':`https://${platform.toLowerCase()}.com/example`,1).map(p=>capabilityKey(p,'profile-posts'));
 const authorSearch=kind==='preview' && [...fallbackKeys,...detailKeys].every(key=>receipts?.some(r=>r.capability_key===key && r.verified && r.build && !['latest','beta','stable'].includes(r.build)));
 const groupPostKeys=accountV5 && platform==='Facebook'?providerPlans(platform,'profile-posts','https://facebook.com/groups/example',1).map(p=>capabilityKey(p,'profile-posts')):[];
 for(const key of [...fallbackKeys,...detailKeys,...postKeys,...groupPostKeys]){const r=receipts?.find(r=>r.capability_key===key && r.verified && r.build && !['latest','beta','stable'].includes(r.build));if(r){builds[key]=r.build;options[key]=r.receipt?.verifiedSearchOptions || {};}}
 let sourceQueries=queries;
 if(platform==='Instagram' && kind==='trends' && !exact)sourceQueries=params.queryVariants!==undefined?[instagramTopicTags(params.keyword)[0],...params.queryVariants.map((q:string)=>q.replace(/^#/,'').replace(/\s/g,''))]:instagramTopicTags(params.keyword);
 let sourceRounds=[{task,queries:sourceQueries.slice(0,1)},{task,queries:sourceQueries.slice(1,3)},{task,queries:sourceQueries.slice(3,4)}];
 if(kind==='preview' && authorSearch && !accountV5)sourceRounds[2]={task:fallbackTask,queries:platform==='Instagram'?instagramTopicTags(params.keyword).slice(0,1):suggestedQueries(params.keyword,params.targetType,'trends',geography).slice(0,1)};
 if(accountV5) {
  const scopes=Array.isArray(geography)?geography:[geography];const place=scopes.filter(s=>!unrestrictedGeography(s)).join(' ');
  const aliases=topicQueries(params.keyword);
  const scoped=queries[0];const supplementary=[...new Set([...(params.queryVariants || []),...aliases.slice(1),queries[queries.length-1]])].filter(q=>q!==scoped).slice(0,3);
  sourceRounds=[{task,queries:usable.length?[scoped]:[]},{task,queries:usable.length?[params.keyword]:[]},
   {task:fallbackTask,queries:authorSearch?(platform==='Instagram'?instagramTopicTags(params.keyword):[`${params.keyword} ${place}`.trim()]):[]},
   {task:usable.length?task:fallbackTask,queries:usable.length?supplementary:authorSearch?(platform==='Instagram'?aliases.slice(1,3).map(q=>normalized(q).replace(/ /g,'')):supplementary):[]}];
 }
 return {platform,task,keys:usable,builds,options,authorSearch,rounds:sourceRounds,warnings:usable.length<keys.length?['Only verified search branches will run.']:[]};
 });
 const rounds=accountV5?[{label:'Scoped profile search',queries:queries.slice(0,1)},{label:'Broader profile search',queries:[params.keyword]},{label:'Topic content and authors',queries:topicQueries(params.keyword).slice(0,1)},{label:'Additional queries',queries:params.queryVariants || topicQueries(params.keyword).slice(1,4)}]:[{label:'Primary search',queries:queries.slice(0,1)},{label:'Additional queries',queries:queries.slice(1,3)},{label:'Evidence and authors',queries:queries.slice(3,4)}];
 if(accountV5 && !sources.some(source=>source.keys.length || source.authorSearch))throw new ScoutError('No verified profile or author search capability is available.', 'CAPABILITY_UNVERIFIED',503);
 const audience=sizeRange(params);
 const appliedFilters=accountV5?sources.flatMap(source=>[
  {platform:source.platform,setting:'Entity type / topic',mode:'Search hint' as const,detail:'Queries guide discovery; account identity and topic are verified from evidence.'},
  {platform:source.platform,setting:'Geography',mode:(source.platform==='Facebook' && Object.values(source.options).some(o=>o.facebookLocations)?'Provider filter':'Search hint') as 'Provider filter'|'Search hint',detail:'Primary round uses location hints. Broader rounds retain accounts active outside their profile location.'},
  ...(audience.minimum!==undefined || audience.maximum!==undefined?[{platform:source.platform,setting:audience.metric==='members'?'Members range':'Followers range',mode:'Local verification' as const,detail:`Observed ${audience.metric}: ${audience.minimum?.toLocaleString('en-US') ?? 'No minimum'} – ${audience.maximum?.toLocaleString('en-US') ?? 'No maximum'}. Missing counts require verification; followers and members are separate.`}]:[]),
  {platform:source.platform,setting:'Recent locations',mode:'Local verification' as const,detail:'Up to 10 sampled public owned posts when needed; latest ordering and location mentions require verification.'},
  {platform:source.platform,setting:'Result target',mode:'Provider filter' as const,detail:'Provider row limits are bounded; the requested number of qualified accounts is not guaranteed.'},
 ]):undefined;
 const modelPolicy=accountV5?currentAccountModelPolicy():undefined;
 const base={...(modelPolicy?{accountPolicyVersion:5 as const,modelRevision:modelPolicy.revision,modelMode:modelPolicy.mode,appliedFilters}:{}),version:accountV5?5 as const:4 as const,kind,criteria,maxSessionUsd,...(accountV5?{allowedMaxSessionUsd}:{}),maxSearchRows:accountV5?Math.min(600,Math.max(120,12*(params.limit || 5))):120,maxHydratedProfiles:accountV5?Math.min(100,Math.max(10,2*(params.limit || 5))):10,maxPostsPerProfile:accountV5?10 as const:5 as const,rounds,sources};
 return {...base,hash:createHash('sha256').update(stableJson(base)).digest('hex')};
}
