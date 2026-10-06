import {ACTOR_CONTRACTS} from './registry';
import { createAdminClient } from '@/lib/supabase/admin';
import { canonicalUrl, platformMatches, urlKind } from './discovery-quality';
import { executePlan, capabilityKey, type Provenance } from './runtime';
import { ScoutError, PendingScout } from './errors';
export { ScoutError, PendingScout } from './errors';
export type ScoutTask = 'profiles' | 'communities' | 'hashtag' | 'keyword' | 'profile-posts' | 'profile-details' | 'comments';
export type Metric = number | null;
export interface SocialPost { id: string; caption: string; url: string; authorUrl: string; author: string; username: string; views: Metric; likes: Metric; comments: Metric; hashtags: string[]; contentType: string; thumbnailUrl: string; publishedAt?: string; location?: string; provenance?: Provenance; }
export interface SocialProfile { username: string; name: string; bio: string; url: string; platform: string; followers: Metric; avgViews: Metric; likes: Metric; comments: Metric; er: Metric; avatarUrl: string; category: string; entityType: string; location: string; posts: SocialPost[]; provenance?: Provenance; derivedMetrics?: { viewsSample: number; erSample: number; formula: string }; }
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
  const plans: { actor: string; input: Record<string, any> }[] = [{ actor: 'apify~facebook-search-scraper', input: { categories: [query], locations: geography ? [geography === 'Nationwide' ? 'Vietnam' : geography] : [], searchType: posts ? 'posts' : task === 'communities' ? 'pages' : 'profiles', resultsLimit: limit } }];
  // Creator Pages can represent individual people, not just organizations.
  if (task === 'profiles') plans.push({ actor: 'apify~facebook-search-scraper', input: { categories: [query], locations: geography ? [geography === 'Nationwide' ? 'Vietnam' : geography] : [], searchType: 'pages', resultsLimit: limit } });
  if (task === 'communities') {
    if (process.env.APIFY_FACEBOOK_GROUP_SEARCH_VERIFIED !== 'true') throw new ScoutError('Facebook Group search is not yet verified. Configure and verify the Group provider before enabling community discovery.', 'GROUP_PROVIDER_UNVERIFIED', 503);
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
  const followers = metric(it.followersCount, it.followers, it.membersCount, it.memberCount, it.members, a.fans, a.followers);
  const observedViews = posts.filter(p => p.views !== null);
  const interactions = posts.filter(p => p.likes !== null && p.comments !== null);
  const avgViews = observedViews.length ? Math.round(observedViews.reduce((n, p) => n + p.views!, 0) / observedViews.length) : null;
  const er = followers !== null && followers > 0 && interactions.length ? Number((interactions.reduce((n, p) => n + p.likes! + p.comments!, 0) / interactions.length / followers * 100).toFixed(2)) : null;
  const provenance=it._provenance ? {...it._provenance,missingFields:followers===null ? ['followers'] : []} : undefined;
  return { username: username || new URL(url).searchParams.get('id') || new URL(url).pathname.split('/').filter(Boolean).pop() || it.id, name: String(it.fullName || it.name || it.title || a.nickName || a.nickname || username), bio: String(it.biography || it.bio || it.description || it.intro || a.signature || ''), url, platform,
    followers, avgViews, likes: null, comments: null, er, provenance, derivedMetrics: {viewsSample:observedViews.length,erSample:interactions.length,formula:"mean(likes + comments) / followers * 100"},
    avatarUrl: it.profilePicUrlHD || it.profilePicUrl || it.profilePicture || it.profilePictureUrl || it.imageUrl || a.avatar || '', category: String(it.categoryName || it.businessCategoryName || it.category || ''), entityType: String(it.entityType || it.type || '').toLowerCase(), location: String(it.location?.name || it.address?.city || (typeof it.location === 'string' ? it.location : '') || ''), posts };
}
export function parsePost(it: any, platform: string): SocialPost | null {
  const a = it.authorMeta || it.user || (typeof it.author === 'object' ? it.author : {}) || {};
  const url = canonicalUrl(it.webVideoUrl || it.postUrl || it.url || it.facebookUrl || '');
  if (!url || !platformMatches(platform, url) || !['post','reel','story','watch'].includes(urlKind(url))) return null;
  const username = String(it.ownerUsername || a.name || a.uniqueId || it.username || '');
  const caption = String(it.caption || it.text || it.description || '');
  const tags = (it.hashtags || []).map((h: any) => typeof h === 'string' ? h : h.name || h.title || '');
  const authorUrl = canonicalUrl(it.ownerProfileUrl || a.profileUrl || (username ? platform === 'TikTok' ? `https://www.tiktok.com/@${username}` : `https://www.${platform.toLowerCase()}.com/${username}/` : it.user?.url || ''));
  const rawDate = it.time || it.createTimeISO || it.timestamp || it.createTime;
  const date = typeof rawDate === 'number' ? (Number.isFinite(rawDate) && Number.isFinite(new Date(rawDate < 1e12 ? rawDate * 1000 : rawDate).getTime()) ? new Date(rawDate < 1e12 ? rawDate * 1000 : rawDate).toISOString() : undefined) : rawDate;
  return { publishedAt: date && Number.isFinite(Date.parse(date)) ? new Date(date).toISOString() : undefined, location: typeof it.location === 'string' ? it.location : it.location?.name || it.locationMeta?.city || it.locationMeta?.address || '', provenance: it._provenance, id: String(it.id || it.postId || url), caption, url, authorUrl, author: String(it.ownerFullName || a.nickName || a.nickname || it.user?.name || username || 'Unknown'), username,
    views: metric(it.videoViewCount, it.videoPlayCount, it.playCount, it.views), likes: metric(it.likesCount, it.diggCount, it.likes, it.reactionsCount), comments: metric(it.commentsCount, it.commentCount, it.comments),
    hashtags: [...new Set<string>([...tags, ...(caption.match(/#[\p{L}\p{N}_]+/gu) || []).map(t => t.slice(1))])],
    contentType: platform === 'TikTok' ? 'Video' : /\/reels?\//.test(url) || it.productType === 'clips' || it.type === 'Reel' ? 'Reels' : 'Post', thumbnailUrl: it.displayUrl || it.thumbnailUrl || it.videoMeta?.coverUrl || '' };
}
export async function scrape(sessionId: string, platform: string, task: ScoutTask, query: string, limit: number, geography = '', options: { newerThan?: string; urls?: string[] } = {}): Promise<any[]> {
  if (!process.env.APIFY_TOKEN) throw new ScoutError('Apify is not configured.', 'NOT_CONFIGURED',503);
  const plans = providerPlans(platform,task,query,limit,geography);
  if(options.urls && options.urls.length>1) {
    const {data:cap,error}=await createAdminClient().from('scout_provider_capabilities').select('receipt,verified').eq('capability_key',capabilityKey(plans[0],task)).maybeSingle();if(error) throw error;
    if(!cap?.verified || !cap.receipt?.supportsBatch) {
      const rows:any[]=[];let pending=false;
      for(const url of options.urls) try{rows.push(...await scrape(sessionId,platform,task,url,limit,geography));}catch(e){if(e instanceof PendingScout)pending=true;else throw e;}
      if(pending)throw new PendingScout();return rows;
    }
  }
  const rows: any[] = []; let pending=false;
  for (const plan of plans) {
    if(options.urls && task === 'profile-details') {
      if(options.urls.length>ACTOR_CONTRACTS[plan.actor].batchSize) throw new ScoutError('Profile batch exceeds the adapter limit.','INVALID_BATCH',400);
      if(platform === 'Instagram') plan.input.directUrls=options.urls;
      else if(platform === 'Facebook') plan.input.startUrls=options.urls.map(url=>({url}));
      else plan.input.profiles=options.urls.map(url=>new URL(url).pathname.split('/').filter(Boolean)[0].replace(/^@/,''));
    }
    if(options.newerThan && ['profile-posts','hashtag'].includes(task) && ACTOR_CONTRACTS[plan.actor]?.dateFilter) {
      const {data:cap,error}=await createAdminClient().from('scout_provider_capabilities').select('receipt,verified').eq('capability_key',capabilityKey(plan,task)).maybeSingle();if(error)throw error;
      if(cap?.verified && cap.receipt?.supportsDateFilter)plan.input[ACTOR_CONTRACTS[plan.actor].dateFilter!]=options.newerThan;
    }
    try { rows.push(...await executePlan(sessionId,platform,task,plan)); } catch(e) { if(e instanceof PendingScout) pending=true; else throw e; }
  }
  if(pending) throw new PendingScout();
  return rows;
}
