import { createAdminClient } from '@/lib/supabase/admin';
import { canonicalUrl, platformMatches, urlKind } from './discovery-quality';
import { ScoutError } from './errors';
import type { PostSource, PostWorkspaceMetadata, SuggestedPostAccount, PostWorkspaceRecord } from './post-contracts';

export function authorIdentity(platform: string, url: string) {
  const clean = canonicalUrl(url || '');
  return platformMatches(platform, clean) && urlKind(clean) === 'profile' ? `${platform}:${clean}` : null;
}
export function postMetadata(row: any): PostWorkspaceMetadata {
  const sources: PostSource[] = Array.isArray(row.collection_sources) ? row.collection_sources : [];
  const authorLink = row.author_account;
  const accountLinks: PostWorkspaceMetadata['accountLinks'] = [];
  if (authorLink?.id && ['kol', 'community'].includes(authorLink.entityType)) accountLinks.push({ ...authorLink, role: 'author' });
  else if (row.kol_id) accountLinks.push({ entityType: 'kol', id: row.kol_id, role: 'author' });
  if (row.community_id && !accountLinks.some(link => link.entityType === 'community' && link.id === row.community_id)) accountLinks.push({ entityType: 'community', id: row.community_id, role: 'group' });
  const workspaces: PostWorkspaceMetadata['workspaces'] = [];
  if (accountLinks.length) workspaces.push('account');
  if (sources.some(source => source.kind === 'topic')) workspaces.push('topic');
  if (!sources.length) workspaces.push('legacy');
  return { authorIdentity: row.author_identity || null, authorProfileUrl: row.author_profile_url || null, collectionSources: sources, accountLinks, workspaces, accountSuggestionState: authorLink || row.kol_id ? 'existing' : row.author_identity ? 'suggested' : 'needs-verification' };
}
export function suggestedPostAccounts(rows: any[]): SuggestedPostAccount[] {
  const grouped = new Map<string, SuggestedPostAccount>();
  for (const row of rows) {
    const metadata = postMetadata(row);
    if (!metadata.workspaces.includes('topic') || metadata.accountSuggestionState !== 'suggested') continue;
    const platform = String(row.platform).split(' ')[0];
    const identity = authorIdentity(platform, metadata.authorProfileUrl || '');
    if (!identity || identity !== metadata.authorIdentity) continue;
    const item: SuggestedPostAccount = grouped.get(identity) || { identity, platform, name: row.author || 'Unknown Account', profileUrl: metadata.authorProfileUrl!, postIds: [], postCount: 0, suggestedEntityType: null, reviewState: 'Needs Review' as const };
    if (!item.postIds.includes(row.id)) item.postIds.push(row.id);
    item.postCount = item.postIds.length;
    grouped.set(identity, item);
  }
  return [...grouped.values()].sort((a, b) => b.postCount - a.postCount || a.identity.localeCompare(b.identity));
}
export async function assertPostWorkspaceSchema() {
  const { error } = await createAdminClient().from('scouted_posts').select('author_identity,author_profile_url,author_account,collection_sources,shares,scout_content_assessment').limit(0);
  if (error) throw new ScoutError('Posts workspaces require the database migration. No collection was started.', 'POST_WORKSPACE_SCHEMA_UNAVAILABLE', 503);
}
/** Row-locked merge: observations from another scout cannot lose a source or overwrite a link. */
export async function recordPostMetadata(postId: string, platform: string, authorUrl: string, source: PostSource | null, account?: { entityType: 'kol' | 'community'; id: string }) {
  const identity = authorIdentity(platform, authorUrl);
  const { data, error } = await createAdminClient().rpc('merge_scout_post_metadata', {
    p_post: postId, p_author_identity: identity, p_author_url: identity ? canonicalUrl(authorUrl) : null,
    p_source: source, p_author_account: account || null,
  });
  if (error) {
    if(/POST_(AUTHOR|ACCOUNT)_CONFLICT/.test(error.message))throw new ScoutError('This post has a conflicting saved account identity. Review its account links.',error.message.includes('POST_AUTHOR_CONFLICT')?'POST_AUTHOR_CONFLICT':'POST_ACCOUNT_CONFLICT',409);
    throw error;
  }
  return data;
}
export function postDto(row: any): PostWorkspaceRecord {
  return { id: row.id, title: row.title || '', author: row.author || '', kolRecordIds: row.kol_id ? [row.kol_id] : [], communityRecordIds: row.community_id ? [row.community_id] : [], platform: row.platform, likes: row.likes ?? null, comments: row.comments ?? null, views: row.views ?? null, shares: row.shares ?? null, er: row.er ?? null, postUrl: row.post_url, publishedAt: row.published_at || null, missingMetrics: row.scout_missing_metrics || [], scoutProvenance: row.scout_provenance || null, scoutContentAssessment: row.scout_content_assessment || null, viralGrade: row.viral_tier || 'Unknown', ...postMetadata(row) };
}
