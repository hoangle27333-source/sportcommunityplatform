export interface KOLChannel {
  id?: string;
  platform: "TikTok" | "Instagram" | "Facebook" | "YouTube" | "Threads" | string;
  handle: string;
  url: string;
  followers: number;
  avgViews: number;
  er: number;
  isPrimary?: boolean;
  status?: string;
  lastScoutedAt?: string;
}

export interface KOL {
  id: string;
  name: string;
  sport: string[];
  tier: string;
  platform: string;
  geography: string;
  followers: number;
  avgViews: number;
  er: number;
  quotation: number;
  status: string;
  info: string;
  profileUrl: string;
  bio?: string;
  avatarUrl?: string;
  channels?: KOLChannel[];
  audienceAudit?: KolAudienceAudit;
  userLockedFields?: string[];
  pendingScoutDiff?: {
    scoutedAt: string;
    changes: Record<string, { current: any; scouted: any }>;
  } | null;
  lastScoutedAt?: string;
}

export interface TagDistributionItem {
  tag: string;
  percentage: number;
  postOrCommentCount?: number;
  color?: string;
}

export interface BookedCategoryItem {
  category: string;
  percentage: number;
  count?: number;
}

export interface PartnerBrandItem {
  brand: string;
  handle?: string;
  industry?: string;
  postCount: number;
  logoUrl?: string;
}

export interface KolAudienceAudit {
  id?: string;
  kolId?: string;
  auditId?: string;
  auditedAt?: string;
  totalPostsScanned: number;
  totalCommentsScanned: number;
  realAudienceRate: number; // e.g. 85.7 (%)
  seedingRate: number;      // e.g. 14.3 (%)
  seedingRiskLevel: "Low" | "Moderate" | "High";
  topTagDistribution: TagDistributionItem[];
  sponsoredContentRate: number; // e.g. 71.4 (%)
  commercialSaturation: "Low Commercial" | "Balanced" | "Heavy Commercial";
  bookedCategories: BookedCategoryItem[];
  partnerBrands: PartnerBrandItem[];
  sampleComments?: {
    organic: string[];
    seeding: string[];
  };
  auditSummary?: string;
}

export interface CommunityChannel {
  id?: string;
  platform: "Facebook Group" | "Facebook Fanpage" | "Strava Club" | "Zalo Group" | "Telegram" | string;
  name?: string;
  url: string;
  members: number;
  activityLevel?: string;
  isPrimary?: boolean;
  status?: string;
  lastScoutedAt?: string;
}

export interface Community {
  id: string;
  name: string;
  sport: string[];
  geography: string;
  members: number;
  platform: string;
  groupUrl: string;
  activityLevel: string;
  adminContact: string;
  pricePerPin: number;
  status: string;
  channels?: CommunityChannel[];
  privacy?: string;
  purpose?: string[];
  audienceAudit?: KolAudienceAudit;
}

export interface Post {
  id: string;
  title: string;
  author: string;
  kolRecordIds: string[];
  platform: string;
  likes: number;
  comments: number;
  views: number;
  er: number;
  postUrl: string;
  viralGrade: string;
  status: string;
  isSponsored?: boolean;
  sponsorBrand?: string;
  contentAudit?: KolAudienceAudit;
}

export interface Report {
  id: string;
  title: string;
  kolName: string;
  kolRecordIds: string[];
  project: string;
  score: number;
  attitude: number;
  deadline: string;
  kpiCommit: number;
  kpiActual: number;
  kpiRate: number;
  notes: string;
  evaluator: string;
}

export interface ProjectBrand {
  name: string;
  role: string; // e.g. "Title Sponsor", "Co-Sponsor", "Apparel Partner", "Hydration Partner"
  contribution?: number; // VND budget contributed
}

export interface ProjectParticipant {
  id: string;
  projectId: string;
  entityType: "kol" | "community";
  kolId?: string;
  communityId?: string;
  entityName: string;
  avatarUrl?: string;
  sport?: string[];
  tierOrPlatform?: string;
  deliverableScope: string;
  agreedFee: number;
  targetViews?: number;
  actualViews?: number;
  targetReach?: number;
  actualReach?: number;
  actualER?: number;
  proofUrl?: string;
  status: "Invited" | "Confirmed" | "Delivered" | "Signed Off" | "Cancelled";
  ratingScore?: number;
  attitudeScore?: number;
  deadlineStatus?: string;
  pmNotes?: string;
  evaluator?: string;
  updatedAt?: string;
}

export interface Project {
  id: string;
  name: string;
  brand: string;
  brands: string[];
  brandDetails?: ProjectBrand[];
  budget: number;
  allocatedBudget?: number;
  startDate?: string;
  endDate?: string;
  pic: string;
  objective: string;
  status: string;
  sport?: string[];
  region?: string;
  participants?: ProjectParticipant[];
}

export interface DashboardData {
  kpis: {
    totalKols: number;
    totalReach: number;
    avgScore: number;
    totalCommunities: number;
    totalCommunityMembers: number;
    totalPosts: number;
    totalProjects?: number;
    totalBudget?: number;
  };
  kols: KOL[];
  communities: Community[];
  posts: Post[];
  reports: Report[];
  projects?: Project[];
}

