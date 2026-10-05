import {ACTOR_CONTRACTS} from './registry';
import {providerPlans} from './providers';
import { createAdminClient } from "@/lib/supabase/admin";
import { quotas, roundRobin, retrievalWindow, advanceWatermark } from "./collection";
import { channelUrl } from "./tasks";
import { randomUUID } from "node:crypto";
import { assessProfile, canonicalUrl, platformMatches, urlKind, contextKey, normalized, tokens, hashtagMatch, type Classification } from "./discovery-quality";
import { scrape, parseProfile, parsePost, ScoutError, type SocialProfile, type SocialPost, PendingScout } from "./providers";

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

export type DiscoveryCandidate = Omit<SocialProfile, 'provenance'> & ReturnType<typeof assessProfile> & { candidateId: string; accountKey: string; isExisting: boolean; existingId?: string; provenance: Partial<NonNullable<SocialProfile['provenance']>> & { platform: string; fetchedAt: string; profileUrl: string } };
function check(error: any) { if (error) throw error; }
function cleanTarget(target: string) { return ['Communities & Clubs', 'Cộng đồng / Group'].includes(target) ? 'Communities & Clubs' : 'Individual KOLs'; }
export async function previewDiscoveryCandidates(params: { keyword: string; targetType?: string; platform?: string; limit?: number; geography?: string; sessionId: string }) {
  const db = createAdminClient(); const platform = params.platform || 'Instagram'; const target = cleanTarget(params.targetType || ''); const geography = params.geography || 'Nationwide';

  const { data: existing, error } = await db.from(target === 'Communities & Clubs' ? 'communities' : 'kols').select('*'); check(error);
  const { data: feedback, error: feedbackError } = await db.from('scout_feedback').select('*').order('created_at', { ascending: false }); check(feedbackError);
  const candidates: DiscoveryCandidate[] = []; const seen = new Set<string>();
  const warnings:string[]=[];
  const providerResults = new Set<string>();
  const plans=providerPlans(platform,target==='Communities & Clubs' ? 'communities' : 'profiles',params.keyword,params.limit || 5,geography);
  const canExpand=plans.every(plan=>ACTOR_CONTRACTS[plan.actor]?.canExpand);
  for(const batch of [...new Set((canExpand ? [1,2,3] : [1]).map(n=>Math.min((params.limit || 5)*n,60)))]) {
  let raw:any[];
  try { raw=await scrape(params.sessionId,platform,target==='Communities & Clubs' ? 'communities' : 'profiles',params.keyword,batch,geography); }
  catch(e:any) { if(e instanceof PendingScout || !candidates.length) throw e; warnings.push(e.message); break; }
  for (const row of raw) providerResults.add(JSON.stringify(row));
  const authorUrls=[...new Set(raw.filter(r=>!parseProfile(r,platform)).map(r=>parsePost(r,platform)?.authorUrl).filter(Boolean))].filter(url=>!seen.has(`${platform}:${url}`)) as string[];
  const hydrated:SocialProfile[]=[];
  for(let i=0;i<authorUrls.length;i+=10) { const urls=authorUrls.slice(i,i+10); const rows=await scrape(params.sessionId,platform,'profile-details',urls[0],1,'',{urls}); hydrated.push(...rows.map(r=>parseProfile(r,platform)).filter(Boolean) as SocialProfile[]); }
  for (const row of raw) {
    let profile = parseProfile(row, platform);
    // A post-only search hit cannot impersonate a profile: hydrate its author.
    if (!profile) {
      const post = parsePost(row, platform);
      if (post?.authorUrl) {
        profile = hydrated.find(p => p.url === post.authorUrl) || null;
      }
    }
    if (!profile) continue;
    const accountKey = `${platform}:${profile.url}`; if (seen.has(accountKey)) continue; seen.add(accountKey);
    const assessment = assessProfile(profile, params.keyword, geography, target);
    const applicable = (feedback || []).filter(f => f.account_key === accountKey);
    const classificationFeedback = applicable.find(f => f.classification && ['Correct Classification', 'Wrong Entity Type'].includes(f.reason));
    if (classificationFeedback) {
      assessment.classification = classificationFeedback.classification;
      assessment.reviewState = !assessment.relevant ? 'Excluded' : assessment.classification === 'Unknown' || !assessment.locationMatch ? 'Needs Review' : 'Matched';
      if (assessment.classification !== 'Unknown' && assessment.classification !== (target === 'Communities & Clubs' ? 'Community' : 'Individual')) assessment.reviewState = 'Excluded';
      assessment.reasons.push('Entity type confirmed by team review');
    }
    const contextual = applicable.find(f => f.context_key === contextKey(params.keyword, geography) && ['Not Relevant', 'Wrong Location'].includes(f.reason));
    if (contextual) { assessment.reviewState = 'Excluded'; assessment.reasons.push(`Team feedback: ${contextual.reason}`); }
    const match = existing?.find(e => e.scout_identity === accountKey || canonicalUrl(e.profile_url || e.group_url || '') === profile!.url);
    candidates.push({ ...profile, ...assessment, candidateId: randomUUID(), accountKey, isExisting: !!match, existingId: match?.id, provenance: { platform, ...profile.provenance, fetchedAt: profile.provenance?.fetchedAt || new Date().toISOString(), profileUrl: profile.url } });
  }
  if(candidates.filter(c=>c.reviewState!=='Excluded').length >= (params.limit || 5)) break;
  }
  const visible = candidates.filter(c => c.reviewState !== 'Excluded').sort((a, b) => Number(b.reviewState === 'Matched') - Number(a.reviewState === 'Matched')).slice(0, params.limit || 5);
  const requestedCount = params.limit || 5;
  const diagnostics = { requestedCount, providerCount: providerResults.size, uniqueProfileCount: candidates.length, excludedCount: candidates.filter(c => c.reviewState === 'Excluded').length, returnedCount: visible.length };
  if (visible.length < requestedCount) warnings.push(`Only ${visible.length} of ${requestedCount} requested profiles passed discovery checks (${diagnostics.providerCount} provider results, ${diagnostics.excludedCount} excluded). Try a broader keyword or another location.`);
  const { error: saveError } = await db.from('scout_sessions').update({ candidates: visible }).eq('id', params.sessionId); check(saveError);
  return { success: true, sessionId: params.sessionId, criteria: { keyword: params.keyword, targetType: target, platform, geography, limit: requestedCount }, candidates: visible, effectiveQuery: params.keyword, totalFound: visible.length, newCount: visible.filter(c => !c.isExisting).length, existingCount: visible.filter(c => c.isExisting).length, excludedCount: diagnostics.excludedCount, diagnostics,partial:warnings.length>0,warnings };
}
export async function ingestSelectedCandidates(params: { sessionId: string; selected: { candidateId: string; classification?: Classification; relevant?: boolean; locationConfirmed?: boolean }[]; actorId: string; }) {
  const db = createAdminClient(); const { data: session, error } = await db.from('scout_sessions').select('*').eq('id', params.sessionId).eq('owner_id', params.actorId).single(); if (error || !session) throw new ScoutError('Preview not found', 'NOT_FOUND', 404);
  if (session.kind !== 'preview' || session.status !== 'complete') throw new ScoutError('Discovery preview is not ready', 'INVALID_PREVIEW', 400);
  if (!params.selected.length || new Set(params.selected.map(s => s.candidateId)).size !== params.selected.length) throw new ScoutError('Select unique candidates to import', 'INVALID_SELECTION', 400);
  const importToken=randomUUID();
  const {data:claimed,error:claimError}=await db.from('scout_sessions').update({import_token:importToken,import_lease_until:new Date(Date.now()+120000).toISOString()}).eq('id',params.sessionId).or(`import_lease_until.is.null,import_lease_until.lt.${new Date().toISOString()}`).select('id').maybeSingle();check(claimError);
  if(!claimed)throw new ScoutError('This preview is already being imported. Retry after the current import finishes.','IMPORT_IN_PROGRESS',409);
  const heartbeat=setInterval(()=>void db.from('scout_sessions').update({import_lease_until:new Date(Date.now()+120000).toISOString()}).eq('id',params.sessionId).eq('import_token',importToken).then(({error})=>{if(error)console.error('[social-scout] Import lease renewal failed',error.code);}),30000);
  try {
  const expected = cleanTarget(session.params.targetType) === 'Communities & Clubs' ? 'Community' : 'Individual';
  const { data: latestFeedback, error: feedbackError } = await db.from('scout_feedback').select('*').order('created_at', { ascending: false }); check(feedbackError);
  const selected: DiscoveryCandidate[] = params.selected.map(s => {
    const c: DiscoveryCandidate | undefined = session.candidates.find((c: DiscoveryCandidate) => c.candidateId === s.candidateId);
    if (!c || c.reviewState === 'Excluded') throw new ScoutError('Candidate is not in this preview', 'INVALID_SELECTION', 400);
    if (!platformMatches(c.platform, c.url) || urlKind(c.url) !== (expected === 'Community' && c.url.includes('/groups/') ? 'group' : 'profile') || c.accountKey !== `${c.platform}:${canonicalUrl(c.url)}`) throw new ScoutError('This preview contains an invalid profile URL. Search again before importing.', 'INVALID_PROFILE_URL', 409);
    const feedback = (latestFeedback || []).filter(f => f.account_key === c.accountKey);
    const typeCorrection = feedback.find(f => f.classification && ['Wrong Entity Type', 'Correct Classification'].includes(f.reason));
    if (typeCorrection && typeCorrection.classification !== c.classification || feedback.some(f => f.context_key === contextKey(session.params.keyword, session.params.geography) && ['Not Relevant', 'Wrong Location'].includes(f.reason))) throw new ScoutError('Team feedback invalidated this candidate. Search again before importing.', 'PREVIEW_STALE', 409);
    if (c.reviewState === 'Needs Review' && (s.classification !== expected || s.relevant !== true || s.locationConfirmed !== true)) throw new ScoutError('Confirm entity type, relevance and location before importing Needs Review candidates', 'REVIEW_REQUIRED', 400);
    if (c.reviewState === 'Matched' && c.classification !== expected) throw new ScoutError('Candidate has the wrong entity type', 'WRONG_TYPE', 400);
    return c;
  });
  const decisions = { ...(session.review_decisions || {}) };
  for (const s of params.selected) decisions[s.candidateId] = { ...s, actorId: params.actorId, confirmedAt: new Date().toISOString() };
  const { error: reviewError } = await db.from('scout_sessions').update({ review_decisions: decisions }).eq('id', params.sessionId).eq('owner_id', params.actorId); check(reviewError);
  let insertedKols = 0, updatedKols = 0, insertedCommunities = 0, updatedCommunities = 0, insertedPosts = 0;
  const table = expected === 'Community' ? 'communities' : 'kols';
  for (const c of selected) {
    const { data: records, error: readError } = await db.from(table).select('*'); check(readError);
    const existing = records?.find(r => r.scout_identity === c.accountKey || r.id === c.existingId || canonicalUrl(r.profile_url || r.group_url || '') === c.url);
    const metrics: Record<string, any> = {};
    if (expected === 'Community') metrics.scout_missing_metrics = c.followers === null ? ['members'] : [];
    if (c.followers !== null) metrics[expected === 'Community' ? 'members_count' : 'followers'] = c.followers;
    if (expected === 'Individual') {
      if (c.avgViews !== null) metrics.avg_views = c.avgViews;
      if (c.er !== null) metrics.er = c.er;
      metrics.scout_missing_metrics = ['followers', 'avgViews', 'er'].filter(k => (c as any)[k] === null);
      metrics.last_scouted_at = new Date().toISOString();
    }
    let entityId = existing?.id;
    if (existing) {
      if (expected === 'Community' && c.followers === null) metrics.scout_missing_metrics = existing.scout_missing_metrics || [];
      if (expected === 'Individual') metrics.scout_missing_metrics = (existing.scout_missing_metrics || []).filter((k: string) => (c as any)[k] === null);
      const payload: any = { ...metrics, scout_identity: c.accountKey,scout_provenance:c.provenance };
      for(const field of existing.user_locked_fields || []) { const mapped:Record<string,string>={avgViews:'avg_views',followers:'followers',er:'er'}; delete payload[mapped[field] || field]; }
      if (expected === 'Individual') {
        const changes: any = {}; const locked = new Set(existing.user_locked_fields || []);
        if (c.bio && c.bio !== existing.bio && !locked.has('bio')) changes.bio = { current: existing.bio, scouted: c.bio };
        if (Object.keys(changes).length) payload.pending_scout_diff = { scoutedAt: new Date().toISOString(), changes };
      }
      const { error: updateError } = await db.from(table).update(payload).eq('id', existing.id); check(updateError);
      if (expected === 'Individual') updatedKols++; else updatedCommunities++;
    } else {
      const payload = expected === 'Community' ? { name: c.name, sports: detectSportNiche(`${c.name} ${c.bio}`), geography: c.verifiedGeography || 'Unknown', platform: c.url.includes('/groups/') ? 'Facebook Group' : c.platform, group_url: c.url, activity_level: 'Unknown', privacy: 'Unknown', purposes: [], price_per_pin: 0, status: 'New Scout (Unverified)' } : { name: c.name, sports: detectSportNiche(`${c.name} ${c.bio}`), geography: c.verifiedGeography || 'Unknown', platform: c.platform, profile_url: c.url, bio: c.bio, avatar_url: c.avatarUrl, tier: c.followers === null ? 'Unknown' : calculateTier(c.followers), quotation: 0, status: 'New Scout (Unverified)' };
      const { data: inserted, error: insertError } = await db.from(table).insert({ ...payload, ...metrics, scout_identity: c.accountKey,scout_provenance:c.provenance }).select('id').single(); check(insertError); if (!inserted) throw new Error('Database did not return the imported profile'); entityId = inserted.id;
      if (expected === 'Individual') insertedKols++; else insertedCommunities++;
    }
    if (expected === 'Individual' && c.followers !== null && c.avgViews !== null && c.er !== null) {
      const { error: snapshotError } = await db.from('kol_metric_snapshots').upsert({ kol_id: entityId, scout_session_id: params.sessionId, followers: c.followers, avg_views: c.avgViews, er: c.er }, { onConflict: 'kol_id,scout_session_id', ignoreDuplicates: true }); check(snapshotError);
    }
    if (expected === 'Individual' && c.posts?.length) {
      const saved = await savePosts(c.posts.filter(p => p.authorUrl === c.url).map(post => ({ post, platform: c.platform, kolId: entityId, sport: detectSportNiche(`${c.name} ${c.bio}`).join(', ') })));
      insertedPosts += saved.length;
    }
  }
  const summary = `Imported ${insertedKols + insertedCommunities} new profiles; refreshed ${updatedKols + updatedCommunities} existing profiles; saved ${insertedPosts} observed posts.`;
  const { error: logError } = await db.from('scout_requests').insert({ keyword: session.params.keyword, target_type: session.params.targetType, platform: session.params.platform, geography: session.params.geography, target_limit: selected.length, status: 'Đã hoàn thành', results_summary: summary + (session.params.notes ? ` Notes: ${session.params.notes}` : ''), created_by: params.actorId }); check(logError);
  const importedIds=[...new Set([...(session.progress?.importedCandidateIds || []),...params.selected.map(s=>s.candidateId)])];
  const {error:countError}=await db.from('scout_sessions').update({progress:{...session.progress,importedCandidateIds:importedIds}}).eq('id',params.sessionId);check(countError);
  return { success: true, insertedKols, updatedKols, insertedCommunities, updatedCommunities, insertedPosts, summary };
  } finally {clearInterval(heartbeat);const {error}=await db.from('scout_sessions').update({import_lease_until:null,import_token:null}).eq('id',params.sessionId).eq('import_token',importToken);check(error);}
}
export async function savePosts(posts: { post: SocialPost; platform: string; kolId?: string; communityId?:string; sport: string; requestedScope?:unknown }[], counts={inserted:0,refreshed:0,duplicate:0}) {
  const db = createAdminClient(); const saved: any[] = [];
  for (const { post: p, platform, kolId, communityId, sport, requestedScope } of posts) {
    const identity = `${platform}:${p.url}`;
    const { data: existing, error: readError } = await db.from('scouted_posts').select('id,post_url,scout_identity,scout_provenance,scout_missing_metrics'); check(readError);
    const match=existing?.find(e => e.scout_identity===identity || canonicalUrl(e.post_url)===p.url);
    if(match) {
      if(p.provenance && (!match.scout_provenance?.fetchedAt || p.provenance.fetchedAt>match.scout_provenance.fetchedAt)) {
        const update:any={scout_provenance:p.provenance,...(p.publishedAt ? {published_at:p.publishedAt} : {})};
        for(const field of ['views','likes','comments']) if((p as any)[field]!=null) update[field]=(p as any)[field];
        update.scout_missing_metrics=(match.scout_missing_metrics || []).filter((field:string)=>(p as any)[field]==null);
        const {error}=await db.from('scouted_posts').update(update).eq('id',match.id);check(error); counts.refreshed++;
      } else counts.duplicate++;
      continue;
    }
    const { data, error } = await db.from('scouted_posts').upsert({ scout_identity: identity,requested_scope:requestedScope || null,scout_provenance:p.provenance,published_at:p.publishedAt || null, kol_id: kolId || null,community_id:communityId || null, title: p.caption, author: p.author, platform: `${platform} ${p.contentType}`, post_url: p.url, thumbnail_url: p.thumbnailUrl, sport,
      views: p.views ?? 0, likes: p.likes ?? 0, comments: p.comments ?? 0, er: 0, scout_missing_metrics: ['views', 'likes', 'comments'].filter(k => (p as any)[k] === null).concat('er'),
      viral_tier: p.views === null ? 'Unknown' : p.views >= 100000 ? 'Super Viral (> 100k views)' : p.views >= 20000 ? 'High Engagement (10k - 100k views)' : 'Standard', hashtags: p.hashtags.map(t => `#${t.replace(/^#/, '')}`).join(' '), notes: 'Verified social scout' }, { onConflict: 'scout_identity', ignoreDuplicates: true }).select().maybeSingle(); check(error);
    if (data) { saved.push(data); counts.inserted++; } else counts.duplicate++;
  }
  return saved;
}
export async function scoutMarketTrends(params: { keyword: string; searchMode?: 'hashtag' | 'keyword'; sport?: string | string[]; platform?: string | string[]; limit?: number; geography?: string | string[]; sessionId: string; }) {
  const platforms = Array.isArray(params.platform) ? params.platform : [params.platform || 'Instagram']; const limit = params.limit || 10;
  const geography = Array.isArray(params.geography) ? params.geography.join(', ') : params.geography || 'Nationwide';
  const mode = params.searchMode || (params.keyword.startsWith('#') ? 'hashtag' : 'keyword');
  if (mode === 'hashtag' && !/^#?[\p{L}\p{N}_]+$/u.test(params.keyword)) throw new ScoutError('Enter one hashtag without spaces', 'INVALID_HASHTAG', 400);
  const collected: { post: SocialPost; platform: string; kolId?: string; communityId?:string; sport: string; requestedScope?:unknown }[] = [];
  const db = createAdminClient(); const { data: kols, error } = await db.from('kols').select('id,profile_url'); check(error);
  const groups:typeof collected[]=[]; const windows:any[]=[]; const warnings:string[]=[]; const failures:{message:string;code:string;httpStatus:number}[]=[]; let excluded=0,unverified=0;
  for (const allocation of quotas(platforms,limit)) {
    if(!allocation.limit) continue; const platform=allocation.platform;
    const window=await retrievalWindow(platform,mode,JSON.stringify({keyword:params.keyword,geography,sport:params.sport}),params.sessionId); windows.push(window);
    let raw:any[];
    try {raw=await scrape(params.sessionId,platform,mode,params.keyword,allocation.limit,geography,{newerThan:window.newerThan});}
    catch(e:any) {if(e instanceof PendingScout) throw e;warnings.push(`${platform}: ${e.message}`);failures.push({message:e.message,code:e.code || 'PROVIDER_ERROR',httpStatus:e.status || 502});groups.push([]);continue;}
    const group:typeof collected=[];
    for(const r of raw) {
      const post=parsePost(r,platform);if(!post) continue;
      if(mode==='hashtag' && !hashtagMatch(post.hashtags,params.keyword) || mode==='keyword' && !tokens(params.keyword).every(t=>tokens(post.caption).includes(t))) {excluded++;continue;}
      const geo=assessProfile({name:'',bio:'',url:post.authorUrl,location:post.location},'running',geography,'Individual KOLs');
      if(!geo.locationMatch) {unverified++;continue;}
      if(!post.publishedAt) {unverified++;continue;}
      if(post.publishedAt<window.newerThan) {excluded++;continue;}
      group.push({post,platform,requestedScope:{sport:params.sport,geography},kolId:kols?.find(k=>post.authorUrl && canonicalUrl(k.profile_url)===post.authorUrl)?.id,sport:detectSportNiche(post.caption).join(', ') || 'Unknown'});
    }
    groups.push(group);
  }
  const unused=Math.max(0,limit-groups.reduce((sum,g)=>sum+g.length,0));
  const allocations=quotas(platforms,limit);
  const expandable=allocations.filter((a,i)=>a.limit>0 && groups[i]?.length>=a.limit && providerPlans(a.platform,mode,params.keyword,a.limit,geography).every(plan=>ACTOR_CONTRACTS[plan.actor]?.canExpand));
  for(const extra of quotas(expandable.map(a=>a.platform),unused)) {
    if(!extra.limit) continue;const index=allocations.findIndex(a=>a.platform===extra.platform);const window=windows[index];if(!window)continue;
    try {
      const rows=await scrape(params.sessionId,extra.platform,mode,params.keyword,allocations[index].limit+extra.limit,geography,{newerThan:window.newerThan});
      const known=new Set(groups[index].map(p=>p.post.url));
      for(const row of rows) {
        const post=parsePost(row,extra.platform);if(!post || known.has(post.url))continue;
        if(mode==='hashtag' && !hashtagMatch(post.hashtags,params.keyword) || mode==='keyword' && !tokens(params.keyword).every(t=>tokens(post.caption).includes(t)))continue;
        if(!assessProfile({name:'',bio:'',url:post.authorUrl,location:post.location},'running',geography,'Individual KOLs').locationMatch || !post.publishedAt || post.publishedAt<window.newerThan)continue;
        known.add(post.url);groups[index].push({post,platform:extra.platform,requestedScope:{sport:params.sport,geography},kolId:kols?.find(k=>post.authorUrl && canonicalUrl(k.profile_url)===post.authorUrl)?.id,sport:detectSportNiche(post.caption).join(', ')});
      }
    }catch(e:any){if(e instanceof PendingScout)throw e;warnings.push(`${extra.platform}: ${e.message}`);}
  }
  const unique=new Set<string>();const merged=roundRobin(groups,groups.reduce((n,g)=>n+g.length,0)).filter(p=>{if(unique.has(p.post.url))return false;unique.add(p.post.url);return true;}).slice(0,limit);
  const counts={inserted:0,refreshed:0,duplicate:0}; const posts=await savePosts(merged,counts);
  const {data:providerRuns,error:runError}=await db.from('scout_provider_runs').select('warnings').eq('session_id',params.sessionId);check(runError);
  const providerPartial=(providerRuns || []).some(r=>r.warnings?.length) || merged.some(p=>p.post.provenance?.warnings?.length);
  for(let i=0;i<windows.length;i++) await advanceWatermark(windows[i].scopeKey,(groups[i] || []).map(p=>p.post),!providerPartial && !warnings.length && !unverified && merged.length<limit && (groups[i] || []).every(p=>!!p.post.publishedAt));
  const allFailed=failures.length===allocations.filter(a=>a.limit>0).length && failures.length>0;
  return { success: !allFailed,allFailed,...(allFailed ? {error:failures.map(f=>f.message).join(' '),code:failures[0].code,httpStatus:failures[0].httpStatus} : {}),keyword: params.keyword, partial:!allFailed && (providerPartial || warnings.length>0),warnings,counts:{...counts,excluded,unverified,failed:failures.length},totalScouted: posts.length, matchedKolsCount: posts.filter(p => p.kol_id).length, posts, message:`Inserted ${counts.inserted}; refreshed ${counts.refreshed}; duplicate ${counts.duplicate}; excluded ${excluded}; unverified ${unverified}; failed ${warnings.length}.` };
}
async function scoutEntityPosts(id: string, kind: 'kol' | 'community', limit: number, platforms: string | string[], sessionId: string) {
  const db = createAdminClient(); const { data: entity, error } = await db.from(kind === 'kol' ? 'kols' : 'communities').select('*').eq('id', id).single(); check(error);
  const requested = Array.isArray(platforms) ? platforms : [platforms];
  const allocations=quotas(requested,limit).filter(a=>a.limit>0);
  const groups:{post:SocialPost;platform:string;kolId?:string;communityId?:string;sport:string}[][]=[];
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
        const accepted=(kind==='community' || post.authorUrl===url) && !!post.publishedAt && post.publishedAt>=window.newerThan;
        if(!accepted) excluded++; return accepted;
      });
      groups.push(eligible.map(post=>({post,platform,kolId:kind==='kol' ? id : undefined,communityId:kind==='community' ? id : undefined,sport:entity.sports?.join(', ') || 'Unknown'})));
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
      for(const row of rows){const post=parsePost(row,extra.platform);if(!post || known.has(post.url) || !post.publishedAt || post.publishedAt<window.newerThan || kind==='kol' && post.authorUrl!==window.url)continue;known.add(post.url);groups[index].push({post,platform:extra.platform,kolId:kind==='kol' ? id : undefined,communityId:kind==='community' ? id : undefined,sport:entity.sports?.join(', ') || 'Unknown'});window.posts.push(post);}
      window.complete=rows.length<cap && rows.every(row=>!!parsePost(row,extra.platform)?.publishedAt);
    }catch(e:any){if(e instanceof PendingScout)throw e;warnings.push(`${extra.platform}: ${e.message}`);window.complete=false;}
  }
  const seen=new Set<string>(); const merged=roundRobin(groups,groups.reduce((n,g)=>n+g.length,0)).filter(p=>{if(seen.has(p.post.url))return false;seen.add(p.post.url);return true;}).slice(0,limit);
  const counts={inserted:0,refreshed:0,duplicate:0};const saved=await savePosts(merged,counts);
  const {data:runs,error:runError}=await db.from('scout_provider_runs').select('warnings').eq('session_id',sessionId);check(runError);
  const partial=warnings.length>0 || (runs || []).some(r=>r.warnings?.length) || merged.some(p=>p.post.provenance?.warnings?.length);
  for(const window of windows) await advanceWatermark(window.scopeKey,window.posts,window.complete && !partial);
  const allFailed=failures.length===allocations.length && allocations.length>0;
  return {success:!allFailed,allFailed,...(allFailed ? {error:failures.map(f=>f.message).join(' '),code:failures[0].code,httpStatus:failures[0].httpStatus} : {}),partial:!allFailed && partial,warnings,counts:{...counts,excluded,failed:failures.length},kolName:entity.name,communityName:entity.name,insertedCount:saved.length,posts:saved,message:`Inserted ${counts.inserted}; refreshed ${counts.refreshed}; duplicate ${counts.duplicate}; excluded ${excluded}; failed ${warnings.length}.`};
}
export async function scoutSingleKolPosts(id: string, limit = 10, platform: string | string[] = 'Instagram', sessionId = '') { return scoutEntityPosts(id, 'kol', limit, platform, sessionId); }
export async function scoutSingleCommunityPosts(id: string, limit = 10, platform: string | string[] = 'Facebook', sessionId = '') { return scoutEntityPosts(id, 'community', limit, platform, sessionId); }
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
    const { data: session, error: sessionError } = await db.from('scout_sessions').insert({ owner_id: owner, kind,runtime_version:2, params: { keyword: request.keyword, targetType: cleanTarget(request.target_type), platform: request.platform, geography: request.geography, limit: Math.min(request.target_limit || 5, 50) } }).select('id').single(); check(sessionError); if (!session) throw new Error('Failed to create scout session'); sessionId = session.id;
    const { error: linkError } = await db.from('scout_requests').update({ scout_session_id: sessionId }).eq('id', requestId); check(linkError);
  }
  const {enqueue,QUEUE_NAMES}=await import('@/lib/queue');
  await enqueue(QUEUE_NAMES.socialScout,'session',{sessionId},{jobId:sessionId,attempts:180,backoff:{type:'scout',delay:5000},removeOnComplete:true,removeOnFail:true});
  const { resumeSession } = await import('./sessions');
  const response = await resumeSession(sessionId, owner); const result = await response.json();
  const summary = result.pending ? 'Scout is running. Resume the saved preview when ready.' : kind === 'trends' ? `Saved ${result.totalScouted} trending posts.` : `Preview ready: ${result.totalFound} candidates. Human confirmation is required before import.`;
  const { error: updateError } = await db.from('scout_requests').update({ status: result.pending ? 'Đang quét dữ liệu' : result.success ? kind === 'trends' ? 'Đã hoàn thành' : 'Needs Review' : 'Failed', results_summary: result.success ? summary : result.error }).eq('id', requestId); check(updateError);
  return { summary, sessionId, ...result };
}
