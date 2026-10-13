import { canonicalUrl } from './discovery-quality';
import { assessContentFilter, DEFAULT_CONTENT_FILTER, type ContentFilter } from './content-settings';
import type { SocialPost } from './providers';
import { assessSearchContent } from './search-assessment';
import { topicQueries } from './account-criteria';
import { hasTopicEvidence } from './content-quality';
import type { ContentQuality } from './content-quality';
export type TopPostCriteria = ContentQuality & {
 selectionMode?: 'top'; rankingMode?: 'views-first'; publishedFrom?: string; publishedTo?: string;
 thresholdsEnabled?: boolean; qualityFilter?: ContentFilter;
};
export const topCandidateBudget = (limit: number) => Math.min(120, Math.max(60, 6 * limit));
export function compareTopPosts(a: SocialPost, b: SocialPost) {
 for (const key of ['views', 'likes', 'comments', 'shares'] as const) {
  const difference = (b[key] ?? -1) - (a[key] ?? -1);
  if (difference) return difference;
 }
 return (b.publishedAt || '').localeCompare(a.publishedAt || '') || a.url.localeCompare(b.url);
}
export function assessTopPost(post: SocialPost, criteria: TopPostCriteria & { keyword?: string; searchMode?: string; geography?: string | string[] }, from: string, to: string, entity = false) {
 // Entity ownership is checked by the collector; it is not topic/geography evidence.
 const keyword=criteria.searchMode==='hashtag'?criteria.keyword || '':topicQueries(criteria.keyword || '').find(alias=>hasTopicEvidence([post.caption,...post.hashtags].join(' '),alias)) || criteria.keyword || '';
 const assessment = assessSearchContent(post, {
  ...criteria, keyword: entity ? '' : keyword, searchMode: criteria.searchMode || 'keyword',
  geography: entity ? 'Any location' : criteria.geography || 'Any location', newerThan: from,
  qualityMode: 'topic',
 });
 if (entity) assessment.assessment.topic = {state:'passed',reason:'Post belongs to the selected channel.',evidence:[post.url]};
 if (post.publishedAt && post.publishedAt > to) assessment.assessment.recency = {state:'failed',reason:'The post is newer than the selected window.',evidence:[post.publishedAt]};
 if (!['views','likes','comments','shares'].some(key => typeof post[key as keyof SocialPost] === 'number')) assessment.assessment.metrics = {state:'unknown',reason:'No usable engagement metrics were observed.',evidence:[]};
 const policy=criteria.qualityFilter || {...DEFAULT_CONTENT_FILTER,enabled:criteria.thresholdsEnabled ?? false,minViews:criteria.minViews ?? 1000,minInteractions:criteria.minInteractions ?? 50};
 const quality=assessContentFilter(post,policy);
 assessment.assessment.engagement=quality;
 const dimensions = Object.entries(assessment.assessment);
 const failed = dimensions.filter(([,d])=>d.state==='failed');
 const unknown = dimensions.filter(([,d])=>d.state==='unknown');
 const resultGroup = failed.some(([key])=>['topic','geography','recency'].includes(key)) ? 'Excluded' : quality.state==='failed' ? 'Below Target' : unknown.length ? 'Needs Verification' : failed.length ? 'Excluded' : 'Qualified';
 const reasons = dimensions.filter(([,d])=>d.state!=='passed').map(([,d])=>d.reason);
 return {...assessment,qualityFilter:quality,resultGroup,reviewState:resultGroup,reasons,reason:reasons.join(' ') || 'All selected criteria are supported by observed evidence.'};
}

/** Missing source evidence is distinct from an observed conflicting owner/group. */
export function channelMembership(post:SocialPost,channel:string,row?:any):'passed'|'failed'|'unknown' {
 const clean=canonicalUrl;
 if(channel.includes('/groups/')) {
  const observed=row?.groupUrl || row?.group?.url || post.url.match(/^https?:\/\/[^/]+\/groups\/[^/]+/)?.[0];
  if(!observed)return 'unknown';
  return clean(observed)===clean(channel)?'passed':'failed';
 }
 return !post.authorUrl?'unknown':clean(post.authorUrl)===clean(channel)?'passed':'failed';
}
