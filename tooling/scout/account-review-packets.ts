import { accountEvidence, assessAccountEntity } from '../../src/lib/apify/account-evidence';
import { evidenceHash } from '../../src/lib/apify/account-model';
import type { SocialProfile } from '../../src/lib/apify/providers';

/** Preparing evidence is not labeling it. Subject links and reviewer decisions stay blank. */
export function prepareReviewPackets(profiles:SocialProfile[]) {
 const seen=new Set<string>();
 return profiles.map(profile=>{
  if(!['Instagram','TikTok','Facebook'].includes(profile?.platform) || !profile.url || typeof profile.name!=='string' || typeof profile.bio!=='string' || !Array.isArray(profile.posts))throw new Error('Expected saved normalized account profiles with original post evidence.');
  const url=new URL(profile.url);if(!['http:','https:'].includes(url.protocol))throw new Error('Invalid source account URL.');
  const key=`${profile.platform}:${profile.url}`;if(seen.has(key))throw new Error('Duplicate source account; merge evidence before preparing review.');seen.add(key);
  const evidence=accountEvidence(profile),rule=assessAccountEntity(profile);
  return {
   profile:structuredClone(profile),
   annotation:{label:null,subjectKey:null,reviewers:[],confirmedAt:null,evidenceUrls:[],evidenceHash:evidenceHash(profile)},
   reviewContext:{accountKey:key,proposedType:rule.suggestedType,proposalStatus:rule.status,proposalSource:'rules',coverage:evidence.coverage,evidenceReferences:[profile.url,...evidence.posts.map(post=>post.url)],missingInformation:rule.missingInformation},
   geographyAnnotation:{confirmedProfileLocation:null,confirmedPostLocations:[],mentionedLocations:[],reviewers:[],confirmedAt:null},
  };
 });
}
