-- ============================================================================
-- SPORT INFLUENCER HUB — MULTI-CHANNEL KOL DATA SCHEMA
-- Migration: 20260922000000_kol_multi_channels.sql
-- Add channels JSONB column to kols table and seed multi-channel footprints
-- ============================================================================

-- 1. Add channels JSONB column
alter table if exists public.kols
  add column if not exists channels jsonb default '[]'::jsonb;

-- 2. Populate Đỗ Kim Phúc (4 channels: TikTok, YouTube, Facebook, Instagram)
update public.kols
set
  platform = 'Omni-channel',
  followers = 6340000,
  avg_views = 760000,
  er = 4.8,
  channels = '[
    {
      "platform": "TikTok",
      "handle": "@dokimphuc.football",
      "url": "https://www.tiktok.com/@dokimphuc.football",
      "followers": 3800000,
      "avgViews": 450000,
      "er": 5.2,
      "isPrimary": true,
      "status": "Verified"
    },
    {
      "platform": "YouTube",
      "handle": "Đỗ Kim Phúc Official",
      "url": "https://www.youtube.com/@dokimphuc",
      "followers": 1350000,
      "avgViews": 220000,
      "er": 4.8,
      "status": "Verified"
    },
    {
      "platform": "Facebook",
      "handle": "Đỗ Kim Phúc Freestyle",
      "url": "https://facebook.com/dokimphuc.vn",
      "followers": 950000,
      "avgViews": 85000,
      "er": 3.5,
      "status": "Verified"
    },
    {
      "platform": "Instagram",
      "handle": "@dokimphuc",
      "url": "https://instagram.com/dokimphuc",
      "followers": 240000,
      "avgViews": 45000,
      "er": 4.1,
      "status": "Active"
    }
  ]'::jsonb
where name ilike '%Đỗ Kim Phúc%';

-- 3. Populate Hana Giang Anh (4 channels: YouTube, Facebook, TikTok, Instagram)
update public.kols
set
  platform = 'Omni-channel',
  followers = 3400000,
  avg_views = 350000,
  er = 4.2,
  channels = '[
    {
      "platform": "YouTube",
      "handle": "Hana Giang Anh",
      "url": "https://www.youtube.com/@HanaGiangAnhFitness",
      "followers": 1450000,
      "avgViews": 140000,
      "er": 4.2,
      "isPrimary": true,
      "status": "Verified"
    },
    {
      "platform": "Facebook",
      "handle": "Hana Giang Anh",
      "url": "https://www.facebook.com/hanagianganh",
      "followers": 850000,
      "avgViews": 65000,
      "er": 3.6,
      "status": "Verified"
    },
    {
      "platform": "TikTok",
      "handle": "@hanagianganh",
      "url": "https://www.tiktok.com/@hanagianganh",
      "followers": 680000,
      "avgViews": 110000,
      "er": 5.0,
      "status": "Verified"
    },
    {
      "platform": "Instagram",
      "handle": "@hanagianganh",
      "url": "https://instagram.com/hanagianganh",
      "followers": 420000,
      "avgViews": 55000,
      "er": 4.5,
      "status": "Verified"
    }
  ]'::jsonb
where name ilike '%Hana Giang Anh%';

-- 4. Populate Hoàng Đăng Phan (3 channels: TikTok, Facebook, Instagram)
update public.kols
set
  platform = 'Omni-channel',
  followers = 85000,
  avg_views = 82000,
  er = 5.6,
  channels = '[
    {
      "platform": "TikTok",
      "handle": "@hoangdang.pickleball",
      "url": "https://www.tiktok.com/@hoangdang.pickleball",
      "followers": 45000,
      "avgViews": 52000,
      "er": 6.2,
      "isPrimary": true,
      "status": "Active"
    },
    {
      "platform": "Facebook",
      "handle": "Hoàng Đăng Phan (Coach)",
      "url": "https://www.facebook.com/hoangdang.phan",
      "followers": 25000,
      "avgViews": 18000,
      "er": 4.8,
      "status": "Active"
    },
    {
      "platform": "Instagram",
      "handle": "@hoangdang.franklin",
      "url": "https://instagram.com/hoangdang.franklin",
      "followers": 15000,
      "avgViews": 12000,
      "er": 5.0,
      "status": "Active"
    }
  ]'::jsonb
where name ilike '%Hoàng Đăng Phan%';

-- 5. Populate Dean Nguyen (2 channels: Instagram, TikTok)
update public.kols
set
  platform = 'Omni-channel',
  followers = 33500,
  avg_views = 57000,
  er = 5.0,
  channels = '[
    {
      "platform": "Instagram",
      "handle": "@pickleballhanoi_",
      "url": "https://instagram.com/pickleballhanoi_",
      "followers": 15000,
      "avgViews": 25000,
      "er": 4.5,
      "isPrimary": true,
      "status": "Active"
    },
    {
      "platform": "TikTok",
      "handle": "@dean.pickleballvn",
      "url": "https://tiktok.com/@dean.pickleballvn",
      "followers": 18500,
      "avgViews": 32000,
      "er": 5.4,
      "status": "Active"
    }
  ]'::jsonb
where name ilike '%Dean Nguyen%';
