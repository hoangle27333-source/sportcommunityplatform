import { createHash } from 'node:crypto';
import { z } from 'zod';
import { createAdminClient } from '@/lib/supabase/admin';
import { canonicalUrl, platformMatches } from './discovery-quality';
import { ScoutError, PendingScout } from './errors';
import { assertPostWorkspaceSchema } from './post-metadata';
import { loadPostAccounts } from './post-accounts';
import { stableJson, capabilityKey } from './runtime';
import { contentFilterSchema, DEFAULT_CONTENT_FILTER } from './content-settings';
import { sessionSnapshot } from './session-snapshot';
import { checkpointTask } from './task-checkpoint';
import { scrape, parsePost, providerPlans, type SocialPost } from './providers';
import { assessTopPost, channelMembership, topCandidateBudget } from './top-post-quality';
import { scoutTopPosts } from './top-posts';
import { savePosts, detectSportNiche } from './scout';
import type { SearchPlan } from './search-plan';

export const accountPostSchema = z.object({
  accounts: z.array(z.object({ entityType: z.enum(['kol', 'community']), id: z.string().uuid(), channelUrls: z.array(z.string().url()).min(1).max(20).optional() })).min(1).max(1000)
    .refine(accounts => new Set(accounts.map(a => `${a.entityType}:${a.id}`)).size === accounts.length, 'Select each account once.'),
  mode: z.enum(['latest', 'top']).default('latest'),
  recentDays: z.number().int().min(1).max(30).default(7),
  publishedFrom: z.string().datetime().optional(), publishedTo: z.string().datetime().optional(),
  limitPerAccount: z.number().int().min(1).max(50).default(10),
  qualityFilter: contentFilterSchema.default({ ...DEFAULT_CONTENT_FILTER, enabled: false }),
  maxSessionUsd: z.number().positive().max(100).optional(),
  planHash: z.string().regex(/^[a-f0-9]{64}$/).optional(),
  uiContext: z.object({ source: z.string().max(200) }).optional(),
}).superRefine((value, ctx) => {
  if (!!value.publishedFrom !== !!value.publishedTo) ctx.addIssue({ code: 'custom', message: 'Select both publication dates.', path: ['publishedFrom'] });
  if (value.publishedFrom && value.publishedTo) {
    const duration = Date.parse(value.publishedTo) - Date.parse(value.publishedFrom);
    if (duration <= 0 || duration > 30 * 86400000 || Date.parse(value.publishedTo) > Date.now() + 60000) ctx.addIssue({ code: 'custom', message: 'Choose a past publication window of up to 30 days.', path: ['publishedTo'] });
  }
});
export type AccountPostRequest = z.infer<typeof accountPostSchema>;
export type AccountPostSnapshot = { entityType: 'kol' | 'community'; id: string; name: string; channelUrls: string[]; plan: SearchPlan };
export type AccountPostPlan = {
  kind: 'account-posts'; version: 1; hash: string; criteria: Omit<AccountPostRequest, 'planHash' | 'uiContext'>;
  accounts: AccountPostSnapshot[]; skipped: { entityType: 'kol' | 'community'; id: string; channelUrl?: string; reason: string; code: string }[];
  maxSessionUsd: number; allowedMaxSessionUsd: number; accountCount: number; channelCount: number;
};
export async function buildAccountPostPlan(input: unknown): Promise<AccountPostPlan> {
  const { planHash: _hash, uiContext: _context, ...criteria } = accountPostSchema.parse(input);
  await assertPostWorkspaceSchema();
  const registry = await loadPostAccounts();
  const db=createAdminClient();
  const [settings,receipts]=await Promise.all([db.from('scout_budget_settings').select('enabled,session_usd,daily_usd').single(),db.from('scout_provider_capabilities').select('capability_key,verified,build,receipt')]);
  if(settings.error || receipts.error || !settings.data?.enabled)throw new ScoutError('Account post collection is unavailable.','NOT_CONFIGURED',503);
  const allowedMaxSessionUsd=Math.min(Number(settings.data.session_usd),Number(settings.data.daily_usd));
  const maxSessionUsd=Math.min(allowedMaxSessionUsd,criteria.maxSessionUsd ?? allowedMaxSessionUsd);
  if(!Number.isFinite(maxSessionUsd) || maxSessionUsd<=0)throw new ScoutError('Scout budget is unavailable.','BUDGET_EXHAUSTED',409);
  const accounts: AccountPostSnapshot[] = [], skipped: AccountPostPlan['skipped'] = [];
  for (const selected of [...criteria.accounts].sort((a, b) => `${a.id}:${a.entityType}`.localeCompare(`${b.id}:${b.entityType}`))) {
    const entity = registry.find(a => a.entityType === selected.entityType && a.id === selected.id);
    if (!entity) throw new ScoutError('A selected account no longer exists.', 'ACCOUNT_NOT_FOUND', 404);
    const urls = [...new Set((selected.channelUrls || entity.urls).map(canonicalUrl))].sort();
    if (urls.some(url => !entity.urls.includes(url))) throw new ScoutError('Choose connected account channels only.', 'INVALID_CHANNEL', 400);
    const plans: SearchPlan[] = [], eligibleUrls: string[] = [];
    for (const channelUrl of urls) {
      const platform = ['Instagram', 'Facebook', 'TikTok'].find(p => platformMatches(p, channelUrl));
      if (!platform) { skipped.push({ ...selected, channelUrl, reason: 'This channel platform is not supported.', code: 'UNSUPPORTED' }); continue; }
      const keys=providerPlans(platform,'profile-posts',channelUrl,1).map(p=>capabilityKey(p,'profile-posts'));
      const builds:Record<string,string>={},options:SearchPlan['sources'][number]['options']={};
      for(const key of keys){const receipt=receipts.data?.find(r=>r.capability_key===key && r.verified && r.build && !['latest','stable','beta'].includes(r.build));if(receipt){builds[key]=receipt.build;options[key]=receipt.receipt?.verifiedSearchOptions || {};}}
      if(keys.some(key=>!builds[key])){skipped.push({entityType:selected.entityType,id:selected.id,channelUrl,reason:'This channel collection capability has not passed provider verification.',code:'CAPABILITY_UNVERIFIED'});continue;}
      const source={platform,task:'profile-posts' as const,keys,builds,options,authorSearch:false,rounds:Array.from({length:4},()=>({task:'profile-posts' as const,queries:[channelUrl]})),warnings:[]};
      const base={version:4 as const,kind:'trends' as const,criteria:{mode:criteria.mode,qualityFilter:criteria.qualityFilter,recentDays:criteria.recentDays,publishedFrom:criteria.publishedFrom,publishedTo:criteria.publishedTo,limit:criteria.limitPerAccount,platform:[platform],channelUrls:[channelUrl],[selected.entityType==='kol'?'kolId':'communityId']:selected.id},maxSessionUsd,allowedMaxSessionUsd,maxSearchRows:topCandidateBudget(criteria.limitPerAccount),maxHydratedProfiles:0,maxPostsPerProfile:5 as const,rounds:Array.from({length:4},(_,i)=>({label:`Channel collection ${i+1}`,queries:[channelUrl]})),sources:[source]};
      plans.push({...base,hash:createHash('sha256').update(stableJson(base)).digest('hex')});eligibleUrls.push(channelUrl);
    }
    if (!urls.length) skipped.push({ entityType: selected.entityType, id: selected.id, reason: 'No connected profile or group channels.', code: 'NO_CHANNELS' });
    if (plans.length) accounts.push({ entityType: selected.entityType, id: selected.id, name: entity.name, channelUrls: eligibleUrls, plan: { ...plans[0], sources: plans.flatMap(p => p.sources) } });
  }
  if (!accounts.length) throw new ScoutError('No supported verified channels are selected.', 'NO_ELIGIBLE_ACCOUNTS', 400);
  // Freeze normalized criteria so selection order and equivalent URL spelling do not change the hash.
  criteria.accounts = [...criteria.accounts].map(a => ({ ...a, ...(a.channelUrls ? { channelUrls: [...new Set(a.channelUrls.map(canonicalUrl))].sort() } : {}) })).sort((a, b) => `${a.id}:${a.entityType}`.localeCompare(`${b.id}:${b.entityType}`));
  const base = { kind: 'account-posts' as const, version: 1 as const, criteria, accounts, skipped, maxSessionUsd, allowedMaxSessionUsd, accountCount: accounts.length, channelCount: accounts.reduce((n, a) => n + a.channelUrls.length, 0) };
  return { ...base, hash: createHash('sha256').update(stableJson(base)).digest('hex') };
}

export async function collectLatestAccountPosts(sessionId: string, account: AccountPostSnapshot, criteria: AccountPostRequest, window: { from: string; to: string }) {
  const unique = new Map<string, { post: SocialPost; channelUrl: string }>();
  const warnings: string[] = [], skippedPosts: any[] = [];
  let completedChannels = 0; let stopReason: string | undefined;
  for (const source of account.plan.sources) {
    const channelUrl = source.rounds![0].queries[0];
    try {
      const rows = await scrape(sessionId, source.platform, 'profile-posts', channelUrl, Math.min(120, Math.max(30, criteria.limitPerAccount * 3)), '', { searchPlan: source, newerThan: window.from, publishedTo: window.to, latestSample: true });
      completedChannels++;
      for (const row of rows) {
        const post = parsePost(row, source.platform);
        if (!post) continue;
        const ownership = channelMembership(post, channelUrl, row);
        const assessment = assessTopPost(post, criteria, window.from, window.to, true);
        if (ownership !== 'passed' || !post.publishedAt || !['Qualified', 'Needs Verification'].includes(assessment.resultGroup)) {
          skippedPosts.push({ ...post, platform: source.platform, ...assessment, reviewState: ownership === 'failed' ? 'Excluded' : ownership === 'unknown' || !post.publishedAt ? 'Needs Verification' : assessment.reviewState, reason: ownership !== 'passed' ? 'Channel membership is not verified.' : assessment.reason }); continue;
        }
        unique.set(`${source.platform}:${post.url}`, { post, channelUrl });
      }
    } catch (e: any) {
      if (e instanceof PendingScout || ['START_UNKNOWN', 'RATE_LIMITED', 'PROVIDER_UNAVAILABLE', 'PLAN_STALE'].includes(e.code)) throw e;
      warnings.push(`${source.platform}: ${e.message}`);
      if(e.code==='BUDGET_EXHAUSTED'){stopReason='budget-exhausted';break;}
    }
  }
  const retained = [...unique.values()].sort((a, b) => b.post.publishedAt!.localeCompare(a.post.publishedAt!) || a.post.url.localeCompare(b.post.url)).slice(0, criteria.limitPerAccount);
  const counts = { inserted: 0, refreshed: 0, duplicate: 0 };
  const posts = await savePosts(retained.map(({ post, channelUrl }) => {
    const platform = account.plan.sources.find(s => platformMatches(s.platform, post.url))!.platform;
    const group = channelUrl.includes('/groups/');
    return { post, platform, ...(account.entityType === 'kol' ? { kolId: account.id } : { communityId: group ? account.id : undefined }), authorAccount: !group ? { entityType: account.entityType, id: account.id } : undefined, sport: detectSportNiche(post.caption).join(', ') || 'Unknown', contentAssessment: { status: assessTopPost(post, criteria, window.from, window.to, true).resultGroup === 'Qualified' ? 'verified' : 'needs-verification', ownership: 'passed' }, collectionSource: { kind: 'account' as const, sessionId, entityType: account.entityType, entityId: account.id, channelUrl } };
  }), counts, true);
  return { success: completedChannels > 0,...(!completedChannels && stopReason==='budget-exhausted'?{code:'BUDGET_EXHAUSTED'}:{}), stopReason, posts, skippedPosts, counts: { ...counts, saved: posts.length }, warnings, partial: warnings.length > 0 || skippedPosts.length > 0 };
}

export async function executeAccountPosts(session: any) {
  const db = createAdminClient();
  const plan: AccountPostPlan = session.params.accountPostPlan;
  if (!plan?.accounts?.length) throw new ScoutError('A reviewed batch plan is required.', 'PLAN_REQUIRED', 400);
  const criteria = accountPostSchema.parse(session.params);
  const window = JSON.parse(await sessionSnapshot(session.id, 'retrievalWindows', 'account-post-window', async created => JSON.stringify({ from: criteria.publishedFrom || new Date(Date.parse(created) - criteria.recentDays * 86400000).toISOString(), to: criteria.publishedTo || created }))) as { from: string; to: string };
  const accountResults: any[] = [], warnings: string[] = [];
  let stopped: string | undefined;
  const progress = async (stage: string) => {
    const { error } = await db.from('scout_sessions').update({ progress: { ...session.progress, stage, totalAccounts: plan.accounts.length, completedAccounts: accountResults.length, accountResults, skippedChannels: plan.skipped } }).eq('id', session.id).eq('lease_token', session.lease_token);
    if (error) throw error;
  };
  for (const account of plan.accounts) {
    await progress('collecting-account-posts');
    const result = await checkpointTask(session.id, `account-posts:${account.entityType}:${account.id}`, async () => {
      if (stopped) return { ...account, plan: undefined, status: 'skipped', code: stopped, posts: [], counts: { saved: 0 }, warnings: [stopped === 'BUDGET_EXHAUSTED' ? 'The batch budget was exhausted.' : 'The batch time limit was reached.'] };
      if (Date.now() - Date.parse(session.execution_started_at || session.created_at) >= 15 * 60000) { stopped = 'SEARCH_TIME_LIMIT'; return { entityType: account.entityType, id: account.id, name: account.name, status: 'skipped', code: stopped, posts: [], counts: { saved: 0 }, warnings: ['The batch time limit was reached.'] }; }
      try {
        const collected: any = criteria.mode === 'top' ? await scoutTopPosts({ ...criteria, selectionMode: 'top', rankingMode: 'views-first', sessionId: session.id, searchPlan: account.plan, limit: criteria.limitPerAccount,saveLimit:criteria.limitPerAccount, publishedFrom: window.from, publishedTo: window.to, [account.entityType === 'kol' ? 'kolId' : 'communityId']: account.id }) : await collectLatestAccountPosts(session.id, account, criteria, window);
        if (collected.stopReason === 'budget-exhausted') stopped = 'BUDGET_EXHAUSTED';
        return { entityType: account.entityType, id: account.id, name: account.name, ...collected, status: collected.success ? 'complete' : 'failed' };
      } catch (error: any) {
        if (error instanceof PendingScout || ['START_UNKNOWN', 'RATE_LIMITED', 'PROVIDER_UNAVAILABLE', 'PLAN_STALE'].includes(error.code)) throw error;
        if (error.code === 'BUDGET_EXHAUSTED') stopped = error.code;
        return { entityType: account.entityType, id: account.id, name: account.name, status: 'failed', code: error.code || 'SCOUT_ERROR', error: error.message, posts: [], counts: { saved: 0 }, warnings: [error.message] };
      }
    });
    if (['BUDGET_EXHAUSTED', 'SEARCH_TIME_LIMIT'].includes(result.code)) stopped = result.code;
    accountResults.push(result); warnings.push(...result.warnings);
    await progress('collecting-account-posts');
  }
  const posts = [...new Map(accountResults.flatMap(r => r.posts).map((p: any) => [p.id, p])).values()];
  const completed = accountResults.filter(r => r.status === 'complete').length;
  return { success: completed > 0, ...(completed ? {} : { code: stopped || 'BATCH_FAILED', error: 'No accounts completed successfully.', httpStatus: 502 }), posts, accountResults, skippedChannels: plan.skipped, qualityCriteria: { ...criteria, publishedFrom: window.from, publishedTo: window.to }, warnings, partial: accountResults.some(r => r.partial || r.status !== 'complete') || plan.skipped.length > 0, stopReason: stopped || 'complete', counts: { saved: posts.length, completedAccounts: completed, failedAccounts: accountResults.filter(r => r.status === 'failed').length, skippedAccounts: accountResults.filter(r => r.status === 'skipped').length, inserted: accountResults.reduce((n, r) => n + (r.counts.inserted || 0), 0), refreshed: accountResults.reduce((n, r) => n + (r.counts.refreshed || 0), 0), duplicate: accountResults.reduce((n, r) => n + (r.counts.duplicate || 0), 0) }, message: `Completed ${completed.toLocaleString('en-US')} of ${plan.accounts.length.toLocaleString('en-US')} accounts; ${posts.length.toLocaleString('en-US')} posts saved.` };
}
