import { canonicalUrl, normalized, tokens } from './discovery-quality';
import { canonicalGeography, unrestrictedGeography } from './geography';
import type { SocialPost, SocialProfile } from './providers';

export const ENTITY_TYPES = ['Individual', 'Community', 'Club', 'Brand/Business', 'Media/Event', 'Other', 'Unknown'] as const;
export type EntityType = typeof ENTITY_TYPES[number];
export const ACCOUNT_POLICY_VERSION = 5;
export type EntityAssessment = { suggestedType: EntityType; reviewedType?: EntityType; status: 'supported' | 'uncertain' | 'unavailable'; source: 'rules' | 'model' | 'review'; policyKey?:string; scores?: Partial<Record<EntityType, number>>; evidence: string[]; missingInformation: string[]; modelVersion: string; evidenceHash?: string };
export type LocationObservation = { raw: string; canonical: string | null; source: 'profile' | 'geotag' | 'mention'; postId?: string; postUrl?: string; publishedAt?: string; status: 'observed' | 'needs-verification' | 'unresolved' };
export type PostCoverage = { requested: number; collected: number; dated: number; partial: boolean; latestVerified: boolean };

export function latestOwnedPosts(profile: SocialProfile, limit = 10) {
  const unique = new Map<string, SocialPost>();
  for (const post of profile.posts) {
    if (canonicalUrl(post.authorUrl) !== canonicalUrl(profile.url) || !post.authorUrl || post.isRepost) continue;
    const key = canonicalUrl(post.url); if (!key) continue;
    if (!unique.has(key)) unique.set(key, post);
  }
  return [...unique.values()].sort((a, b) => (Date.parse(b.publishedAt || '') || 0) - (Date.parse(a.publishedAt || '') || 0)).slice(0, limit);
}
export function accountEvidence(profile: SocialProfile) {
  const posts = latestOwnedPosts(profile);
  const dated=posts.filter(p=>Number.isFinite(Date.parse(p.publishedAt || ''))).length;
  const coverage: PostCoverage = { requested: 10, collected: posts.length, dated, latestVerified: profile.latestPostsVerified === true, partial: posts.length < 10 || dated < posts.length || profile.latestPostsVerified !== true };
  return { posts, coverage };
}
export function legacyClassification(type: EntityType): 'Individual' | 'Community' | 'Brand/Business' | 'Unknown' {
  return type === 'Club' ? 'Community' : ['Individual', 'Community', 'Brand/Business'].includes(type) ? type as 'Individual' | 'Community' | 'Brand/Business' : 'Unknown';
}
export function legacyEntityType(value:string):EntityType {
 if(value==='Individual')return 'Individual';
 if(['Community','Club/Community','Club'].includes(value))return 'Community';
 if(['Business','Brand/Business'].includes(value))return 'Brand/Business';
 return 'Unknown';
}
export function selectedEntityTypes(target: string, selected?: EntityType[]): EntityType[] {
  return selected?.length ? [...new Set(selected)] : target === 'Communities & Clubs' ? ['Community', 'Club'] : ['Individual'];
}
export function assessAccountEntity(profile: SocialProfile): EntityAssessment {
  const posts = latestOwnedPosts(profile, 5);
  const identity = tokens(`${profile.name} ${profile.category}`).join(' ');
  const bio = tokens(profile.bio).join(' ');
  const profileText = `${identity} ${bio}`;
  const selling = /\b(book now|book a session|order now|buy now|price list|our services|our classes|we offer|shop now|dat lich|dat hang|bang gia|mua ngay|ban hang|lien he mua|dang ky khoa hoc)\b/;
  const salesPosts = posts.filter(p => selling.test(tokens(p.caption).join(' ')) && !/\b(sponsored|paid partnership|quang cao|tai tro)\b/.test(tokens(p.caption).join(' ')));
  let type: EntityType = 'Unknown';
  const person = profile.entityType === 'person' || /\b(digital creator|athlete|coach|personal trainer|influencer|huan luyen vien|vdv)\b/.test(identity) || /^(i am|i m|toi la)\b/.test(bio) || /^(running |pickleball )?(coach|athlete|creator)\b/.test(bio);
  const clubName = /\b(club|clb|cau lac bo|sports team|running team)\b/.test(identity);
  const communityName = /\b(community|cong dong|hoi nhom)\b/.test(identity);
  const organization = /\b(join us|join our|members|membership|weekly|every saturday|every sunday|lich tap|lich sinh hoat|thanh vien|gia nhap|hang tuan|ban quan ly)\b/;
  const organized = organization.test(bio) || posts.some(p => organization.test(tokens(p.caption).join(' ')));
  const evidence: string[] = [];
  if (selling.test(profileText) || salesPosts.length >= 2 || /\b(company|business|shop|store|retailer|gym|fitness center|fitness centre|studio|academy)\b/.test(identity)) {
    type = 'Brand/Business'; evidence.push([profile.name,profile.category,profile.bio].filter(Boolean).join('\n'), ...salesPosts.map(p => p.url));
  } else if (/\b(news|media|magazine|tv channel|sports event|festival|giai dau|bao chi)\b/.test(identity)) {
    type = 'Media/Event'; evidence.push(profile.name, profile.category);
  } else if (person) { type = 'Individual'; evidence.push(profile.name, profile.bio, profile.category); }
  else if (clubName && organized) { type = 'Club'; evidence.push(profile.name, profile.bio, ...posts.filter(p => organization.test(tokens(p.caption).join(' '))).map(p => p.url)); }
  else if (communityName || profile.entityType === 'group' || profile.url.includes('/groups/')) { type = 'Community'; evidence.push(profile.name, profile.category, profile.url); }
  // A club-like name alone is an unverified suggestion, never a qualified identity.
  else if (clubName) { type = 'Club'; evidence.push(profile.name); }
  const supported = type !== 'Unknown' && !(type === 'Club' && !organized);
  return { suggestedType: type, status: supported ? 'supported' : 'uncertain', source: 'rules', evidence: evidence.filter(Boolean), missingInformation: supported ? [] : [type === 'Club' ? 'Club membership or recurring activities are unverified.' : 'Account identity is unverified.'], modelVersion: 'account-rules-5' };
}

const PLACE_ALIASES: Record<string, string[]> = {
  'Ho Chi Minh City': ['ho chi minh city', 'ho chi minh', 'tp hcm', 'tp ho chi minh', 'hcmc', 'hcm', 'saigon', 'sai gon', 'tphcm'],
  Hanoi: ['hanoi', 'ha noi'], 'Da Nang': ['da nang', 'danang'], Vietnam: ['vietnam', 'viet nam'],
  'Hai Phong':['hai phong','haiphong'], 'Can Tho':['can tho','cantho'], Hue:['hue'],
  'Da Lat':['da lat','dalat'], 'Nha Trang':['nha trang','nhatrang'], 'Vung Tau':['vung tau','vungtau'],
  'Binh Duong':['binh duong','binhduong'], 'Dong Nai':['dong nai','dongnai'],
};
function places(raw: string): string[] {
  const text = ` ${normalized(raw)} `;
  return Object.entries(PLACE_ALIASES).filter(([, aliases]) => aliases.some(alias => text.includes(` ${alias} `))).map(([place]) => place);
}
function matches(place: string | null, scope: string) {
  if (!place) return false;
  return normalized(place) === normalized(scope) || scope === 'Vietnam' && Object.keys(PLACE_ALIASES).includes(place);
}
export function assessAccountGeography(profile: SocialProfile, scopes: string | string[], mode: 'profile' | 'profile-or-recent-posts' = 'profile-or-recent-posts') {
  const selected = (Array.isArray(scopes) ? scopes : [scopes]).map(canonicalGeography);
  const { posts, coverage } = accountEvidence(profile);
  const observations: LocationObservation[] = [];
  function add(raw: string, source: LocationObservation['source'], post?: SocialPost) {
    if (!raw) return;
    const found = places(raw);
    // Unknown structured place names remain inspectable, without inventing a city.
    const resolved = found.length ? found : [null];
    for (const canonical of resolved) observations.push({ raw, canonical, source, postId: post?.id, postUrl: post?.url, publishedAt: post?.publishedAt, status: canonical ? source === 'mention' ? 'needs-verification' : 'observed' : 'unresolved' });
  }
  add(profile.location, 'profile');
  // Bio mentions are retained as proposals, not substituted for a structured address.
  if(places(profile.bio).length)add(profile.bio, 'mention');
  for (const post of posts) {
    add(post.location || '', 'geotag', post);
    const caption=`${post.caption} ${post.hashtags.join(' ')}`;
    if(places(caption).length)add(caption, 'mention', post);
  }
  const active = observations.filter(o => mode === 'profile-or-recent-posts' || !o.postId);
  const observed = active.filter(o => o.source !== 'mention' && selected.some(s => matches(o.canonical, s)));
  const mentioned = active.filter(o => o.source === 'mention' && selected.some(s => matches(o.canonical, s)));
  const unrestricted = selected.some(unrestrictedGeography);
  const state = unrestricted || observed.length ? 'passed' as const : 'unknown' as const;
  const reason = unrestricted ? 'No location filter selected.' : observed.some(o => o.source === 'geotag') ? 'Recent post location meets the selected scope.' : observed.length ? 'Profile location meets the selected scope.' : mentioned.length ? 'The selected location is mentioned; presence needs verification.' : 'Location is unverified; recent-post coverage may be incomplete.';
  return { state, reason, mode, profileLocation: profile.location, observations, coverage, mentionedMatch: mentioned.length > 0, verifiedGeography: !unrestricted && observed.length ? selected.find(s => observed.some(o => matches(o.canonical, s))) || '' : '' };
}
