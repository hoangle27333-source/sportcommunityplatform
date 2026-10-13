'use client';

import React, { useEffect, useState } from 'react';
import { AccountPostScoutModal } from '@/components/sport-hub/account-post-scout-modal';
import { SuggestedAccountReviewModal } from '@/components/sport-hub/suggested-account-review-modal';
import { TrendingPageView } from '@/components/sport-hub/pages/trending-page-view';
import type { DashboardData } from '@/components/sport-hub/types';
import type { SuggestedPostAccount } from '@/lib/apify/post-contracts';

const MOCK_INITIAL_DATA: DashboardData = {
  kpis: {
    totalKols: 12,
    totalReach: 1500000,
    avgScore: 4.8,
    totalCommunities: 5,
    totalCommunityMembers: 80000,
    totalPosts: 4,
  },
  kols: [
    {
      id: '00000000-0000-4000-8000-000000000001',
      name: 'Đỗ Kim Phúc',
      tier: 'Chuyên nghiệp',
      platform: 'TikTok',
      geography: 'Hà Nội',
      sport: ['Bóng đá', 'Pickleball'],
      followers: 1200000,
      avgViews: 80000,
      er: 6.5,
      quotation: 15000000,
      status: 'Đang hợp tác tích cực',
      info: 'contact@dokimphuc.vn',
      profileUrl: 'https://www.tiktok.com/@dokimphuc.official',
      bio: 'Freestyle Football Champion Vietnam',
      channels: [
        {
          platform: 'TikTok',
          handle: '@dokimphuc.official',
          url: 'https://www.tiktok.com/@dokimphuc.official',
          followers: 1200000,
          avgViews: 80000,
          er: 6.5,
          isPrimary: true,
        },
        {
          platform: 'Facebook',
          handle: 'dokimphuc.vn',
          url: 'https://www.facebook.com/dokimphuc.vn',
          followers: 500000,
          avgViews: 35000,
          er: 4.2,
        },
      ],
    },
  ],
  communities: [
    {
      id: '00000000-0000-4000-8000-000000000002',
      name: 'Cộng Đồng Pickleball Việt Nam',
      sport: ['Pickleball'],
      geography: 'Toàn quốc',
      members: 45000,
      platform: 'Facebook Group',
      groupUrl: 'https://www.facebook.com/groups/pickleballvietnam',
      activityLevel: 'Rất sôi động (> 20 bài/ngày)',
      adminContact: 'admin@pickleball.vn',
      pricePerPin: 2000000,
      status: 'Đang hợp tác tích cực',
      channels: [
        {
          platform: 'Facebook Group',
          url: 'https://www.facebook.com/groups/pickleballvietnam',
          members: 45000,
          isPrimary: true,
        },
      ],
    },
  ],
  posts: [
    {
      id: 'post-1',
      title: 'Kỹ thuật tâng bóng đỉnh cao tại phố đi bộ Hà Nội',
      author: 'Đỗ Kim Phúc',
      kolRecordIds: ['00000000-0000-4000-8000-000000000001'],
      platform: 'TikTok',
      likes: 45000,
      comments: 1200,
      views: 650000,
      shares: 320,
      er: 7.1,
      postUrl: 'https://www.tiktok.com/@dokimphuc.official/video/1',
      viralGrade: 'Siêu Viral',
      status: 'Đang hiển thị',
      workspaces: ['account'],
      accountLinks: [
        {
          entityType: 'kol',
          id: '00000000-0000-4000-8000-000000000001',
          role: 'author',
        },
      ],
      accountSuggestionState: 'existing',
      collectionSources: [{ kind: 'account', entityType: 'kol' }],
    },
    {
      id: 'post-2',
      title: 'Review chi tiết vợt Selkirk Vanguard Power Air',
      author: 'Hoàng Đăng Phan',
      kolRecordIds: [],
      platform: 'TikTok',
      likes: 8500,
      comments: 240,
      views: 120000,
      shares: 45,
      er: 7.28,
      postUrl: 'https://www.tiktok.com/@hoangdangphan/video/2',
      viralGrade: 'Tương tác cao',
      status: 'Đang hiển thị',
      workspaces: ['topic'],
      accountLinks: [],
      accountSuggestionState: 'suggested',
      authorIdentity: 'TikTok:https://www.tiktok.com/@hoangdangphan',
      authorProfileUrl: 'https://www.tiktok.com/@hoangdangphan',
      collectionSources: [{ kind: 'topic', keyword: 'Pickleball' }],
    },
    {
      id: 'post-3',
      title: 'Lịch thi đấu giao lưu CLB Pickleball cuối tuần',
      author: 'Cộng Đồng Pickleball Việt Nam',
      kolRecordIds: [],
      communityRecordIds: ['00000000-0000-4000-8000-000000000002'],
      platform: 'Facebook',
      likes: 420,
      comments: 38,
      views: 12000,
      shares: 12,
      er: 3.8,
      postUrl: 'https://www.facebook.com/groups/pickleballvietnam/posts/3',
      viralGrade: 'Tiêu chuẩn',
      status: 'Đang hiển thị',
      workspaces: ['account', 'topic'],
      accountLinks: [
        {
          entityType: 'community',
          id: '00000000-0000-4000-8000-000000000002',
          role: 'group',
        },
      ],
      accountSuggestionState: 'existing',
      collectionSources: [{ kind: 'topic', keyword: 'Pickleball' }],
    },
    {
      id: 'post-4',
      title: 'Video lưu trữ từ hệ thống cũ không có nguồn xác định',
      author: 'Vận Động Viên Khuyết Danh',
      kolRecordIds: [],
      platform: 'Instagram',
      likes: 120,
      comments: 5,
      views: 0,
      er: 0,
      postUrl: 'https://www.instagram.com/p/legacy_record/',
      viralGrade: 'Tiêu chuẩn',
      status: 'Đang hiển thị',
      workspaces: ['legacy'],
      missingMetrics: ['views', 'likes'],
      collectionSources: [],
    },
  ],
  reports: [],
  projects: [],
};

const MOCK_SUGGESTION: SuggestedPostAccount = {
  identity: 'TikTok:https://www.tiktok.com/@hoangdangphan',
  platform: 'TikTok',
  name: 'Hoàng Đăng Phan',
  profileUrl: 'https://www.tiktok.com/@hoangdangphan',
  postIds: ['post-2'],
  postCount: 1,
  suggestedEntityType: null,
  reviewState: 'Needs Review',
};

export default function ScoutPostsFixture() {
  const [activeModal, setActiveModal] = useState<'' | 'account' | 'review'>('');

  // Setup Mock API interception for browser test
  useEffect(() => {
    const originalFetch = window.fetch;

    window.fetch = async (input, init) => {
      const url = String(input);
      const method = init?.method || 'GET';
      const body = init?.body ? JSON.parse(String(init.body)) : {};

      if (url.includes('/api/sport-hub/scout/accounts')) {
        return Response.json({
          success: true,
          accounts: [
            {
              entityType: 'kol',
              id: '00000000-0000-4000-8000-000000000001',
              name: 'Đỗ Kim Phúc',
              sport: ['Bóng đá', 'Pickleball'],
              geography: 'Hà Nội',
              urls: [
                'https://www.tiktok.com/@dokimphuc.official',
                'https://www.facebook.com/dokimphuc.vn',
                'https://www.threads.net/@dokimphuc',
              ],
              channels: [
                {
                  url: 'https://www.tiktok.com/@dokimphuc.official',
                  platform: 'TikTok',
                  available: true,
                },
                {
                  url: 'https://www.facebook.com/dokimphuc.vn',
                  platform: 'Facebook',
                  available: true,
                },
                {
                  url: 'https://www.threads.net/@dokimphuc',
                  platform: 'Unsupported',
                  available: false,
                  reason: 'This platform is not supported.',
                },
              ],
            },
            {
              entityType: 'community',
              id: '00000000-0000-4000-8000-000000000002',
              name: 'Cộng Đồng Pickleball Việt Nam',
              sport: ['Pickleball'],
              geography: 'Toàn quốc',
              urls: ['https://www.facebook.com/groups/pickleballvietnam'],
              channels: [
                {
                  url: 'https://www.facebook.com/groups/pickleballvietnam',
                  platform: 'Facebook',
                  available: true,
                },
              ],
            },
          ],
        });
      }

      if (url.includes('/api/sport-hub/scout/plan') && method === 'POST') {
        return Response.json({
          success: true,
          plan: {
            kind: 'account-posts',
            version: 1,
            hash: 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
            criteria: body,
            accounts: body.accounts.map((a: any) => ({
              ...a,
              name: a.entityType === 'kol' ? 'Đỗ Kim Phúc' : 'Cộng Đồng Pickleball Việt Nam',
              channelUrls: a.channelUrls || ['https://www.tiktok.com/@dokimphuc.official'],
            })),
            skipped: [
              {
                entityType: 'kol',
                id: '00000000-0000-4000-8000-000000000001',
                channelUrl: 'https://www.threads.net/@dokimphuc',
                reason: 'This platform is not supported.',
                code: 'UNSUPPORTED',
              },
            ],
            accountCount: body.accounts.length,
            channelCount: body.accounts.length * 2,
            maxSessionUsd: 1.0,
            allowedMaxSessionUsd: 1.0,
          },
        });
      }

      if (url.includes('/api/sport-hub/scout/account-posts') && method === 'POST') {
        return Response.json({
          success: true,
          pending: true,
          sessionId: 'fixture-session-001',
          status: 'running',
          progress: {
            stage: 'collecting-account-posts',
            totalAccounts: body.accounts?.length || 1,
            completedAccounts: 0,
            accountResults: [],
          },
          warnings: [],
        });
      }

      if (url.includes('/api/sport-hub/scout/posts')) {
        return Response.json({
          success: true,
          posts: MOCK_INITIAL_DATA.posts,
          suggestedAccounts: [MOCK_SUGGESTION],
        });
      }

      if (url.includes('/api/sport-hub/scout/suggested-accounts') && method === 'POST') {
        return Response.json({
          success: true,
          sessionId: 'fixture-preview-session-001',
          candidates: [
            {
              candidateId: 'cand-001',
              name: body.name || 'Hoàng Đăng Phan',
              url: 'https://www.tiktok.com/@hoangdangphan',
              platform: 'TikTok',
              followers: null,
              verifiedGeography: body.geography || 'Toàn quốc',
              reviewState: 'Needs Review',
            },
          ],
        });
      }

      if (url.includes('/api/sport-hub/scout/review') && method === 'POST') {
        return Response.json({
          success: true,
          decision: 'approved',
        });
      }

      if (url.includes('/api/sport-hub/scout/post-links') && method === 'POST') {
        return Response.json({
          success: true,
          linked: 1,
          conflicts: [],
          partial: false,
        });
      }

      return originalFetch(input, init);
    };

    return () => {
      window.fetch = originalFetch;
    };
  }, []);

  return (
    <div className="space-y-4 p-4">
      {/* Test Controls Bar */}
      <div className="bg-white p-4 rounded-xl border border-slate-200 flex items-center justify-between">
        <div>
          <h2 className="text-sm font-bold text-slate-900">Scout Posts UI QA Fixture</h2>
          <p className="text-xs text-slate-500">
            Interactive verification sandbox with completely mocked APIs (zero provider spend).
          </p>
        </div>
        <div className="flex items-center space-x-2">
          <button
            type="button"
            onClick={() => setActiveModal('account')}
            className="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg text-xs font-bold"
          >
            Launch Scout Account Posts Modal
          </button>
          <button
            type="button"
            onClick={() => setActiveModal('review')}
            className="px-3 py-1.5 bg-rose-600 hover:bg-rose-500 text-white rounded-lg text-xs font-bold"
          >
            Launch Review Suggested Account Modal
          </button>
        </div>
      </div>

      {/* Main Page View Component */}
      <TrendingPageView initialData={MOCK_INITIAL_DATA} />

      {/* Direct Modal Tests */}
      {activeModal === 'account' && (
        <AccountPostScoutModal
          isOpen
          onClose={() => setActiveModal('')}
          onSuccess={() => setActiveModal('')}
        />
      )}

      {activeModal === 'review' && (
        <SuggestedAccountReviewModal
          isOpen
          suggestion={MOCK_SUGGESTION}
          onClose={() => setActiveModal('')}
          onSuccess={() => setActiveModal('')}
        />
      )}
    </div>
  );
}

