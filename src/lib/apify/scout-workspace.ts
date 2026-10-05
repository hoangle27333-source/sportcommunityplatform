import {scoutOutcome} from './scout-outcome';
/** Public workspace contracts. Provider execution and billing stay server-side. */
export const SCOUT_PLATFORMS = ['Instagram', 'Facebook', 'TikTok'] as const;
export type ScoutPlatform = typeof SCOUT_PLATFORMS[number];
export type ScoutIntent = 'profiles' | 'content' | 'refresh';
export type ScoutKind = 'preview' | 'trends' | 'kol-posts' | 'community-posts' | 'sync' | 'tracked' | 'comments' | 'inspect';
export type ScoutContext = {
  intent: ScoutIntent;
  mode?: 'search' | 'entity' | 'link';
  entityType?: 'kol' | 'community' | 'tracked';
  ids?: string[];
  source?: string;
  url?: string;
};
export const TASK_LABELS: Record<string, string> = {
  preview: 'Find Profiles', trends: 'Find Content', 'kol-posts': 'Collect Posts',
  'community-posts': 'Collect Posts', sync: 'Refresh Data', tracked: 'Refresh Data',
  comments: 'Collect Comments', inspect: 'Fetch Verified Details',
};
export type ScoutCapabilityTask = 'profiles' | 'communities' | 'hashtag' | 'keyword' | 'profile-posts' | 'group-posts' | 'profile-details' | 'group-details' | 'sync' | 'group-sync' | 'comments';
export type ScoutCapabilities = Record<ScoutPlatform, Record<ScoutCapabilityTask, { available: boolean; reason?: string }>>;
export type ScoutSessionSummary = {
  id: string; kind: ScoutKind; title: string; subject: string; createdAt: string;
  status: 'pending' | 'running' | 'complete' | 'failed'; partial: boolean; empty?: boolean;
  reviewState: 'needs-review' | 'reviewed' | 'none'; remainingCandidates: number;
  progress: { stage?: string }; warnings: string[]; counts: Record<string, number>;
  params: Record<string, unknown>; result?: Record<string, unknown>;
};

export function sessionSummary(session: any, subjects: Record<string, string> = {}): ScoutSessionSummary {
  const params = session.params || {};
  const outcome=scoutOutcome(session.kind,params,session.result);
  const status=session.status==='complete' && outcome?.success===false ? 'failed' : session.status;
  const candidates = session.candidates || session.result?.candidates || [];
  const imported = new Set(session.progress?.importedCandidateIds || []);
  const remainingCandidates = candidates.filter((c: any) => c.reviewState !== 'Excluded' && !imported.has(c.candidateId)).length;
  const ids: string[] = params.ids || [params.kolId || params.communityId || params.trackedAccountId].filter(Boolean);
  const names = ids.map(id => subjects[id]).filter(Boolean);
  const subject = params.keyword || params.url || (names.length ? `${names.slice(0, 2).join(', ')}${ids.length > 2 ? ` +${ids.length - 2}` : ''}` : `${ids.length} saved ${params.entityType === 'community' ? 'communities' : 'accounts'}`);
  return {
    id: session.id, kind: session.kind, title: TASK_LABELS[session.kind] || 'Scout Task', subject,
    createdAt: session.created_at, status, partial: !!outcome?.partial, empty:status==='complete' && ['trends','kol-posts','community-posts'].includes(session.kind) && Array.isArray(outcome?.posts) && !outcome.posts.length && !outcome.counts?.refreshed && !outcome.counts?.duplicate,
    reviewState: session.kind === 'preview' && status === 'complete' ? remainingCandidates ? 'needs-review' : 'reviewed' : 'none',
    remainingCandidates, progress: { stage: session.progress?.stage },
    warnings: [...new Set<string>([...(status==='pending' ? session.warnings || [] : (session.warnings || []).filter((w:string)=>w!=='Waiting for the worker queue to recover.')), ...(session.result?.warnings || [])])],
    counts: Object.fromEntries(Object.entries(session.result?.counts || {}).filter((entry):entry is [string,number] => typeof entry[1] === 'number' && Number.isFinite(entry[1]))),
    params: Object.fromEntries(Object.entries(params).filter(([key]) => ['keyword','targetType','platform','geography','limit','searchMode','sport','kolId','communityId','forceRefresh','ids','entityType','trackedAccountId','url','selectedPostIds','notes','uiContext'].includes(key))),
  };
}

/** Connected URLs are the source of platform selection, never a guessed Instagram default. */
export function connectedPlatforms(entity: { channels?: { url?: string }[]; profileUrl?: string; groupUrl?: string }): ScoutPlatform[] {
  const urls = [...(entity.channels || []).map(c => c.url), entity.profileUrl, entity.groupUrl];
  return SCOUT_PLATFORMS.filter(platform => urls.some(url => {
    try { const host = new URL(url || '').hostname.toLowerCase(); const domain = `${platform.toLowerCase()}.com`; return host === domain || host.endsWith(`.${domain}`); } catch { return false; }
  }));
}

export function taskRequest(context: ScoutContext, params: Record<string, unknown>): { url: string; body: Record<string, unknown> } {
  const uiContext = { source: context.source || '/scout' };
  if (context.intent === 'profiles') return { url: '/api/sport-hub/scout', body: { ...params, action: 'preview', uiContext } };
  if (context.intent === 'content' && context.mode !== 'entity') return { url: '/api/sport-hub/scout/market-trends', body: { ...params, uiContext } };
  if (context.intent === 'content') {
    const community = context.entityType === 'community';
    return { url: `/api/sport-hub/scout/${community ? 'community' : 'kol'}-posts`, body: { ...params, [community ? 'communityId' : 'kolId']: context.ids?.[0], uiContext } };
  }
  if (context.entityType === 'tracked') return { url: `/api/tracked-accounts/${context.ids?.[0]}/scrape`, body: { uiContext } };
  return { url: '/api/sport-hub/batch-action', body: { ...params, type: context.entityType || 'kol', action: 'sync', ids: context.ids, uiContext } };
}
