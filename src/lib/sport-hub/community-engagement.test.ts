import { describe, expect, it } from 'vitest';
import { communityEngagement } from './community-engagement';

function post(index: number, extra: Record<string, unknown> = {}) {
  return { id: String(index), post_url: `https://facebook.com/club/posts/${index}`, published_at: new Date(Date.UTC(2026, 9, 11, 0, 0, -index)).toISOString(), likes: index, comments: 2, ...extra };
}
describe('community latest-30 engagement', () => {
  it('selects by publication date before calculating, excluding the older viral post', () => {
    const summary = communityEngagement([...Array.from({ length: 30 }, (_, i) => post(i)), post(31, { likes: 1_000_000 })].reverse());
    expect(summary.sampleSize).toBe(30); expect(summary.average).toBe(16.5); expect(summary.postIds).not.toContain('31');
  });
  it('does not replace missing metrics with post 31 and accepts observed zero', () => {
    const summary = communityEngagement([post(0, { likes: 0, comments: 0 }), ...Array.from({ length: 29 }, (_, i) => post(i + 1, { scout_missing_metrics: ['likes'] })), post(31)]);
    expect(summary.average).toBe(0); expect(summary.measuredCount).toBe(1); expect(summary.sampleSize).toBe(30); expect(summary.partial).toBe(true);
  });
  it('deduplicates canonical URLs across channels and ignores missing dates', () => {
    const summary = communityEngagement([post(1), post(2, { post_url: 'https://www.facebook.com/club/posts/1/?tracking=x' }), post(3, { published_at: null }), post(4, { published_at: 'invalid' })]);
    expect(summary.sampleSize).toBe(1); expect(summary.average).toBe(3);
  });
  it('preserves Unknown instead of estimating missing data', () => {
    expect(communityEngagement([]).average).toBeNull();
    expect(communityEngagement([post(1, { likes: null }), post(2, { comments: undefined })]).measuredCount).toBe(0);
  });
  it('keeps channel failures inspectable and reports update freshness', () => {
    const collection = { updatedAt: '2026-10-11T01:00:00Z', channels: [{ url: 'https://facebook.com/groups/1', platform: 'Facebook', status: 'unavailable', reason: 'Private group' }] };
    expect(communityEngagement([post(1)], collection)).toMatchObject({ average: 3, partial: true, channels: collection.channels, updatedAt: collection.updatedAt });
  });
});
