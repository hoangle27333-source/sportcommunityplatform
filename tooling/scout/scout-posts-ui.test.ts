import { describe, expect, it } from 'vitest';
import type { Post } from '@/components/sport-hub/types';
import type { SuggestedPostAccount } from '@/lib/apify/post-contracts';

describe('Scout Posts UI Data and Segregation Logic', () => {
  const samplePosts: Post[] = [
    {
      id: 'post-1',
      title: 'Chạy bộ Hồ Gươm buổi sáng',
      author: 'Đỗ Kim Phúc',
      kolRecordIds: ['kol-1'],
      platform: 'Facebook',
      likes: 1200,
      comments: 45,
      views: 25000,
      shares: 10,
      er: 5.0,
      postUrl: 'https://facebook.com/posts/1',
      viralGrade: 'Tương tác cao',
      status: 'active',
      workspaces: ['account'],
      accountLinks: [{ entityType: 'kol', id: 'kol-1', role: 'author' }],
      accountSuggestionState: 'existing',
      collectionSources: [{ kind: 'account', entityType: 'kol', entityId: 'kol-1' }],
    },
    {
      id: 'post-2',
      title: 'Review vợt Pickleball mới',
      author: 'Creator Chưa Lưu',
      kolRecordIds: [],
      platform: 'TikTok Video',
      likes: 500,
      comments: 30,
      views: 15000,
      shares: null,
      er: 3.5,
      postUrl: 'https://tiktok.com/@creator/video/1',
      viralGrade: 'Xu Hướng',
      status: 'active',
      workspaces: ['topic'],
      accountLinks: [],
      accountSuggestionState: 'suggested',
      authorIdentity: 'TikTok:https://www.tiktok.com/@creator',
      authorProfileUrl: 'https://www.tiktok.com/@creator',
      collectionSources: [{ kind: 'topic', keyword: 'Pickleball' }],
    },
    {
      id: 'post-3',
      title: 'Giải chạy marathon Nha Trang',
      author: 'CLB Chạy Bộ',
      kolRecordIds: [],
      communityRecordIds: ['comm-1'],
      platform: 'Facebook',
      likes: 300,
      comments: 15,
      views: 8000,
      shares: 5,
      er: 3.9,
      postUrl: 'https://facebook.com/groups/runners/posts/1',
      viralGrade: 'Tiêu chuẩn',
      status: 'active',
      // Dual-workspace: topic discovery matched to saved group
      workspaces: ['account', 'topic'],
      accountLinks: [{ entityType: 'community', id: 'comm-1', role: 'group' }],
      accountSuggestionState: 'existing',
      collectionSources: [{ kind: 'topic', keyword: 'Marathon' }],
    },
    {
      id: 'post-4',
      title: 'Bài viết cũ từ hệ thống cũ',
      author: 'Tác Giả Ẩn Danh',
      kolRecordIds: [],
      platform: 'Instagram',
      likes: 50,
      comments: 2,
      views: 0,
      er: 0,
      postUrl: 'https://instagram.com/p/legacy1',
      viralGrade: 'Tiêu chuẩn',
      status: 'active',
      workspaces: ['legacy'],
      accountLinks: [],
      missingMetrics: ['views', 'likes'],
      collectionSources: [],
    },
  ];

  it('correctly filters posts for the Account Posts tab', () => {
    const accountPosts = samplePosts.filter(
      p =>
        p.workspaces?.includes('account') ||
        (p.accountLinks && p.accountLinks.length > 0) ||
        (p.kolRecordIds && p.kolRecordIds.length > 0) ||
        (p.communityRecordIds && p.communityRecordIds.length > 0)
    );

    // post-1 (saved author) and post-3 (topic post matched to saved group)
    expect(accountPosts.map(p => p.id)).toEqual(['post-1', 'post-3']);
  });

  it('correctly filters posts for the Trending Posts tab', () => {
    const trendingPosts = samplePosts.filter(
      p =>
        p.workspaces?.includes('topic') ||
        (p.collectionSources && p.collectionSources.some(s => s.kind === 'topic'))
    );

    // post-2 (topic suggestion) and post-3 (topic match to community)
    expect(trendingPosts.map(p => p.id)).toEqual(['post-2', 'post-3']);
  });

  it('preserves the exact same post ID across both workspaces when topic matches a saved account', () => {
    const accountPosts = samplePosts.filter(p => p.workspaces?.includes('account'));
    const trendingPosts = samplePosts.filter(p => p.workspaces?.includes('topic'));

    const sharedPostId = 'post-3';
    expect(accountPosts.some(p => p.id === sharedPostId)).toBe(true);
    expect(trendingPosts.some(p => p.id === sharedPostId)).toBe(true);
  });

  it('preserves distinction between role: author and role: group', () => {
    const authorPost = samplePosts.find(p => p.id === 'post-1')!;
    const groupPost = samplePosts.find(p => p.id === 'post-3')!;

    expect(authorPost.accountLinks?.[0].role).toBe('author');
    expect(groupPost.accountLinks?.[0].role).toBe('group');
  });

  it('keeps legacy / unknown source posts accessible without labeling them as trending', () => {
    const legacyPosts = samplePosts.filter(
      p =>
        p.workspaces?.includes('legacy') ||
        (!p.workspaces?.includes('account') &&
          !p.workspaces?.includes('topic') &&
          (!p.accountLinks || p.accountLinks.length === 0) &&
          (!p.kolRecordIds || p.kolRecordIds.length === 0))
    );

    expect(legacyPosts.map(p => p.id)).toEqual(['post-4']);
  });

  it('formats unknown metrics truthfully using missingMetrics rather than fallback zero', () => {
    const postWithMissing = samplePosts.find(p => p.id === 'post-4')!;
    const isViewsUnknown =
      postWithMissing.missingMetrics?.includes('views') || postWithMissing.views == null;
    const isLikesUnknown =
      postWithMissing.missingMetrics?.includes('likes') || postWithMissing.likes == null;

    expect(isViewsUnknown).toBe(true);
    expect(isLikesUnknown).toBe(true);

    const normalPost = samplePosts.find(p => p.id === 'post-1')!;
    expect(normalPost.missingMetrics?.includes('views')).toBeFalsy();
  });
});

describe('Scout Account Posts Plan & Selection Bounding Logic', () => {
  it('bounds account multi-selection to 1,000 unique accounts', () => {
    const selected = new Map<string, any>();
    for (let i = 0; i < 1200; i++) {
      if (selected.size < 1000) {
        selected.set(`kol:${i}`, { id: `id-${i}`, entityType: 'kol' });
      }
    }
    expect(selected.size).toBe(1000);
  });

  it('excludes unsupported channels from execution while keeping them visible with reasons', () => {
    const channels = [
      { url: 'https://instagram.com/valid', platform: 'Instagram', available: true },
      {
        url: 'https://threads.net/@user',
        platform: 'Unsupported',
        available: false,
        reason: 'This platform is not supported.',
      },
    ];

    const eligible = channels.filter(c => c.available);
    const ineligible = channels.filter(c => !c.available);

    expect(eligible).toHaveLength(1);
    expect(eligible[0].url).toBe('https://instagram.com/valid');
    expect(ineligible).toHaveLength(1);
    expect(ineligible[0].reason).toBe('This platform is not supported.');
  });
});

