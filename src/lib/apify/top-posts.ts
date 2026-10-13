import { createAdminClient } from '@/lib/supabase/admin';
import { parsePost, scrape, type SocialPost } from './providers';
import { assertTopPostSchema } from './top-post-plan';
import { PendingScout, ScoutError } from './errors';
import { sessionSnapshot } from './session-snapshot';
import { checkpointTask } from './task-checkpoint';
import { isStoredEvidence } from './stored-evidence';
import { channelMembership, assessTopPost, compareTopPosts, topCandidateBudget, type TopPostCriteria } from './top-post-quality';
import { canonicalUrl } from './discovery-quality';
import { detectSportNiche, savePosts } from './scout';
import type { SearchPlan } from './search-plan';
import { loadPostAccounts, matchPostAuthor, matchPostGroup } from './post-accounts';
import type { CollectedPost } from './scout';

type Item=CollectedPost & {ownershipUnknown?:boolean};
export async function scoutTopPosts(params:TopPostCriteria & {sessionId:string;searchPlan?:SearchPlan;keyword?:string;searchMode?:string;geography?:string|string[];limit?:number;recentDays?:number;kolId?:string;communityId?:string}) {
 const plan=params.searchPlan;if(!plan)throw new ScoutError('A reviewed top-post plan is required.','PLAN_REQUIRED',400);
 if(!isStoredEvidence())await assertTopPostSchema();
 const entity=!!(params.kolId || params.communityId);const limit=params.limit || 10;
 const window=JSON.parse(await sessionSnapshot(params.sessionId,'retrievalWindows','top-window',async createdAt=>JSON.stringify({from:params.publishedFrom || new Date(Date.parse(createdAt)-(params.recentDays ?? 7)*86400000).toISOString(),to:params.publishedTo || createdAt,reference:createdAt}))) as {from:string;to:string;reference?:string};
 const budget=topCandidateBudget(limit);const unique=new Map<string,Item>();const warnings:string[]=[];const rounds:any[]=[];
 let requestedRows=0,providerCount=0,duplicates=0,unparseable=0,noNewRounds=0;let stopReason='sources-exhausted';
 const blockedPlatforms=new Set<string>();const exhausted=new Set<string>();const sizes=new Map<string,number>();const sourceCoverage=new Map<string,any>();
 const accept=(platform:string,row:any,channel?:string)=>{
  providerCount++;const post=parsePost(row,platform);if(!post){unparseable++;return;}
  const key=`${platform}:${post.url}`;
  // Source membership must be observed for groups, not inferred from the query.
  const membership=entity && channel?channelMembership(post,channel,row):entity?'unknown':'passed';
  const belongs=membership==='passed';
  const item={post,platform,kolId:params.kolId,communityId:params.communityId,sport:detectSportNiche(post.caption).join(', ') || 'Unknown',requestedScope:{publishedFrom:window.from,publishedTo:window.to,selectionMode:'top',channel,kolId:params.kolId,communityId:params.communityId}};
  const ownershipKnown=membership==='failed';
  if(!belongs && ownershipKnown){sourceCoverage.set(`ownership:${key}`,{post,platform,resultGroup:'Excluded',reviewState:'Excluded',reason:'The post does not verify membership in the selected channel.'});return;}
  if(!belongs){Object.assign(item,{kolId:undefined,communityId:undefined,ownershipUnknown:true});}
  if(unique.has(key)){duplicates++;const prior=unique.get(key)!;const newer=(post.provenance?.fetchedAt || '')>=(prior.post.provenance?.fetchedAt || '');if(newer)unique.set(key,{...item,post:{...post,views:post.views ?? prior.post.views,likes:post.likes ?? prior.post.likes,comments:post.comments ?? prior.post.comments,shares:post.shares ?? prior.post.shares}});return;}
  unique.set(key,item);
 };
 if(isStoredEvidence()) {
  // Saved rows are reused once per platform/task; do not apply collection caps to replay.
  const tasks=new Set<string>();
  for(const source of plan.sources){const key=`${source.platform}:${source.task}`;if(tasks.has(key))continue;tasks.add(key);
   const rows=await scrape(params.sessionId,source.platform,source.task,source.rounds?.[0]?.queries[0] || params.keyword || '',1);
   for(const row of rows){const post=parsePost(row,source.platform);const channel=entity?plan.sources.filter(s=>s.platform===source.platform).flatMap(s=>s.rounds?.[0]?.queries || []).find(url=>post?.authorUrl===url || post?.url.startsWith(`${url}/`)):undefined;accept(source.platform,row,channel);}
  }
  stopReason='stored-evidence';
 } else for(let index=0;index<plan.rounds.length;index++) {
  const allowance=Math.min(index===0?Math.floor(budget/6):index===1?Math.floor(budget/3):40,budget-requestedRows);if(allowance<=0){stopReason='candidate-budget';break;}
  const units=plan.sources.flatMap(source=>{const round=source.rounds?.[index];return (round?.queries || []).map(query=>({source,query,sorting:round?.sorting}));}).filter(unit=>!blockedPlatforms.has(unit.source.platform) && !exhausted.has(`${unit.source.platform}:${unit.query}:${unit.sorting || ''}`));
  if(!units.length)continue;
  const collected=await checkpointTask(params.sessionId,`top-round:${params.kolId || params.communityId || 'topic'}:${index}`,async()=>{
   const observations:any[]=[];let requested=0;let budgetStopped=false;
   for(const [i,unit] of units.entries()) {
    if(blockedPlatforms.has(unit.source.platform))continue;
    const count=Math.floor(allowance/units.length)+(i<allowance%units.length?1:0);if(!count)continue;
    const key=`${unit.source.platform}:${unit.query}:${unit.sorting || ''}`;
    // Actors without cursors expand their prefix; every requested row counts toward the cap.
    if(count<=(sizes.get(key) || 0)){continue;}
    requested+=count;
    try {const rows=await scrape(params.sessionId,unit.source.platform,unit.source.task,unit.query,count,Array.isArray(params.geography)?params.geography.join(', '):params.geography || '',{boundedSearch:true,searchPlan:unit.source,newerThan:window.from,qualityMode:'high-engagement',recentDays:Math.max(1,Math.ceil((Date.parse(window.reference || window.to)-Date.parse(window.from))/86400000)),videoSearchSorting:unit.sorting});observations.push({key,platform:unit.source.platform,channel:entity?unit.query:undefined,count,rows});}
    catch(e:any){if(e instanceof PendingScout || ['START_UNKNOWN','RATE_LIMITED','PROVIDER_UNAVAILABLE','PLAN_STALE'].includes(e.code))throw e;const message=e.code==='BILLING_REQUIRED'?'The provider requires billing to be resolved before collection can continue.':e.message;observations.push({key,platform:unit.source.platform,count,error:message,code:e.code});if(['BILLING_REQUIRED','APPROVAL_REQUIRED','NOT_CONFIGURED'].includes(e.code))blockedPlatforms.add(unit.source.platform);if(e.code==='BUDGET_EXHAUSTED'){budgetStopped=true;break;}}
   }
   return {observations,requested,budgetStopped};
  });
  const before=unique.size;requestedRows+=collected.requested;
  for(const observation of collected.observations){sizes.set(observation.key,observation.count);if(observation.error){if(['BILLING_REQUIRED','APPROVAL_REQUIRED','NOT_CONFIGURED'].includes(observation.code))blockedPlatforms.add(observation.platform);warnings.push(`${observation.platform}: ${observation.error}`);exhausted.add(observation.key);sourceCoverage.set(observation.key,{platform:observation.platform,status:'failed',reason:observation.error,code:observation.code});continue;}
   sourceCoverage.set(observation.key,{platform:observation.platform,status:'collected',rows:observation.rows.length});
   if(observation.rows.length<observation.count)exhausted.add(observation.key);
   for(const row of observation.rows)accept(observation.platform,row,observation.channel);
  }
  const added=unique.size-before;noNewRounds=added?0:noNewRounds+1;rounds.push({round:index+1,requestedRows:collected.requested,newIdentities:added});
  if(blockedPlatforms.size===new Set(plan.sources.map(s=>s.platform)).size){stopReason='provider-restricted';break;}
  if(collected.budgetStopped){stopReason='budget-exhausted';break;}
  if(requestedRows>=budget){stopReason='candidate-budget';break;}
  if(noNewRounds>=2){stopReason='no-new-identities';break;}
 }
 if(!isStoredEvidence()) {
  const registry=await loadPostAccounts();
  for(const item of unique.values()) {
   item.authorAccount=matchPostAuthor(registry,item.platform,item.post.authorUrl);
   item.kolId=item.authorAccount?.entityType==='kol'?item.authorAccount.id:undefined;
   if(!entity)item.communityId=matchPostGroup(registry,item.platform,item.post.url);
   const channel=(item.requestedScope as any)?.channel;
   if(entity && item.ownershipUnknown){item.kolId=undefined;item.communityId=undefined;}
   item.collectionSource=entity?{kind:'account',sessionId:params.sessionId,entityType:params.kolId?'kol':'community',entityId:params.kolId || params.communityId,channelUrl:channel}:{kind:'topic',sessionId:params.sessionId,keyword:params.keyword};
  }
 }
 const qualified:Item[]=[];const accepted:Item[]=[];const skippedPosts:any[]=[...sourceCoverage.values()].filter(c=>c.post).map(({post,...c})=>({...post,...c}));
 for(const item of unique.values()) {
  let assessment=assessTopPost(item.post,params,window.from,window.to,entity);
  if(item.ownershipUnknown && ['Qualified','Needs Verification'].includes(assessment.resultGroup))assessment={...assessment,resultGroup:'Needs Verification',reviewState:'Needs Verification',reason:'Source membership is unverified.',assessment:{...assessment.assessment,topic:{state:'unknown',reason:'Source membership is unverified.',evidence:[]}}};
  if(['Qualified','Needs Verification'].includes(assessment.resultGroup)) {
   item.contentAssessment={status:assessment.resultGroup==='Qualified'?'verified':'needs-verification',ownership:item.ownershipUnknown?'unknown':entity?'passed':undefined,assessment:assessment.assessment,qualityFilter:assessment.qualityFilter,reason:assessment.reason};
   accepted.push(item);if(assessment.resultGroup==='Qualified')qualified.push(item);
  } else skippedPosts.push({...item.post,platform:item.platform,...assessment});
 }
 accepted.sort((a,b)=>compareTopPosts(a.post,b.post));
 const counts={inserted:0,refreshed:0,duplicate:0};
 const persisted=isStoredEvidence()?[]:await savePosts(accepted,counts,true);
 const savedPosts=accepted.map(item=>{const saved=persisted.find((p:any)=>canonicalUrl(p.post_url)===item.post.url);return {...saved,...item.post,id:saved?.id || item.post.id,post_url:item.post.url,title:item.post.caption,platform:item.platform,saveState:isStoredEvidence()?'evidence-only':saved?.saveState || 'existing',scout_provenance:item.post.provenance,scout_content_assessment:item.contentAssessment,reason:item.contentAssessment.reason,assessment:item.contentAssessment.assessment,requestedScope:item.requestedScope,reviewState:item.contentAssessment.status==='verified'?'Qualified':'Needs Verification',kolId:item.kolId,communityId:item.communityId};});
 const posts=savedPosts.slice(0,limit).map((post,index)=>({...post,rank:index+1}));
 const unverified=savedPosts.filter(p=>p.reviewState==='Needs Verification');
 if(posts.length<limit)warnings.push(`Found ${posts.length}/${limit} posts in the selected window. Criteria were not relaxed.`);
 const coverage=[...sourceCoverage.values()].filter(c=>!c.post);const allFailed=coverage.length>0 && coverage.every(c=>c.status==='failed');const restriction=coverage.find(c=>['BILLING_REQUIRED','APPROVAL_REQUIRED','NOT_CONFIGURED'].includes(c.code));
 return {success:!allFailed,...(allFailed?{allFailed:true,error:warnings.join(' '),code:restriction?.code || 'SEARCH_FAILED',httpStatus:restriction?.code==='BILLING_REQUIRED'?402:502}:{}),selectionMode:'top',rankingMode:'views-first',posts,savedPosts,skippedPosts,groups:{qualified:posts.filter(p=>p.reviewState==='Qualified'),topByViews:posts.filter(p=>p.views!==null),viewsUnavailable:posts.filter(p=>p.views===null),needsVerification:unverified,belowTarget:skippedPosts.filter(p=>p.resultGroup==='Below Target'),excluded:skippedPosts.filter(p=>p.resultGroup==='Excluded')},counts:{...counts,saved:savedPosts.length,topDisplayed:posts.length,verified:qualified.length,qualified:qualified.length,topByViews:posts.filter(p=>p.views!==null).length,viewsUnavailable:posts.filter(p=>p.views===null).length,unverified:unverified.length,excluded:skippedPosts.filter(p=>p.resultGroup==='Excluded').length,belowTarget:skippedPosts.filter(p=>p.resultGroup==='Below Target').length},totalScouted:savedPosts.length,insertedCount:counts.inserted,partial:posts.length<limit || warnings.length>0,warnings,stopReason,searchExecution:{rounds,stopReason,requestedRows,providerCount,uniqueCount:unique.size,duplicateCount:duplicates,unparseableCount:unparseable},collectionCoverage:coverage,qualityCriteria:{cutoff:window.from,selectionMode:'top',rankingMode:'views-first',publishedFrom:window.from,publishedTo:window.to,candidateLimit:budget,minViews:params.qualityFilter?.minViews ?? params.minViews,minInteractions:params.qualityFilter?.minInteractions ?? params.minInteractions,thresholdsEnabled:params.qualityFilter?.enabled ?? params.thresholdsEnabled ?? false,qualityFilter:params.qualityFilter},message:`Top among ${providerCount.toLocaleString('en-US')} collected posts; ${savedPosts.length.toLocaleString('en-US')} ${isStoredEvidence()?'retained as evidence':'saved'}, ${qualified.length.toLocaleString('en-US')} verified, ${unverified.length.toLocaleString('en-US')} need verification.`,diagnostics:{providerCount,returnedCount:posts.length,stopReason}};
}

/** Time-limit fallback may save collected evidence after leaving the read-only replay context. */
export async function persistCollectedTopPosts(result:any, params:{kolId?:string;communityId?:string}) {
 await assertTopPostSchema();
 const counts={inserted:0,refreshed:0,duplicate:0};
 const items:Item[]=(result.savedPosts || result.posts || []).map((post:any)=>({post,platform:post.platform,kolId:post.scout_content_assessment?.ownership==='unknown'?undefined:params.kolId,communityId:post.scout_content_assessment?.ownership==='unknown'?undefined:params.communityId,sport:detectSportNiche(post.caption).join(', ') || 'Unknown',requestedScope:post.requestedScope || result.qualityCriteria,contentAssessment:post.scout_content_assessment}));
 const saved=await savePosts(items,counts,true);
 const posts=items.map(({post},index)=>{const row=saved.find((p:any)=>canonicalUrl(p.post_url)===post.url);return {...row,...post,id:row?.id || post.id,rank:index+1,saveState:row?.saveState || 'existing'};});
 const displayed=posts.slice(0,result.posts?.length || 10);
 return {...result,posts:displayed,savedPosts:posts,counts:{...result.counts,...counts},groups:{...result.groups,qualified:displayed.filter(p=>p.reviewState==='Qualified'),needsVerification:posts.filter(p=>p.reviewState==='Needs Verification'),topByViews:displayed.filter(p=>p.views!==null),viewsUnavailable:displayed.filter(p=>p.views===null)}};
}
