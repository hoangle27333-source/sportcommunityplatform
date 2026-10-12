import { AsyncLocalStorage } from 'node:async_hooks';
import { canonicalUrl } from './discovery-quality';
import { ScoutError } from './errors';
export type SavedProviderRun = { platform: string; task: string; state: string; normalized_rows?: any[]; raw_rows?: any[]; warnings?: string[] };
const saved = new AsyncLocalStorage<SavedProviderRun[]>();
export function withStoredEvidence<T>(runs: SavedProviderRun[], work: () => Promise<T>) { return saved.run(runs, work); }
export function isStoredEvidence() { return saved.getStore() !== undefined; }
export function forbidPaidReplay() {
  if (isStoredEvidence()) throw new ScoutError('Stored-evidence reassessment cannot start or poll a provider.', 'PAID_REPLAY_BLOCKED', 409);
}
export function savedProviderRows(platform: string, task: string, urls?: string[]) {
  const runs = saved.getStore(); if (!runs) return undefined;
  const identities = urls?.map(canonicalUrl);
  const rows = runs.filter(r => r.platform === platform && r.task === task && r.state === 'succeeded')
    .flatMap(r => r.normalized_rows ?? r.raw_rows ?? []);
  const seen = new Set<string>();
  return rows.filter(row => {
    if (identities && ![row.profileUrl,row.groupUrl,row.url,row.pageUrl,row.facebookUrl].some(url=>identities.includes(canonicalUrl(url || '')))) return false;
    const key = JSON.stringify(row); if (seen.has(key)) return false; seen.add(key); return true;
  });
}
