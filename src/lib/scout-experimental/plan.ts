import { createHash } from 'node:crypto';
import { createAdminClient } from '../supabase/admin';
import { providerPlans } from '../apify/providers';
import { capabilityKey } from '../apify/runtime';
import { stableJson } from '../apify/runtime';
import { topicQueries } from '../apify/account-criteria';
import { ScoutError } from '../apify/errors';
import type { SearchPlan } from '../apify/search-plan';
import type { ProviderSelection, TrialCapability } from './types';
import { EXPERIMENTAL_REVISION } from './types';
import { assertTrial } from './trial';
import { seedUrl } from './seeds';
export function keywordSuggestions(topic:string,geography:string,target:string) {
 const synonyms=topicQueries(topic);const role=target==='Communities & Clubs'?['club','câu lạc bộ','cộng đồng']:['coach','huấn luyện viên','athlete','vận động viên'];
 return {synonyms,expansions:[...role.map(r=>`${topic} ${r} ${geography}`),`${topic} tournament ${geography}`,`${topic} training ${geography}`,`${topic} technique`].slice(0,8)};
}
export async function experimentalConfiguration(){
 const db=createAdminClient();const [{data:capabilities,error},{data:datasets,error:seedError}]=await Promise.all([db.from('scout_trial_capabilities').select('*'),db.from('scout_seed_datasets').select('*')]);
 if(error||seedError)return {configured:false,capabilities:[],datasets:[],error:'Apply the experimental Scout migration and configure verified trials.'};
 const keys:Record<string,boolean>={apify:!!process.env.APIFY_TOKEN,brave:!!process.env.BRAVE_SEARCH_API_KEY,brightdata:!!process.env.BRIGHT_DATA_API_TOKEN,gemini:!!process.env.GEMINI_API_KEY};
 return {configured:true,datasets:datasets || [],capabilities:(capabilities || []).map(c=>{let available=false;try{assertTrial(c);available=keys[c.provider];}catch{}return {id:c.id,provider:c.provider,operation:c.operation,platform:c.platform,revision:c.revision,available,expiresAt:c.expires_at,remainingUnits:Math.max(0,c.total_units-c.used_units),unitsPerRequest:c.units_per_request,maxValueUsd:c.max_value_usd,paidModel:c.config.paidModel===true,reason:available?(c.config.paidModel?'Verified light model; bounded paid usage.':'Verified trial; billing disabled.'):'Trial, credentials or capability verification is missing.'};})};
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
  caps.push(c);
 }
 const allowed=Math.min(Number(settings.session_usd),Number(settings.daily_usd));const maxSessionUsd=params.maxSessionUsd ?? Math.min(0.5,allowed);
 if(maxSessionUsd<=0||maxSessionUsd>allowed)throw new ScoutError('Session value cap exceeds the administrative policy.','BUDGET_ABOVE_POLICY',400);
 let seeds:any[]=[];
 if(params.seedDatasetId){const {data,error}=await db.from('scout_seed_records').select('record').eq('dataset_id',params.seedDatasetId);if(error)throw error;if(!data?.length)throw new ScoutError('Seed dataset is unavailable.','INVALID_SEEDS',400);seeds=data.map(r=>r.record);}
 const knownUrls=[...new Set([...seeds.map(s=>s.url),...(params.seedUrls || []).map((u:string)=>seedUrl(u).url)])];
 const selectedSeeds=[...new Set([...(params.seedUrls || []).map((u:string)=>seedUrl(u).url),...(params.datasetSeedUrls || []).filter((u:string)=>knownUrls.includes(seedUrl(u).url)).map((u:string)=>seedUrl(u).url)])].slice(0,10);
 const approved=[...new Set<string>(params.approvedKeywords.map((x:string)=>x.trim()).filter(Boolean))];
 const units=approved.flatMap((query,index)=>platforms.filter((platform:string)=>selection.discovery!=='apify' || platform!=='Instagram' || /^#?[\p{L}\p{N}_]+$/u.test(query)).map((platform:string)=>({platform,query,method:selection.discovery==='brave'?'web-content':platform==='Instagram'?'hashtag':index%3===0?'profile':'content-author'}))).slice(0,12);
 if(platforms.some((p:string)=>!units.some(u=>u.platform===p)))throw new ScoutError('Each platform needs a compatible approved query. Instagram Apify content search requires a single hashtag.','INVALID_QUERY',400);
 if((params.seedUrls || []).length+(params.datasetSeedUrls || []).length>10)throw new ScoutError('Select at most 10 seed accounts in total.','INVALID_SEEDS',400);
 const apifyCaps=caps.filter(c=>c.provider==='apify');
 if(apifyCaps.length){
  const {data:verified,error}=await db.from('scout_provider_capabilities').select('capability_key,verified,build');if(error)throw error;
  for(const c of apifyCaps){
   const requests=c.operation==='discovery'?units.filter(u=>u.platform===c.platform).map(u=>({task:u.method==='profile'?'profiles':u.method==='hashtag'?'hashtag':'keyword',query:u.query})): [{task:c.operation==='profile'?'profile-details':'profile-posts',query:c.platform==='Facebook'?'https://facebook.com/example':c.platform==='TikTok'?'https://tiktok.com/@example':'https://instagram.com/example'}];
   for(const r of requests){const eligible=providerPlans(c.platform,r.task as any,r.query,10).filter(p=>c.config.builds?.[capabilityKey(p,r.task)]);if(!eligible.length || eligible.some(p=>!verified?.some(v=>v.verified && v.capability_key===capabilityKey(p,r.task) && v.build===c.config.builds[v.capability_key])))throw new ScoutError(`${c.platform}: ${r.task} needs a currently verified immutable Apify build.`,'CAPABILITY_UNAVAILABLE',409);}
  }
 }
 const seedSnapshot=createHash('sha256').update(stableJson(seeds)).digest('hex');
 const criteria={...params,searchStrategy:'seed_content_v1',assessmentRevision:7,maxModelUsd:params.maxModelUsd ?? 0.02,seedSnapshot,seedUrls:selectedSeeds,knownSeedUrls:knownUrls,providerSelection:selection,planHash:undefined,searchPlan:undefined,notes:undefined};
 // Changing remaining credits must not change the immutable plan hash on every poll.
 const immutable=caps.map(c=>({...c,used_units:0}));
 const plan:SearchPlan={version:6,kind:'preview',hash:'',criteria,maxSessionUsd,allowedMaxSessionUsd:allowed,maxSearchRows:180,maxHydratedProfiles:20,maxPostsPerProfile:10,accountPolicyVersion:5,modelMode:'off',modelRevision:'rules-5',rounds:[{label:'Seed evidence',queries:[]},{label:'Content discovery',queries:approved},{label:'Public connections',queries:[]},{label:'Supplementary discovery',queries:approved}],sources:platforms.map((platform:string)=>({platform,task:'profiles',keys:[],builds:{},options:{},authorSearch:true,warnings:[]})),experimental:{revision:EXPERIMENTAL_REVISION,capabilities:immutable,units,seeds:selectedSeeds,knownSeedUrls:knownUrls,maxQueries:12,maxCandidates:60,maxMedia:6},appliedFilters:immutable.map(c=>({platform:c.platform,setting:`${c.operation}: ${c.provider}`,mode:'Local verification',detail:`${c.config.paidModel?'Budgeted light model':'Trial only'}; up to ${c.units_per_request} trial units and $${c.max_value_usd.toFixed(4)} credit value/request; expires ${c.expires_at}.`}))};
 plan.hash=createHash('sha256').update(stableJson({...plan,hash:undefined})).digest('hex');return plan;
}
