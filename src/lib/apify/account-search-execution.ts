import { createAdminClient } from '@/lib/supabase/admin';
import { accountModelPolicyKey, assertAccountModelPolicy, plannedAccountModelPolicy } from './account-model-policy';
import { classifyAccount, evidenceHash } from './account-model';
import { latestOwnedPosts } from './account-evidence';
import { assessAccountSize, assessReviewedProfile, type AccountAssessmentOptions } from './search-assessment';
import { mergeProfileEvidence, parsePost, parseProfile, providerPlans, scrape, type SocialProfile } from './providers';
import { capabilityKey } from './runtime';
import { checkpointTask } from './task-checkpoint';
import { PendingScout, ScoutError } from './errors';
import type { SearchPlan } from './search-plan';
import type { SearchExecution } from './planned-search';

const resumable = (error: any) => error instanceof PendingScout || ['START_UNKNOWN','RATE_LIMITED','PROVIDER_UNAVAILABLE','PLAN_STALE'].includes(error.code);
function interleave<T>(groups: T[][]): T[] {
  const result: T[] = [];
  for(let i=0;groups.some(group=>i<group.length);i++)for(const group of groups)if(i<group.length)result.push(group[i]);
  return result;
}
function reportProgress(sessionId: string, progress: Record<string, any>) {
  try {
    const t: any = createAdminClient().from('scout_sessions');
    if (typeof t?.update === 'function') void t.update({ progress }).eq('id', sessionId);
  } catch {}
}

/** Version 5 accounts have their own checkpoints; old plans retain their execution contract. */
export async function collectPlannedAccounts(params: Record<string,any>, existing: Set<string>, feedback: any[] = []): Promise<SearchExecution> {
  const plan: SearchPlan = params.searchPlan;
  const policy=plannedAccountModelPolicy(plan);assertAccountModelPolicy(policy);
  const savedExisting=await checkpointTask(params.sessionId,'account-search-5:existing',async()=>[...existing]);
  existing.clear();savedExisting.forEach((key:string)=>existing.add(key));
  const savedFeedback=await checkpointTask(params.sessionId,'account-search-5:feedback',async()=>feedback);
  const options: AccountAssessmentOptions={...plan.criteria,version:6};
  const pool=new Map<string,SocialProfile>();const attempted=new Set<string>();
  const rows:Record<string,any[]>={},rounds:any[]=[],warnings:string[]=[];
  let requestedRows=0,providerCount=0,duplicateCount=0,unparseableCount=0,noNewRounds=0,stopReason='plan-exhausted';
  const key=(p:SocialProfile)=>`${p.platform}:${p.url}`;
  const assess=(p:SocialProfile)=>assessReviewedProfile(p,plan.criteria.keyword,plan.criteria.geography,plan.criteria.targetType,{...options,entityAssessment:p.accountEntityAssessment?.evidenceHash===evidenceHash(p)?p.accountEntityAssessment:undefined},savedFeedback);
  const qualified=()=>[...pool.values()].filter(p=>!existing.has(key(p)) && assess(p).resultGroup==='Qualified').length;
  const priority=(p:SocialProfile)=>{
    const a=assess(p);const geography='geographyAssessment' in a?a.geographyAssessment:undefined;
    return Number(a.relevant)*100+Number(a.assessment.entityType.state==='passed')*20+Number(a.assessment.geography.state==='passed')*10+Number(geography?.mentionedMatch===true)*5;
  };
  const merge=(p:SocialProfile)=>{const previous=pool.get(key(p));pool.set(key(p),previous?mergeProfileEvidence(previous,p):p);};
  const db=createAdminClient();
  for(let index=0;index<plan.rounds.length;index++) {
    if(qualified()>=plan.criteria.limit){stopReason='target-reached';break;}
    if(requestedRows>=plan.maxSearchRows){stopReason='row-limit';break;}
    const work=interleave(plan.sources.map(source=>(source.rounds?.[index]?.queries || []).map(query=>({source,query,task:source.rounds![index].task}))));
    if(!work.length)continue;
    const allowance=Math.min(plan.maxSearchRows-requestedRows,Math.ceil(plan.maxSearchRows/plan.rounds.length));
    const round=await checkpointTask(params.sessionId,`account-search-5:round:${index}`,async()=>{
      const observations:any[]=[],details:SocialProfile[]=[],tried:string[]=[],errors:string[]=[];
      let requested=0,budgetStopped=false,duplicates=0,unparseable=0;
      const candidates=new Map(pool);
      for(const [i,unit] of work.entries()) {
        const limit=Math.floor(allowance/work.length)+(i<allowance%work.length?1:0);if(!limit)continue;
        const keys=providerPlans(unit.source.platform,unit.task,unit.query,1).map(p=>capabilityKey(p,unit.task)).filter(k=>unit.source.builds[k]);
        if(!keys.length){errors.push(`${unit.source.platform}: This search branch is unavailable.`);continue;}
        requested+=limit;
        reportProgress(params.sessionId,{stage:'running',round:index+1,totalRounds:plan.rounds.length,roundLabel:plan.rounds[index].label,currentQuery:unit.query,platform:unit.source.platform,candidatesFound:candidates.size,qualifiedCount:qualified(),targetCount:plan.criteria.limit});
        try {
          const values=await scrape(params.sessionId,unit.source.platform,unit.task,unit.query,limit,index===0?plan.criteria.geography:'Any location',{boundedSearch:true,searchPlan:{...unit.source,keys}});
          observations.push({platform:unit.source.platform,task:unit.task,values});
          for(const row of values) {
            const post=['keyword','hashtag'].includes(unit.task)?parsePost(row,unit.source.platform):null;
            let p=post?.authorUrl?parseProfile({profileUrl:post.authorUrl,name:post.author,username:post.username},unit.source.platform):!['keyword','hashtag'].includes(unit.task)?parseProfile(row,unit.source.platform):null;
            if(!p){unparseable++;continue;}
            if(post)p.posts=[post];
            const previous=candidates.get(key(p));if(previous){duplicates++;p=mergeProfileEvidence(previous,p);}
            candidates.set(key(p),p);
          }
        } catch(error:any) {if(resumable(error))throw error;errors.push(`${unit.source.platform}: ${error.message}`);if(error.code==='BUDGET_EXHAUSTED'){budgetStopped=true;break;}}
      }
      const byPlatform=plan.sources.map(source=>[...candidates.values()].filter(p=>p.platform===source.platform && !existing.has(key(p)) && !attempted.has(key(p)) && assessAccountSize(p,options)?.state!=='failed')
        .filter(p=>{const a=assess(p);return a.resultGroup!=='Qualified' && a.assessment.entityType.state!=='failed' && !a.reasons.some(r=>r.startsWith('Team feedback:'));})
        .sort((a,b)=>priority(b)-priority(a)).map(p=>({source,p})));
      // Reserve capacity for later rounds and share each round across platforms.
      const remaining=plan.maxHydratedProfiles-attempted.size;
      const capacity=Math.ceil(remaining/(plan.rounds.length-index));
      if(!budgetStopped)for(const {source,p} of interleave(byPlatform).slice(0,capacity)) {
        if(budgetStopped)break;
        const group=p.url.includes('/groups/');
        const detailKey=group?'':capabilityKey(providerPlans(p.platform,'profile-details',p.url,1)[0],'profile-details');
        const postKey=capabilityKey(providerPlans(p.platform,'profile-posts',p.url,1)[0],'profile-posts');
        let enriched=p;
        try {
          if(!group) {
            if(!source.builds[detailKey]){errors.push(`${p.platform}: Profile details are unavailable; evidence remains partial.`);continue;}
            tried.push(key(p));
            reportProgress(params.sessionId,{stage:'running',round:index+1,totalRounds:plan.rounds.length,roundLabel:plan.rounds[index].label,currentQuery:`Verifying ${p.name || p.username || 'profile'} (${p.platform})`,platform:p.platform,candidatesFound:candidates.size,qualifiedCount:qualified(),targetCount:plan.criteria.limit});
            const values=await scrape(params.sessionId,p.platform,'profile-details',p.url,1,'',{searchPlan:{...source,keys:[detailKey]}});
            for(const row of values){const detail=parseProfile(row,p.platform);if(detail?.url===p.url)enriched=mergeProfileEvidence(enriched,detail);}
          }
          if(assessAccountSize(enriched,options)?.state==='failed'){details.push(enriched);continue;}
          const assessment=assess(enriched);
          const needsEvidence=[assessment.assessment.topic,assessment.assessment.entityType,assessment.assessment.geography].some(d=>d.state!=='passed');
          if(needsEvidence && assessment.assessment.entityType.state!=='failed') {
            if(source.builds[postKey]) {
              if(group)tried.push(key(p));
              const values=await scrape(params.sessionId,p.platform,'profile-posts',p.url,plan.maxPostsPerProfile,'',{latestSample:true,searchPlan:{...source,keys:[postKey]}});
              enriched={...enriched,posts:[...enriched.posts,...values.map(row=>parsePost(row,p.platform)).filter((post):post is NonNullable<typeof post>=>!!post && post.authorUrl===p.url)]};
              enriched.posts=latestOwnedPosts(enriched);enriched.latestPostsVerified=source.options[postKey]?.latestProfilePosts===true;
            } else errors.push(`${p.platform}: Owned-post evidence is unavailable; coverage remains partial.`);
          }
          details.push(enriched);
        } catch(error:any){if(resumable(error))throw error;details.push(enriched);errors.push(`${p.platform} evidence: ${error.message}`);if(error.code==='BUDGET_EXHAUSTED')budgetStopped=true;}
      }
      return {observations,profiles:[...candidates.values()],details,tried,errors,requested,budgetStopped,duplicates,unparseable};
    });
    const before=[...pool.values()].filter(p=>!existing.has(key(p))).length;requestedRows+=round.requested;warnings.push(...round.errors);round.tried.forEach((id:string)=>attempted.add(id));
    duplicateCount+=round.duplicates;unparseableCount+=round.unparseable;
    for(const observation of round.observations){providerCount+=observation.values.length;(rows[observation.platform] ||= []).push(...observation.values);}
    round.profiles.forEach(merge);round.details.forEach(merge);
    for(const p of pool.values())p.accountEntityAssessment=await checkpointTask(params.sessionId,`account-search-5:model:${evidenceHash(p)}:${accountModelPolicyKey(policy)}`,()=>classifyAccount(p,policy.revision,policy.mode));
    if(pool.size){const stored=await checkpointTask(params.sessionId,`account-search-5:crm:${index}`,async()=>{const {data,error}=await db.from(plan.criteria.targetType==='Communities & Clubs'?'communities':'kols').select('scout_identity').in('scout_identity',[...pool.keys()]);if(error)throw error;return data || [];});stored.forEach((r:any)=>existing.add(r.scout_identity));}
    const added=Math.max(0,[...pool.values()].filter(p=>!existing.has(key(p))).length-before);noNewRounds=added?0:noNewRounds+1;
    rounds.push({round:index+1,label:plan.rounds[index].label,queries:work.map(w=>w.query),newIdentities:added,qualifiedNew:qualified(),requestedRows:round.requested});
    if(round.budgetStopped){stopReason='budget-exhausted';break;}
    if(index>=2 && noNewRounds>=2){stopReason='no-new-identities';break;}
  }
  if(qualified()>=plan.criteria.limit)stopReason='target-reached';
  if(!Object.keys(rows).length && warnings.length && stopReason!=='budget-exhausted')throw new ScoutError(warnings.join(' '),'SEARCH_FAILED',502);
  const profiles:Record<string,SocialProfile[]>={};for(const p of pool.values())(profiles[p.platform] ||= []).push(p);
  return {rounds,stopReason,requestedRows,providerCount,uniqueCount:pool.size,duplicateCount,unparseableCount,hydratedProfiles:attempted.size,warnings:[...new Set(warnings)],rows,profiles};
}
