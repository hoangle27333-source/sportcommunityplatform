import { createHash } from 'node:crypto';
import { canonicalUrl, platformMatches, urlKind } from '../../src/lib/apify/discovery-quality';
import { canonicalGeography } from '../../src/lib/apify/geography';
import type { SocialProfile } from '../../src/lib/apify/providers';
import { prepareReviewPackets } from './account-review-packets';

export interface TalentRow { row: number; values: (string | number | null)[]; links: (string | null)[] }
export function parseTalentFollowers(value: unknown): number | null {
  if (value === null || value === undefined || value === '') return null;
  if (typeof value === 'number') return Number.isSafeInteger(value) && value >= 0 ? value : null;
  const text = String(value).trim().replace(/\s/g, '');
  const compact = text.match(/^(\d+(?:[.,]\d+)?)\s*([km])$/i);
  const result = compact ? Number(compact[1].replace(',', '.')) * (compact[2].toLowerCase() === 'k' ? 1000 : 1000000)
    : /^\d{1,3}(,\d{3})+$/.test(text) ? Number(text.replace(/,/g, '')) : /^\d+$/.test(text) ? Number(text) : NaN;
  return Number.isSafeInteger(Math.round(result)) && result >= 0 ? Math.round(result) : null;
}
export function talentId(key: string) {
  const h = createHash('sha256').update(`talent-source-v1:${key}`).digest('hex');
  return `${h.slice(0,8)}-${h.slice(8,12)}-5${h.slice(13,16)}-a${h.slice(17,20)}-${h.slice(20,32)}`;
}
const str = (value: unknown) => value == null ? '' : String(value).trim();
export function prepareTalentDataset(rows: TalentRow[], source: { filename: string; sha256: string }) {
  const groups = new Map<string, { key: string; url: string; platform: string; sources: any[] }>();
  let section = '', blankRows = 0, sectionRows = 0;
  for (const row of rows) {
    if (!row.values.some(value => value !== null && str(value))) { blankRows++; continue; }
    if (row.row === 1 && str(row.values[2]) === 'Name') continue;
    if (/^TIER\s/i.test(str(row.values[0])) && !str(row.values[2])) { section = str(row.values[0]); sectionRows++; continue; }
    const name = str(row.values[2]);
    if (!name) throw new Error(`Unexpected non-talent data at source row ${row.row}.`);
    const rawUrl = str(row.links[3] || row.values[3]);
    const canonical = canonicalUrl(rawUrl);
    const platform = ['Facebook', 'TikTok', 'Instagram'].find(p => platformMatches(p, canonical)) || 'Unknown';
    const url = platform !== 'Unknown' && urlKind(canonical) === 'profile' ? canonical : '';
    // Usernames are case-insensitive; names alone never establish account identity.
    const key = url ? `${platform}:${url.toLowerCase()}` : `unresolved:${source.sha256}:${row.row}`;
    const group = groups.get(key) || { key, url, platform, sources: [] };
    group.sources.push({ row: row.row, cells: structuredClone(row.values), hyperlinks: structuredClone(row.links), section, name,
      rawUrl, category: str(row.values[1]), followersRaw: row.values[4], followers: parseTalentFollowers(row.values[4]),
      region: str(row.values[5]), description: str(row.values[6]) });
    groups.set(key, group);
  }
  const accounts = [...groups.values()].map(group => {
    const first = group.sources[0];
    const followers = [...new Set<number>(group.sources.map(s => s.followers).filter(n => n !== null))];
    const regions = [...new Set<string>(group.sources.map(s => s.region ? canonicalGeography(s.region) : '').filter(Boolean))];
    const warnings: string[] = [];
    if (!group.url) warnings.push('Account URL requires resolution. The original link is retained in source evidence.');
    if (followers.length > 1) warnings.push('Source rows contain conflicting follower counts. Followers remain unknown.');
    if (regions.length > 1) warnings.push('Source rows contain conflicting regions. Geography remains unknown.');
    if (group.sources.some(s => s.followersRaw != null && s.followers === null)) warnings.push('A source follower value could not be parsed.');
    const profile: SocialProfile = { name: first.name, username: group.url ? new URL(group.url).searchParams.get('id') || new URL(group.url).pathname.split('/').filter(Boolean).pop()!.replace(/^@/, '') : '',
      url: group.url, platform: group.platform, followers: followers.length === 1 ? followers[0] : null,
      // Editorial spreadsheet fields are not observed account bio, category, or location.
      bio: '', category: '', entityType: '', location: '', posts: [], latestPostsVerified: false,
      avgViews: null, er: null, likes: null, comments: null, avatarUrl: '' };
    return { key: group.key, id: talentId(group.key), profile, geography: regions.length === 1 ? regions[0] : 'Unknown',
      sports: [...new Set<string>(group.sources.map(s => ({ Road: 'Running / Marathon', Trail: 'Running / Marathon', Tri: 'Triathlon' }[s.category as 'Road' | 'Trail' | 'Tri'] || s.category)).filter(Boolean))],
      descriptions: [...new Set<string>(group.sources.map(s => s.description).filter(Boolean))], warnings, sourceRows: group.sources };
  });
  const reviewPackets = accounts.filter(a => a.profile.url).map(account => ({ ...prepareReviewPackets([account.profile])[0],
    sourceContext: { ...source, accountKey: account.key, crmId: account.id, sourceRows: account.sourceRows,
      warnings: account.warnings, proposedType: 'Individual', proposalSource: 'talent-spreadsheet',
      observedAccountEvidence: false, sourceRegion: account.geography } }));
  return { source, accounts, reviewPackets,
    unresolved: accounts.filter(a => !a.profile.url),
    summary: { sourceTalentRows: accounts.reduce((n,a) => n+a.sourceRows.length,0), uniqueAccounts: accounts.length,
      duplicatesCollapsed: accounts.reduce((n,a) => n+a.sourceRows.length-1,0), blankRows, sectionRows,
      reviewPackets: reviewPackets.length, unresolvedUrls: accounts.filter(a => !a.profile.url).length,
      followerConflicts: accounts.filter(a => a.warnings.some(w => w.includes('conflicting follower'))).length,
      missingFollowers: accounts.filter(a => a.profile.followers === null).length,
      missingRegions: accounts.filter(a => a.geography === 'Unknown').length,
      confirmedTrainingLabels: 0, trainingInputReady: false, providerStarts: 0 } };
}

export function talentCrmRecord(account: ReturnType<typeof prepareTalentDataset>['accounts'][number], source: { filename: string; sha256: string }, storagePrefix: string) {
  const followers = account.profile.followers;
  const tier = followers === null ? 'Unknown' : followers < 10000 ? 'Nano (< 10k)' : followers < 50000 ? 'Micro (10k - 50k)' : followers < 500000 ? 'Macro (50k - 500k)' : 'Mega (> 500k)';
  const missingFields = [...(followers === null ? ['followers'] : []), 'avgViews', 'er'];
  return { id: account.id, name: account.profile.name, platform: account.profile.platform, profile_url: account.profile.url,
    sports: account.sports, geography: account.geography, followers: followers ?? 0, avg_views: 0, er: 0, quotation: 0,
    tier, status: 'Mới scout (Chưa duyệt)', bio: account.descriptions.join('\n\n'),
    contact_info: [`Source: ${source.filename}; Talent Database rows ${account.sourceRows.map(s => s.row).join(', ')}.`,
      `Talent categories: ${[...new Set(account.sourceRows.map(s => s.category))].join(', ')}.`,
      `Source tiers: ${[...new Set(account.sourceRows.map(s => s.section))].join(', ')}.`,
      ...(!account.profile.url ? account.sourceRows.map(s => `Unresolved source link: ${s.rawUrl}`) : []), ...account.warnings].join('\n'),
    scout_missing_metrics: missingFields,
    scout_provenance: { source: 'talent-spreadsheet', filename: source.filename, sourceSha256: source.sha256,
      accountKey: account.key, storagePrefix, sourceRows: account.sourceRows, missingFields, warnings: account.warnings,
      metricObservationDate: null, trainingLabel: null, userAuthorizedImport: true } };
}
