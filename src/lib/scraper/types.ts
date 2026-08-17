export interface RecentPost {
  url?: string;
  caption?: string;
  likes?: number;
  comments?: number;
  shares?: number;
  views?: number;
  mediaType?: "image" | "video" | "carousel";
  postedAt?: string;
}

export interface ScrapedProfile {
  platform: "facebook" | "instagram";
  username: string;
  displayName: string;
  avatarUrl?: string;
  followersCount?: number;
  followingCount?: number;
  postsCount?: number;
  bio?: string;
  isVerified?: boolean;
  engagementRate?: number;
  postsPerWeek?: number;
  topHashtags?: string[];
  avgLikes?: number;
  avgComments?: number;
  avgShares?: number;
  avgViews?: number;
  recentPosts?: RecentPost[];
}
