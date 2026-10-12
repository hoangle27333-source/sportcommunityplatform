import { tiktokDateWindow, type VerifiedSearchOptions } from './search-input';
import { savedProviderRows } from './stored-evidence';
import {ACTOR_CONTRACTS} from './registry';
import { createAdminClient } from '@/lib/supabase/admin';
import { canonicalUrl, platformMatches, urlKind } from './discovery-quality';
import { executePlan, capabilityKey, type Provenance } from './runtime';
import { ScoutError, PendingScout } from './errors';
export { ScoutError, PendingScout } from './errors';
export type ScoutTask = 'profiles' | 'communities' | 'hashtag' | 'keyword' | 'profile-posts' | 'profile-details' | 'comments';
export type Metric = number | null;
export interface SocialPost { videoUrl?:string; videoDuration?:number; publicLinks?:string[]; id: string; caption: string; url: string; authorUrl: string; author: string; username: string; views: Metric; likes: Metric; comments: Metric; hashtags: string[]; contentType: string; thumbnailUrl: string; publishedAt?: string; location?: string; isRepost?: boolean; provenance?: Provenance; }
export interface SocialProfile { providerAccountIds?:string[]; identityAliases?:string[]; contentEvidence?:import('../scout-experimental/types').ContentEvidence; discoveryPaths?:import('../scout-experimental/types').DiscoveryPath[]; knownSeed?:boolean; username: string; name: string; bio: string; url: string; platform: string; followers: Metric; members?: Metric; latestPostsVerified?: boolean; accountEntityAssessment?: import('./account-evidence').EntityAssessment; avgViews: Metric; likes: Metric; comments: Metric; er: Metric; avatarUrl: string; category: string; entityType: string; location: string; posts: SocialPost[]; provenance?: Provenance; derivedMetrics?: { viewsSample: number; erSample: number; formula: string }; }
export function metric(...values: any[]): Metric { for (const v of values) { if (v !== null && v !== undefined && v !== '' && Number.isFinite(Number(v)) && Number(v) >= 0) return Number(v); } return null; }
export function providerPlans(platform: string, task: ScoutTask, query: string, limit: number, geography = '') {
  if (!['Instagram', 'Facebook', 'TikTok'].includes(platform)) throw new ScoutError('This platform is unavailable for scouting', 'UNSUPPORTED', 400);
  if (task === 'comments') return [{ actor: platform === 'Facebook' ? 'apify~facebook-comments-scraper' : platform === 'TikTok' ? 'clockworks~tiktok-comments-scraper' : 'apify~instagram-scraper', input: platform === 'Instagram' ? {directUrls:[query],resultsType:'comments',resultsLimit:limit} : platform === 'Facebook' ? {startUrls:[{url:query}],resultsLimit:limit} : {postURLs:[query],commentsPerPost:limit} }];
  const posts = ['hashtag', 'keyword', 'profile-posts'].includes(task);
  if (platform === 'Instagram') {
    if (task === 'keyword') throw new ScoutError('Instagram supports hashtag search or a profile URL. Select Hashtag search.', 'UNSUPPORTED', 400);
    let input: Record<string, any>;
    if (task === 'hashtag') input = { directUrls: [`https://www.instagram.com/explore/tags/${query.replace(/^#/, '')}/`], resultsType: 'posts', resultsLimit: limit };
    else if (task === 'profile-details') input = { directUrls: [query], resultsType: 'details', resultsLimit: 1 };
    else if (task === 'profile-posts') input = { directUrls: [query], resultsType: 'posts', resultsLimit: limit };
    else input = { search: query, searchType: 'user', resultsType: 'details', searchLimit: limit, resultsLimit: 1 };
    return [{ actor: 'apify~instagram-scraper', input }];
  }
  if (platform === 'TikTok') return [{ actor: 'clockworks~tiktok-scraper', input: task === 'hashtag' ? { hashtags: [query.replace(/^#/, '')], resultsPerPage: limit } : ['profile-posts', 'profile-details'].includes(task) ? { profiles: [new URL(query).pathname.split('/').filter(Boolean)[0].replace(/^@/, '')], resultsPerPage: limit } : { searchQueries: [query], searchSection: posts ? '/video' : '/user', ...(posts ? {resultsPerPage:limit} : {maxProfilesPerQuery:limit}) } }];
  if(task === 'profile-details' && urlKind(query)==='group') throw new ScoutError('Facebook Group details are unavailable until the group contract is verified.','CAPABILITY_UNAVAILABLE',503);
  if (task === 'profile-details') return [{ actor: 'apify~facebook-pages-scraper', input: { startUrls: [{ url: query }] } }];
  if (task === 'profile-posts') return [{ actor: query.includes('/groups/') ? 'apify~facebook-groups-scraper' : 'apify~facebook-posts-scraper', input: { startUrls: [{ url: query }], resultsLimit: limit } }];
  const plans: { actor: string; input: Record<string, any> }[] = [{ actor: 'apify~facebook-search-scraper', input: { categories: [query], locations: [], searchType: posts ? 'posts' : task === 'communities' ? 'pages' : 'profiles', resultsLimit: limit } }];
  // Creator Pages can represent individual people, not just organizations.
  if (task === 'profiles') plans.push({ actor: 'apify~facebook-search-scraper', input: { categories: [query], locations: [], searchType: 'pages', resultsLimit: limit } });
  if (task === 'communities') {
    plans.push({ actor: 'parseforge~facebook-groups-search-scraper', input: { searchQueries: [query], maxItems: limit, proxyConfiguration: { useApifyProxy: true, apifyProxyGroups: ['RESIDENTIAL'] } } });
  }
  return plans;
}
export function parseProfile(it: any, platform: string): SocialProfile | null {
  const a = it.authorMeta || it.user || (typeof it.author === 'object' ? it.author : {}) || {};
  const username = String(it.username || it.pageName || it.uniqueId || a.uniqueId || (platform === 'TikTok' ? a.name : '') || '').replace(/^@/, '');
  // Facebook search output uses facebookUrl for the shared search page and url
  // for the actual result. Never let the search context become account identity.
  const urls = [it.profileUrl, it.groupUrl, it.url, it.pageUrl, it.facebookUrl];
  if (platform !== 'Facebook' && /^[\w.]+$/.test(username)) urls.push(platform === 'TikTok' ? `https://www.tiktok.com/@${username}` : `https://www.${platform.toLowerCase()}.com/${username}/`);
  const url = urls.map(value => canonicalUrl(value)).find(value => platformMatches(platform, value) && ['profile', 'group'].includes(urlKind(value)));
  if (!url) return null;
  const posts = (it.latestPosts || []).map((post: any) => parsePost({ ...post, ownerUsername: post.ownerUsername || username, ownerFullName: post.ownerFullName || it.fullName || it.name }, platform)).filter(Boolean) as SocialPost[];
  const followers = metric(it.followersCount, it.followers, a.fans, a.followers);
  const observedViews = posts.filter(p => p.views !== null);
  const interactions = posts.filter(p => p.likes !== null && p.comments !== null);
  const avgViews = observedViews.length ? Math.round(observedViews.reduce((n, p) => n + p.views!, 0) / observedViews.length) : null;
  const er = followers !== null && followers > 0 && interactions.length ? Number((interactions.reduce((n, p) => n + p.likes! + p.comments!, 0) / interactions.length / followers * 100).toFixed(2)) : null;
  const provenance=it._provenance ? {...it._provenance,missingFields:followers===null ? ['followers'] : []} : undefined;
  return { username: username || new URL(url).searchParams.get('id') || new URL(url).pathname.split('/').filter(Boolean).pop() || it.id, name: String(it.fullName || it.name || it.title || a.nickName || a.nickname || username), bio: String(it.biography || it.bio || it.description || it.intro || a.signature || ''), url, platform,
    followers, members: metric(it.membersCount, it.memberCount, it.members), avgViews, likes: null, comments: null, er, provenance, derivedMetrics: {viewsSample:observedViews.length,erSample:interactions.length,formula:"mean(likes + comments) / followers * 100"},
    avatarUrl: it.profilePicUrlHD || it.profilePicUrl || it.profilePicture || it.profilePictureUrl || it.imageUrl || a.avatar || '', category: String(it.categoryName || it.businessCategoryName || it.category || (Array.isArray(it.categories) ? it.categories.join(' · ') : '') || it.additionalProperties?.category || ''), entityType: String(it.entityType || it.type || '').toLowerCase(), location: String(it.location?.name || (typeof it.location === 'string' ? it.location : '') || (typeof it.address === 'string' ? it.address : [it.address?.city,it.address?.country].filter(Boolean).join(', ')) || it.additionalProperties?.address || ''), posts };
}
export function parsePost(it: any, platform: string): SocialPost | null {
  const a = it.authorMeta || it.user || (typeof it.author === 'object' ? it.author : {}) || {};
  const url = canonicalUrl(it.webVideoUrl || it.postUrl || it.url || it.facebookUrl || '');
  if (!url || !platformMatches(platform, url) || !['post','reel','story','watch'].includes(urlKind(url))) return null;
  const username = String(it.ownerUsername || a.name || a.uniqueId || it.username || '');
  const caption = String(it.caption || it.text || it.description || '');
  const referenceTags = (it.textReferences || []).flatMap((ref: any) => { try { const u = new URL(ref.url); return platformMatches('Facebook',u.toString()) && /^\/hashtag\/[^/]+\/?$/.test(u.pathname) ? [decodeURIComponent(u.pathname.split('/')[2])] : []; } catch { return []; } });
  const tags = [...(it.hashtags || []), ...referenceTags].map((h: any) => typeof h === 'string' ? h : h.name || h.title || '');
  const authorCandidate = canonicalUrl(it.ownerProfileUrl || it.authorUrl || a.profileUrl || it.user?.url || (username ? platform === 'TikTok' ? `https://www.tiktok.com/@${username}` : `https://www.${platform.toLowerCase()}.com/${username}/` : it.user?.url || ''));
  const authorUrl=platformMatches(platform,authorCandidate) && ['profile','group'].includes(urlKind(authorCandidate))?authorCandidate:'';
  const rawDate = it.time || it.createTimeISO || it.timestamp || it.createTime;
  const date = typeof rawDate === 'number' ? (Number.isFinite(rawDate) && Number.isFinite(new Date(rawDate < 1e12 ? rawDate * 1000 : rawDate).getTime()) ? new Date(rawDate < 1e12 ? rawDate * 1000 : rawDate).toISOString() : undefined) : rawDate;
  const publicLinks=(it.textReferences || []).flatMap((r:any)=>{const link=canonicalUrl(r.url || '');return platformMatches(platform,link) && ['profile','group'].includes(urlKind(link))?[link]:[];});
  return { videoUrl:typeof it.videoUrl==='string'?it.videoUrl:typeof it.videoMeta?.downloadAddr==='string'?it.videoMeta.downloadAddr:undefined,videoDuration:metric(it.videoDuration,it.videoMeta?.duration) ?? undefined,publicLinks,publishedAt: date && Number.isFinite(Date.parse(date)) ? new Date(date).toISOString() : undefined, isRepost: it.isRepost === true || it.isReposted === true, location: typeof it.location === 'string' ? it.location : it.location?.name || it.locationName || it.place?.name || it.locationMeta?.city || it.locationMeta?.address || '', provenance: it._provenance, id: String(it.id || it.postId || url), caption, url, authorUrl, author: String(it.ownerFullName || a.nickName || a.nickname || it.user?.name || username || 'Unknown'), username,
    views: metric(it.videoViewCount, it.videoPlayCount, it.playCount, it.views), likes: metric(it.likesCount, it.diggCount, it.likes, it.reactionsCount), comments: metric(it.commentsCount, it.commentCount, it.comments),
    hashtags: [...new Set<string>([...tags, ...(caption.match(/#[\p{L}\p{N}_]+/gu) || []).map(t => t.slice(1))])],
    contentType: platform === 'TikTok' ? 'Video' : /\/reels?\//.test(url) || it.productType === 'clips' || it.type === 'Reel' ? 'Reels' : 'Post', thumbnailUrl: it.displayUrl || it.thumbnailUrl || it.videoMeta?.coverUrl || '' };
}
export async function scrape(sessionId: string, platform: string, task: ScoutTask, query: string, limit: number, geography = '', options: { newerThan?: string; urls?: string[]; queryVariants?: string[]; searchPlan?: { keys:string[]; builds:Record<string,string>; options:Record<string,VerifiedSearchOptions> }; qualityMode?:string; recentDays?:number; boundedSearch?:boolean; latestSample?:boolean } = {}): Promise<any[]> {
  const saved = savedProviderRows(platform, task, options.urls || (task==='profile-details' ? [query] : undefined));
  if (saved !== undefined) return saved;
  if (!process.env.APIFY_TOKEN) throw new ScoutError('Apify is not configured.', 'NOT_CONFIGURED',503);
  let plans = providerPlans(platform,task,query,limit,geography);
  if(options.searchPlan)plans=plans.filter(plan=>options.searchPlan!.keys.includes(capabilityKey(plan,task)));
  if(options.boundedSearch)plans=plans.slice(0,limit);
  if(!plans.length)throw new ScoutError('No verified search branch is available.', 'CAPABILITY_UNVERIFIED',503);
  if(options.boundedSearch)plans.forEach((plan,index)=>{const allocated=Math.floor(limit/plans.length)+(index<limit%plans.length?1:0);if(plan.input.resultsLimit)plan.input.resultsLimit=allocated;if(plan.input.maxItems)plan.input.maxItems=allocated;});
  for(const plan of plans) {
    const key=capabilityKey(plan,task);const verified=options.searchPlan?.options[key];
    if(options.searchPlan) {
      const {data:cap,error}=await createAdminClient().from('scout_provider_capabilities').select('build,verified').eq('capability_key',key).maybeSingle();if(error)throw error;
      if(!cap?.verified || cap.build!==options.searchPlan.builds[key])throw new ScoutError('The verified provider build changed. Review a new search plan.', 'PLAN_STALE',409);
    }
    if(platform==='Facebook' && plan.input.locations && verified?.facebookLocations && geography)plan.input.locations=geography.split(', ').filter(value=>!['Nationwide','Any location'].includes(value));
    if(platform==='TikTok' && task==='keyword' && verified?.tiktokVideoFilters) {
      plan.input.videoSearchSorting=options.qualityMode==='high-engagement'?'MOST_LIKED':'MOST_RELEVANT';
      plan.input.videoSearchDateFilter=tiktokDateWindow(options.recentDays ?? 7);
    }
  }
  if (platform === 'Facebook' && options.queryVariants?.length) for (const plan of plans) { if (plan.input.categories) plan.input.categories = [...new Set([query, ...options.queryVariants])]; if (plan.input.searchQueries) plan.input.searchQueries = [...new Set([query, ...options.queryVariants])]; }
  if(options.urls && options.urls.length>1) {
    const {data:cap,error}=await createAdminClient().from('scout_provider_capabilities').select('receipt,verified').eq('capability_key',capabilityKey(plans[0],task)).maybeSingle();if(error) throw error;
    if(!cap?.verified || !cap.receipt?.supportsBatch) {
      const rows:any[]=[];let pending=false;
      for(const url of options.urls) try{rows.push(...await scrape(sessionId,platform,task,url,limit,geography,{...options,urls:undefined}));}catch(e){if(e instanceof PendingScout)pending=true;else throw e;}
      if(pending)throw new PendingScout();return rows;
    }
  }
  const rows: any[] = []; let pending=false; const failures: Error[] = [];
  for (const plan of plans) {
    if(options.urls && task === 'profile-details') {
      if(options.urls.length>ACTOR_CONTRACTS[plan.actor].batchSize) throw new ScoutError('Profile batch exceeds the adapter limit.','INVALID_BATCH',400);
      if(platform === 'Instagram') plan.input.directUrls=options.urls;
      else if(platform === 'Facebook') plan.input.startUrls=options.urls.map(url=>({url}));
      else plan.input.profiles=options.urls.map(url=>new URL(url).pathname.split('/').filter(Boolean)[0].replace(/^@/,''));
    }
    if(options.latestSample && platform==='TikTok' && task==='profile-posts' && options.searchPlan?.options[capabilityKey(plan,task)]?.latestProfilePosts) {plan.input.profileSorting='latest';plan.input.profileScrapeSections=['videos'];}
    if(options.newerThan && ['profile-posts','hashtag'].includes(task) && ACTOR_CONTRACTS[plan.actor]?.dateFilter) {
      const {data:cap,error}=await createAdminClient().from('scout_provider_capabilities').select('receipt,verified').eq('capability_key',capabilityKey(plan,task)).maybeSingle();if(error)throw error;
      if(cap?.verified && cap.receipt?.supportsDateFilter)plan.input[ACTOR_CONTRACTS[plan.actor].dateFilter!]=options.newerThan;
    }
    try { rows.push(...await executePlan(sessionId,platform,task,plan)); } catch(e) {
      if(e instanceof PendingScout) pending=true;
      else if(platform==='Facebook' && task==='communities' && e instanceof ScoutError && !['START_UNKNOWN','RESERVATION_FAILED'].includes(e.code)) failures.push(e as Error);
      else throw e;
    }
  }
  if(pending) throw new PendingScout();
  if(failures.length === plans.length) throw failures[0];
  if(failures.length) {
    const warning = 'Facebook community search is partial: ' + failures.map(e=>e.message).join(' ');
    for(const row of rows) row._provenance={...row._provenance,warnings:[...(row._provenance?.warnings || []),warning]};
    const {error}=await createAdminClient().from('scout_sessions').update({warnings:[warning]}).eq('id',sessionId);
    if(error) throw error;
  }
  return rows;
}

/** Search and detail observations may be combined only for the same account. */
export function mergeProfileEvidence(base:SocialProfile, detail:SocialProfile):SocialProfile {
 if(base.platform!==detail.platform || canonicalUrl(base.url)!==canonicalUrl(detail.url))return base;
 const posts=[...new Map([...base.posts,...detail.posts].filter(p=>p.authorUrl===base.url).map(p=>[p.url,p])).values()];
 return {...base,providerAccountIds:detail.providerAccountIds || base.providerAccountIds,identityAliases:[...new Set([...(base.identityAliases || []),...(detail.identityAliases || [])])],name:detail.name && detail.name!==detail.username?detail.name:base.name,bio:detail.bio || base.bio,category:detail.category || base.category,entityType:detail.entityType || base.entityType,location:detail.location || base.location,avatarUrl:detail.avatarUrl || base.avatarUrl,followers:detail.followers ?? base.followers,members:detail.members ?? base.members,avgViews:detail.avgViews ?? base.avgViews,er:detail.er ?? base.er,posts,latestPostsVerified:detail.latestPostsVerified || base.latestPostsVerified,provenance:detail.provenance || base.provenance};
}
