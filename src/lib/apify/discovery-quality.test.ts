import { describe, expect, it } from 'vitest';
import { assessProfile, canonicalUrl, contextKey, hashtagMatch, tokens, urlKind } from './discovery-quality';
import badmintonSearch from './fixtures/facebook-badminton-search.json';
import { parsePost, parseProfile, providerPlans, metric } from './providers';
const profile = (name: string, bio: string, url = 'https://facebook.com/test') => ({ name, bio, url });
describe('Client scouting regressions', () => {
  it('excludes adidas from individual KOL results', () => expect(assessProfile(profile('adidas Running', 'Running shoes Vietnam'), 'run', 'Nationwide', 'Individual KOLs').reviewState).toBe('Excluded'));
  it('does not match run as a substring of Runaway', () => expect(assessProfile(profile('Runaway Play Games', 'Games'), 'run', 'Nationwide', 'Individual KOLs').relevant).toBe(false));
  it('does not use a CrossFit post mentioning a run club as profile evidence', () => {
    const p = parseProfile({ name: 'VNTeam CrossFit', username: 'vnteamcrossfit', biography: 'CrossFit Vietnam', caption: 'Good Strides Run Club collaboration' }, 'Instagram')!;
    expect(p.bio).toBe('CrossFit Vietnam'); expect(assessProfile(p, 'run club', 'Nationwide', 'Communities & Clubs').reviewState).toBe('Excluded');
  });
  it('accepts a running community with location evidence', () => expect(assessProfile(profile('Founders Running Club Saigon', 'Running community Vietnam'), 'Sai Gon Run Club', 'Nationwide', 'Communities & Clubs').reviewState).toBe('Matched'));
  it('requires review for an unknown entity', () => expect(assessProfile(profile('Alex', 'Running Vietnam'), 'run', 'Nationwide', 'Individual KOLs').reviewState).toBe('Needs Review'));
  it('requires review for unverified geography', () => expect(assessProfile(profile('Alex', 'Running coach'), 'run', 'Hanoi', 'Individual KOLs').reviewState).toBe('Needs Review'));
  it('accepts a creator page as an individual', () => expect(assessProfile({ ...profile('Alex', 'Running coach Hanoi Vietnam'), entityType: 'page' }, 'run', 'Hanoi', 'Individual KOLs').classification).toBe('Individual'));
  it('does not translate original names', () => expect(parseProfile({ username: 'kimphuc', fullName: 'Đỗ Kim Phúc', biography: 'Football coach' }, 'Instagram')?.name).toBe('Đỗ Kim Phúc'));
});
describe('Provider contracts and truthful metrics', () => {
  it('preserves all 15 distinct accounts from the reported badminton search', () => {
    const profiles = badmintonSearch.map(row => parseProfile(row, 'Facebook')!);
    expect(profiles).toHaveLength(15);
    expect(new Set(profiles.map(p => p.url)).size).toBe(15);
    expect(profiles[0].name).toBe('Henry Badminton');
    expect(profiles[0].url).toBe(canonicalUrl(badmintonSearch[0].url));
    expect(profiles.every(p => !p.url.includes('/search/'))).toBe(true);
  });
  it.each(['https://facebook.com/search/top?q=badminton', 'https://facebook.com/search/people', 'https://facebook.com/profile.php', 'https://facebook.com/groups/feed', 'https://facebook.com/login.php', 'https://facebook.com/'])('rejects navigation URL %s as a profile', url => {
    expect(urlKind(url)).toBe('unknown');
    expect(parseProfile({ facebookUrl: url, name: 'Henry Badminton' }, 'Facebook')).toBeNull();
  });
  it('never fabricates a Facebook URL from a display name or handle', () => {
    expect(parseProfile({ name: 'Henry Badminton', username: 'Henry Badminton' }, 'Facebook')).toBeNull();
    expect(parseProfile({ name: 'Henry', username: 'henry' }, 'Facebook')).toBeNull();
  });
  it('falls back from an invalid profile field to an actual result URL', () => {
    expect(parseProfile({ profileUrl: badmintonSearch[0].facebookUrl, ...badmintonSearch[0] }, 'Facebook')?.url).toBe(canonicalUrl(badmintonSearch[0].url));
  });
  it('routes Facebook profile discovery to Facebook', () => expect(providerPlans('Facebook', 'profiles', 'run', 5)[0].actor).toBe('apify~facebook-search-scraper'));
  it('sets Instagram profile details explicitly', () => expect(providerPlans('Instagram', 'profiles', 'run', 5)[0].input.resultsType).toBe('details'));
  it('uses hashtag/post mode for Instagram trends', () => expect(providerPlans('Instagram', 'hashtag', '#run', 5)[0].input).toMatchObject({ directUrls: ['https://www.instagram.com/explore/tags/run/'], resultsType: 'posts' }));
  it('uses TikTok hashtags', () => expect(providerPlans('TikTok', 'hashtag', '#chaybo', 1)[0].input.hashtags).toEqual(['chaybo']));
  it('rejects unsupported platforms and Instagram keyword mode', () => { expect(() => providerPlans('YouTube', 'profiles', 'run', 5)).toThrow(); expect(() => providerPlans('Instagram', 'keyword', 'run club', 5)).toThrow(); });
  it('requires live verification before group discovery', () => { delete process.env.APIFY_FACEBOOK_GROUP_SEARCH_VERIFIED; expect(() => providerPlans('Facebook', 'communities', 'run club', 1)).toThrow('not yet verified'); });
  it('searches both Pages and Groups when verified', () => { process.env.APIFY_FACEBOOK_GROUP_SEARCH_VERIFIED = 'true'; expect(providerPlans('Facebook', 'communities', 'run club', 1).map(p => p.actor)).toEqual(['apify~facebook-search-scraper', 'parseforge~facebook-groups-search-scraper']); delete process.env.APIFY_FACEBOOK_GROUP_SEARCH_VERIFIED; });
  it('preserves true zero and missing values', () => { expect(metric(0, 100)).toBe(0); expect(metric(undefined, null)).toBeNull(); });
  it('rejects a mismatched platform and post link as a profile', () => { expect(parseProfile({ url: 'https://instagram.com/someone', name: 'A' }, 'Facebook')).toBeNull(); expect(parseProfile({ url: 'https://instagram.com/p/123', name: 'A' }, 'Instagram')).toBeNull(); });
  it('preserves original group URL', () => expect(parseProfile({ name: 'CLB Chạy Bộ', url: 'https://facebook.com/groups/123', memberCount: 0 }, 'Facebook')).toMatchObject({ url: 'https://facebook.com/groups/123', followers: 0 }));
  it('derives profile metrics only from real observed publications', () => { const p=parseProfile({username:'alex',followersCount:100,latestPosts:[{url:'https://instagram.com/p/a',videoViewCount:0,likesCount:0,commentsCount:0}]},'Instagram')!; expect(p.avgViews).toBe(0); expect(p.er).toBe(0); expect(p.posts[0].caption).toBe(''); });
  it('does not infer Reels from high views', () => expect(parsePost({ url: 'https://instagram.com/p/abc/', caption: '#run', videoViewCount: 900000 }, 'Instagram')?.contentType).toBe('Post'));
  it('preserves multiple posts by the same author', () => {
    const posts = ['a','b'].map(id => parsePost({ url: `https://instagram.com/p/${id}`, ownerUsername: 'alex', caption: '#chaybo', likesCount: 0 }, 'Instagram')!);
    expect(posts.map(p => p.url)).toEqual(['https://instagram.com/p/a','https://instagram.com/p/b']); expect(posts[0].likes).toBe(0); expect(posts[0].views).toBeNull();
  });
  it('does exact hashtag matching including Unicode', () => { expect(hashtagMatch(['runner'], '#run')).toBe(false); expect(hashtagMatch(['chạybộ'], '#CHẠYBỘ')).toBe(true); });
  it('preserves distinct Facebook story/watch identities', () => { expect(canonicalUrl('https://facebook.com/story.php?story_fbid=123&id=7&ref=x')).toBe('https://facebook.com/story.php?story_fbid=123&id=7'); expect(canonicalUrl('https://facebook.com/watch/?v=123&ref=x')).not.toBe(canonicalUrl('https://facebook.com/watch/?v=456')); });
  it('preserves Facebook profile ID in canonical identity', () => expect(canonicalUrl('http://www.facebook.com/profile.php?id=12&ref=abc')).toBe('https://facebook.com/profile.php?id=12'));
  it('normalizes query context without substring matches', () => { expect(contextKey('Run club', 'Hanoi')).toBe(contextKey('Running club', 'Hanoi')); expect(tokens('Runaway')).not.toContain('running'); });
});
