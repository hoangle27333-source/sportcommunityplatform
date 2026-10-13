import { canonicalUrl } from '../apify/discovery-quality';
import { topicQueries } from '../apify/account-criteria';
import { hasTopicEvidence } from '../apify/content-quality';
import type { SocialPost } from '../apify/providers';
import type { ContentEvidence } from './types';
/** Only server-configured trusted publishers can establish an external sport role.
 * A single explicit account link is required: tags in a multi-person article remain discovery only.
 */
export function trustedRoleSource(post:SocialPost,topic:string,trustedPublishers:string[]):ContentEvidence['roleSources'][number]|null {
 const publisher=canonicalUrl(post.authorUrl);
 if(post.isRepost || !trustedPublishers.map(canonicalUrl).includes(publisher) || !post.provenance?.runId || !post.provenance.fetchedAt)return null;
 const links=[...new Set((post.publicLinks || []).map(canonicalUrl))].filter(url=>url!==publisher);
 const role=/\bcoach\b|huấn luyện viên|\bhlv\b/i.test(post.caption)?'Coach':/\bathlete\b|vận động viên|\bvđv\b/i.test(post.caption)?'Athlete':null;
 if(links.length!==1 || !role || !topicQueries(topic).some(query=>hasTopicEvidence(post.caption,query)))return null;
 return {url:post.url,accountUrl:links[0],sport:topic,role,quote:post.caption,publisher};
}
