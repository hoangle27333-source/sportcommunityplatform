import { createHash } from 'node:crypto';
import { canonicalUrl, platformMatches, urlKind } from './discovery-quality';
import type { SocialPost } from './providers';
export type LatestPostReference={accountUrl:string;observedAt:string;reviewers:string[];evidenceUrls:string[];allPublicPosts:boolean;posts:{url:string;publishedAt:string}[]};
export type LatestSampleRun={id:string;platform:string;task:string;actor:string;build:string;build_id:string;state:string;observed_at:string;input:Record<string,any>};
/** Sorted output alone is insufficient: compare owned posts to independently reviewed latest evidence. */
export function verifyLatestPostSample(run:LatestSampleRun,posts:SocialPost[],reference:LatestPostReference,pinnedBuild:string,pinnedBuildId:string=pinnedBuild){
 const reasons:string[]=[];
 if(run.state!=='succeeded' || run.task!=='profile-posts' || !run.id)reasons.push('A succeeded profile-posts run is required.');
 if(!pinnedBuild || ['latest','stable','beta'].includes(pinnedBuild) || run.build!==pinnedBuild || (!pinnedBuildId || run.build_id!==pinnedBuildId))reasons.push('The observed run must use the current immutable pinned build.');
 const account=canonicalUrl(reference.accountUrl),observed=Date.parse(run.observed_at),reviewed=Date.parse(reference.observedAt);
 if(!account || !reference.reviewers?.length || reference.reviewers.some(id=>typeof id!=='string' || !id.trim()) || !reference.evidenceUrls?.length)reasons.push('Independent reviewer identity and source references are required.');
 if(!Number.isFinite(observed) || !Number.isFinite(reviewed) || Math.abs(observed-reviewed)>3600000)reasons.push('Reviewer reference and run observations must be within one hour.');
 if(!Array.isArray(reference.posts) || !reference.posts.length || reference.posts.length>10 || reference.posts.length<10 && reference.allPublicPosts!==true)reasons.push('Reference must identify the latest ten posts, or explicitly confirm the complete shorter public history.');
 if(!platformMatches(run.platform,account) || !['profile','group'].includes(urlKind(account)))reasons.push('Reference must identify an account on the run platform.');
 if(reference.evidenceUrls?.some(url=>typeof url!=='string' || !/^https?:\/\//.test(url)) || !reference.evidenceUrls?.some(url=>canonicalUrl(url)===account))reasons.push('Reviewer evidence must include the original account URL.');
 const expectedActor=run.platform==='Instagram'?'apify~instagram-scraper':run.platform==='TikTok'?'clockworks~tiktok-scraper':account.includes('/groups/')?'apify~facebook-groups-scraper':'apify~facebook-posts-scraper';
 if(run.actor!==expectedActor)reasons.push('Actor does not match the verified profile-posts adapter.');
 const input=run.input || {};
 const requestAccounts=run.platform==='TikTok'?(input.profiles || []).map((name:string)=>canonicalUrl(`https://tiktok.com/@${name.replace(/^@/,'')}`)):run.platform==='Instagram'?(input.directUrls || []).map(canonicalUrl):(input.startUrls || []).map((entry:any)=>canonicalUrl(typeof entry==='string'?entry:entry.url));
 if(requestAccounts.length!==1 || requestAccounts[0]!==account)reasons.push('Provider input must sample only the reference account.');
 const biased=['onlyPostsNewerThan','onlyPostsOlderThan','locations','newerThan','since','until','oldestPostDateUnified','newestPostDate','mostDiggs','leastDiggs','videoSearchDateFilter','videoSearchSorting','searchQueries','hashtags','excludePinnedPosts'];
 if(biased.some(field=>input[field]!==undefined && input[field]!==null && input[field]!==false && !(Array.isArray(input[field]) && !input[field].length)))reasons.push('Latest-post sampling cannot use keyword, date, engagement or pinned-post exclusion filters.');
 if(run.platform==='TikTok' && (input.profileSorting!=='latest' || JSON.stringify(input.profileScrapeSections)!==JSON.stringify(['videos'])))reasons.push('TikTok sampling must explicitly use latest owned videos.');
 if((input.resultsLimit ?? input.resultsPerPage)!==10)reasons.push('The provider sample must request ten posts.');
 const refs=reference.posts || [],expected=new Map<string,number>();
 for(const post of refs){const url=canonicalUrl(post.url),date=Date.parse(post.publishedAt);if(!url || !Number.isFinite(date) || expected.has(url))reasons.push('Reference contains invalid dates or duplicate identities.');else expected.set(url,date);}
 const unique=new Map<string,SocialPost>();
 for(const post of posts){
  if(canonicalUrl(post.authorUrl)!==account || post.isRepost)reasons.push('Provider returned another account or repost evidence.');
  if(!Number.isFinite(Date.parse(post.publishedAt || '')))reasons.push('Provider returned a post without a publication timestamp.');
  const url=canonicalUrl(post.url);if(!url)reasons.push('Provider returned an invalid post identity.');else if(!unique.has(url))unique.set(url,post);
 }
 const latest=[...unique.values()].sort((a,b)=>Date.parse(b.publishedAt || '')-Date.parse(a.publishedAt || '')).slice(0,10);
 if(latest.length!==expected.size || latest.some(post=>expected.get(canonicalUrl(post.url))!==Date.parse(post.publishedAt || '')))reasons.push('Observed owned-post sample does not match the independently reviewed latest list.');
 return {option:'latestProfilePosts' as const,build:pinnedBuild,buildId:pinnedBuildId,runId:run.id,observedAt:run.observed_at,verified:reasons.length===0,reasons:[...new Set(reasons)],count:latest.length,referenceHash:createHash('sha256').update(JSON.stringify(reference)).digest('hex')};
}
