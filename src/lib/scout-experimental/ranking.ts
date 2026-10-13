import { tokens } from '../apify/discovery-quality';
import { topicQueries } from '../apify/account-criteria';
import { hasTopicEvidence } from '../apify/content-quality';
import type { SocialProfile } from '../apify/providers';
function content(p:SocialProfile){return [p.bio,p.category,...p.posts.filter(post=>post.authorUrl===p.url&&!post.isRepost).map(post=>post.caption),...(p.contentEvidence?.posts || []).map(post=>post.excerpt)].join(' ');}
/** Similarity is a retrieval priority only; assessment never consumes this score. */
export function candidatePriority(p:SocialProfile,topic:string,seeds:SocialProfile[]) {
 const queries=topicQueries(topic);
 const supports=(text:string)=>queries.some(query=>hasTopicEvidence(text,query));
 const ownedEvidence=new Set(p.posts.filter(post=>post.authorUrl===p.url&&!post.isRepost&&supports([post.caption,...post.hashtags].join(' '))).map(post=>post.url));
 const text=content(p);const own=new Set(tokens(text));
 const cosine=(seed:SocialProfile)=>{const other=new Set(tokens(content(seed)));const overlap=[...own].filter(t=>other.has(t)).length;return own.size&&other.size?overlap/Math.sqrt(own.size*other.size):0;};
 return (supports(text)?2:0)+Math.min(3,ownedEvidence.size)*0.5+Math.max(0,...seeds.map(cosine));
}
