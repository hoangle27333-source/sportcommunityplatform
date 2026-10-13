/** Shared browser-safe contracts for the two Posts workspaces. */
export type PostSource = {
  kind: 'account' | 'topic';
  sessionId?: string;
  keyword?: string;
  entityType?: 'kol' | 'community';
  entityId?: string;
  channelUrl?: string;
};
export type PostAccountLink = {
  entityType: 'kol' | 'community';
  id: string;
  role: 'author' | 'group';
};
export type PostWorkspaceMetadata = {
  authorIdentity: string | null;
  authorProfileUrl: string | null;
  collectionSources: PostSource[];
  accountLinks: PostAccountLink[];
  workspaces: ('account' | 'topic' | 'legacy')[];
  accountSuggestionState: 'existing' | 'suggested' | 'needs-verification';
};
export type SuggestedPostAccount = {
  identity: string;
  platform: string;
  name: string;
  profileUrl: string;
  postIds: string[];
  postCount: number;
  suggestedEntityType: 'kol' | 'community' | null;
  reviewState: 'Needs Review';
};
export type PostWorkspaceRecord = PostWorkspaceMetadata & {
  id: string; title: string; author: string; platform: string;
  kolRecordIds: string[]; communityRecordIds: string[];
  likes: number | null; comments: number | null; views: number | null; shares: number | null; er: number | null;
  postUrl: string; publishedAt: string | null; viralGrade: string;
  missingMetrics: string[]; scoutProvenance: Record<string, unknown> | null; scoutContentAssessment: Record<string, unknown> | null;
};
