import { beforeEach, expect, it, vi } from 'vitest';
const state = vi.hoisted(() => ({ receipts: [] as any[], budget: { enabled: true, run_usd: 0.25, tiktok_run_usd: 0.5 } }));
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: () => ({ from(table: string) {
  const result = { data: table === 'scout_budget_settings' ? state.budget : state.receipts, error: null };
  return { select: () => ({ single: async () => result, then: (resolve: any) => Promise.resolve(result).then(resolve) }) };
} }) }));
import { workspaceCapabilities } from './workspace-capabilities';
beforeEach(() => { process.env.APIFY_TOKEN = 'fixture'; state.budget.tiktok_run_usd = 0.5; state.receipts = [{ capability_key: 'clockworks~tiktok-scraper:keyword:default', verified: false, build: '0.0.612', receipt: { code: 'ACTOR_MINIMUM_EXCEEDS_POLICY', minimumRunCapUsd: 0.5, policyRunCapUsd: 0.25 } }]; });
it('requires a new verification receipt after a cap increase instead of showing a stale policy block', async () => {
  const result = await workspaceCapabilities();
  expect(result.TikTok.keyword).toEqual({ available: false, reason: 'This collection capability has not passed provider verification.' });
});
it('shows a policy block while the current cap is below the Actor minimum', async () => {
  state.budget.tiktok_run_usd = 0.25;
  expect((await workspaceCapabilities()).TikTok.keyword.reason).toContain('run cap above');
});
it('enables verified TikTok keyword while keeping Instagram keyword unavailable', async () => {
  state.receipts[0].verified = true;
  const result = await workspaceCapabilities();
  expect(result.TikTok.keyword.available).toBe(true);
  expect(result.Instagram.keyword.available).toBe(false);
});

it('enables Facebook community discovery from either verified source without an environment flag',async()=>{
 delete process.env.APIFY_FACEBOOK_GROUP_SEARCH_VERIFIED;
 state.receipts=[{capability_key:'parseforge~facebook-groups-search-scraper:communities:default',verified:true,build:'0.1.4'}];
 expect((await workspaceCapabilities()).Facebook.communities).toMatchObject({available:true,partial:true});
});
it('uses verified TikTok user search for community classification without fabricating a new receipt',async()=>{
 state.receipts=['profiles'].map(task=>({capability_key:`clockworks~tiktok-scraper:${task}:default`,verified:true,build:'0.0.612'}));
 expect((await workspaceCapabilities()).TikTok.communities.available).toBe(true);
});

it('offers Instagram topic discovery through its verified hashtag source',async()=>{
 state.receipts=[{capability_key:'apify~instagram-scraper:hashtag:posts',verified:true,build:'0.0.100'}];
 expect((await workspaceCapabilities()).Instagram.keyword.available).toBe(true);
});
it('offers account discovery through verified content and details when profile search is unavailable',async()=>{
 state.receipts=['keyword','profile-details'].map(task=>({capability_key:`clockworks~tiktok-scraper:${task}:default`,verified:true,build:'pinned'}));
 expect((await workspaceCapabilities()).TikTok.profiles.available).toBe(true);
 state.receipts.pop();expect((await workspaceCapabilities()).TikTok.profiles.available).toBe(false);
});
