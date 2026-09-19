import { KOL, KOLChannel, Community, CommunityChannel } from "@/components/sport-hub/types";

export interface PlatformConfig {
  name: string;
  shortName: string;
  badgeBg: string;
  badgeText: string;
  badgeBorder: string;
  brandColor: string;
  iconType: "tiktok" | "youtube" | "facebook" | "instagram" | "threads" | "strava" | "zalo" | "telegram" | "globe";
}

export const PLATFORM_REGISTRY: Record<string, PlatformConfig> = {
  tiktok: {
    name: "TikTok",
    shortName: "TT",
    badgeBg: "bg-slate-900",
    badgeText: "text-white",
    badgeBorder: "border-slate-800",
    brandColor: "#000000",
    iconType: "tiktok",
  },
  youtube: {
    name: "YouTube",
    shortName: "YT",
    badgeBg: "bg-rose-50",
    badgeText: "text-rose-700",
    badgeBorder: "border-rose-200",
    brandColor: "#FF0000",
    iconType: "youtube",
  },
  facebook: {
    name: "Facebook",
    shortName: "FB",
    badgeBg: "bg-blue-50",
    badgeText: "text-blue-700",
    badgeBorder: "border-blue-200",
    brandColor: "#1877F2",
    iconType: "facebook",
  },
  instagram: {
    name: "Instagram",
    shortName: "IG",
    badgeBg: "bg-fuchsia-50",
    badgeText: "text-fuchsia-700",
    badgeBorder: "border-fuchsia-200",
    brandColor: "#E1306C",
    iconType: "instagram",
  },
  threads: {
    name: "Threads",
    shortName: "TH",
    badgeBg: "bg-slate-100",
    badgeText: "text-slate-800",
    badgeBorder: "border-slate-300",
    brandColor: "#101010",
    iconType: "threads",
  },
  strava: {
    name: "Strava",
    shortName: "ST",
    badgeBg: "bg-orange-50",
    badgeText: "text-orange-700",
    badgeBorder: "border-orange-200",
    brandColor: "#FC4C02",
    iconType: "strava",
  },
  zalo: {
    name: "Zalo",
    shortName: "ZL",
    badgeBg: "bg-blue-50",
    badgeText: "text-blue-700",
    badgeBorder: "border-blue-200",
    brandColor: "#0068FF",
    iconType: "zalo",
  },
  telegram: {
    name: "Telegram",
    shortName: "TG",
    badgeBg: "bg-sky-50",
    badgeText: "text-sky-700",
    badgeBorder: "border-sky-200",
    brandColor: "#229ED9",
    iconType: "telegram",
  },
};

export function getPlatformConfig(platformName: string): PlatformConfig {
  const normalized = (platformName || "").toLowerCase().trim();
  if (normalized.includes("tiktok") || normalized.includes("tik tok")) return PLATFORM_REGISTRY.tiktok;
  if (normalized.includes("youtube") || normalized.includes("yt")) return PLATFORM_REGISTRY.youtube;
  if (normalized.includes("facebook") || normalized.includes("fb")) return PLATFORM_REGISTRY.facebook;
  if (normalized.includes("instagram") || normalized.includes("ig")) return PLATFORM_REGISTRY.instagram;
  if (normalized.includes("threads")) return PLATFORM_REGISTRY.threads;
  if (normalized.includes("strava")) return PLATFORM_REGISTRY.strava;
  if (normalized.includes("zalo")) return PLATFORM_REGISTRY.zalo;
  if (normalized.includes("telegram")) return PLATFORM_REGISTRY.telegram;

  return {
    name: platformName || "Web",
    shortName: (platformName || "W").slice(0, 2).toUpperCase(),
    badgeBg: "bg-slate-100",
    badgeText: "text-slate-700",
    badgeBorder: "border-slate-200",
    brandColor: "#64748B",
    iconType: "globe",
  };
}

/**
 * Pre-configured multi-channel datasets for top Vietnamese sports creators
 */
export const KNOWN_KOL_CHANNELS: Record<string, KOLChannel[]> = {
  "Đỗ Kim Phúc": [
    {
      platform: "TikTok",
      handle: "@dokimphuc.football",
      url: "https://www.tiktok.com/@dokimphuc.football",
      followers: 3800000,
      avgViews: 450000,
      er: 5.2,
      isPrimary: true,
      status: "Verified",
    },
    {
      platform: "YouTube",
      handle: "Đỗ Kim Phúc Official",
      url: "https://www.youtube.com/@dokimphuc",
      followers: 1350000,
      avgViews: 220000,
      er: 4.8,
      status: "Verified",
    },
    {
      platform: "Facebook",
      handle: "Đỗ Kim Phúc Freestyle",
      url: "https://facebook.com/dokimphuc.vn",
      followers: 950000,
      avgViews: 85000,
      er: 3.5,
      status: "Verified",
    },
    {
      platform: "Instagram",
      handle: "@dokimphuc",
      url: "https://instagram.com/dokimphuc",
      followers: 240000,
      avgViews: 45000,
      er: 4.1,
      status: "Active",
    },
  ],
  "Hana Giang Anh": [
    {
      platform: "YouTube",
      handle: "Hana Giang Anh",
      url: "https://www.youtube.com/@HanaGiangAnhFitness",
      followers: 1450000,
      avgViews: 140000,
      er: 4.2,
      isPrimary: true,
      status: "Verified",
    },
    {
      platform: "Facebook",
      handle: "Hana Giang Anh",
      url: "https://www.facebook.com/hanagianganh",
      followers: 850000,
      avgViews: 65000,
      er: 3.6,
      status: "Verified",
    },
    {
      platform: "TikTok",
      handle: "@hanagianganh",
      url: "https://www.tiktok.com/@hanagianganh",
      followers: 680000,
      avgViews: 110000,
      er: 5.0,
      status: "Verified",
    },
    {
      platform: "Instagram",
      handle: "@hanagianganh",
      url: "https://instagram.com/hanagianganh",
      followers: 420000,
      avgViews: 55000,
      er: 4.5,
      status: "Verified",
    },
  ],
  "Hoàng Đăng Phan": [
    {
      platform: "TikTok",
      handle: "@hoangdang.pickleball",
      url: "https://www.tiktok.com/@hoangdang.pickleball",
      followers: 45000,
      avgViews: 52000,
      er: 6.2,
      isPrimary: true,
      status: "Active",
    },
    {
      platform: "Facebook",
      handle: "Hoàng Đăng Phan (Coach)",
      url: "https://www.facebook.com/hoangdang.phan",
      followers: 25000,
      avgViews: 18000,
      er: 4.8,
      status: "Active",
    },
    {
      platform: "Instagram",
      handle: "@hoangdang.franklin",
      url: "https://instagram.com/hoangdang.franklin",
      followers: 15000,
      avgViews: 12000,
      er: 5.0,
      status: "Active",
    },
  ],
  "Dean Nguyen": [
    {
      platform: "Instagram",
      handle: "@pickleballhanoi_",
      url: "https://instagram.com/pickleballhanoi_",
      followers: 15000,
      avgViews: 25000,
      er: 4.5,
      isPrimary: true,
      status: "Active",
    },
    {
      platform: "TikTok",
      handle: "@dean.pickleballvn",
      url: "https://tiktok.com/@dean.pickleballvn",
      followers: 18500,
      avgViews: 32000,
      er: 5.4,
      status: "Active",
    },
  ],
};

/**
 * Returns normalized channels for a KOL.
 * If kol.channels is present and non-empty, returns it.
 * Otherwise, checks KNOWN_KOL_CHANNELS by name.
 * If still not found, synthesizes a 1-channel list from kol.platform.
 */
export function getKolChannels(kol: KOL): KOLChannel[] {
  if (kol.channels && kol.channels.length > 0) {
    return kol.channels;
  }

  // Check known presets by exact or partial match
  const matchedName = Object.keys(KNOWN_KOL_CHANNELS).find(
    (name) => kol.name.toLowerCase().includes(name.toLowerCase()) || name.toLowerCase().includes(kol.name.toLowerCase())
  );
  if (matchedName) {
    return KNOWN_KOL_CHANNELS[matchedName];
  }

  // Fallback: 1 primary channel synthesized from base fields
  return [
    {
      platform: kol.platform || "Facebook",
      handle: kol.name,
      url: kol.profileUrl || "#",
      followers: kol.followers || 0,
      avgViews: kol.avgViews || 0,
      er: kol.er || 0,
      isPrimary: true,
      status: "Active",
    },
  ];
}

export interface KolAggregates {
  totalFollowers: number;
  totalAvgViews: number;
  blendedEr: number;
  channelCount: number;
  primaryChannel: KOLChannel;
  hasMultipleChannels: boolean;
  channels: KOLChannel[];
}

/**
 * Calculates cross-platform aggregated metrics for a KOL
 */
export function getKolAggregates(kol: KOL): KolAggregates {
  const channels = getKolChannels(kol);
  const channelCount = channels.length;
  const hasMultipleChannels = channelCount > 1;

  const totalFollowers = channels.reduce((sum, ch) => sum + (ch.followers || 0), 0) || kol.followers || 0;
  const totalAvgViews = channels.reduce((sum, ch) => sum + (ch.avgViews || 0), 0) || kol.avgViews || 0;

  // Weighted ER based on followers share
  let blendedEr = kol.er || 0;
  if (totalFollowers > 0) {
    const weightedSum = channels.reduce((sum, ch) => sum + (ch.er || 0) * (ch.followers || 0), 0);
    blendedEr = +(weightedSum / totalFollowers).toFixed(1);
  }

  const primaryChannel = channels.find((ch) => ch.isPrimary) || channels[0];

  return {
    totalFollowers,
    totalAvgViews,
    blendedEr,
    channelCount,
    primaryChannel,
    hasMultipleChannels,
    channels,
  };
}

/**
 * Pre-configured multi-channel datasets for Vietnamese sports communities
 */
export const KNOWN_COMMUNITY_CHANNELS: Record<string, CommunityChannel[]> = {
  "Cộng Đồng Pickleball Việt Nam": [
    {
      platform: "Facebook Group",
      name: "Cộng Đồng Pickleball Việt Nam (Official)",
      url: "https://facebook.com/groups/pickleballvietnam",
      members: 85000,
      activityLevel: "Rất sôi động (> 20 bài/ngày)",
      isPrimary: true,
      status: "Active",
    },
    {
      platform: "Facebook Fanpage",
      name: "Pickleball Vietnam Media",
      url: "https://facebook.com/pickleballvietnam.media",
      members: 32000,
      activityLevel: "Rất sôi động (> 20 bài/ngày)",
      status: "Active",
    },
    {
      platform: "Zalo Group",
      name: "Giao Lưu Kèo Pickleball Bắc - Nam",
      url: "https://zalo.me/g/pickleballvn",
      members: 1500,
      activityLevel: "Rất sôi động (> 20 bài/ngày)",
      status: "Active",
    },
  ],
  "Hội Yêu Chạy Bộ & Marathon Sài Gòn": [
    {
      platform: "Facebook Group",
      name: "Hội Yêu Chạy Bộ Sài Gòn",
      url: "https://facebook.com/groups/chaybosaigon",
      members: 52000,
      activityLevel: "Rất sôi động (> 20 bài/ngày)",
      isPrimary: true,
      status: "Active",
    },
    {
      platform: "Strava Club",
      name: "Saigon Runners Club",
      url: "https://strava.com/clubs/saigonrunners",
      members: 8500,
      activityLevel: "Rất sôi động (> 20 bài/ngày)",
      status: "Active",
    },
  ],
  "CLB Pickleball Ba Đình": [
    {
      platform: "Facebook Group",
      name: "CLB Pickleball Ba Đình & Đống Đa",
      url: "https://facebook.com/groups/clbpickleballbadinh",
      members: 12000,
      activityLevel: "Trung bình (5-20 bài/ngày)",
      isPrimary: true,
      status: "Active",
    },
    {
      platform: "Zalo Group",
      name: "Kèo Sân Ba Đình Mỗi Chiều",
      url: "https://zalo.me/g/badinhpickleball",
      members: 850,
      activityLevel: "Trung bình (5-20 bài/ngày)",
      status: "Active",
    },
  ],
};

/**
 * Returns normalized channels for a Community.
 */
export function getCommunityChannels(comm: Community): CommunityChannel[] {
  if (comm.channels && comm.channels.length > 0) {
    return comm.channels;
  }

  const matchedName = Object.keys(KNOWN_COMMUNITY_CHANNELS).find(
    (name) => comm.name.toLowerCase().includes(name.toLowerCase()) || name.toLowerCase().includes(comm.name.toLowerCase())
  );
  if (matchedName) {
    return KNOWN_COMMUNITY_CHANNELS[matchedName];
  }

  return [
    {
      platform: comm.platform || "Facebook Group",
      name: comm.name,
      url: comm.groupUrl || "#",
      members: comm.members || 0,
      activityLevel: comm.activityLevel || "Rất sôi động (> 20 bài/ngày)",
      isPrimary: true,
      status: "Active",
    },
  ];
}

export interface CommunityAggregates {
  totalMembers: number;
  channelCount: number;
  primaryChannel: CommunityChannel;
  hasMultipleChannels: boolean;
  channels: CommunityChannel[];
}

/**
 * Calculates cross-platform aggregated metrics for a Community
 */
export function getCommunityAggregates(comm: Community): CommunityAggregates {
  const channels = getCommunityChannels(comm);
  const channelCount = channels.length;
  const hasMultipleChannels = channelCount > 1;

  const totalMembers = channels.reduce((sum, ch) => sum + (ch.members || 0), 0) || comm.members || 0;
  const primaryChannel = channels.find((ch) => ch.isPrimary) || channels[0];

  return {
    totalMembers,
    channelCount,
    primaryChannel,
    hasMultipleChannels,
    channels,
  };
}
