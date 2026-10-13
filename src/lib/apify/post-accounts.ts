import { createAdminClient } from '@/lib/supabase/admin';
import { getStoredEntityChannels } from '@/lib/sport-hub/channel-store';
import { canonicalUrl, platformMatches, urlKind } from './discovery-quality';
import { authorIdentity } from './post-metadata';
export type SavedPostAccount = { entityType: 'kol' | 'community'; id: string; name: string; sport: string[]; geography: string; urls: string[] };
export function savedAccountUrls(row: any, entityType: 'kol' | 'community') {
  // ID-only lookup: a similarly named account is never identity evidence.
  const stored = getStoredEntityChannels(entityType, row.id) || [];
  return [...new Set<string>([row.profile_url, row.group_url, ...(row.channels || []).map((c: any) => c.url), ...stored.map(c => c.url)]
    .map(url => canonicalUrl(url || '')).filter(url => ['profile', 'group'].includes(urlKind(url))))].sort();
}
export async function loadPostAccounts(): Promise<SavedPostAccount[]> {
  const db = createAdminClient();
  async function all(table: 'kols' | 'communities') {
    const first=await db.from(table).select('*').order('id');
    if(first.error)throw first.error;
    const rows=first.data || [];
    if(rows.length<1000)return first;
    for(let offset=1000;;offset+=1000){const next=await db.from(table).select('*').order('id').range(offset,offset+999);if(next.error)throw next.error;rows.push(...next.data || []);if(!next.data || next.data.length<1000)break;}
    return {...first,data:rows};
  }
  const [kols, communities] = await Promise.all([all('kols'), all('communities')]);
  if (kols.error) throw kols.error;
  if (communities.error) throw communities.error;
  return ([['kol', kols.data], ['community', communities.data]] as const).flatMap(([entityType, rows]) => (rows || []).map(row => ({ entityType, id: row.id, name: row.name, sport: row.sports || [], geography: row.geography || 'Unknown', urls: savedAccountUrls(row, entityType) })));
}
export function matchPostAuthor(accounts: SavedPostAccount[], platform: string, url: string) {
  const identity = authorIdentity(platform, url);
  if (!identity) return undefined;
  const matched = accounts.filter(account => account.urls.some(channel => authorIdentity(platform, channel) === identity));
  return matched.length === 1 ? { entityType: matched[0].entityType, id: matched[0].id } : undefined;
}
export function hasSavedPostAuthor(accounts: SavedPostAccount[], platform: string, url: string) {
  const identity=authorIdentity(platform,url);
  return !!identity && accounts.some(a=>a.urls.some(channel=>authorIdentity(platform,channel)===identity));
}
export function matchPostGroup(accounts: SavedPostAccount[], platform: string, url: string) {
  if (platform !== 'Facebook') return undefined;
  const group = canonicalUrl(url.match(/^https?:\/\/[^/]+\/groups\/[^/]+/)?.[0] || '');
  if (!group || urlKind(group) !== 'group') return undefined;
  const matches = accounts.filter(account => account.entityType === 'community' && account.urls.includes(group) && platformMatches(platform, group));
  return matches.length === 1 ? matches[0].id : undefined;
}
