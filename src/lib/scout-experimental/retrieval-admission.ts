import { topicQueries } from '../apify/account-criteria';
import { hasTopicEvidence } from '../apify/content-quality';
import type { SocialProfile } from '../apify/providers';

/** Retrieval hints admit a lead for verification; they never qualify its topic. */
export function hasDiscoveryLead(profile: Pick<SocialProfile, "knownSeed" | "trustedRoleSources" | "name" | "username" | "bio" | "category" | "contentEvidence" | "posts" | "url" | "discoveryPaths">, topic: string): boolean {
  const supports = (text: string) => topicQueries(topic).some(query => hasTopicEvidence(text, query));
  if (profile.knownSeed || profile.trustedRoleSources?.length) return true;
  if (supports([profile.name, profile.username, profile.bio, profile.category].join(' '))) return true;
  if (profile.contentEvidence?.posts.some(post => post.topic)) return true;
  if (profile.posts.some(post => post.authorUrl === profile.url && !post.isRepost && supports([post.caption, ...post.hashtags].join(' ')))) return true;
  // A real media post may have no caption. Its content must still be analyzed.
  if (profile.discoveryPaths?.some(path => path.method === 'content-author') && profile.posts.some(post => post.authorUrl === profile.url && !post.isRepost && (post.videoUrl || post.thumbnailUrl))) return true;
  return !!profile.discoveryPaths?.some(path => ['seed', 'public-connection', 'trusted-role-source'].includes(path.method));
}
