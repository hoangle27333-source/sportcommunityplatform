import { hasDiscoveryLead } from './retrieval-admission';
import { trustedRoleSource } from './role-sources';
import { prioritizeApprovedUnits } from './discovery-plan';
import { createAdminClient } from '../supabase/admin';
import { checkpointTask } from '../apify/task-checkpoint';
import { sessionSnapshot } from '../apify/session-snapshot';
import { assessReviewedProfile, assessAccountSize } from '../apify/search-assessment';
import { parseProfile, parsePost, mergeProfileEvidence, type SocialProfile } from '../apify/providers';
import { canonicalUrl, platformMatches, urlKind } from '../apify/discovery-quality';
import { PendingScout, ScoutError } from '../apify/errors';
import type { SearchPlan } from '../apify/search-plan';
import type { SearchExecution } from '../apify/planned-search';
import { experimentalApifyProfile,experimentalApifyPost } from './apify-adapter';
import { candidatePriority } from './ranking';
import { fetchExternal, normalizeBrightPost, normalizeBrightProfile, resultIdentity, analyzeContent } from './providers';
import { CONTENT_PROMPT_REVISION } from './types';
import type { TrialCapability } from './types';

export async function collectExperimental(params:Record<string,any>,existing:Set<string>,feedback:any[]):Promise<SearchExecution>{
 const plan:SearchPlan=params.searchPlan;const config=plan.experimental;if(!config)throw new Error('Experimental plan is missing.');
 if(plan.criteria.promptRevision && plan.criteria.promptRevision!==CONTENT_PROMPT_REVISION)throw new ScoutError('Content-analysis prompt changed. Review a new experimental plan.','PLAN_STALE',409);
 const known=new Set(config.knownSeedUrls.map(canonicalUrl));const profiles:Record<string,SocialProfile[]>={};const warnings:string[]=[];const rounds:any[]=[];const pool=new Map<string,SocialProfile>();const hydrated=new Set<string>();
 const discardedDiscovery = new Map<string, {url:string;name:string;platform:string;reason:string;discoveryPaths:SocialProfile['discoveryPaths']}>();
 const outcomes:{platform:string;method:string;newCandidates:number}[]=[];
 let queries=0,noNew=0,stopReason='plan-exhausted',providerCount=0;
 const capabilities=config.capabilities;
 const capability=(platform:string,operation:string)=>{const c=capabilities.find(c=>c.operation===operation&&(c.platform===platform||c.platform==='*'));if(!c)throw new ScoutError(`${platform}: ${operation} capability is unavailable.`,'CAPABILITY_UNAVAILABLE',409);return c;};
 const assess=(p:SocialProfile)=>assessReviewedProfile(p,plan.criteria.keyword,plan.criteria.geography,plan.criteria.targetType,{...plan.criteria,version:7},feedback);
 const qualified=()=>[...pool.values()].filter(p=>!p.knownSeed&&!known.has(p.url)&&!existing.has(`${p.platform}:${p.url}`)&&assess(p).resultGroup==='Qualified').length;
 const newCount=()=>[...pool.values()].filter(p=>!p.knownSeed&&!known.has(p.url)&&!existing.has(`${p.platform}:${p.url}`)).length;
 const merge=(p:SocialProfile)=>{if(!pool.has(p.url)&&!hasDiscoveryLead(p,plan.criteria.keyword)){discardedDiscovery.set(p.url,{url:p.url,name:p.name,platform:p.platform,reason:'No observed topic hint, supporting content or seed connection. Search query is not evidence.',discoveryPaths:p.discoveryPaths});return;}discardedDiscovery.delete(p.url);if(pool.size>=60&&!pool.has(p.url))return;const previous=pool.get(p.url);pool.set(p.url,previous?{...mergeProfileEvidence(previous,p),contentEvidence:p.contentEvidence || previous.contentEvidence,trustedRoleSources:[...(previous.trustedRoleSources || []),...(p.trustedRoleSources || [])],discoveryPaths:[...(previous.discoveryPaths||[]),...(p.discoveryPaths||[])]}:p);};
 const handle=(e:any)=>{if(e instanceof PendingScout||['RATE_LIMITED'].includes(e.code))throw e;
 if(['START_UNKNOWN','PLAN_STALE'].includes(e.code))stopReason=e.code==='START_UNKNOWN'?'provider-start-unresolved':'capability-changed';warnings.push(e.message);if(['BUDGET_EXHAUSTED','TRIAL_UNAVAILABLE'].includes(e.code))stopReason='trial-or-budget-limit';if(e.code==='QUOTA_EXHAUSTED')stopReason='quota-limit';};
 // Session-owned snapshots keep evidence stable across worker retries and database seed edits.
 const baseline=await sessionSnapshot(params.sessionId,'retrievalWindows','experimental-existing',async()=>JSON.stringify([...existing]));existing=new Set(JSON.parse(baseline));
 async function enrich(p:SocialProfile,seed=false){
  if(hydrated.size>=20 || hydrated.has(p.url) || !seed&&(known.has(p.url)||existing.has(`${p.platform}:${p.url}`)||assessAccountSize(p,plan.criteria)?.state==='failed'))return;
  hydrated.add(p.url);
  try{
   const result=await checkpointTask(params.sessionId,`experimental-profile:${p.url}`,async()=>{
    let current=p;const detailCap=capability(p.platform,'profile');
    const details=await fetchExternal(params.sessionId,detailCap,{url:p.url,limit:1});
    for(const row of details){const detail=detailCap.provider==='brightdata'?normalizeBrightProfile(row,p.platform):experimentalApifyProfile(row,p.platform);if(detail && (detail.url===p.url || detail.identityAliases?.includes(p.url)))current=mergeProfileEvidence(current,{...detail,url:p.url});}
    if(!seed && current.identityAliases?.some(url=>known.has(url)))return {...current,knownSeed:true};
    // A definite size/type failure needs no media or posts.
    if(!seed&&assessAccountSize(current,plan.criteria)?.state==='failed')return current;
    const postCap=capability(p.platform,'posts');const rows=await fetchExternal(params.sessionId,postCap,{url:p.url,limit:10});
    const posts=rows.map((r:any)=>postCap.provider==='brightdata'?normalizeBrightPost(r,p.platform):experimentalApifyPost(r,current)).filter((r:any)=>r?.authorUrl===p.url&&!r.isRepost);
    current={...current,posts:[...new Map([...current.posts,...posts].map(p=>[p.url,p])).values()].slice(0,10)};
    current.contentEvidence=await analyzeContent(params.sessionId,capability(p.platform,'analysis'),current,plan.criteria.keyword);
    return current;
   });merge(result);
  }catch(e){handle(e);}
 }
 // Seeds teach the search but are always excluded from the new-account target.
 for(const url of config.seeds){const platform=plan.sources.find(s=>platformMatches(s.platform,url))?.platform;if(!platform)continue;const p=parseProfile({profileUrl:url},platform);if(p){merge({...p,knownSeed:true,discoveryPaths:[{method:'seed',sourceUrl:url,depth:0}]});await enrich(pool.get(url)!,true);}if(stopReason!=='plan-exhausted')break;}
 const runUnit=async(unit:{platform:string;query:string;method:string},index:number)=>{
  if(queries>=12)return;queries++;const before=newCount();
  try{const result=await checkpointTask(params.sessionId,`experimental-discovery:${index}`,()=>fetchExternal(params.sessionId,capability(unit.platform,'discovery'),{query:unit.query,limit:15,method:unit.method}));providerCount+=result.length;
   for(const row of result){const p=resultIdentity(row,unit.platform);if(p){merge({...p,discoveryPaths:[{method:unit.method,query:unit.query,sourceUrl:p.posts[0]?.url || row.url || p.url,depth:0}]});
    for(const post of p.posts){const source=trustedRoleSource(post,plan.criteria.keyword,capability(unit.platform,'discovery').config.trustedPublisherUrls || []);if(source){const candidate=parseProfile({profileUrl:source.accountUrl},unit.platform);if(candidate)merge({...candidate,trustedRoleSources:[source],discoveryPaths:[{method:'trusted-role-source',query:unit.query,sourceUrl:source.url,depth:0}]});}}
   }}
  }catch(e){handle(e);}
  outcomes.push({platform:unit.platform,method:unit.method,newCandidates:newCount()-before});
 };
 // Round-robin ordering avoids exhausting all discovery requests on the first platform.
 const platforms=plan.sources.map(s=>s.platform);const remaining=[...config.units];
 for(let round=0;round<3&&stopReason==='plan-exhausted';round++){
  if(qualified()>=plan.criteria.limit){stopReason='target-reached';break;}
  const before=newCount();
  const roundUnits=prioritizeApprovedUnits(remaining,outcomes).slice(0,4);
  for(const unit of roundUnits){remaining.splice(remaining.indexOf(unit),1);await runUnit(unit,config.units.indexOf(unit));if(stopReason!=='plan-exhausted')break;}
  const remainingRounds=3-round;const allowance=Math.ceil((20-hydrated.size)/remainingRounds);
  const ordered=platforms.map(platform=>[...pool.values()].filter(p=>p.platform===platform&&!p.knownSeed&&!known.has(p.url)&&!existing.has(`${p.platform}:${p.url}`)&&!hydrated.has(p.url)).sort((a,b)=>candidatePriority(b,plan.criteria.keyword,[...pool.values()].filter(p=>known.has(p.url)))-candidatePriority(a,plan.criteria.keyword,[...pool.values()].filter(p=>known.has(p.url)))));
  const queue=Array.from({length:Math.max(...ordered.map(b=>b.length),0)},(_,i)=>ordered.flatMap(b=>b[i]?[b[i]]:[])).flat().slice(0,allowance);
  for(const p of queue){if(stopReason!=='plan-exhausted')break;await enrich(p);if(qualified()>=plan.criteria.limit){stopReason='target-reached';break;}if(stopReason!=='plan-exhausted')break;}
  // Only explicit public collaboration links from collected owned posts, depth one.
  for(const p of [...pool.values()])for(const post of p.posts)for(const link of post.publicLinks || []){
   const url=canonicalUrl(link);if(!platformMatches(p.platform,url)||!['profile','group'].includes(urlKind(url)))continue;
   if(p.discoveryPaths?.some(d=>d.depth===0)){const candidate=parseProfile({profileUrl:url},p.platform);if(candidate)merge({...candidate,discoveryPaths:[{method:'public-connection',sourceUrl:post.url,seedUrl:p.url,depth:1}]});}
  }
  noNew=newCount()===before?noNew+1:0;rounds.push({round:round+1,newCandidates:newCount()-before,qualifiedNew:qualified()});
  if(stopReason==='target-reached')break;if(noNew>=2 && stopReason==='plan-exhausted'){stopReason='no-new-accounts';break;}
 }
 if(stopReason==='plan-exhausted' && hydrated.size>=20)stopReason='profile-quota-limit';
 const seedAssessments=[...pool.values()].filter(p=>known.has(p.url)).map(p=>({url:p.url,name:p.name,assessment:assess(p),contentEvidence:p.contentEvidence}));
 for(const p of pool.values())if(!p.knownSeed&&!known.has(p.url))(profiles[p.platform] ||= []).push(p);
 const db=createAdminClient();const identities=[...pool.values()].map(p=>`${p.platform}:${p.url}`);
 if(identities.length){const {data,error}=await db.from(plan.criteria.targetType==='Communities & Clubs'?'communities':'kols').select('scout_identity').in('scout_identity',identities);if(error)throw error;for(const r of data||[])existing.add(r.scout_identity);}
 return {rounds,discardedDiscovery:[...discardedDiscovery.values()],seedAssessments,stopReason,requestedRows:queries*15,providerCount,uniqueCount:pool.size,duplicateCount:Math.max(0,providerCount-pool.size-discardedDiscovery.size),unparseableCount:0,hydratedProfiles:hydrated.size,warnings,rows:{},profiles};
}
