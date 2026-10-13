import { collectExperimental } from '../scout-experimental/execution';
import { collectPlannedAccounts } from './account-search-execution';
import { plannedAccountModelPolicy, assertAccountModelPolicy, accountModelPolicyKey } from './account-model-policy';
import { classifyAccount, evidenceHash } from './account-model';
import { latestOwnedPosts } from './account-evidence';
import { createAdminClient } from '@/lib/supabase/admin';
import { scrape, parsePost, parseProfile, mergeProfileEvidence, type SocialProfile, type ScoutTask } from './providers';
import { capabilityKey } from './runtime';
import { providerPlans } from './providers';
import { assessSearchContent, assessSearchProfile } from './search-assessment';
import { instagramTopicTags, type SearchPlan } from './search-plan';
import { checkpointTask } from './task-checkpoint';
import { sessionSnapshot } from './session-snapshot';
import { PendingScout, ScoutError } from './errors';
import { quotas } from './collection';
export type SearchExecution={discardedDiscovery?:any[];seedAssessments?:any[];rounds:any[];stopReason:string;requestedRows:number;providerCount:number;uniqueCount:number;duplicateCount:number;unparseableCount:number;hydratedProfiles:number;warnings:string[];rows:Record<string,any[]>;profiles:Record<string,SocialProfile[]>};
/** Round checkpoints are reused by durable Workflow retries; provider receipts fence starts within a round. */
export async function collectPlannedSearch(params:Record<string,any>,existing:Set<string>,feedback:any[]=[]):Promise<SearchExecution> {
 if(params.searchPlan.version===6)return collectExperimental(params,existing,feedback);
 if(params.searchPlan.version===5 && params.searchPlan.kind==='preview')return collectPlannedAccounts(params,existing,feedback);
 const plan:SearchPlan=params.searchPlan;const accountV5=plan.accountPolicyVersion===5;const assessmentOptions=accountV5?{version:5,minFollowers:plan.criteria.minFollowers,entityTypes:plan.criteria.entityTypes,geographyMode:plan.criteria.geographyMode}:undefined;const db=createAdminClient();
 const modelPolicy=accountV5?plannedAccountModelPolicy(plan):undefined;
 if(modelPolicy)assertAccountModelPolicy(modelPolicy);
 const originalExisting=await checkpointTask(params.sessionId,'search-v4-existing',async()=>[...existing]);existing.clear();originalExisting.forEach((key:string)=>existing.add(key));
 const reference=await sessionSnapshot(params.sessionId,'retrievalWindows','search-reference',async createdAt=>createdAt);
 const cutoff=new Date(Date.parse(reference)-(params.recentDays ?? 7)*86400000).toISOString();
 const rows:Record<string,any[]>={},profiles:Record<string,SocialProfile[]>={};const attempted=new Set<string>();const identities=new Set<string>();
 let requestedRows=0,providerCount=0,duplicateCount=0,unparseableCount=0,noNewRounds=0;const rounds:any[]=[];const warnings:string[]=[];let stopReason='plan-exhausted';
 const qualified=()=>plan.kind==='preview'?Object.values(profiles).flat().filter(p=>!existing.has(`${p.platform}:${p.url}`) && assessSearchProfile(p,params.keyword,params.geography,params.targetType,assessmentOptions?{...assessmentOptions,entityAssessment:p.accountEntityAssessment}:undefined).resultGroup==='Qualified').length:Object.entries(rows).flatMap(([platform,values])=>values.map(r=>({platform,post:parsePost(r,platform)}))).filter(({platform,post})=>post && !existing.has(`${platform}:${post.url}`) && assessSearchContent(post,{...params,keyword:params.keyword,searchMode:params.searchMode || plan.criteria.searchMode,geography:params.geography,newerThan:cutoff}).resultGroup==='Qualified').length;
 for(let index=0;index<plan.rounds.length;index++) {
  if(qualified()>=(params.limit || 5)){stopReason='target-reached';break;}
  const round=plan.rounds[index];const fallback=index===2 && plan.kind==='preview';
  const work=plan.sources.flatMap(source=>{
   if(!source.rounds && fallback && !source.authorSearch)return [];
   const task:ScoutTask=source.rounds?.[index]?.task || (fallback?(source.platform==='Instagram'?'hashtag':'keyword'):source.task);
   let queries=source.rounds?.[index]?.queries || (fallback?[params.keyword]:round.queries);
   if(!source.rounds && source.platform==='Instagram' && task==='hashtag' && params.searchMode!=='hashtag')queries=instagramTopicTags(params.keyword).slice(index,index+1);
   return queries.map(query=>({source,query:source.platform==='Instagram' && task==='hashtag'?query.replace(/^#/,''):query,task}));
  });
  if(!work.length)continue;
  const allowance=Math.min(40,plan.maxSearchRows-requestedRows);if(allowance<=0){stopReason='row-limit';break;}
  const checkpoint=await checkpointTask(params.sessionId,`search-v4-round:${index}`,async()=>{
   const observations:{platform:string;values:any[];task:ScoutTask}[]=[];const details:SocialProfile[]=[];const tried:string[]=[];const errors:string[]=[];let budgetStopped=false;let requested=0;
   for(const [i,unit] of work.entries()) {
    const limit=Math.floor(allowance/work.length)+(i<allowance%work.length?1:0);if(!limit)continue;requested+=limit;
    const keys=unit.task===unit.source.task?unit.source.keys:providerPlans(unit.source.platform,unit.task,unit.query,1).map(p=>capabilityKey(p,unit.task)).filter(k=>unit.source.builds[k]);
    try {const values=await scrape(params.sessionId,unit.source.platform,unit.task,unit.query,limit,accountV5 && index>0?'Any location':Array.isArray(params.geography)?params.geography.join(', '):params.geography,{boundedSearch:true,searchPlan:{...unit.source,keys},qualityMode:params.qualityMode,recentDays:params.recentDays,newerThan:cutoff});observations.push({platform:unit.source.platform,values,task:unit.task});}
    catch(e:any){if(e instanceof PendingScout || ['START_UNKNOWN','RATE_LIMITED','PROVIDER_UNAVAILABLE','PLAN_STALE'].includes(e.code))throw e;errors.push(`${unit.source.platform}: ${e.message}`);if(e.code==='BUDGET_EXHAUSTED'){budgetStopped=true;break;}}
   }
   const currentProfile=(platform:string,url:string)=>[...(profiles[platform] || []),...observations.filter(o=>o.platform===platform).flatMap(o=>o.values.map(r=>parseProfile(r,platform)).filter(Boolean) as SocialProfile[])].find(p=>p.url===url);
   if(plan.kind==='preview' && !budgetStopped) {
    const all=plan.sources.flatMap(source=>{
     const current=[...(profiles[source.platform] || []),...observations.filter(o=>o.platform===source.platform).flatMap(o=>o.values.map(r=>parseProfile(r,source.platform)).filter(Boolean) as SocialProfile[])];
     // Post hits supply author identities; hydration must return the actual author account.
     const authors=observations.filter(o=>o.platform===source.platform).flatMap(o=>o.values.map(r=>parsePost(r,source.platform)?.authorUrl).filter(Boolean) as string[]);
     const eligible=current.filter(p=>{
      const assessment=assessSearchProfile(p,params.keyword,params.geography,params.targetType,assessmentOptions?{...assessmentOptions,entityAssessment:p.accountEntityAssessment}:undefined);
      const expected=params.targetType==='Communities & Clubs'?'Community':'Individual';
      if(accountV5)return !existing.has(`${source.platform}:${p.url}`);
      return !existing.has(`${source.platform}:${p.url}`) && !p.url.includes('/groups/') && (!p.bio || !p.category || p.followers===null) && !assessment.reasons.includes('Observed location conflicts with selected geography') && !(assessment.reviewState==='Excluded' && assessment.classification!=='Unknown' && assessment.classification!==expected);
     }).sort((a,b)=>Number(assessSearchProfile(b,params.keyword,params.geography,params.targetType,assessmentOptions?{...assessmentOptions,entityAssessment:b.accountEntityAssessment}:undefined).relevant)-Number(assessSearchProfile(a,params.keyword,params.geography,params.targetType,assessmentOptions?{...assessmentOptions,entityAssessment:a.accountEntityAssessment}:undefined).relevant));
     const urls=[...new Set([...eligible.map(p=>p.url),...authors.filter(url=>!existing.has(`${source.platform}:${url}`))])];
     return urls.map(url=>({source,url}));
    }).filter(({source,url})=>!attempted.has(`${source.platform}:${url}`)).slice(0,plan.maxHydratedProfiles-attempted.size);
    for(const {source,url} of all) {
     const isGroup=accountV5 && url.includes('/groups/');
     const key=isGroup?'':capabilityKey(providerPlans(source.platform,'profile-details',url,1)[0],'profile-details');
     if(isGroup){
      const base=currentProfile(source.platform,url);
      const postKey=capabilityKey(providerPlans(source.platform,'profile-posts',url,1)[0],'profile-posts');
      if(!base || !source.builds[postKey]){errors.push(`${source.platform}: Latest group posts capability is unavailable; coverage remains partial.`);continue;}
      tried.push(`${source.platform}:${url}`);
      try{const postRows=await scrape(params.sessionId,source.platform,'profile-posts',url,plan.maxPostsPerProfile,'',{latestSample:true,searchPlan:{...source,keys:[postKey]}});
       const p={...base,posts:[...base.posts,...postRows.map(r=>parsePost(r,source.platform)).filter((post):post is NonNullable<typeof post>=>!!post && post.authorUrl===url)]};
       p.posts=latestOwnedPosts(p);p.latestPostsVerified=source.options[postKey]?.latestProfilePosts===true;details.push(p);
      }catch(e:any){if(e instanceof PendingScout || ['START_UNKNOWN','RATE_LIMITED','PROVIDER_UNAVAILABLE','PLAN_STALE'].includes(e.code))throw e;errors.push(`${source.platform} group posts: ${e.message}`);if(e.code==='BUDGET_EXHAUSTED'){budgetStopped=true;break;}}
      continue;
     }
     if(!source.builds[key]){if(accountV5)errors.push(`${source.platform}: Profile hydration capability is unavailable; coverage remains partial.`);continue;}
     tried.push(`${source.platform}:${url}`);
     try {const values=await scrape(params.sessionId,source.platform,'profile-details',url,1,'',{searchPlan:{...source,keys:[key]}});for(const row of values){const p=parseProfile(row,source.platform);if(p?.url===url){
        const base=currentProfile(source.platform,url);if(base)p.posts=[...base.posts,...p.posts];
        details.push(p);
        const postKey=capabilityKey(providerPlans(source.platform,'profile-posts',url,1)[0],'profile-posts');
        if((accountV5 || !p.bio && !p.posts.length) && source.builds[postKey]) {
          const postRows=await scrape(params.sessionId,source.platform,'profile-posts',url,plan.maxPostsPerProfile,'',{...(accountV5?{latestSample:true}:{newerThan:cutoff}),searchPlan:{...source,keys:[postKey]}});
          p.posts=[...p.posts,...postRows.map(r=>parsePost(r,source.platform)).filter((post):post is NonNullable<typeof post>=>!!post && post.authorUrl===url)];
          if(accountV5){p.posts=latestOwnedPosts(p);p.latestPostsVerified=source.options[postKey]?.latestProfilePosts===true;}
        }
      }}}
     catch(e:any){if(e instanceof PendingScout || ['START_UNKNOWN','RATE_LIMITED','PROVIDER_UNAVAILABLE','PLAN_STALE'].includes(e.code))throw e;errors.push(`${source.platform} details: ${e.message}`);if(e.code==='BUDGET_EXHAUSTED'){budgetStopped=true;break;}}
    }
   }
   return {observations,details,tried,errors,budgetStopped,requested};
  });
  const before=identities.size;requestedRows+=checkpoint.requested;warnings.push(...checkpoint.errors);checkpoint.tried.forEach((key:string)=>attempted.add(key));
  for(const observation of checkpoint.observations){rows[observation.platform] ||= [];profiles[observation.platform] ||= [];
   for(const row of observation.values){providerCount++;const p=plan.kind==='preview' && !['keyword','hashtag'].includes(observation.task)?parseProfile(row,observation.platform):parsePost(row,observation.platform);
    if(!p){unparseableCount++;continue;}const identity=`${observation.platform}:${p.url}`;if(identities.has(identity)){duplicateCount++;continue;}identities.add(identity);rows[observation.platform].push(row);
    if(plan.kind==='preview' && !['keyword','hashtag'].includes(observation.task))profiles[observation.platform].push(p as SocialProfile);
   }
  }
  for(const detail of checkpoint.details){profiles[detail.platform] ||= [];const i=profiles[detail.platform].findIndex(p=>p.url===detail.url);if(i<0)profiles[detail.platform].push(detail);else profiles[detail.platform][i]=mergeProfileEvidence(profiles[detail.platform][i],detail);}
  if(accountV5)for(const platformProfiles of Object.values(profiles))for(const profile of platformProfiles) {
    profile.accountEntityAssessment=await checkpointTask(params.sessionId,`account-model:${evidenceHash(profile)}:${accountModelPolicyKey(modelPolicy!)}`,()=>classifyAccount(profile,modelPolicy!.revision,modelPolicy!.mode));
  }
  const storedTable=plan.kind==='trends'?'scouted_posts':params.targetType==='Communities & Clubs'?'communities':'kols';
  if(identities.size) {const stored=await checkpointTask(params.sessionId,`search-v4-existing:${index}`,async()=>{const {data,error}=await db.from(storedTable).select('scout_identity').in('scout_identity',[...identities]);if(error)throw error;return data || [];});stored.forEach((r:any)=>existing.add(r.scout_identity));}
  const added=identities.size-before;noNewRounds=added?0:noNewRounds+1;
  const summary={round:index+1,label:round.label,queries:work.map(w=>w.query),newIdentities:added,qualifiedNew:qualified(),requestedRows:checkpoint.requested};rounds.push(summary);
  if(checkpoint.budgetStopped){stopReason='budget-exhausted';break;}
  if(noNewRounds>=2){stopReason='no-new-identities';break;}
 }
 if(!Object.keys(rows).length && warnings.length && stopReason!=='budget-exhausted')throw new ScoutError(warnings.join(' '),'SEARCH_FAILED',502);
 if(qualified()>=(params.limit || 5))stopReason='target-reached';
 if(stopReason==='budget-exhausted')warnings.push('The reviewed budget was reached. Available results have been retained.');
 return {rounds,stopReason,requestedRows,providerCount,uniqueCount:identities.size,duplicateCount,unparseableCount,hydratedProfiles:attempted.size,warnings:[...new Set(warnings)],rows,profiles};
}
