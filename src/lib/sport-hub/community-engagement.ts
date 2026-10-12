import { canonicalUrl } from '@/lib/apify/discovery-quality';

export interface EngagementSummary {
  average: number | null;
  sampleSize: number;
  measuredCount: number;
  freshestPostAt: string | null;
  oldestPostAt: string | null;
  updatedAt: string | null;
  partial: boolean;
  channels: { url: string; platform: string; status: string; posts?: number; reason?: string }[];
  postIds: string[];
}
export function communityEngagement(posts: any[], collection?: { channels?: EngagementSummary['channels']; updatedAt?: string }): EngagementSummary {
  const seen = new Set<string>();
  const sample = [...posts].filter(p => p.published_at && Number.isFinite(Date.parse(p.published_at)))
    .sort((a, b) => Date.parse(b.published_at) - Date.parse(a.published_at) || String(a.id).localeCompare(String(b.id)))
    .filter(p => { const key = canonicalUrl(p.post_url || '') || p.scout_identity || p.id; if (seen.has(key)) return false; seen.add(key); return true; })
    .slice(0, 30);
  const measured = sample.filter(p => !['likes', 'comments'].some(k => (p.scout_missing_metrics || []).includes(k))
    && ['likes', 'comments'].every(k => p[k] !== null && p[k] !== undefined && Number.isFinite(Number(p[k])) && Number(p[k]) >= 0));
  const observed = sample.map(p => p.scout_provenance?.fetchedAt).filter((v): v is string => typeof v === 'string' && Number.isFinite(Date.parse(v))).sort();
  const channels = collection?.channels || [];
  return {
    average: measured.length ? measured.reduce((sum, p) => sum + Number(p.likes) + Number(p.comments), 0) / measured.length : null,
    sampleSize: sample.length, measuredCount: measured.length,
    freshestPostAt: sample[0]?.published_at || null, oldestPostAt: sample.at(-1)?.published_at || null,
    updatedAt: collection?.updatedAt || observed.at(-1) || null,
    partial: sample.length < 30 || measured.length < sample.length || !channels.length || channels.some(c => c.status !== 'collected'),
    channels, postIds: sample.map(p => p.id),
  };
}
