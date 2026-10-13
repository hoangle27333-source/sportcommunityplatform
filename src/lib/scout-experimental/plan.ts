import { discoveryUnits,discoveryTask } from './discovery-plan';
import { hasTopicEvidence } from '../apify/content-quality';
import { createHash } from 'node:crypto';
import { createAdminClient } from '../supabase/admin';
import { providerPlans } from '../apify/providers';
import { capabilityKey } from '../apify/runtime';
import { stableJson } from '../apify/runtime';
import { topicQueries } from '../apify/account-criteria';
import { ScoutError } from '../apify/errors';
import type { SearchPlan } from '../apify/search-plan';
import type { ProviderSelection, TrialCapability } from './types';
import { EXPERIMENTAL_REVISION,CONTENT_PROMPT_REVISION } from './types';
import { assertTrial } from './trial';
import { seedUrl } from './seeds';
export function keywordSuggestions(topic:string,geography:string,target:string,seeds:{name:string;sport?:string}[]=[]) {
 const synonyms=topicQueries(topic);const role=target==='Communities & Clubs'?['club','câu lạc bộ','cộng đồng']:['coach','huấn luyện viên','athlete','vận động viên'];
 const seedBranches=seeds.filter(seed=>!seed.sport || synonyms.some(query=>hasTopicEvidence(seed.sport!,query))).slice(0,3).map(seed=>`${topic} ${seed.name} ${geography}`.trim());
 return {synonyms,seedBranches,expansions:[...role.map(r=>`${topic} ${r} ${geography}`),`${topic} tournament ${geography}`,`${topic} training ${geography}`,`${topic} technique`].slice(0,8)};
}
export async function experimentalConfiguration(){
 const db=createAdminClient();const [{data:capabilities,error},{data:datasets,error:seedError}]=await Promise.all([db.from('scout_trial_capabilities').select('*'),db.from('scout_seed_datasets').select('*')]);
 if(error||seedError)return {configured:false,capabilities:[],datasets:[],error:'Apply the experimental Scout migration and configure verified trials.'};
 const keys:Record<string,boolean>={apify:!!process.env.APIFY_TOKEN,brave:!!process.env.BRAVE_SEARCH_API_KEY,brightdata:!!process.env.BRIGHT_DATA_API_TOKEN,gemini:!!process.env.GEMINI_API_KEY};
 return {configured:true,datasets:datasets || [],capabilities:(capabilities || []).map(c=>{let available=false;try{assertTrial(c);available=keys[c.provider];}catch{}return {id:c.id,provider:c.provider,operation:c.operation,platform:c.platform,revision:c.revision,available,expiresAt:c.expires_at,remainingUnits:Math.max(0,c.total_units-c.used_units),unitsPerRequest:c.units_per_request,maxValueUsd:c.max_value_usd,paidModel:c.config.paidModel===true,reason:available?(c.config.paidModel?'Verified light model; bounded paid usage.':'Verified trial; billing disabled.'):c.config.blockedReason || 'Trial, credentials or capability verification is missing.'};})};
}
export async function buildExperimentalPlan(params:Record<string,any>):Promise<SearchPlan>{
 const db=createAdminClient();const [{data:settings,error:settingsError},{data:all,error}]=await Promise.all([db.from('scout_budget_settings').select('*').single(),db.from('scout_trial_capabilities').select('*')]);
 if(error||settingsError)throw new ScoutError('Experimental Scout storage is unavailable. Apply the migration first.','NOT_CONFIGURED',503);
 if(!settings?.enabled)throw new ScoutError('New collections are paused.','SCOUT_DISABLED',409);
 if(!params.keywordsApproved || !params.approvedKeywords?.length)throw new ScoutError('Review and approve the search keywords.','KEYWORDS_REQUIRED',400);
 const platforms=Array.isArray(params.platform)?params.platform:[params.platform];const selection:ProviderSelection=params.providerSelection || {discovery:'apify',profile:'apify',posts:'apify'};
 const caps:TrialCapability[]=[];
 for(const platform of platforms)for(const operation of ['discovery','profile','posts','analysis'] as const){
  const provider=operation==='analysis'?'gemini':selection[operation];const c=all.find((c:TrialCapability)=>c.provider===provider&&c.operation===operation&&(c.platform===platform || c.platform==='*'));
  if(!c)throw new ScoutError(`${platform}: ${provider} ${operation} needs a verified trial capability.`,'CAPABILITY_UNAVAILABLE',409);assertTrial(c);
  const key={apify:process.env.APIFY_TOKEN,brave:process.env.BRAVE_SEARCH_API_KEY,brightdata:process.env.BRIGHT_DATA_API_TOKEN,gemini:process.env.GEMINI_API_KEY}[provider];if(!key)throw new ScoutError(`${provider}: Server credentials are missing.`,'NOT_CONFIGURED',503);
  if(!caps.some(existing=>existing.id===c.id))caps.push(c);
 }
 const allowed=Math.min(Number(settings.session_usd),Number(settings.daily_usd));const maxSessionUsd=params.maxSessionUsd ?? Math.min(0.5,allowed);
 if(maxSessionUsd<=0||maxSessionUsd>allowed)throw new ScoutError('Session value cap exceeds the administrative policy.','BUDGET_ABOVE_POLICY',400);
 for(const cap of caps.filter(c=>c.provider==='apify'))if(maxSessionUsd<Number(cap.config.minimumRunCapUsd || 0))throw new ScoutError(`${cap.platform} requires at least $${Number(cap.config.minimumRunCapUsd).toFixed(2)} reserved per provider run; your session cap is $${maxSessionUsd.toFixed(2)}. Explicitly change the cap or choose another platform.`,'BUDGET_BELOW_PROVIDER_MINIMUM',409);
 let seeds:any[]=[];
 if(params.seedDatasetId){const {data,error}=await db.from('scout_seed_records').select('record').eq('dataset_id',params.seedDatasetId);if(error)throw error;if(!data?.length)throw new ScoutError('Seed dataset is unavailable.','INVALID_SEEDS',400);seeds=data.map(r=>r.record);}
 const {data:knownRecords,error:knownError}=await db.from('scout_seed_records').select('url');if(knownError)throw knownError;
 const knownUrls=[...new Set([...(knownRecords || []).map(r=>r.url),...seeds.map(s=>s.url),...(params.seedUrls || []).map((u:string)=>seedUrl(u).url)])];
 const selectedSeeds=[...new Set([...(params.seedUrls || []).map((u:string)=>seedUrl(u).url),...(params.datasetSeedUrls || []).filter((u:string)=>seeds.some(s=>!s.needsResolution && s.url===seedUrl(u).url)).map((u:string)=>seedUrl(u).url)])].slice(0,10);
 const approved=[...new Set<string>(params.approvedKeywords.map((x:string)=>x.trim()).filter(Boolean))];
 const {data:verified,error:verifiedError}=await db.from('scout_provider_capabilities').select('capability_key,verified,build');if(verifiedError)throw verifiedError;
 const eligiblePlans=(platform:string,task:any,query:string)=>{
  const c=caps.find(c=>c.provider==='apify'&&c.platform===platform&&c.operation===(['profiles','keyword','hashtag'].includes(task)?'discovery':task==='profile-details'?'profile':'posts'));
  return providerPlans(platform,task,query,10).filter(p=>c?.config.builds?.[capabilityKey(p,task)] && verified?.some(v=>v.verified && v.capability_key===capabilityKey(p,task) && v.build===c.config.builds[v.capability_key]));
 };
 const units=discoveryUnits(approved,platforms,selection.discovery,unit=>selection.discovery!=='apify' || eligiblePlans(unit.platform,discoveryTask(unit.method),unit.query).length>0);
 if(platforms.some((p:string)=>!units.some(u=>u.platform===p)))throw new ScoutError('Each platform needs a compatible approved query and a verified discovery branch.','CAPABILITY_UNAVAILABLE',409);
 if((params.seedUrls || []).length+(params.datasetSeedUrls || []).length>10)throw new ScoutError('Select at most 10 seed accounts in total.','INVALID_SEEDS',400);
 for(const c of caps.filter(c=>c.provider==='apify'&&c.operation!=='discovery')){
  const task=c.operation==='profile'?'profile-details':'profile-posts';
  const example=c.platform==='Facebook'?'https://facebook.com/example':c.platform==='TikTok'?'https://tiktok.com/@example':'https://instagram.com/example';
  for(const url of [example,...selectedSeeds.filter(url=>seedUrl(url).platform===c.platform)])if(!eligiblePlans(c.platform,task,url).length)throw new ScoutError(`${c.platform}: ${task} needs a currently verified immutable Apify build.`,'CAPABILITY_UNAVAILABLE',409);
 }
 const seedSnapshot=createHash('sha256').update(stableJson(seeds)).digest('hex');
 const criteria={...params,searchStrategy:'seed_content_v1',assessmentRevision:7,promptRevision:CONTENT_PROMPT_REVISION,maxModelUsd:params.maxModelUsd ?? 0.02,seedSnapshot,seedUrls:selectedSeeds,knownSeedUrls:knownUrls,providerSelection:selection,planHash:undefined,searchPlan:undefined,notes:undefined,uiContext:undefined};
 // Changing remaining credits must not change the immutable plan hash on every poll.
 const immutable=caps.map(c=>({...c,used_units:0,...(c.provider==='apify'?{config:{...c.config,builds:Object.fromEntries(Object.entries(c.config.builds || {}).filter(([key,build])=>verified?.some(v=>v.capability_key===key && v.verified && v.build===build)))}}:{})}));
 const plan:SearchPlan={version:6,kind:'preview',hash:'',criteria,maxSessionUsd,allowedMaxSessionUsd:allowed,maxSearchRows:180,maxHydratedProfiles:20,maxPostsPerProfile:10,accountPolicyVersion:5,modelMode:'off',modelRevision:'rules-5',rounds:[{label:'Seed evidence',queries:[]},{label:'Content discovery',queries:approved},{label:'Public connections',queries:[]},{label:'Supplementary discovery',queries:approved}],sources:platforms.map((platform:string)=>({platform,task:'profiles',keys:[],builds:{},options:{},authorSearch:units.some(u=>u.platform===platform&&u.method!=='profile'),warnings:units.some(u=>u.platform===platform&&u.method!=='profile')?[]:['Content discovery is unavailable for the approved queries; only verified profile search will run.']})),experimental:{revision:EXPERIMENTAL_REVISION,capabilities:immutable,units,seeds:selectedSeeds,knownSeedUrls:knownUrls,maxQueries:12,maxCandidates:60,maxMedia:6},appliedFilters:immutable.map(c=>({platform:c.platform,setting:`${c.operation}: ${c.provider}`,mode:'Local verification',detail:`${c.config.paidModel?'Budgeted light model':'Trial only'}; up to ${c.units_per_request} trial units and $${c.max_value_usd.toFixed(4)} credit value/request; expires ${c.expires_at}.`}))};
 plan.hash=createHash('sha256').update(stableJson({...plan,hash:undefined})).digest('hex');return plan;
}
