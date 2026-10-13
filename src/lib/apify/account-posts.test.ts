import { beforeEach, describe, expect, it, vi } from 'vitest';
const state = vi.hoisted(() => ({ accounts: [] as any[], capabilities: [] as any[], checkpoints: new Map<string, any>(), updates: [] as any[], saved: [] as any[], scrape: vi.fn(), top: vi.fn(), schema: true, rows: 0 }));
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: () => ({ from(table: string) {
  const result = () => ({ data: table === 'scout_budget_settings' ? { enabled: true, session_usd: 1, daily_usd: 3 } : table === 'scout_provider_capabilities' ? state.capabilities : [], error: null });
  const q: any = { select: () => q, single: async () => result(), update: (value: any) => { state.updates.push(value); return q; }, eq: () => q, then: (resolve: any, reject: any) => Promise.resolve(result()).then(resolve, reject) }; return q;
} }) }));
vi.mock('./post-accounts', () => ({ loadPostAccounts: async () => state.accounts }));
vi.mock('./post-metadata', () => ({ assertPostWorkspaceSchema: async () => { if (!state.schema) throw new Error('Migration missing'); } }));
vi.mock('./session-snapshot', () => ({ sessionSnapshot: async (_id: string, _namespace: string, _key: string, make: any) => make('2026-10-13T00:00:00.000Z') }));
vi.mock('./task-checkpoint', () => ({ checkpointTask: async (_id: string, key: string, work: any) => { if (state.checkpoints.has(key)) return state.checkpoints.get(key); const value = await work(); state.checkpoints.set(key, value); return value; } }));
vi.mock('./providers', async () => ({ ...await vi.importActual<any>('./providers'), scrape: state.scrape }));
vi.mock('./top-posts', () => ({ scoutTopPosts: state.top }));
vi.mock('./scout', () => ({ detectSportNiche: () => ['Running'], savePosts: async (items: any[], counts: any) => { state.saved.push(...items); counts.inserted += items.length; return items.map(item => ({ id: `p${++state.rows}`, ...item.post, collectionSource: item.collectionSource })); } }));
import { accountPostSchema, buildAccountPostPlan, executeAccountPosts } from './account-posts';
import { PendingScout, ScoutError } from './errors';
const k = '00000000-0000-4000-8000-000000000001', c = '00000000-0000-4000-8000-000000000002';
const request = { accounts: [{ entityType: 'kol', id: k }, { entityType: 'community', id: c }] };
beforeEach(() => {
  state.accounts = [{ entityType: 'kol', id: k, name: 'Runner', urls: ['https://instagram.com/runner'] }, { entityType: 'community', id: c, name: 'Club', urls: ['https://facebook.com/groups/123'] }];
  state.capabilities = [{ capability_key: 'apify~instagram-scraper:profile-posts:posts', verified: true, build: '1.0.1', receipt: {} }, { capability_key: 'apify~facebook-groups-scraper:profile-posts:default', verified: true, build: '1.0.2', receipt: {} }];
  state.schema = true; state.checkpoints.clear(); state.updates = []; state.saved = []; state.rows = 0; state.scrape.mockReset(); state.top.mockReset();
});
const raw = (id: string, owner = 'runner', date = '2026-10-12T00:00:00Z') => ({ url: `https://instagram.com/p/${id}`, ownerUsername: owner, caption: 'Chạy bộ mỗi ngày', timestamp: date, likesCount: 0 });
async function session(extra: any = {}) { const plan = await buildAccountPostPlan(request); return { id: 'session', created_at: '2026-10-13T00:00:00Z', execution_started_at: new Date().toISOString(), lease_token: 'lease', progress: {}, params: { ...accountPostSchema.parse(request), accountPostPlan: plan, ...extra } }; }
describe('account post plans and durable execution', () => {
  it('defaults to latest, seven days, ten/account, no engagement threshold and rejects duplicates/invalid windows', () => {
    expect(accountPostSchema.parse(request)).toMatchObject({ mode: 'latest', recentDays: 7, limitPerAccount: 10, qualityFilter: { enabled: false } });
    expect(accountPostSchema.safeParse({ accounts: [request.accounts[0], request.accounts[0]] }).success).toBe(false);
    expect(accountPostSchema.safeParse({ ...request, publishedFrom: '2026-10-01T00:00:00Z' }).success).toBe(false);
  });
  it('reviews one budget, hashes membership/build/settings changes, and ignores selection order/UI context', async () => {
    const plan = await buildAccountPostPlan(request);
    expect(plan).toMatchObject({ maxSessionUsd: 1, accountCount: 2, channelCount: 2 });
    expect((await buildAccountPostPlan({ accounts: [...request.accounts].reverse(), uiContext: { source: '/elsewhere' } })).hash).toBe(plan.hash);
    expect((await buildAccountPostPlan({ ...request, mode: 'top' })).hash).not.toBe(plan.hash);
    state.capabilities[0].build = '1.0.3'; expect((await buildAccountPostPlan(request)).hash).not.toBe(plan.hash);
    await expect(buildAccountPostPlan({ accounts: [{ entityType: 'kol', id: k, channelUrls: ['https://instagram.com/other'] }] })).rejects.toMatchObject({ code: 'INVALID_CHANNEL' });
  });
  it('reports unverified channels rather than dropping them invisibly', async () => {
    state.capabilities[1].verified = false;
    expect(await buildAccountPostPlan(request)).toMatchObject({ accountCount: 1, skipped: [{ id: c, code: 'CAPABILITY_UNVERIFIED' }] });
    state.capabilities[0].verified = false; await expect(buildAccountPostPlan(request)).rejects.toMatchObject({ code: 'NO_ELIGIBLE_ACCOUNTS' });
  });
  it('bounds/latest-ranks dated owned posts across channels and preserves observed zero', async () => {
    const s = await session({ limitPerAccount: 1 });
    state.scrape.mockImplementation(async (_id, platform) => platform === 'Instagram' ? [raw('old', 'runner', '2026-10-09T00:00:00Z'), raw('new'), raw('wrong', 'someoneelse'), raw('stale', 'runner', '2026-09-01T00:00:00Z')] : []);
    const result = await executeAccountPosts(s);
    expect(result.posts).toHaveLength(1); expect(result.posts[0]).toMatchObject({ caption: 'Chạy bộ mỗi ngày', likes: 0, url: 'https://instagram.com/p/new' });
    expect(state.saved[0]).toMatchObject({ authorAccount: { entityType: 'kol', id: k }, collectionSource: { kind: 'account', entityId: k } });
  });
  it('preserves successful accounts after a provider failure and reuses checkpoints on reload', async () => {
    const s = await session();
    state.scrape.mockImplementation(async (_id, platform) => { if (platform === 'Facebook') throw new ScoutError('Private group', 'ACCESS_DENIED'); return [raw('a')]; });
    const result = await executeAccountPosts(s);
    expect(result).toMatchObject({ success: true, partial: true, counts: { completedAccounts: 1, failedAccounts: 1, saved: 1 } });
    const calls = state.scrape.mock.calls.length; await executeAccountPosts(s); expect(state.scrape).toHaveBeenCalledTimes(calls);
  });
  it('retains completed account results over suspension without checkpointing pending work', async () => {
    const s = await session(); let pending = true;
    state.scrape.mockImplementation(async (_id, platform) => { if (platform === 'Facebook' && pending) throw new PendingScout(); return platform === 'Instagram' ? [raw('a')] : []; });
    await expect(executeAccountPosts(s)).rejects.toBeInstanceOf(PendingScout);
    expect(state.updates.at(-1).progress.accountResults).toHaveLength(1);
    pending = false; expect(await executeAccountPosts(s)).toMatchObject({ success: true, counts: { completedAccounts: 2, saved: 1 } });
    expect(state.scrape.mock.calls.filter(call => call[1] === 'Instagram')).toHaveLength(1);
  });
  it('stops new work at the total budget and retains partial success', async () => {
    const s = await session();
    state.scrape.mockImplementation(async (_id, platform) => { if (platform === 'Facebook') throw new ScoutError('Budget', 'BUDGET_EXHAUSTED'); return [raw('a')]; });
    expect(await executeAccountPosts(s)).toMatchObject({ success: true, partial: true, stopReason: 'BUDGET_EXHAUSTED', counts: { saved: 1 } });
  });
  it('stops at the task deadline without starting a provider', async () => {
    const s = await session(); s.execution_started_at = new Date(Date.now() - 16 * 60000).toISOString();
    expect(await executeAccountPosts(s)).toMatchObject({ success: false, stopReason: 'SEARCH_TIME_LIMIT', counts: { skippedAccounts: 2 } });
    expect(state.scrape).not.toHaveBeenCalled();
  });
});
