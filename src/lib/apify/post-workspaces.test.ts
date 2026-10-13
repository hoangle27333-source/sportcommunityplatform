import { describe, expect, it, vi } from 'vitest';
vi.mock('@/lib/sport-hub/channel-store', () => ({ getStoredEntityChannels: () => null }));
import { authorIdentity, postMetadata, suggestedPostAccounts } from './post-metadata';
import { matchPostAuthor, matchPostGroup, type SavedPostAccount } from './post-accounts';
const accounts: SavedPostAccount[] = [
  { entityType: 'kol', id: 'k', name: 'Đỗ Kim Phúc', sport: [], geography: 'Unknown', urls: ['https://instagram.com/primary', 'https://tiktok.com/@secondary'] },
  { entityType: 'community', id: 'c', name: 'CLB Chạy Bộ', sport: [], geography: 'Unknown', urls: ['https://facebook.com/groups/123', 'https://facebook.com/clubpage'] },
];
describe('post workspace identity and projections', () => {
  it('matches secondary channels without matching names or navigation/post URLs', () => {
    expect(matchPostAuthor(accounts, 'TikTok', 'https://www.tiktok.com/@secondary/')).toEqual({ entityType: 'kol', id: 'k' });
    for (const url of ['https://facebook.com/search/top?q=running', 'https://instagram.com/p/abc', 'https://facebook.com/groups/123']) expect(authorIdentity('Facebook', url)).toBeNull();
    expect(matchPostAuthor(accounts, 'Instagram', 'https://instagram.com/dokimphuc')).toBeUndefined();
  });
  it('fails closed when multiple records claim the same channel', () => {
    expect(matchPostAuthor([...accounts, { ...accounts[0], id: 'other' }], 'TikTok', 'https://tiktok.com/@secondary')).toBeUndefined();
  });
  it('separates group membership from a publishing author', () => {
    expect(matchPostGroup(accounts, 'Facebook', 'https://facebook.com/groups/123/posts/456')).toBe('c');
    expect(matchPostAuthor(accounts, 'Facebook', 'https://facebook.com/member')).toBeUndefined();
    const metadata = postMetadata({ community_id: 'c', author_identity: 'Facebook:https://facebook.com/member', collection_sources: [{ kind: 'topic' }] });
    expect(metadata.accountLinks).toEqual([{ entityType: 'community', id: 'c', role: 'group' }]);
    expect(metadata.workspaces).toEqual(['account', 'topic']);
    expect(metadata.accountSuggestionState).toBe('suggested');
  });
  it('shows the same record in both workspaces and preserves unknown legacy provenance', () => {
    expect(postMetadata({ kol_id: 'k', collection_sources: [{ kind: 'account' }, { kind: 'topic' }] }).workspaces).toEqual(['account', 'topic']);
    expect(postMetadata({}).workspaces).toEqual(['legacy']);
    expect(postMetadata({ kol_id: 'k' }).workspaces).toEqual(['account', 'legacy']);
  });
  it('groups suggestions by validated identity and retains original names', () => {
    const row = { platform: 'TikTok Video', author: 'Nguyễn Văn A', author_identity: 'TikTok:https://tiktok.com/@a', author_profile_url: 'https://tiktok.com/@a', collection_sources: [{ kind: 'topic' }] };
    const grouped = suggestedPostAccounts([{ ...row, id: '1' }, { ...row, id: '2' }, { ...row, id: '3', author_account: { entityType: 'kol', id: 'k' } }, { ...row, id: '4', author_identity: 'bad-identity' }]);
    expect(grouped).toHaveLength(1); expect(grouped[0]).toMatchObject({ name: 'Nguyễn Văn A', postIds: ['1', '2'], postCount: 2, suggestedEntityType: null });
  });
});
