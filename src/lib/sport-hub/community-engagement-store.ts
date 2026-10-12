import { createAdminClient } from '@/lib/supabase/admin';
import { communityEngagement, type EngagementSummary } from './community-engagement';

export async function loadCommunityEngagement(ids: string[]): Promise<Map<string, EngagementSummary>> {
  const summaries = new Map<string, EngagementSummary>();
  const db = createAdminClient();
  // Each RPC response has at most 750 posts, below PostgREST's default row cap.
  for (let index = 0; index < ids.length; index += 25) {
    const { data, error } = await db.rpc('community_engagement_samples', { p_ids: ids.slice(index, index + 25) });
    if (error) throw new Error('Community engagement requires the Scout workflow migration.');
    for (const row of data || []) summaries.set(row.community_id, communityEngagement(row.posts || [], {
      channels: row.channel_coverage || [], updatedAt: row.collected_at || undefined,
    }));
  }
  return summaries;
}
