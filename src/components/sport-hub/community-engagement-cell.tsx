'use client';
import type { Community } from './types';

export function CommunityEngagementCell({ community, onUpdate }: { community: Community; onUpdate?: () => void }) {
  const summary = community.engagementSummary;
  const date = (value?: string | null) => value ? new Date(value).toLocaleString('en-US', { timeZone: 'Asia/Ho_Chi_Minh' }) : 'Unknown';
  const tooltip = `Mean(likes/reactions + comments) across measured posts in the latest 30 stored posts. Missing metrics are excluded, not zero. Updated: ${date(summary?.updatedAt)}. Sample: ${date(summary?.oldestPostAt)} – ${date(summary?.freshestPostAt)}. Public collected sample; inaccessible posts may be missing.`;
  return <div className="min-w-44 text-right" title={tooltip}>
    <span className="text-sm font-semibold text-slate-800">{summary?.average == null ? 'Not available' : summary.average.toLocaleString('en-US', { maximumFractionDigits: 1 })}</span>
    <p className="text-[11px] text-slate-500">{summary?.measuredCount || 0} measured / {summary?.sampleSize || 0} posts</p>
    <p className="text-[11px] text-slate-500">Updated: {date(summary?.updatedAt)}</p>
    {summary?.partial && <p className="text-[11px] text-amber-700">Partial sample</p>}
    {onUpdate && <button type="button" className="mt-1 text-[11px] font-medium text-indigo-700 underline" onClick={event => { event.stopPropagation(); onUpdate(); }}>Update latest 30 posts</button>}
  </div>;
}
