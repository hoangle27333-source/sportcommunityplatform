import { assessContentFilter, type ContentFilter } from './content-settings';
import { channelMembership, assessTopPost } from './top-post-quality';
import { hasDiscoveryLead } from '../scout-experimental/retrieval-admission';
import { type AccountSizeCriteria } from './account-criteria';
import { currentAccountModelPolicy, plannedAccountModelPolicy, assertAccountModelPolicy, accountModelPolicyKey, type AccountModelPolicy } from './account-model-policy';
import { legacyEntityType, ENTITY_TYPES, assessAccountEntity, legacyClassification, type EntityAssessment, type EntityType } from './account-evidence';
import { classifyAccount, evidenceHash } from './account-model';
import { createHash } from 'node:crypto';
import { collectPlannedSearch } from './planned-search';
import { assessSearchProfile, assessSearchContent, assessProfileFollowers, assessAccountSize, assessReviewedProfile, activeNegativeFeedback } from './search-assessment';
import type { SearchPlan } from './search-plan';
import { assessSearchPost } from './content-quality';
import { canonicalScopes } from './geography';
import { isStoredEvidence, savedProviderRows } from './stored-evidence';
import { checkpointTask } from './task-checkpoint';
import { workflowExecution } from './execution-budget';
import { getStoredEntityChannels } from '@/lib/sport-hub/channel-store';
import {assessTopicPost,assessEngagement,comparePostEngagement,type ContentQuality} from './content-quality';
import {sessionSnapshot} from './session-snapshot';
import {ACTOR_CONTRACTS} from './registry';
import {providerPlans} from './providers';
import { createAdminClient } from "@/lib/supabase/admin";
import { quotas, roundRobin, retrievalWindow, advanceWatermark } from "./collection";
import { channelUrl } from "./tasks";
import { randomUUID } from "node:crypto";
import { assessProfile, canonicalUrl, platformMatches, urlKind, contextKey, normalized, tokens, hashtagMatch, type Classification } from "./discovery-quality";
import { scrape, parseProfile, mergeProfileEvidence, parsePost, ScoutError, type SocialProfile, type SocialPost, PendingScout } from "./providers";
import { recordPostMetadata, postMetadata } from './post-metadata';
import { loadPostAccounts, matchPostAuthor, matchPostGroup, hasSavedPostAuthor } from './post-accounts';
import type { PostSource } from './post-contracts';

export type CollectedPost = { post: SocialPost; platform: string; kolId?: string; communityId?: string; sport: string; requestedScope?: unknown; contentAssessment?: any; collectionSource?: PostSource; authorAccount?: { entityType: 'kol' | 'community'; id: string } };

export function detectSportNiche(text: string): string[] {
  const t = (text || "").toLowerCase();
  const sports: string[] = [];

  const mapping: Record<string, string> = {
    pickleball: "Pickleball",
    tennis: "Tennis",
    "chạy bộ": "Chạy bộ / Marathon",
    marathon: "Chạy bộ / Marathon",
    run: "Chạy bộ / Marathon",
    runner: "Chạy bộ / Marathon",
    running: "Chạy bộ / Marathon",
    trail: "Chạy bộ / Marathon",
    gym: "Gym & Fitness",
    fitness: "Gym & Fitness",
    workout: "Gym & Fitness",
    yoga: "Gym & Fitness",
    pilates: "Gym & Fitness",
    "cầu lông": "Cầu lông",
    badminton: "Cầu lông",
    "bóng đá": "Bóng đá",
    football: "Bóng đá",
    soccer: "Bóng đá",
    "đạp xe": "Đạp xe",
    cycling: "Đạp xe",
    bike: "Đạp xe",
    golf: "Golf",
    bơi: "Khác",
    swimming: "Khác",
  };

  for (const [kw, sport] of Object.entries(mapping)) {
    if ((` ${normalized(t)} `).includes(` ${normalized(kw)} `) && !sports.includes(sport)) {
      sports.push(sport);
    }
  }

  return sports.length > 0 ? sports : ["Khác"];
}

export function calculateTier(followers: number): string {
  if (followers >= 1000000) return "Celebrity (> 1M)";
  if (followers >= 200000) return "Mega (> 200k)";
  if (followers >= 50000) return "Macro (50k - 200k)";
  if (followers >= 10000) return "Micro (10k - 50k)";
  return "Nano (< 10k)";
}

export function buildProfileUrl(platform: string, username: string, originalUrl?: string): string {
  const cleanUser = (username || "").toLowerCase().trim().replace(/^@/, "");
  if (!cleanUser) return originalUrl || "";

  const p = (platform || "").toLowerCase();
  if (p.includes("instagram")) {
    return `https://www.instagram.com/${cleanUser}/`;
  }
  if (p.includes("tiktok")) {
    return `https://www.tiktok.com/@${cleanUser}`;
  }
  if (p.includes("youtube")) {
    return `https://www.youtube.com/@${cleanUser}`;
  }
  if (p.includes("facebook")) {
    if (!originalUrl || originalUrl.includes("/posts/") || originalUrl.includes("/videos/") || originalUrl.includes("/watch/") || originalUrl.includes("/photo/")) {
      return `https://www.facebook.com/${cleanUser}`;
    }
    return originalUrl;
  }
  return originalUrl || "";
}

export type DiscoveryCandidate = Omit<SocialProfile, 'provenance'> & ReturnType<typeof assessProfile> & { assessment?:Record<string,import('./search-assessment').Dimension>; candidateId: string; accountKey: string; isExisting: boolean; existingId?: string; entityAssessment?: EntityAssessment; geographyAssessment?: ReturnType<typeof import('./account-evidence').assessAccountGeography>; assessmentVersion?:number; provenance: Partial<NonNullable<SocialProfile['provenance']>> & { platform: string; fetchedAt: string; profileUrl: string } };
function check(error: any) { if (error) throw error; }
function cleanTarget(target: string) { return ['Communities & Clubs', 'Cộng đồng / Group'].includes(target) ? 'Communities & Clubs' : 'Individual KOLs'; }
/** Rank only provider-observed values; missing measurements are never treated as zero. */
export function compareDiscoveryMetrics(a: Pick<SocialProfile, 'followers' | 'avgViews' | 'er'>, b: Pick<SocialProfile, 'followers' | 'avgViews' | 'er'>) {
  for (const key of ['followers', 'avgViews', 'er'] as const) {
    const left = a[key] !== null && Number.isFinite(a[key]) ? a[key]! : null;
    const right = b[key] !== null && Number.isFinite(b[key]) ? b[key]! : null;
    if (left === null && right !== null) return 1;
    if (right === null && left !== null) return -1;
    if (left !== null && right !== null && left !== right) return right - left;
  }
  return 0;
}
export async function previewDiscoveryCandidates(params: AccountSizeCriteria & { keyword: string; assessmentRevision?:number; targetType?: string; platform?: string | string[]; limit?: number; geography?: string; queryVariants?: string[]; searchPlan?:SearchPlan; assessmentVersion?:number; accountModelPolicy?:AccountModelPolicy; accountPolicyVersion?:5; entityTypes?:EntityType[]; geographyMode?:'profile'|'profile-or-recent-posts'; sessionId: string; savedExperimentalProfiles?:SocialProfile[]; searchStrategy?:string }) {
  const db = createAdminClient(); const platforms = [...new Set(Array.isArray(params.platform) ? params.platform : [params.platform || 'Instagram'])]; const target = cleanTarget(params.targetType || ''); const geography = canonicalScopes(params.geography || 'Nationwide') as string;

  const { data: existing, error } = await db.from(target === 'Communities & Clubs' ? 'communities' : 'kols').select('*'); check(error);
  const { data: feedback, error: feedbackError } = await db.from('scout_feedback').select('*').order('created_at', { ascending: false }); check(feedbackError);
  const accountV5=params.searchPlan?.accountPolicyVersion===5 || (params.assessmentVersion || 0)>=5 || (params.assessmentRevision || 0)>=6 || params.accountPolicyVersion===5 || params.minFollowers!==undefined;
  const experimental=params.searchPlan?.version===6 || params.assessmentRevision===7;
  const revision=experimental?7:params.searchPlan?.version===5 || params.assessmentRevision===6?6:5;
  const modelPolicy:AccountModelPolicy=experimental?{version:5,revision:'rules-5',mode:'off'}:accountV5?(params.accountModelPolicy || (params.searchPlan?.accountPolicyVersion===5?plannedAccountModelPolicy(params.searchPlan):currentAccountModelPolicy())):{version:5,revision:'rules-5',mode:'off'};
  if(accountV5 && !experimental)assertAccountModelPolicy(modelPolicy);
  const planned=params.savedExperimentalProfiles?{profiles:Object.fromEntries(platforms.map(platform=>[platform,params.savedExperimentalProfiles!.filter(p=>p.platform===platform)])),rows:{},warnings:[],stopReason:'stored-evidence',providerCount:0}:params.searchPlan && !isStoredEvidence() ? await collectPlannedSearch(params,new Set([...(existing || []).map(e=>e.scout_identity || `${String(e.platform).split(' ')[0]}:${canonicalUrl(e.profile_url || e.group_url || '')}`),...(feedback || []).filter(f=>f.context_key===contextKey(params.keyword,geography) && ['Not Relevant','Wrong Location'].includes(f.reason)).map(f=>f.account_key)]),feedback || []) : null;
  const strictCriteria=revision>=6;
  const assessmentOptions=accountV5?{...params.searchPlan?.criteria,...params,version:revision,minFollowers:params.minFollowers ?? params.searchPlan?.criteria?.minFollowers,entityTypes:params.entityTypes || params.searchPlan?.criteria?.entityTypes,geographyMode:params.geographyMode || params.searchPlan?.criteria?.geographyMode}:undefined;
  const discardedDiscovery:any[] = [...((planned as any)?.discardedDiscovery || [])];
  const candidates: DiscoveryCandidate[] = []; const seen = new Set<string>();
  const warnings:string[]=[...(planned?.warnings || [])];
  const providerResults = new Set<string>();
  const failures: { platform: string; error: string; code?: string; status?: number }[] = [];
  for (const platform of platforms) {
  try {
  const plans=providerPlans(platform,target==='Communities & Clubs' ? 'communities' : 'profiles',params.keyword,params.limit || 5,geography);
  const canExpand=plans.every(plan=>ACTOR_CONTRACTS[plan.actor]?.canExpand);
  // The requested count is a minimum target, not a cap on returned profiles.
  // Keep collection bounded by the existing provider and budget contracts.
  const poolLimit = Math.min((params.limit || 5) * (canExpand ? 3 : 1), 60);
  const raw = planned ? planned.profiles[platform] || [] : isStoredEvidence() && strictCriteria ? ['profiles','communities','keyword','hashtag'].flatMap(task=>savedProviderRows(platform,task) || []) : await scrape(params.sessionId, platform, target === 'Communities & Clubs' ? 'communities' : 'profiles', params.keyword, poolLimit, geography, {queryVariants:params.queryVariants});
  const savedPosts=isStoredEvidence()?(strictCriteria?['profile-posts','keyword','hashtag'].flatMap(task=>savedProviderRows(platform,task) || []):savedProviderRows(platform,'profile-posts') || []).map(row=>parsePost(row,platform)).filter((post):post is SocialPost=>!!post):[];
  const savedDetails=isStoredEvidence() ? (savedProviderRows(platform,'profile-details') || []).map(row=>parseProfile(row,platform)).filter((p):p is SocialProfile=>!!p) : [];
  for (const row of raw) providerResults.add(`${platform}:${JSON.stringify(row)}`);
  const authorUrls=planned ? [] : [...new Set(raw.filter(r=>!parseProfile(r,platform)).map(r=>parsePost(r,platform)?.authorUrl).filter(Boolean))].filter(url=>!seen.has(`${platform}:${url}`)) as string[];
  const hydrated:SocialProfile[]=[];
  for(let i=0;i<authorUrls.length;i+=10) { const urls=authorUrls.slice(i,i+10); const rows=await scrape(params.sessionId,platform,'profile-details',urls[0],1,'',{urls}); hydrated.push(...rows.map(r=>parseProfile(r,platform)).filter(Boolean) as SocialProfile[]); }
  // Facebook search supplies identities, not audience counts. Details are part of
  // this requested discovery task; durable provider runs keep worker retries safe.
  const facebookAudience = new Map<string, SocialProfile>();
  if (!planned && platform === 'Facebook') {
    const urls = [...new Set(raw.map(row => parseProfile(row,platform)).filter((profile): profile is SocialProfile => {
      if(!profile || profile.url.includes('/groups/'))return false;
      const evidence=assessProfile(profile,params.keyword,geography,target);
      return profile.followers===null || evidence.classification==='Unknown' || !evidence.locationMatch;
    }).map(profile => profile.url))].slice(0,10);
    for (let i=0;i<urls.length;i+=10) {
      const batch=urls.slice(i,i+10);
      try {
        const details=await scrape(params.sessionId,platform,'profile-details',batch[0],1,'',{urls:batch});
        for (const row of details) {
          const observed=parseProfile(row,platform);if(!observed)continue;
          const aliases=[observed.url,row.facebookUrl,row.pageUrl,row.url].map(value=>canonicalUrl(value || ''));
          for (const url of batch) if(aliases.includes(url))facebookAudience.set(url,observed);
        }
      } catch(e:any) {
        if(e instanceof PendingScout || e.code==='START_UNKNOWN')throw e;
        warnings.push(`Facebook audience details: ${e.message}. Search profiles remain available with Unknown followers.`);
        break;
      }
    }
    const missing=urls.filter(url=>facebookAudience.get(url)?.followers==null).length;
    if(missing)warnings.push(`Facebook: Followers were unavailable for ${missing} profiles. Missing values remain Unknown; page likes are not used as followers.`);
  }
  for (const row of raw) {
    let profile = planned ? row as SocialProfile : parseProfile(row, platform);
    const detail=profile && savedDetails.find(p=>p.url===profile!.url);
    if(profile && detail)profile=mergeProfileEvidence(profile,detail);
    const audience=profile && facebookAudience.get(profile.url);
    if(profile && audience)profile=mergeProfileEvidence(profile,audience);
    // A post-only search hit cannot impersonate a profile: hydrate its author.
    if (!profile) {
      const post = parsePost(row, platform);
      if (post?.authorUrl) {
        profile = hydrated.find(p => p.url === post.authorUrl) || null;
      }
    }
    if (!profile) continue;
    // Reassessment replays already admitted review candidates, including manual reviews.
    if(experimental && !params.savedExperimentalProfiles && !hasDiscoveryLead(profile,params.keyword)){discardedDiscovery.push({...profile,reason:"No observed topic hint, supporting content or seed connection. Search query is not evidence."});continue;}
    if(accountV5 && savedPosts.length)profile={...profile,posts:[...profile.posts,...savedPosts.filter(post=>post.authorUrl===profile!.url)]};
    const accountKey = `${platform}:${profile.url}`; if (seen.has(accountKey)) continue; seen.add(accountKey);
    const inferredEntity=accountV5 && !experimental?profile.accountEntityAssessment || await checkpointTask(params.sessionId,`account-v5:${evidenceHash(profile)}:${accountModelPolicyKey(modelPolicy)}`,()=>classifyAccount(profile!,modelPolicy.revision,modelPolicy.mode)):undefined;
    const modelEntity=inferredEntity?{...inferredEntity,policyKey:accountModelPolicyKey(modelPolicy)}:undefined;
    const reviewedEntity=experimental ? (profile as Partial<DiscoveryCandidate>).entityAssessment : undefined;
    const assessment = strictCriteria ? assessReviewedProfile(profile,params.keyword,geography,target,{...assessmentOptions,entityAssessment:modelEntity || reviewedEntity},feedback || []) : (accountV5 || params.searchPlan || (params.assessmentVersion || 0)>=4) ? assessSearchProfile(profile, params.keyword, geography, target, assessmentOptions?{...assessmentOptions,entityAssessment:modelEntity}:undefined) : assessProfile(profile, params.keyword, geography, target);
    const applicable = (feedback || []).filter(f => f.account_key === accountKey);
    const classificationFeedback = applicable.find(f => f.classification && ['Correct Classification', 'Wrong Entity Type'].includes(f.reason));
    if (classificationFeedback && !strictCriteria) {
      if(accountV5) {
        const reviewedType=ENTITY_TYPES.includes(classificationFeedback.entity_type)?classificationFeedback.entity_type as EntityType:legacyEntityType(classificationFeedback.classification);
        const corrected=assessSearchProfile(profile,params.keyword,geography,target,{...assessmentOptions,entityAssessment:{...(modelEntity || assessAccountEntity(profile)),suggestedType:reviewedType,reviewedType,status:reviewedType==='Unknown'?'uncertain':'supported',source:'review'}});
        Object.assign(assessment,corrected);
      } else {
        assessment.classification = classificationFeedback.classification;
        assessment.reviewState = !assessment.relevant ? 'Excluded' : assessment.classification === 'Unknown' || !assessment.locationMatch ? 'Needs Review' : 'Matched';
        if (assessment.classification !== 'Unknown' && assessment.classification !== (target === 'Communities & Clubs' ? 'Community' : 'Individual')) assessment.reviewState = 'Excluded';
        if('assessment' in assessment) {const dimensions=assessment.assessment as any;dimensions.entityType={state:assessment.classification==='Unknown'?'unknown':assessment.classification===(target==='Communities & Clubs'?'Community':'Individual')?'passed':'failed',reason:`Entity type: ${assessment.classification}`,evidence:['Team review']};}
      }
      assessment.reasons.push('Entity type confirmed by team review');
    }
    const contextual = strictCriteria ? undefined : applicable.find(f => f.context_key === contextKey(params.keyword, geography) && ['Not Relevant', 'Wrong Location'].includes(f.reason));
    if (contextual) { assessment.reviewState = 'Excluded'; assessment.reasons.push(`Team feedback: ${contextual.reason}`); }
    if('resultGroup' in assessment)assessment.resultGroup=assessment.reviewState==='Matched'?'Qualified':assessment.reviewState==='Needs Review'?'Needs Verification':'Excluded';
    const match = existing?.find(e => e.scout_identity === accountKey || canonicalUrl(e.profile_url || e.group_url || '') === profile!.url);
    candidates.push({ ...profile, ...assessment,...(accountV5?{assessmentVersion:revision}:{}), candidateId: params.searchPlan ? stableCandidateId(params.sessionId,accountKey) : randomUUID(), accountKey, isExisting: !!match, existingId: match?.id, provenance: { platform, ...profile.provenance, fetchedAt: profile.provenance?.fetchedAt || new Date().toISOString(), profileUrl: profile.url } });
  }
  } catch (e: any) {
    if (e instanceof PendingScout) throw e;
    if (e.code === 'START_UNKNOWN') throw e;
    if (platforms.length === 1) throw e;
    failures.push({ platform, error: e.message, code: e.code, status: e.status });
    warnings.push(`${platform}: ${e.message}`);
  }
  }
  if (failures.length === platforms.length) throw new ScoutError(failures[0].error, failures[0].code || 'PROVIDER_UNAVAILABLE', failures[0].status || 502);
  const visible = candidates.filter(c => accountV5 || c.reviewState !== 'Excluded').sort((a,b)=> strictCriteria ? Number(b.reviewState==='Matched')-Number(a.reviewState==='Matched') || Number(a.isExisting)-Number(b.isExisting) || (assessmentOptions?.sizeMetric==='members'?(b.members ?? -1)-(a.members ?? -1):compareDiscoveryMetrics(a,b)) : target==='Communities & Clubs'?(b.members ?? -1)-(a.members ?? -1):compareDiscoveryMetrics(a,b));
  const requestedCount = params.limit || 5;
  const qualifiedNew=visible.filter(c=>c.reviewState==='Matched' && !c.isExisting).length;
  const reasonCounts:Record<string,number>={};
  for(const c of candidates.filter(c=>c.reviewState==='Excluded')) for(const reason of c.reasons) if(reason==='Topic is not supported by profile evidence' || reason==='Observed location conflicts with selected geography' || reason.startsWith('Team feedback:') || reason.startsWith('Entity type:') && c.classification !== (target==='Communities & Clubs' ? 'Community' : 'Individual')) reasonCounts[reason]=(reasonCounts[reason] || 0)+1;
  const diagnostics = { discardedDiscovery,discardedDiscoveryCount:discardedDiscovery.length, ...(accountV5?{accountModelPolicy:modelPolicy,accountModelPolicyKey:accountModelPolicyKey(modelPolicy)}:{}),qualifiedNew,shortfall:Math.max(0,requestedCount-qualifiedNew),stopReason:planned?.stopReason || 'stored-evidence',assessmentVersion:accountV5?revision:params.searchPlan || (params.assessmentVersion || 0)>=4 ?4:3,reasonCounts,items:candidates.map(c=>({accountKey:c.accountKey,name:c.name,reviewState:c.reviewState,reasons:c.reasons,evidence:c.evidence})),requestedCount, providerCount: planned?.providerCount ?? providerResults.size, uniqueProfileCount: candidates.length, excludedCount: candidates.filter(c => c.reviewState === 'Excluded').length, returnedCount: visible.length };
  if(discardedDiscovery.length)warnings.push(`${discardedDiscovery.length.toLocaleString("en-US")} discovery hits were discarded because they had no observed topic hint or seed connection. They remain in the discovery audit; this does not classify their accounts as off-topic.`);
  if (qualifiedNew < requestedCount) warnings.push(`Found ${qualifiedNew}/${requestedCount} qualified new accounts; ${Math.max(0,requestedCount-qualifiedNew)} still needed. Search stopped: ${planned?.stopReason || 'available-evidence-exhausted'}. Missing evidence remains available for review.`);
  const { error: saveError } = await db.from('scout_sessions').update({ candidates: visible }).eq('id', params.sessionId); check(saveError);
  return { ...((accountV5 || params.searchPlan || (params.assessmentVersion || 0)>=4)?{searchExecution:planned?{...planned,rows:undefined,profiles:undefined}:undefined,groups:{qualified:visible.filter(c=>c.reviewState==='Matched'),needsVerification:visible.filter(c=>c.reviewState==='Needs Review'),belowTarget:[],excluded:candidates.filter(c=>c.reviewState==='Excluded')},counts:{qualifiedNew,shortfall:Math.max(0,requestedCount-qualifiedNew),qualified:visible.filter(c=>c.reviewState==='Matched').length,unverified:visible.filter(c=>c.reviewState==='Needs Review').length,excluded:diagnostics.excludedCount,found:visible.length,existing:visible.filter(c=>c.isExisting).length}}:{}), success: true, sessionId: params.sessionId, criteria: { ...(experimental?{searchStrategy:'seed_content_v1'}:{}),...(accountV5?{accountPolicyVersion:5,...(strictCriteria?{assessmentRevision:revision,sizeMetric:assessmentOptions?.sizeMetric || 'followers',maxFollowers:assessmentOptions?.maxFollowers,minMembers:assessmentOptions?.minMembers,maxMembers:assessmentOptions?.maxMembers}:{}),minFollowers:assessmentOptions?.minFollowers,entityTypes:assessmentOptions?.entityTypes,geographyMode:assessmentOptions?.geographyMode || 'profile-or-recent-posts'}:{}),keyword: params.keyword, targetType: target, platform: platforms.length === 1 ? platforms[0] : platforms, geography, limit: requestedCount }, candidates: visible, effectiveQuery: params.keyword, totalFound: visible.length, newCount: visible.filter(c => !c.isExisting).length, existingCount: visible.filter(c => c.isExisting).length, excludedCount: diagnostics.excludedCount, diagnostics,partial:warnings.length>0,warnings, failed: failures, ranking: 'followers-members-desc,avg-views-desc,er-desc;unknown-last' };
}
export async function ingestSelectedCandidates(params: { sessionId: string; selected: { candidateId: string; classification?: Classification; relevant?: boolean; locationConfirmed?: boolean }[]; actorId: string; }) {
  const db = createAdminClient(); const { data: loadedSession, error } = await db.from('scout_sessions').select('*').eq('id', params.sessionId).eq('owner_id', params.actorId).single(); if (error || !loadedSession) throw new ScoutError('Preview not found', 'NOT_FOUND', 404);
  if (loadedSession.kind !== 'preview' || loadedSession.status !== 'complete') throw new ScoutError('Discovery preview is not ready', 'INVALID_PREVIEW', 400);
  if (!params.selected.length || new Set(params.selected.map(s => s.candidateId)).size !== params.selected.length) throw new ScoutError('Select unique candidates to import', 'INVALID_SELECTION', 400);
  const importToken=randomUUID();
  const {data:claimed,error:claimError}=await db.from('scout_sessions').update({import_token:importToken,import_lease_until:new Date(Date.now()+120000).toISOString()}).eq('id',params.sessionId).eq('owner_id',params.actorId).or(`import_lease_until.is.null,import_lease_until.lt.${new Date().toISOString()}`).select('*').maybeSingle();check(claimError);
  if(!claimed)throw new ScoutError('This preview is already being imported. Retry after the current import finishes.','IMPORT_IN_PROGRESS',409);
  // Use the snapshot returned by the lease claim, including edits completed after the initial read.
  const session=claimed;
  const reviewDecisions = session.review_decisions || {};
  const heartbeat=setInterval(()=>void db.from('scout_sessions').update({import_lease_until:new Date(Date.now()+120000).toISOString()}).eq('id',params.sessionId).eq('import_token',importToken).then(({error})=>{if(error)console.error('[social-scout] Import lease renewal failed',error.code);}),30000);
  try {
  const expected = cleanTarget(session.params.targetType) === 'Communities & Clubs' ? 'Community' : 'Individual';
  const audienceCriteria={...session.params.searchPlan?.criteria,...session.params};
  const minFollowers = audienceCriteria.minFollowers;
  const { data: latestFeedback, error: feedbackError } = await db.from('scout_feedback').select('*').order('created_at', { ascending: false }); check(feedbackError);
  const selected: DiscoveryCandidate[] = params.selected.map(s => {
    const c: DiscoveryCandidate | undefined = session.candidates.find((c: DiscoveryCandidate) => c.candidateId === s.candidateId);
    const savedDecision = reviewDecisions?.[s.candidateId];
    if (savedDecision?.decision === 'approved') s = { ...s, classification: savedDecision.classification, relevant: savedDecision.relevant, locationConfirmed: savedDecision.locationConfirmed };
    if(c?.entityAssessment && !['Individual','Community','Club'].includes(savedDecision?.entityType || c.entityAssessment.suggestedType)) throw new ScoutError('This account type cannot be imported into the current CRM.', 'WRONG_TYPE',400);
    if(c?.entityAssessment && savedDecision?.evidenceHash && savedDecision.evidenceHash!==c.entityAssessment.evidenceHash)throw new ScoutError('Account evidence changed after review.', 'PREVIEW_STALE',409);
    if(c && (audienceCriteria.assessmentRevision>=6 || [5,6].includes(session.params.searchPlan?.version) ? assessAccountSize(c,audienceCriteria)?.state && assessAccountSize(c,audienceCriteria)?.state!=='passed' : minFollowers > 0 && assessProfileFollowers(c,minFollowers)?.state!=='passed'))throw new ScoutError('Observed followers or members must meet the selected range before import.', 'FOLLOWER_THRESHOLD_REQUIRED',400);
    if(c && (audienceCriteria.assessmentRevision>=6 || [5,6].includes(session.params.searchPlan?.version))) {
      const checked=assessReviewedProfile({...c,provenance:undefined},session.params.keyword,session.params.geography,session.params.targetType,{...audienceCriteria,version:audienceCriteria.assessmentRevision===7 || session.params.searchPlan?.version===6?7:6,entityAssessment:c.entityAssessment},latestFeedback || []);
      if(checked.resultGroup==='Excluded' || (session.params.searchPlan?.version===6 || audienceCriteria.assessmentRevision===7) && checked.resultGroup!=='Qualified')throw new ScoutError('Current account evidence does not meet the selected criteria.', 'PREVIEW_STALE',409);
    }
    if (!c || c.reviewState === 'Excluded') throw new ScoutError('Candidate is not in this preview', 'INVALID_SELECTION', 400);
    if (!platformMatches(c.platform, c.url) || urlKind(c.url) !== (expected === 'Community' && c.url.includes('/groups/') ? 'group' : 'profile') || c.accountKey !== `${c.platform}:${canonicalUrl(c.url)}`) throw new ScoutError('This preview contains an invalid profile URL. Search again before importing.', 'INVALID_PROFILE_URL', 409);
    const feedback = (latestFeedback || []).filter(f => f.account_key === c.accountKey);
    const typeCorrection = feedback.find(f => f.classification && ['Wrong Entity Type', 'Correct Classification'].includes(f.reason));
    if (typeCorrection && (typeCorrection.classification !== c.classification || c.entityAssessment && typeCorrection.entity_type && typeCorrection.entity_type !== c.entityAssessment.suggestedType) || activeNegativeFeedback(c,session.params.keyword,session.params.geography,feedback)) throw new ScoutError('Team feedback invalidated this candidate. Search again before importing.', 'PREVIEW_STALE', 409);
    if (c.reviewState === 'Needs Review' && (s.classification !== expected || s.relevant !== true || s.locationConfirmed !== true)) throw new ScoutError('Confirm entity type, relevance and location before importing Needs Review candidates', 'REVIEW_REQUIRED', 400);
    if (c.reviewState === 'Matched' && c.classification !== expected) throw new ScoutError('Candidate has the wrong entity type', 'WRONG_TYPE', 400);
    if (reviewDecisions?.[s.candidateId]?.decision !== 'approved') throw new ScoutError('This profile is not approved. Approve it before importing.', 'REVIEW_REQUIRED', 400);
    return c;
  });
  const decisions = { ...reviewDecisions };
  for (const s of params.selected) decisions[s.candidateId] = { ...decisions[s.candidateId], decision: 'approved', actorId: params.actorId, confirmedAt: new Date().toISOString() };
  const { error: reviewError } = await db.from('scout_sessions').update({ review_decisions: decisions }).eq('id', params.sessionId).eq('owner_id', params.actorId); check(reviewError);
  let insertedKols = 0, updatedKols = 0, insertedCommunities = 0, updatedCommunities = 0, insertedPosts = 0;
  const postLinkResults:any[]=[];
  const importedAccounts:{entityType:'kol'|'community';id:string}[]=[];
  const table = expected === 'Community' ? 'communities' : 'kols';
  for (const c of selected) {
    const { data: records, error: readError } = await db.from(table).select('*'); check(readError);
    const authorRegistry=session.params.suggestionIdentity?await loadPostAccounts():[];
    const savedAuthor=session.params.suggestionIdentity?matchPostAuthor(authorRegistry,c.platform,c.url):undefined;
    if(session.params.suggestionIdentity && !savedAuthor && hasSavedPostAuthor(authorRegistry,c.platform,c.url))throw new ScoutError('Several saved accounts claim this channel. Resolve the identity conflict before importing.','POST_ACCOUNT_CONFLICT',409);
    if(savedAuthor && savedAuthor.entityType!==(expected==='Individual'?'kol':'community'))throw new ScoutError('This publishing account already exists in another CRM destination. Refresh the suggestion list.','SUGGESTION_STALE',409);
    const existing = records?.find(r => r.id===savedAuthor?.id || r.scout_identity === c.accountKey || r.id === c.existingId || canonicalUrl(r.profile_url || r.group_url || '') === c.url);
    const metrics: Record<string, any> = {};
    if(c.entityAssessment){ metrics.scout_entity_assessment={...c.entityAssessment,reviewedType:reviewDecisions[c.candidateId]?.entityType};metrics.scout_geography_assessment=c.geographyAssessment; if(expected==='Community'){metrics.community_subtype=reviewDecisions[c.candidateId]?.entityType || (['Community','Club'].includes(c.entityAssessment.suggestedType)?c.entityAssessment.suggestedType:null);metrics.account_followers=c.followers;} }
    if (expected==='Community') {metrics.scout_missing_metrics=c.members==null?['members']:[];if(c.members!=null)metrics.members_count=c.members;if(c.followers!=null)metrics.account_followers=c.followers;}
    else if(c.followers!==null)metrics.followers=c.followers;
    if (expected === 'Individual') {
      if (c.avgViews !== null) metrics.avg_views = c.avgViews;
      if (c.er !== null) metrics.er = c.er;
      metrics.scout_missing_metrics = ['followers', 'avgViews', 'er'].filter(k => (c as any)[k] === null);
      metrics.last_scouted_at = new Date().toISOString();
    }
    const experimentalImport=c.assessmentVersion===7;
    const observedProvenance=experimentalImport?{...c.provenance,assessmentRevision:7,contentEvidence:c.contentEvidence,assessment:c.assessment,manualAttributeReview:c.manualAttributeReview,discoveryPaths:c.discoveryPaths,geographyAssessment:c.geographyAssessment}:c.provenance;
    const observedSports=detectSportNiche(experimentalImport?session.params.keyword:`${c.name} ${c.bio}`);
    let entityId = existing?.id;
    if (existing) {
      if (expected === 'Community' && c.members == null) metrics.scout_missing_metrics = existing.scout_missing_metrics || [];
      if (expected === 'Individual') metrics.scout_missing_metrics = (existing.scout_missing_metrics || []).filter((k: string) => (c as any)[k] === null);
      const payload: any = { ...metrics, scout_identity: session.params.suggestionIdentity?existing.scout_identity || c.accountKey:c.accountKey,scout_provenance:observedProvenance };
      for(const field of existing.user_locked_fields || []) { const mapped:Record<string,string>={avgViews:'avg_views',followers:'followers',er:'er'}; delete payload[mapped[field] || field]; }
      if (expected === 'Individual') {
        const changes: any = {}; const locked = new Set(existing.user_locked_fields || []);
        if (c.bio && c.bio !== existing.bio && !locked.has('bio')) changes.bio = { current: existing.bio, scouted: c.bio };
        if (Object.keys(changes).length) payload.pending_scout_diff = { scoutedAt: new Date().toISOString(), changes };
      }
      const { error: updateError } = await db.from(table).update(payload).eq('id', existing.id); check(updateError);
      if (expected === 'Individual') updatedKols++; else updatedCommunities++;
    } else {
      const payload = expected === 'Community' ? { name: c.name, sports: observedSports, geography: c.verifiedGeography || 'Unknown', platform: c.url.includes('/groups/') ? 'Facebook Group' : c.platform, group_url: c.url, activity_level: 'Unknown', privacy: 'Unknown', purposes: [], price_per_pin: 0, status: 'New Scout (Unverified)' } : { name: c.name, sports: observedSports, geography: c.verifiedGeography || 'Unknown', platform: c.platform, profile_url: c.url, bio: c.bio, avatar_url: c.avatarUrl, tier: c.followers === null ? 'Unknown' : calculateTier(c.followers), quotation: 0, status: 'New Scout (Unverified)' };
      const { data: inserted, error: insertError } = await db.from(table).insert({ ...payload, ...metrics, scout_identity: c.accountKey,scout_provenance:observedProvenance }).select('id').single();
      if(insertError?.code==='23505') {
        const {data:concurrent,error:concurrentError}=await db.from(table).select('id').eq('scout_identity',c.accountKey).single();check(concurrentError);
        if(!concurrent)throw insertError;entityId=concurrent.id;
        if(expected==='Individual')updatedKols++;else updatedCommunities++;
      } else {check(insertError); if (!inserted) throw new Error('Database did not return the imported profile'); entityId = inserted.id;
        if (expected === 'Individual') insertedKols++; else insertedCommunities++;
      }
    }
    if (expected === 'Individual' && c.followers !== null && c.avgViews !== null && c.er !== null) {
      const { error: snapshotError } = await db.from('kol_metric_snapshots').upsert({ kol_id: entityId, scout_session_id: params.sessionId, followers: c.followers, avg_views: c.avgViews, er: c.er }, { onConflict: 'kol_id,scout_session_id', ignoreDuplicates: true }); check(snapshotError);
    }
    if (expected === 'Individual' && c.posts?.length) {
      const saved = await savePosts(c.posts.filter(p => p.authorUrl === c.url).map(post => ({ post, platform: c.platform, kolId: entityId, sport: observedSports.join(', ') })));
      insertedPosts += saved.length;
    }
    importedAccounts.push({entityType:expected==='Individual'?'kol':'community',id:entityId});
    if(session.params.suggestionIdentity) {
      try {const {relinkPostAuthor}=await import('./post-suggestions');postLinkResults.push({entityType:expected==='Individual'?'kol':'community',id:entityId,...await relinkPostAuthor(expected==='Individual'?'kol':'community',entityId)});}
      catch(error:any){postLinkResults.push({success:false,entityType:expected==='Individual'?'kol':'community',id:entityId,error:error.message,retryable:true});}
    }
  }
  const summary = `Imported ${insertedKols + insertedCommunities} new profiles; refreshed ${updatedKols + updatedCommunities} existing profiles; saved ${insertedPosts} observed posts.`;
  const { error: logError } = await db.from('scout_requests').insert({ keyword: session.params.keyword, target_type: session.params.targetType, platform: session.params.platform, geography: session.params.geography, target_limit: selected.length, status: 'Đã hoàn thành', results_summary: summary + (session.params.notes ? ` Notes: ${session.params.notes}` : ''), created_by: params.actorId }); check(logError);
  const importedIds=[...new Set([...(session.progress?.importedCandidateIds || []),...params.selected.map(s=>s.candidateId)])];
  const {error:countError}=await db.from('scout_sessions').update({progress:{...session.progress,importedCandidateIds:importedIds}}).eq('id',params.sessionId);check(countError);
  return { success: true, insertedKols, updatedKols, insertedCommunities, updatedCommunities, insertedPosts, summary,importedAccounts,importedIds:importedAccounts.map(a=>a.id),...(postLinkResults.length?{postLinkResults,partial:postLinkResults.some(r=>!r.success || r.partial)}:{}) };
  } finally {clearInterval(heartbeat);const {error}=await db.from('scout_sessions').update({import_lease_until:null,import_token:null}).eq('id',params.sessionId).eq('import_token',importToken);check(error);}
}
export async function savePosts(posts: CollectedPost[], counts={inserted:0,refreshed:0,duplicate:0}, returnExisting=false) {
  const context=workflowExecution();if(!context?.sessionId) return writePosts(posts,counts,returnExisting);
  const saved:any[]=[];
  for(const item of posts) {
    const observation=item.post.provenance?.runId || item.post.url;
    const sourceScope=item.collectionSource?createHash('sha256').update(JSON.stringify(item.collectionSource)).digest('hex'):'';
    const result=await checkpointTask(context.sessionId,`save:${item.platform}:${item.post.url}:${observation}${returnExisting?':top':''}:${sourceScope}`,async()=>{
      const unit={inserted:0,refreshed:0,duplicate:0};return {rows:await writePosts([item],unit,returnExisting),counts:unit};
    });
    saved.push(...result.rows);for(const key of ['inserted','refreshed','duplicate'] as const)counts[key]+=result.counts[key];
  }
  return saved;
}
async function writePosts(posts: CollectedPost[], counts={inserted:0,refreshed:0,duplicate:0}, returnExisting=false) {
  const db = createAdminClient(); const saved: any[] = [];
  for (const { post: p, platform, kolId, communityId, sport, requestedScope, contentAssessment, collectionSource, authorAccount } of posts) {
    const mergeMetadata = async (row: any) => {
      if (!collectionSource || !row?.id) return row;
      const merged = await recordPostMetadata(row.id, platform, p.authorUrl, collectionSource, authorAccount);
      return merged ? { ...row, ...merged, ...postMetadata(merged) } : row;
    };
    const identity = `${platform}:${p.url}`;
    const selection=returnExisting?'*':'id,post_url,scout_identity,scout_provenance,scout_missing_metrics,community_id';
    let existing:any[] | null;
    if(workflowExecution()) {
      const byIdentity=await db.from('scouted_posts').select(selection).eq('scout_identity',identity);check(byIdentity.error);
      const byUrl=await db.from('scouted_posts').select(selection).eq('post_url',p.url);check(byUrl.error);
      existing=[...(byIdentity.data || []),...(byUrl.data || [])];
    } else { const result=await db.from('scouted_posts').select(selection);check(result.error);existing=result.data; }
    const match=existing?.find(e => e.scout_identity===identity || canonicalUrl(e.post_url)===p.url);
    if(match) {
      const linked = await mergeMetadata(match);
      if(communityId && match.community_id && match.community_id!==communityId) throw new ScoutError('This post is already linked to another community.', 'POST_COMMUNITY_CONFLICT', 409);
      if(communityId && !match.community_id) { const {error}=await db.from('scouted_posts').update({community_id:communityId,requested_scope:requestedScope || null}).eq('id',match.id).is('community_id',null);check(error); }
      if(p.provenance && (!match.scout_provenance?.fetchedAt || p.provenance.fetchedAt>match.scout_provenance.fetchedAt)) {
        const update:any={...(contentAssessment?{scout_content_assessment:contentAssessment}:{}),scout_provenance:p.provenance,...(p.publishedAt ? {published_at:p.publishedAt} : {})};
        for(const field of (returnExisting?['views','likes','comments','shares']:['views','likes','comments'])) if((p as any)[field]!=null) update[field]=(p as any)[field];
        update.scout_missing_metrics=(match.scout_missing_metrics || []).filter((field:string)=>(p as any)[field]==null);
        const {error}=await db.from('scouted_posts').update(update).eq('id',match.id);check(error); counts.refreshed++;if(returnExisting)saved.push({...linked,...update,saveState:'refreshed'});
      } else {if(contentAssessment){const {error}=await db.from('scouted_posts').update({scout_content_assessment:contentAssessment}).eq('id',match.id);check(error);}counts.duplicate++;if(returnExisting)saved.push({...linked,...(contentAssessment?{scout_content_assessment:contentAssessment}:{}),saveState:'existing'});}
      continue;
    }
    const { data, error } = await db.from('scouted_posts').upsert({ scout_identity: identity,...(contentAssessment?{scout_content_assessment:contentAssessment}:{}),requested_scope:requestedScope || null,scout_provenance:p.provenance,published_at:p.publishedAt || null, kol_id: kolId || null,community_id:communityId || null, title: p.caption, author: p.author, platform: `${platform} ${p.contentType}`, post_url: p.url, thumbnail_url: p.thumbnailUrl, sport,
      ...(returnExisting?{shares:p.shares ?? null}:{}), views: contentAssessment?p.views:p.views ?? 0, likes: contentAssessment?p.likes:p.likes ?? 0, comments: contentAssessment?p.comments:p.comments ?? 0, er: 0, scout_missing_metrics: (returnExisting?['views', 'likes', 'comments','shares']:['views','likes','comments']).filter(k => (p as any)[k] === null).concat('er'),
      viral_tier: p.views === null ? 'Unknown' : p.views >= 100000 ? 'Super Viral (> 100k views)' : p.views >= 20000 ? 'High Engagement (10k - 100k views)' : 'Standard', hashtags: p.hashtags.map(t => `#${t.replace(/^#/, '')}`).join(' '), notes: contentAssessment?.status==='needs-verification'?'Social scout — Needs Verification':'Verified social scout' }, { onConflict: 'scout_identity', ignoreDuplicates: true }).select().maybeSingle(); check(error);
    if (data) { const linked=await mergeMetadata(data);saved.push(returnExisting?{...linked,saveState:'inserted'}:linked); counts.inserted++; } else {counts.duplicate++;if(returnExisting || collectionSource){const {data:concurrent,error:readError}=await db.from('scouted_posts').select('*').eq('scout_identity',identity).single();check(readError);if(!concurrent)throw new ScoutError('Saved post could not be read back.','POST_SAVE_FAILED',409);const linked=await mergeMetadata(concurrent);if(returnExisting)saved.push({...linked,saveState:'existing'});}}
  }
  return saved;
}
export async function scoutMarketTrends(params: ContentQuality & import('./top-post-quality').TopPostCriteria & { keyword: string; searchMode?: 'hashtag' | 'keyword'; sport?: string | string[]; platform?: string | string[]; limit?: number; geography?: string | string[]; queryVariants?: string[]; searchPlan?:SearchPlan; assessmentVersion?:number; accountModelPolicy?:AccountModelPolicy; accountPolicyVersion?:5; entityTypes?:EntityType[]; geographyMode?:'profile'|'profile-or-recent-posts'; sessionId: string; }, savedEvidence?: Record<string,any[]>) {
  if(params.selectionMode==='top')return (await import('./top-posts')).scoutTopPosts(params);
  const platforms = Array.isArray(params.platform) ? params.platform : [params.platform || 'Instagram']; const limit = params.limit || 10;
  const scopes = canonicalScopes(params.geography || 'Nationwide');
  const geography = Array.isArray(scopes) ? scopes.join(', ') : scopes;
  const mode = params.searchMode || (params.keyword.startsWith('#') ? 'hashtag' : 'keyword');
  if (mode === 'hashtag' && !/^#?[\p{L}\p{N}_]+$/u.test(params.keyword)) throw new ScoutError('Enter one hashtag without spaces', 'INVALID_HASHTAG', 400);
  const highEngagement=params.qualityMode==='high-engagement';
  const candidateLimit=highEngagement ? Math.min(limit*3,60) : limit;
  const qualityCutoff=highEngagement || params.searchPlan ? await sessionSnapshot(params.sessionId,'retrievalWindows','engagement-cutoff',async createdAt=>new Date(Date.parse(createdAt)-(params.recentDays ?? 7)*86400000).toISOString()) : '';
  const collected: { post: SocialPost; platform: string; kolId?: string; communityId?:string; sport: string; requestedScope?:unknown; contentAssessment?:any }[] = [];
  const db = createAdminClient(); const { data: kols, error } = await db.from('kols').select('id,profile_url'); check(error);
  const {data:knownPosts,error:knownError}=params.searchPlan && !isStoredEvidence()?await db.from('scouted_posts').select('platform,post_url'):{data:[],error:null};check(knownError);
  const existingPostKeys=new Set((knownPosts || []).map(p=>`${String(p.platform).split(' ')[0]}:${canonicalUrl(p.post_url || '')}`));
  const planned=params.searchPlan && !isStoredEvidence()?await collectPlannedSearch(params,existingPostKeys):null;
  const groups:typeof collected[]=[]; const windows:any[]=[]; const warnings:string[]=[]; const failures:{message:string;code:string;httpStatus:number}[]=[]; let excluded=0,unverified=0,belowTarget=0; const skippedPosts:any[]=[];
  for (const allocation of quotas(platforms,candidateLimit)) {
    if(!allocation.limit) continue; const platform=allocation.platform;
    const window=await retrievalWindow(platform,mode,JSON.stringify({keyword:params.keyword,geography,sport:params.sport,qualityMode:params.qualityMode,minInteractions:params.minInteractions,minViews:params.minViews,recentDays:params.recentDays}),params.sessionId);
    if(qualityCutoff && (params.searchPlan || qualityCutoff>window.newerThan))window.newerThan=qualityCutoff;
    windows.push(window);
    let raw:any[];
    try {raw=planned ? planned.rows[platform] || [] : savedEvidence ? savedEvidence[platform] || [] : await scrape(params.sessionId,platform,mode,params.keyword,allocation.limit,geography,{newerThan:window.newerThan,queryVariants:params.queryVariants});}
    catch(e:any) {if(e instanceof PendingScout) throw e;warnings.push(`${platform}: ${e.message}`);failures.push({message:e.message,code:e.code || 'PROVIDER_ERROR',httpStatus:e.status || 502});groups.push([]);continue;}
    const group:typeof collected=[];
    for(const r of raw) {
      const post=parsePost(r,platform);if(!post) continue;
      let contentAssessment:any;
      if(params.qualityFilter) {
        const assessment=assessTopPost(post,{...params,searchMode:mode,geography:scopes},window.newerThan,new Date().toISOString());
        if(!['Qualified','Needs Verification'].includes(assessment.resultGroup)){if(assessment.resultGroup==='Below Target')belowTarget++;else excluded++;skippedPosts.push({...post,platform,...assessment});continue;}
        if(assessment.resultGroup==='Needs Verification')unverified++;
        contentAssessment={status:assessment.resultGroup==='Qualified'?'verified':'needs-verification',assessment:assessment.assessment,qualityFilter:assessment.qualityFilter,reason:assessment.reason};
      } else if(params.searchPlan || (params.assessmentVersion || 0)>=4) {
        const assessment=assessSearchContent(post,{...params,searchMode:mode,geography:scopes,newerThan:window.newerThan});
        if(assessment.resultGroup!=='Qualified'){if(assessment.resultGroup==='Excluded')excluded++;else if(assessment.resultGroup==='Below Target')belowTarget++;else unverified++;skippedPosts.push({...post,platform,...assessment});continue;}
      } else {
        const assessment=assessSearchPost(post,{...params,searchMode:mode,geography:scopes,newerThan:window.newerThan});
        if(assessment.state!=='matched') {if(assessment.state==='excluded')excluded++;else unverified++;skippedPosts.push({...post,platform,reviewState:assessment.state==='excluded'?'Excluded':'Needs Verification',reason:assessment.reason});continue;}
      }
      group.push({post,platform,...(contentAssessment?{contentAssessment}:{}),requestedScope:{sport:params.sport,geography},kolId:kols?.find(k=>post.authorUrl && canonicalUrl(k.profile_url)===post.authorUrl)?.id,sport:detectSportNiche(post.caption).join(', ') || 'Unknown'});
    }
    groups.push(group);
  }
  if(planned)warnings.push(...planned.warnings);
  const unused=Math.max(0,limit-groups.reduce((sum,g)=>sum+g.length,0));
  const allocations=quotas(platforms,limit);
  const expandable=allocations.filter((a,i)=>a.limit>0 && groups[i]?.length>=a.limit && providerPlans(a.platform,mode,params.keyword,a.limit,geography).every(plan=>ACTOR_CONTRACTS[plan.actor]?.canExpand));
  for(const extra of quotas(params.searchPlan || isStoredEvidence() || savedEvidence || highEngagement ? [] : expandable.map(a=>a.platform),unused)) {
    if(!extra.limit) continue;const index=allocations.findIndex(a=>a.platform===extra.platform);const window=windows[index];if(!window)continue;
    try {
      const rows=await scrape(params.sessionId,extra.platform,mode,params.keyword,allocations[index].limit+extra.limit,geography,{newerThan:window.newerThan});
      const known=new Set(groups[index].map(p=>p.post.url));
      for(const row of rows) {
        const post=parsePost(row,extra.platform);if(!post || known.has(post.url))continue;
        const assessment=params.qualityFilter?assessTopPost(post,{...params,searchMode:mode,geography:scopes},window.newerThan,new Date().toISOString()):null;
        if(assessment?!['Qualified','Needs Verification'].includes(assessment.resultGroup):assessSearchPost(post,{...params,searchMode:mode,geography:scopes,newerThan:window.newerThan}).state!=='matched')continue;
        known.add(post.url);groups[index].push({post,...(assessment?{contentAssessment:{status:assessment.resultGroup==='Qualified'?'verified':'needs-verification',assessment:assessment.assessment,qualityFilter:assessment.qualityFilter,reason:assessment.reason}}:{}),platform:extra.platform,requestedScope:{sport:params.sport,geography},kolId:kols?.find(k=>post.authorUrl && canonicalUrl(k.profile_url)===post.authorUrl)?.id,sport:detectSportNiche(post.caption).join(', ')});
      }
    }catch(e:any){if(e instanceof PendingScout)throw e;warnings.push(`${extra.platform}: ${e.message}`);}
  }
  const unique=new Set<string>();const ranked=highEngagement ? groups.flat().sort((a,b)=>comparePostEngagement(a.post,b.post)) : roundRobin(groups,groups.reduce((n,g)=>n+g.length,0));
  if(planned && !params.qualityFilter)ranked.sort((a,b)=>Number(existingPostKeys.has(`${a.platform}:${a.post.url}`))-Number(existingPostKeys.has(`${b.platform}:${b.post.url}`)));
  const merged=ranked.filter(p=>{if(unique.has(p.post.url))return false;unique.add(p.post.url);return true;});
  if(!params.qualityFilter)merged.splice(limit);
  if(highEngagement && merged.length<limit)warnings.push(`Only ${merged.length} posts met the selected topic, location, recency and engagement criteria; requested up to ${limit}. Low-engagement posts were not substituted.`);
  const registry=isStoredEvidence()?[]:await loadPostAccounts();
  const collectedPosts:CollectedPost[]=merged.map(item=>{const authorAccount=matchPostAuthor(registry,item.platform,item.post.authorUrl);return {...item,kolId:authorAccount?.entityType==='kol'?authorAccount.id:undefined,communityId:matchPostGroup(registry,item.platform,item.post.url),authorAccount,collectionSource:{kind:'topic',sessionId:params.sessionId,keyword:params.keyword}};});
  const counts={inserted:0,refreshed:0,duplicate:0}; const posts=isStoredEvidence() ? merged.map(({post,platform})=>({...post,platform,reviewState:'Matched'})) : await savePosts(collectedPosts,counts,!!params.qualityFilter);
  if(!params.qualityFilter && (params.searchPlan || (params.assessmentVersion || 0)>=4)) for(const saved of posts as any[]) {const observed=merged.find(p=>p.post.url===canonicalUrl(saved.post_url || saved.url || ''));if(observed)Object.assign(saved,assessSearchContent(observed.post,{...params,searchMode:mode,geography:scopes,newerThan:qualityCutoff || windows.find(w=>w.platform===observed.platform)?.newerThan || windows[0]?.newerThan || ''}));}
  const {data:providerRuns,error:runError}=await db.from('scout_provider_runs').select('warnings').eq('session_id',params.sessionId);check(runError);
  const providerPartial=(providerRuns || []).some(r=>r.warnings?.length) || merged.some(p=>p.post.provenance?.warnings?.length);
  if(!params.searchPlan && !isStoredEvidence()) for(let i=0;i<windows.length;i++) await advanceWatermark(windows[i].scopeKey,(groups[i] || []).map(p=>p.post),!providerPartial && !warnings.length && !unverified && merged.length<limit && (groups[i] || []).every(p=>!!p.post.publishedAt));
  const contentGroups=params.qualityFilter?{qualified:posts.filter((p:any)=>p.scout_content_assessment?.status==='verified'),needsVerification:posts.filter((p:any)=>p.scout_content_assessment?.status==='needs-verification'),belowTarget:skippedPosts.filter(p=>p.resultGroup==='Below Target'),excluded:skippedPosts.filter(p=>p.resultGroup==='Excluded')}:undefined;
  const allFailed=failures.length===allocations.filter(a=>a.limit>0).length && failures.length>0;
  const reasonCounts:Record<string,number>={}; for(const p of skippedPosts) reasonCounts[p.reason]=(reasonCounts[p.reason] || 0)+1;
  return { ...((planned || (params.assessmentVersion || 0)>=4)?{searchExecution:planned?{...planned,rows:undefined,profiles:undefined}:undefined,groups:{qualified:merged.map(item=>({...item.post,platform:item.platform,...assessSearchContent(item.post,{...params,searchMode:mode,geography:scopes,newerThan:qualityCutoff || windows[0]?.newerThan || ''})})),needsVerification:skippedPosts.filter(p=>p.resultGroup==='Needs Verification'),belowTarget:skippedPosts.filter(p=>p.resultGroup==='Below Target'),excluded:skippedPosts.filter(p=>p.resultGroup==='Excluded')}}:{}), ...(contentGroups?{groups:contentGroups,savedPosts:posts}:{}), diagnostics:{assessmentVersion:params.searchPlan || (params.assessmentVersion || 0)>=4 ?4:3,reasonCounts,providerCount:planned?.providerCount ?? skippedPosts.length+groups.reduce((n,g)=>n+g.length,0),returnedCount:posts.length},success: !allFailed,allFailed,...(allFailed ? {error:failures.map(f=>f.message).join(' '),code:failures[0].code,httpStatus:failures[0].httpStatus} : {}),keyword: params.keyword, qualityCriteria:{mode:highEngagement?'high-engagement':'topic',...(highEngagement ? {minInteractions:params.minInteractions ?? 100,minViews:params.minViews ?? 10000,recentDays:params.recentDays ?? 7,candidateLimit,cutoff:qualityCutoff,ranking:'likes + comments, then views, then publication date'} : {})}, partial:!allFailed && (providerPartial || warnings.length>0 || unverified>0),warnings,skippedPosts,counts:{...counts,saved:posts.length,qualified:contentGroups?.qualified.length ?? merged.length,belowTarget,excluded,unverified,failed:failures.length},totalScouted: posts.length, matchedKolsCount: posts.filter(p => p.kol_id).length, posts, message:`Inserted ${counts.inserted}; refreshed ${counts.refreshed}; duplicate ${counts.duplicate}; excluded ${excluded}; unverified ${unverified}; failed ${failures.length}.` };
}
async function scoutEntityPosts(id: string, kind: 'kol' | 'community', limit: number, platforms: string | string[], sessionId: string, qualityFilter?:ContentFilter) {
  const db = createAdminClient(); const { data: entity, error } = await db.from(kind === 'kol' ? 'kols' : 'communities').select('*').eq('id', id).single(); check(error);
  const requested = Array.isArray(platforms) ? platforms : [platforms];
  const allocations=quotas(requested,limit).filter(a=>a.limit>0);
  const groups:{post:SocialPost;platform:string;kolId?:string;communityId?:string;sport:string;contentAssessment?:any}[][]=[];
  const windows:{platform:string;url:string;newerThan:string;scopeKey:string;complete:boolean;posts:SocialPost[]}[]=[]; const warnings:string[]=[]; const failures:{message:string;code:string;httpStatus:number}[]=[]; let excluded=0;
  for (const allocation of allocations) {
    if(!allocation.limit) continue; const platform=allocation.platform;
    const url=channelUrl(entity,platform);
    if(!url) {const message=`A verified ${platform} profile URL is required.`;warnings.push(message);failures.push({message,code:'INVALID_PROFILE_URL',httpStatus:400});groups.push([]);continue;}
    const window=await retrievalWindow(platform,'profile-posts',url,sessionId);
    try {
      const rows=await scrape(sessionId,platform,'profile-posts',url,allocation.limit,'',{newerThan:window.newerThan});
      const parsed=rows.map(row=>parsePost(row,platform)).filter(Boolean) as SocialPost[];
      const eligible=parsed.filter(post=>{
        if(qualityFilter){const membership=channelMembership(post,url,rows.find(row=>parsePost(row,platform)?.url===post.url));const accepted=membership!=='failed' && (!post.publishedAt || post.publishedAt>=window.newerThan && post.publishedAt<=new Date().toISOString());if(!accepted)excluded++;return accepted;}
        const accepted=(kind==='community' || post.authorUrl===url) && !!post.publishedAt && post.publishedAt>=window.newerThan;
        if(!accepted) excluded++; return accepted;
      });
      groups.push(eligible.map(post=>({post,platform,...(qualityFilter?{contentAssessment:{status:!post.publishedAt || channelMembership(post,url,rows.find(row=>parsePost(row,platform)?.url===post.url))==='unknown'?'needs-verification':'verified',ownership:channelMembership(post,url,rows.find(row=>parsePost(row,platform)?.url===post.url))}}:{}),kolId:kind==='kol' ? id : undefined,communityId:kind==='community' ? id : undefined,sport:qualityFilter?detectSportNiche(post.caption).join(', ') || 'Unknown':entity.sports?.join(', ') || 'Unknown'})));
      windows.push({platform,url,newerThan:window.newerThan,scopeKey:window.scopeKey,posts:eligible,complete:rows.length<allocation.limit && parsed.every(post=>!!post.publishedAt)});
    } catch(e:any) {if(e instanceof PendingScout) throw e; warnings.push(`${platform}: ${e.message}`);failures.push({message:e.message,code:e.code || 'PROVIDER_ERROR',httpStatus:e.status || 502});groups.push([]);}
  }
  const unused=Math.max(0,limit-groups.reduce((n,g)=>n+g.length,0));
  const expandable=allocations.filter((a,i)=>groups[i]?.length>=a.limit && windows.some(w=>w.platform===a.platform) && providerPlans(a.platform,'profile-posts',windows.find(w=>w.platform===a.platform)!.url,a.limit).every(p=>ACTOR_CONTRACTS[p.actor]?.canExpand));
  for(const extra of quotas(expandable.map(a=>a.platform),unused)) {
    if(!extra.limit)continue;const index=allocations.findIndex(a=>a.platform===extra.platform);const window=windows.find(w=>w.platform===extra.platform)!;
    try {
      const cap=allocations[index].limit+extra.limit;
      const rows=await scrape(sessionId,extra.platform,'profile-posts',window.url,cap,'',{newerThan:window.newerThan});
      const known=new Set(groups[index].map(p=>p.post.url));
      for(const row of rows){const post=parsePost(row,extra.platform);if(!post || known.has(post.url))continue;
        const membership=channelMembership(post,window.url,row);
        if(qualityFilter ? membership==='failed' || !!post.publishedAt && (post.publishedAt<window.newerThan || post.publishedAt>new Date().toISOString()) : !post.publishedAt || post.publishedAt<window.newerThan || kind==='kol' && post.authorUrl!==window.url)continue;
        known.add(post.url);groups[index].push({post,platform:extra.platform,...(qualityFilter?{contentAssessment:{status:!post.publishedAt || membership==='unknown'?'needs-verification':'verified',ownership:membership}}:{}),kolId:kind==='kol' ? id : undefined,communityId:kind==='community' ? id : undefined,sport:qualityFilter?detectSportNiche(post.caption).join(', ') || 'Unknown':entity.sports?.join(', ') || 'Unknown'});window.posts.push(post);}
      window.complete=rows.length<cap && rows.every(row=>!!parsePost(row,extra.platform)?.publishedAt);
    }catch(e:any){if(e instanceof PendingScout)throw e;warnings.push(`${extra.platform}: ${e.message}`);window.complete=false;}
  }
  const seen=new Set<string>(); const merged=roundRobin(groups,groups.reduce((n,g)=>n+g.length,0)).filter(p=>{if(seen.has(p.post.url))return false;seen.add(p.post.url);return true;});if(!qualityFilter)merged.splice(limit);
  const counts={inserted:0,refreshed:0,duplicate:0};const filtered=qualityFilter?merged.filter(item=>assessContentFilter(item.post,qualityFilter).state!=='failed').map(item=>({...item,...((item as any).contentAssessment?.ownership==='unknown'?{kolId:undefined,communityId:undefined}:{}),contentAssessment:{...(item as any).contentAssessment,status:(item as any).contentAssessment?.status==='needs-verification' || !['views','likes','comments','shares'].some(key=>typeof item.post[key as keyof SocialPost]==='number')?'needs-verification':'verified',qualityFilter:assessContentFilter(item.post,qualityFilter)}})):merged;
  const collected:CollectedPost[]=filtered.map(item=>{const url=windows.find(w=>w.platform===item.platform)?.url || '';const known=(item as any).contentAssessment?.ownership!=='unknown';return {...item,authorAccount:known && !url.includes('/groups/')?{entityType:kind,id}:undefined,collectionSource:{kind:'account',sessionId,entityType:kind,entityId:id,channelUrl:url}};});
  const saved=await savePosts(collected,counts,!!qualityFilter);
  const {data:runs,error:runError}=await db.from('scout_provider_runs').select('warnings').eq('session_id',sessionId);check(runError);
  const partial=filtered.some(item=>(item as any).contentAssessment?.status==='needs-verification') || warnings.length>0 || (runs || []).some(r=>r.warnings?.length) || merged.some(p=>p.post.provenance?.warnings?.length);
  for(const window of windows) await advanceWatermark(window.scopeKey,window.posts,window.complete && !partial);
  const allFailed=failures.length===allocations.length && allocations.length>0;
  return {success:!allFailed,allFailed,...(allFailed ? {error:failures.map(f=>f.message).join(' '),code:failures[0].code,httpStatus:failures[0].httpStatus} : {}),partial:!allFailed && partial,warnings,counts:{...counts,saved:saved.length,unverified:filtered.filter(item=>(item as any).contentAssessment?.status==='needs-verification').length,filteredLowEngagement:merged.length-filtered.length,excluded,failed:failures.length},kolName:entity.name,communityName:entity.name,insertedCount:saved.length,posts:saved,message:`Inserted ${counts.inserted}; refreshed ${counts.refreshed}; duplicate ${counts.duplicate}; excluded ${excluded}; failed ${warnings.length}.`};
}
export async function scoutSingleKolPosts(id: string, limit = 10, platform: string | string[] = 'Instagram', sessionId = '',qualityFilter?:ContentFilter) { return scoutEntityPosts(id, 'kol', limit, platform, sessionId,qualityFilter); }
export async function scoutSingleCommunityPosts(id: string, limit = 10, platform: string | string[] = 'Facebook', sessionId = '',qualityFilter?:ContentFilter) { return scoutEntityPosts(id, 'community', limit, platform, sessionId,qualityFilter); }
// Queued discovery uses the same durable preview pipeline; imports still require review.
export async function processScoutRequest(requestId: string) {
  const db = createAdminClient();
  const { data: request, error } = await db.from('scout_requests').select('*').eq('id', requestId).single(); check(error);
  const owner = request.created_by;
  if (!owner) {
    const { error: updateError } = await db.from('scout_requests').update({ status: 'Needs Review', results_summary: 'This legacy request has no owner. Open Discover New Profiles to start an authenticated preview.' }).eq('id', requestId); check(updateError);
    return { summary: 'Discovery requires an authenticated owner and human confirmation.' };
  }
  const { data: profile, error: profileError } = await db.from('profiles').select('role').eq('id', owner).single(); check(profileError);
  if (!profile || !['admin', 'editor'].includes(profile.role)) throw new ScoutError('Editor access required for queued discovery', 'FORBIDDEN', 403);
  const kind = /Viral|Posts|Reels/i.test(request.target_type) ? 'trends' : 'preview';
  let sessionId = request.scout_session_id;
  if (!sessionId) {
    const { data: session, error: sessionError } = await db.from('scout_sessions').insert({ owner_id: owner, kind,runtime_version:3, execution_engine:'workflow', params: { keyword: request.keyword, targetType: cleanTarget(request.target_type), platform: request.platform, geography: request.geography, limit: Math.min(request.target_limit || 5, 50) } }).select('id').single(); check(sessionError); if (!session) throw new Error('Failed to create scout session'); sessionId = session.id;
    const { error: linkError } = await db.from('scout_requests').update({ scout_session_id: sessionId }).eq('id', requestId); check(linkError);
  }
  const {dispatchScoutSession}=await import('./workflow-dispatch');
  await dispatchScoutSession(sessionId);
  const { resumeSession } = await import('./sessions');
  const response = await resumeSession(sessionId, owner); const result = await response.json();
  const summary = result.pending ? 'Scout is running. Resume the saved preview when ready.' : kind === 'trends' ? `Saved ${result.totalScouted} trending posts.` : `Preview ready: ${result.totalFound} candidates. Human confirmation is required before import.`;
  const { error: updateError } = await db.from('scout_requests').update({ status: result.pending ? 'Đang quét dữ liệu' : result.success ? kind === 'trends' ? 'Đã hoàn thành' : 'Needs Review' : 'Failed', results_summary: result.success ? summary : result.error }).eq('id', requestId); check(updateError);
  return { summary, sessionId, ...result };
}

/** A latest sample is independent of incremental watermarks and activity thresholds. */
export async function scoutLatestCommunityPosts(id: string, selectedPlatforms: string | string[], sessionId: string, selectedUrls?: string[], qualityFilter?:ContentFilter) {
  const db = createAdminClient();
  const {data: entity,error}=await db.from('communities').select('*').eq('id',id).single();check(error);
  const platforms=Array.isArray(selectedPlatforms) ? selectedPlatforms : [selectedPlatforms];
  const channels=entity.channels?.length ? entity.channels : getStoredEntityChannels('community',id,entity.name) || [];
  const connected=[...new Set([entity.group_url,...channels.map((c:any)=>c.url || c.profileUrl)].map(u=>canonicalUrl(u || '')).filter(Boolean))];
  const requested=selectedUrls?.map(u=>canonicalUrl(u)) || connected.filter(u=>platforms.some(p=>platformMatches(p,u)));
  if(!requested.length || requested.some(u=>!connected.includes(u) || !platforms.some(p=>platformMatches(p,u)))) throw new ScoutError('Choose connected community channels only.','INVALID_CHANNEL',400);
  const samples:{post:SocialPost;platform:string;communityId?:string;sport:string;requestedScope:{communityId:string;url:string;collectionMode:string};contentAssessment?:any}[]=[];
  const coverage:{url:string;platform:string;status:string;posts?:number;reason?:string}[]=[];
  for(const url of [...new Set(requested)]) {
    const platform=platforms.find(p=>platformMatches(p,url))!;
    try {
      const result=await checkpointTask(sessionId,`latest-channel:${url}`,async()=>{
        const rows=await scrape(sessionId,platform,'profile-posts',url,30);
        const parsed=rows.map(row=>parsePost(row,platform)).filter(Boolean) as SocialPost[];
        const group=urlKind(url)==='group';
        const eligible=parsed.filter(p=>qualityFilter?(!p.publishedAt || p.publishedAt<=new Date().toISOString()) && channelMembership(p,url,rows.find(row=>parsePost(row,platform)?.url===p.url))!=='failed':p.publishedAt && (group || canonicalUrl(p.authorUrl)===url))
          .sort((a,b)=>(Date.parse(b.publishedAt || '') || 0) - (Date.parse(a.publishedAt || '') || 0)).slice(0,30);
        const partial=parsed.some(p=>!p.publishedAt) || eligible.some(p=>p.provenance?.warnings?.length) || rows.length>30;
        return {posts:eligible,partial,ownership:Object.fromEntries(eligible.map(post=>[post.url,channelMembership(post,url,rows.find(row=>parsePost(row,platform)?.url===post.url))]))};
      });
      samples.push(...result.posts.map(post=>({post,platform,...(qualityFilter?{contentAssessment:{status:!post.publishedAt || result.ownership[post.url]==='unknown'?'needs-verification':'verified',ownership:result.ownership[post.url]}}:{}),communityId:qualityFilter && result.ownership[post.url]==='unknown'?undefined:id,sport:qualityFilter?detectSportNiche(post.caption).join(', ') || 'Unknown':entity.sports?.join(', ') || 'Unknown',requestedScope:{communityId:id,url,collectionMode:'latest-30'}})));
      coverage.push({url,platform,status:result.partial ? 'partial' : 'collected',posts:result.posts.length,...(result.partial ? {reason:'Some source posts could not be verified.'} : {})});
    } catch(error:any) {
      if(error instanceof PendingScout) throw error;
      coverage.push({url,platform,status:'unavailable',posts:0,reason:error.message});
    }
  }
  const seen=new Set<string>();
  const selected=samples.sort((a,b)=>(Date.parse(b.post.publishedAt || '') || 0) - (Date.parse(a.post.publishedAt || '') || 0) || a.post.url.localeCompare(b.post.url))
    .filter(item=>{if(seen.has(item.post.url))return false;seen.add(item.post.url);return true;});
  if(!qualityFilter)selected.splice(30);
  const counts={inserted:0,refreshed:0,duplicate:0};const posts:any[]=[];
  const samplePosts=selected.filter(item=>item.post.publishedAt && item.communityId===id).slice(0,30).map(({post,platform})=>({...post,platform,post_url:post.url,published_at:post.publishedAt,scout_provenance:post.provenance,scout_missing_metrics:['likes','comments'].filter(key=>post[key as keyof SocialPost]==null)}));
  const retained=qualityFilter?selected.filter(item=>assessContentFilter(item.post,qualityFilter).state!=='failed'):selected;
  for(const item of retained) {
    const saved=await checkpointTask(sessionId,`latest-save:${item.post.url}`,async()=>{
      const unit={inserted:0,refreshed:0,duplicate:0};const rows=await savePosts([{...item,authorAccount:item.communityId && !item.requestedScope.url.includes('/groups/')?{entityType:'community',id}:undefined,collectionSource:{kind:'account',sessionId,entityType:'community',entityId:id,channelUrl:item.requestedScope.url},...(qualityFilter?{contentAssessment:{...(item as any).contentAssessment,status:(item as any).contentAssessment?.status==='needs-verification' || !['views','likes','comments','shares'].some(key=>typeof item.post[key as keyof SocialPost]==='number')?'needs-verification':'verified',qualityFilter:assessContentFilter(item.post,qualityFilter)}}:{})}],unit,!!qualityFilter);return {rows,counts:unit};
    });
    posts.push(...saved.rows);for(const key of ['inserted','refreshed','duplicate'] as const)counts[key]+=saved.counts[key];
  }
  const failures=coverage.filter(c=>c.status==='unavailable');
  const warnings=coverage.filter(c=>c.reason).map(c=>`${c.platform}: ${c.reason}`);
  if(samplePosts.length<30) warnings.push(`Only ${samplePosts.length} verified dated posts were collected across the selected channels.`);
  return {success:failures.length<coverage.length,partial:coverage.some(c=>c.status!=='collected') || selected.length<30,channelCoverage:coverage,warnings,
    counts:{...counts,saved:posts.length,filteredLowEngagement:selected.length-retained.length,sampled:samplePosts.length,failed:failures.length},posts,samplePosts,communityName:entity.name,
    ...(failures.length===coverage.length ? {error:'No selected community channel could be collected.',code:'CHANNELS_UNAVAILABLE',httpStatus:503} : {}),
    message:`Collected a public sample of ${samplePosts.length} latest posts; saved ${posts.length} retained posts. Inaccessible source posts may be missing.`};
}

function stableCandidateId(sessionId:string,accountKey:string) {
 const hex=createHash('sha256').update(`${sessionId}:${accountKey}`).digest('hex');
 return `${hex.slice(0,8)}-${hex.slice(8,12)}-5${hex.slice(13,16)}-a${hex.slice(17,20)}-${hex.slice(20,32)}`;
}
