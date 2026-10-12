import { parseProfile, parsePost, mergeProfileEvidence, type SocialProfile } from '../../src/lib/apify/providers';
import { canonicalUrl } from '../../src/lib/apify/discovery-quality';
import type { SavedProviderRun } from '../../src/lib/apify/stored-evidence';

/** Reconstruct accounts from final saved runs. Does not execute or poll a provider. */
export function profilesFromSavedRuns(runs:SavedProviderRun[]) {
 const profiles=new Map<string,SocialProfile>();
 for(const run of runs){
  if(run.state!=='succeeded' || !['profiles','communities','profile-details'].includes(run.task))continue;
  for(const row of run.normalized_rows ?? run.raw_rows ?? []){
   const profile=parseProfile(row,run.platform);if(!profile)continue;
   const key=`${profile.platform}:${canonicalUrl(profile.url)}`,existing=profiles.get(key);
   profiles.set(key,existing?mergeProfileEvidence(existing,profile):profile);
  }
 }
 for(const run of runs){
  if(run.state!=='succeeded' || !['profile-posts','keyword','hashtag'].includes(run.task))continue;
  for(const row of run.normalized_rows ?? run.raw_rows ?? []){
   const post=parsePost(row,run.platform);if(!post?.authorUrl)continue;
   const profile=profiles.get(`${run.platform}:${canonicalUrl(post.authorUrl)}`);if(!profile)continue;
   if(!profile.posts.some(existing=>canonicalUrl(existing.url)===canonicalUrl(post.url)))profile.posts.push(post);
  }
 }
 // Ordering completeness requires an independent receipt; saved post hits alone cannot prove it.
 for(const profile of profiles.values())profile.latestPostsVerified=false;
 return [...profiles.values()];
}
