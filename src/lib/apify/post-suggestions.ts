import { randomUUID } from 'node:crypto';
import { createAdminClient } from '@/lib/supabase/admin';
import { authorIdentity, postMetadata, recordPostMetadata, suggestedPostAccounts } from './post-metadata';
import { loadPostAccounts, matchPostAuthor, hasSavedPostAuthor } from './post-accounts';
import { ScoutError } from './errors';
import { canonicalUrl } from './discovery-quality';

export async function readWorkspacePosts() {
  const db = createAdminClient();
  const rows: any[] = [];
  for (let offset = 0; ; offset += 1000) {
    const { data, error } = await db.from('scouted_posts').select('*').order('id').range(offset, offset + 999);
    if (error) throw error;
    rows.push(...data || []);
    if (!data || data.length < 1000) return rows;
  }
}
export async function readSuggestedAccounts() {
  const [rows, accounts] = await Promise.all([readWorkspacePosts(), loadPostAccounts()]);
  return suggestedPostAccounts(rows).filter(s => !hasSavedPostAuthor(accounts, s.platform, s.profileUrl));
}
/** Retry independently after an import: exact saved channel matching, no provider access. */
export async function relinkPostAuthor(entityType: 'kol' | 'community', id: string) {
  const registry = await loadPostAccounts();
  const account = registry.find(a => a.entityType === entityType && a.id === id);
  if (!account) throw new ScoutError('Account not found.', 'ACCOUNT_NOT_FOUND', 404);
  const db = createAdminClient();
  let linked = 0; const conflicts: string[] = [];
  for (const url of account.urls) {
    const platform = ['Instagram', 'Facebook', 'TikTok'].find(p => authorIdentity(p, url));
    if (!platform) continue;
    const match = matchPostAuthor(registry, platform, url);
    if (!match || match.id !== id || match.entityType !== entityType) continue;
    const identity = authorIdentity(platform, url)!;
    for (let offset = 0; ; offset += 1000) {
      const { data, error } = await db.from('scouted_posts').select('*').eq('author_identity', identity).order('id').range(offset, offset + 999);
      if (error) throw error;
      for (const post of data || []) {
        if (postMetadata(post).accountSuggestionState === 'existing' && post.author_account?.id === id) continue;
        try { await recordPostMetadata(post.id, platform, url, null, { entityType, id }); linked++; }
        catch (error: any) { if (/POST_(AUTHOR|ACCOUNT)_CONFLICT/.test(error.code || error.message)) conflicts.push(post.id); else throw error; }
      }
      if (!data || data.length < 1000) break;
    }
  }
  return { success: true, linked, conflicts, partial: conflicts.length > 0 };
}

export async function createSuggestedAccountPreview(owner: string, input: { identity: string; entityType: 'kol' | 'community'; keyword?: string; geography?: string; name?: string; bio?: string; verificationSessionId?: string }) {
  const suggestions = await readSuggestedAccounts();
  const suggestion = suggestions.find(s => s.identity === input.identity);
  if (!suggestion) throw new ScoutError('This suggestion is no longer available. Refresh the account and post lists.', 'SUGGESTION_STALE', 409);
  const db = createAdminClient();
  let verified: any;
  if (input.verificationSessionId) {
    const { data, error } = await db.from('scout_sessions').select('*').eq('id', input.verificationSessionId).eq('owner_id', owner).single();
    if (error || !data || data.kind !== 'inspect' || data.status !== 'complete' || !data.result?.success || canonicalUrl(data.result?.data?.url || '') !== suggestion.profileUrl || data.result?.data?.platform !== suggestion.platform) throw new ScoutError('Completed verification for this exact account is required.', 'INVALID_VERIFICATION', 409);
    verified = data.result.data;
  }
  const now = new Date().toISOString(), candidateId = randomUUID();
  const candidate = { username: verified?.username || '', name: input.name || verified?.name || suggestion.name, bio: input.bio ?? verified?.bio ?? '', url: suggestion.profileUrl, platform: suggestion.platform, followers: verified?.followers ?? null, members: verified?.members ?? null, avgViews: verified?.avgViews ?? null, likes: null, comments: null, er: verified?.er ?? null, avatarUrl: verified?.avatarUrl || '', category: verified?.category || '', entityType: verified?.entityType || 'unknown', location: verified?.location || '', posts: [], candidateId, accountKey: suggestion.identity, isExisting: false, classification: 'Unknown', relevant: false, locationMatch: false, verifiedGeography: 'Unknown', reviewState: 'Needs Review', reasons: ['Confirm account type, topic relevance and target location before import.'], evidence: suggestion.postIds, provenance: { ...verified?.provenance, platform: suggestion.platform, fetchedAt: verified?.provenance?.fetchedAt || now, profileUrl: suggestion.profileUrl, source: verified ? 'post-suggestion-and-profile-verification' : 'saved-post-suggestion', postIds: suggestion.postIds, manualEdits: { ...(input.name ? { name: input.name } : {}), ...(input.bio !== undefined ? { bio: input.bio } : {}) }, missingFields: verified?.provenance?.missingFields || ['followers', 'geography', 'entityType'] } };
  const targetType = input.entityType === 'community' ? 'Communities & Clubs' : 'Individual KOLs';
  const params = { keyword: input.keyword || 'Account from trending posts', geography: input.geography || 'Any location', platform: suggestion.platform, targetType, suggestionIdentity: suggestion.identity, suggestionPostIds: suggestion.postIds, verificationSessionId: input.verificationSessionId, limit: 1 };
  const result = { success: true, candidates: [candidate], criteria: params, counts: { found: 1, unverified: 1, qualified: 0 }, groups: { qualified: [], needsVerification: [candidate], excluded: [] }, warnings: [], providerStarts: 0 };
  const { data, error } = await db.from('scout_sessions').insert({ owner_id: owner, kind: 'preview', status: 'complete', params, candidates: [candidate], result, runtime_version: 3, progress: { stage: 'complete' }, review_decisions: {} }).select('id').single();
  if (error) throw error;
  return { ...result, sessionId: data.id };
}
