import { beforeEach, expect, it, vi } from 'vitest';
const state = vi.hoisted(() => ({ checkpoints: new Map<string, any>(), saved: [] as any[], scrape: vi.fn(), serial: 0 }));
vi.mock('./task-checkpoint', () => ({ checkpointTask: async (_id: string, key: string, work: any) => { if (state.checkpoints.has(key)) return state.checkpoints.get(key); const result = await work(); state.checkpoints.set(key, result); return result; } }));
vi.mock('./top-post-plan', () => ({ assertTopPostSchema: async () => {} }));
vi.mock('./session-snapshot', () => ({ sessionSnapshot: async (_id: string, _ns: string, _key: string, make: any) => make('2026-10-13T00:00:00.000Z') }));
vi.mock('./post-accounts', () => ({ loadPostAccounts: async () => ['a', 'b'].map(id => ({ entityType: 'kol', id, urls: [`https://instagram.com/${id}`] })), matchPostAuthor: (_accounts: any, _platform: string, url: string) => ({ entityType: 'kol', id: url.split('/').pop() }), matchPostGroup: () => undefined }));
vi.mock('./providers', async () => ({ ...await vi.importActual<any>('./providers'), scrape: state.scrape }));
vi.mock('./scout', () => ({ detectSportNiche: () => ['Running'], savePosts: async (items: any[], counts: any) => { state.saved.push(...items); counts.inserted += items.length; return items.map(item => ({ id: `p${++state.serial}`, post_url: item.post.url, collection_sources: [item.collectionSource] })); } }));
import { scoutTopPosts } from './top-posts';
import type { SearchPlan } from './search-plan';
const plan = (id: string): SearchPlan => ({ version: 4, kind: 'trends', hash: 'a'.repeat(64), criteria: {}, maxSessionUsd: 1, maxSearchRows: 60, maxHydratedProfiles: 0, maxPostsPerProfile: 5, rounds: [0, 1, 2, 3].map(i => ({ label: `round ${i}`, queries: [`https://instagram.com/${id}`] })), sources: [{ platform: 'Instagram', task: 'profile-posts', keys: [], builds: {}, options: {}, authorSearch: false, rounds: [0, 1, 2, 3].map(() => ({ task: 'profile-posts', queries: [`https://instagram.com/${id}`] })), warnings: [] }] });
beforeEach(() => {
  state.checkpoints.clear(); state.saved = []; state.serial = 0;
  state.scrape.mockImplementation(async (_session, _platform, _task, query) => [1, 2, 3].map(n => ({ url: `https://instagram.com/p/${query.split('/').pop()}${n}`, ownerUsername: query.split('/').pop(), caption: 'Running', timestamp: '2026-10-12T00:00:00Z', videoViewCount: n * 100 })));
});
it('isolates adaptive round checkpoints for two accounts in one durable session', async () => {
  const common = { sessionId: 'batch', selectionMode: 'top' as const, recentDays: 7, limit: 2, saveLimit: 2, thresholdsEnabled: false };
  const a = await scoutTopPosts({ ...common, kolId: 'a', searchPlan: plan('a') });
  const b = await scoutTopPosts({ ...common, kolId: 'b', searchPlan: plan('b') });
  expect(a.posts.map(p => p.post_url)).toEqual(['https://instagram.com/p/a3', 'https://instagram.com/p/a2']);
  expect(b.posts.map(p => p.post_url)).toEqual(['https://instagram.com/p/b3', 'https://instagram.com/p/b2']);
  expect(state.saved).toHaveLength(4);
  expect(state.saved[2]).toMatchObject({ authorAccount: { entityType: 'kol', id: 'b' }, collectionSource: { kind: 'account', sessionId: 'batch', entityId: 'b' } });
  expect(b.counts.saved).toBe(2); expect(b.counts.verified).toBe(2);
  const calls = state.scrape.mock.calls.length;
  await scoutTopPosts({ ...common, kolId: 'b', searchPlan: plan('b') }); expect(state.scrape).toHaveBeenCalledTimes(calls);
});
