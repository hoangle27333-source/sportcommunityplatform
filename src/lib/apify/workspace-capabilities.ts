import { createAdminClient } from '@/lib/supabase/admin';
import { providerPlans, type ScoutTask } from './providers';
import { capabilityKey } from './runtime';
import { SCOUT_PLATFORMS, type ScoutCapabilities, type ScoutCapabilityTask } from './scout-workspace';

const TASKS: ScoutCapabilityTask[] = ['profiles', 'communities', 'hashtag', 'keyword', 'profile-posts', 'group-posts', 'profile-details', 'group-details', 'sync', 'group-sync', 'comments'];
export async function workspaceCapabilities(): Promise<ScoutCapabilities> {
  const db = createAdminClient();
  const [{ data: receipts, error }, { data: budget, error: budgetError }] = await Promise.all([
    db.from('scout_provider_capabilities').select('capability_key,verified,build,receipt'),
    db.from('scout_budget_settings').select('enabled,run_usd,tiktok_run_usd').single(),
  ]);
  const verified = new Set((receipts || []).filter(r => r.verified && r.build && !['latest','beta','stable'].includes(r.build)).map(r => r.capability_key));
  const unavailable = !process.env.APIFY_TOKEN ? 'The collection provider is not configured.' : error || budgetError ? 'Collection is unavailable until the Scout runtime is configured.' : !budget?.enabled ? 'New collections are paused by an administrator.' : '';
  return Object.fromEntries(SCOUT_PLATFORMS.map(platform => [platform, Object.fromEntries(TASKS.map(task => {
    if (unavailable) return [task, { available: false, reason: unavailable }];
    if (task.startsWith('group-') && platform !== 'Facebook') return [task, { available: false, reason: 'Group collection is available only for supported Facebook groups.' }];
    try {
      const group = task.startsWith('group-');
      const query = group ? 'https://www.facebook.com/groups/123456' : platform === 'TikTok' ? 'https://www.tiktok.com/@example' : `https://www.${platform.toLowerCase()}.com/example`;
      const tasks: ScoutTask[] = platform === 'TikTok' && task === 'communities' ? ['communities'] : task === 'sync' || task === 'group-sync' ? ['profile-details', ...(group ? [] : ['profile-posts'] as ScoutTask[])] : task === 'profiles' || task === 'communities' ? [task, 'profile-details'] : [task === 'group-posts' ? 'profile-posts' : task === 'group-details' ? 'profile-details' : task==='keyword' && platform==='Instagram'?'hashtag':task as ScoutTask];
      const keys = tasks.flatMap(t => providerPlans(platform, t, ['profiles','communities','hashtag','keyword'].includes(t) ? 'sports' : query, 1).map(plan => capabilityKey(plan, t)));
      const communitySearch = task === 'communities' && platform === 'Facebook';
      const discoveryKeys = communitySearch ? providerPlans(platform,'communities','sports',1).map(plan=>capabilityKey(plan,'communities')) : keys;
      const discovery=task==='profiles' || task==='communities';
      const profileKeys=discovery?providerPlans(platform,task as ScoutTask,'sports',1).map(plan=>capabilityKey(plan,task as ScoutTask)):[];
      const authorTask=platform==='Instagram'?'hashtag':'keyword';
      const authorKeys=discovery?[...providerPlans(platform,authorTask,'sports',1).map(plan=>capabilityKey(plan,authorTask)),...providerPlans(platform,'profile-details',query,1).map(plan=>capabilityKey(plan,'profile-details'))]:[];
      const available = discovery ? profileKeys.some(key=>verified.has(key)) || authorKeys.every(key=>verified.has(key)) : communitySearch ? discoveryKeys.some(key=>verified.has(key)) : keys.every(key => verified.has(key));
      const partial = communitySearch && !discoveryKeys.every(key=>verified.has(key));
      const runCap = Number(platform === 'TikTok' ? budget?.tiktok_run_usd : budget?.run_usd);
      const policyBlocked=keys.some(key => receipts?.some(r => r.capability_key===key && !r.verified && r.receipt?.code==='ACTOR_MINIMUM_EXCEEDS_POLICY' && Number(r.receipt.minimumRunCapUsd) > runCap));
      return [task, { available, ...(available && partial ? {partial:true,reason:'Search covers verified Facebook sources only; unavailable sources are reported in the results.'} : {}), ...(!available ? { reason: policyBlocked ? 'This Actor requires a run cap above the system policy.' : 'This collection capability has not passed provider verification.' } : {}) }];
    } catch (e: any) { return [task, { available: false, reason: e.message || 'This task is unavailable on this platform.' }]; }
  }))])) as ScoutCapabilities;
}
