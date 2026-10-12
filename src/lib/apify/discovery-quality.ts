import { canonicalGeography, unrestrictedGeography } from './geography';
export type Classification = 'Individual' | 'Community' | 'Brand/Business' | 'Unknown';
export function normalized(text: string) {
  return text.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/đ/g, 'd').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}
const aliases: Record<string, string> = { run: 'running', runner: 'running', runners: 'running', marathon: 'running', jogging: 'running', clubs: 'club', hcmc: 'hcm', saigon: 'hcm', hanoi: 'hanoi' };
export function tokens(text: string) {
  const n = normalized(text).replace(/chay bo|\bchaybo\b/g, 'running').replace(/\b(runningvietnam|marathonvietnam|runnervietnam)\b/g,'running').replace(/\bcaulongvietnam\b/g,'badminton').replace(/bong da/g,'football').replace(/cau long/g,'badminton').replace(/bong ro/g,'basketball').replace(/dap xe/g,'cycling').replace(/boi loi/g,'swimming').replace(/ho chi minh|sai gon|tp hcm/g, 'hcm').replace(/ha noi/g, 'hanoi').replace(/da nang/g, 'danang').replace(/viet nam/g, 'vietnam');
  return n.split(' ').filter(Boolean).map(t => aliases[t] || t);
}
export function contextKey(keyword: string, geography: string) { return `${tokens(keyword).join(' ')}|${tokens(geography).join(' ')}`; }
export function assessProfile(p: { name: string; bio: string; category?: string; entityType?: string; location?: string; url: string }, keyword: string, geography: string, targetType: string) {
  geography = canonicalGeography(geography);
  const unrestricted = unrestrictedGeography(geography);
  const text = tokens(`${p.name} ${p.bio} ${p.category || ''}`).join(' ');
  const has = (expression: RegExp) => expression.test(text);
  let classification: Classification = 'Unknown';
  const identity = tokens(`${p.name} ${p.category || ''}`).join(' ');
  const groupIdentity = p.entityType === 'group' || p.url.includes('/groups/');
  const communityIdentity = /\b(club|community|clb|cong dong|hoi nhom|running team|sports team)\b/.test(identity);
  const businessIdentity = /\b(gym|fitness center|fitness centre|crossfit|studio|academy|company|business|shop|store|tv channel|sports event)\b/.test(identity) || /\b(we offer|our classes|our gym|training program|official .+ facebook page|live streaming)\b/.test(text);
  // A service offering coaching is not evidence that the account belongs to a coach.
  const strongPerson = p.entityType === 'person' || /\b(digital creator|athlete|coach|personal trainer|influencer|huan luyen vien|vdv)\b/.test(identity) || /^(?:i am|i m|toi la)\b/.test(tokens(p.bio).join(' ')) && /\b(coach|athlete|creator|huan luyen vien)\b/.test(text) || /^(?:running |pickleball |hyrox )?(?:coach|athlete|digital creator)\b/.test(tokens(p.bio).join(' '));
  if (groupIdentity || communityIdentity) classification = 'Community';
  else if (businessIdentity) classification = 'Brand/Business';
  else if (strongPerson) classification = 'Individual';
  else if (has(/\b(brand|business|company|shop|store|academy|adidas|nike|games|gaming|retailer)\b/)) classification = 'Brand/Business';
  const wanted = tokens(keyword).filter(t => !['club', 'community', 'vietnam', 'hcm', 'hanoi', 'danang', 'da', 'nang'].includes(t));
  const evidenceTokens = new Set(tokens(`${p.name} ${p.bio} ${p.category || ''}`));
  const relevant = wanted.length > 0 && wanted.every(t => evidenceTokens.has(t));
  const geoTokens = tokens(`${p.location || ''} ${p.bio} ${p.name}`);
  const queryCities = tokens(keyword).filter(t => ['hcm','hanoi','danang'].includes(t));
  const geo = queryCities.length && tokens(geography).includes('nationwide') ? queryCities : tokens(geography);
  const requiredGeo = geo.includes('nationwide') || geo.includes('toan') ? ['vietnam'] : geo.filter(t => t !== 'city');
  const locationMatch = unrestricted || requiredGeo.every(t => geoTokens.includes(t)) || (requiredGeo[0] === 'vietnam' && ['hcm', 'hanoi', 'danang'].some(t => geoTokens.includes(t)));
  const expected = targetType === 'Communities & Clubs' ? 'Community' : 'Individual';
  const knownCities = ['hanoi', 'hcm', 'danang'];
  const foreignPattern=/\b(usa|united states|canada|australia|singapore|thailand|japan|china|france|united kingdom|india|hong kong|taiwan|malaysia|indonesia|philippines|south korea|new zealand|salt lake city)\b/;
  // Structured address takes precedence over mentions of travel/competitions in the biography.
  const foreignCountry=foreignPattern.test(normalized(p.location || '')) || !p.location && foreignPattern.test(normalized(p.name));
  const vietnamScope=requiredGeo.includes('vietnam') || requiredGeo.some(t=>knownCities.includes(t));
  const addressCities=tokens(p.location || '').filter(t=>knownCities.includes(t));
  const wrongLocation = foreignCountry && vietnamScope || requiredGeo.some(t=>knownCities.includes(t)) && addressCities.length>0 && !requiredGeo.some(t=>addressCities.includes(t)) || !locationMatch && requiredGeo.some(t => knownCities.includes(t)) && geoTokens.some(t => knownCities.includes(t));
  const wrongType = classification !== 'Unknown' && classification !== expected;
  const reviewState = wrongType || wrongLocation || !relevant ? 'Excluded' : classification === 'Unknown' || !locationMatch ? 'Needs Review' : 'Matched';
  return { classification, relevant, locationMatch:locationMatch && !wrongLocation, verifiedGeography: locationMatch && !wrongLocation && !unrestricted ? geography : '', reviewState,
    reasons: [relevant ? 'Profile matches the search topic' : 'Topic is not supported by profile evidence', classification === 'Unknown' ? 'Entity type is unverified' : `Entity type: ${classification}`, wrongLocation ? 'Observed location conflicts with selected geography' : unrestricted ? 'No location filter selected' : locationMatch ? 'Location supported by profile evidence' : 'Location is unverified'],
    evidence: [p.name, p.bio, p.category, p.location].filter(Boolean) as string[] };
}
export function canonicalUrl(value: string): string {
  try {
    const u = new URL(value);
    if (u.protocol !== 'https:' && u.protocol !== 'http:') return '';
    u.protocol = 'https:'; u.hash = '';
    const keep = u.pathname === '/profile.php' ? ['id'] : ['/story.php', '/permalink.php'].includes(u.pathname) ? ['story_fbid', 'id'] : /^\/watch\/?$/.test(u.pathname) ? ['v'] : [];
    const params = new URLSearchParams();
    for (const key of keep) { const value = u.searchParams.get(key); if (value) params.set(key, value); }
    u.search = params.toString();
    u.hostname = u.hostname.toLowerCase().replace(/^www\./, '').replace(/^m\.facebook/, 'facebook');
    return u.toString().replace(/\/$/, '');
  } catch { return ''; }
}
export function platformMatches(platform: string, url: string) {
  try { const host = new URL(url).hostname.replace(/^www\./, ''); const domain = `${platform.toLowerCase()}.com`; return host === domain || host.endsWith(`.${domain}`); } catch { return false; }
}
export function hashtagMatch(tags: string[], query: string) { return tags.some(t => t.replace(/^#/, '').normalize('NFC').toLowerCase() === query.replace(/^#/, '').normalize('NFC').toLowerCase()); }

export function urlKind(url: string): 'profile' | 'group' | 'post' | 'unknown' {
  try {
    const u = new URL(url);
    const parts = u.pathname.split('/').filter(Boolean);
    const path = u.pathname;
    if (/\/(p|reel|reels|posts|videos|video|photo|photos)(\/|$)/.test(path) || /^(\/story\.php|\/permalink\.php|\/watch\/?|\/photo\.php)$/.test(path)) return 'post';
    if (!parts.length || /^(search|explore|login|login\.php|logout|share|sharer|sharer\.php|l\.php|home\.php|help|settings|marketplace|gaming|events|hashtag|hashtags|tag|tags|reel|reels)$/i.test(parts[0])) return 'unknown';
    if (parts[0] === 'groups' && parts.length === 4 && ['permalink','posts'].includes(parts[2])) return 'post';
    if (parts[0] === 'groups') return parts.length === 2 && !['feed', 'discover', 'joins', 'create'].includes(parts[1]) ? 'group' : 'unknown';
    if (parts[0] === 'profile.php') return /^\d+$/.test(u.searchParams.get('id') || '') ? 'profile' : 'unknown';
    if (parts[0] === 'people') return parts.length === 3 ? 'profile' : 'unknown';
    if (parts[0] === 'pages') return parts.length === 3 ? 'profile' : 'unknown';
    if (parts.length === 1 && !parts[0].endsWith('.php') && !/\s/.test(decodeURIComponent(parts[0]))) return 'profile';
  } catch {}
  return 'unknown';
}
export function queryGeographyConflict(query: string, geography: string): boolean {
 const cities=['hcm','hanoi','danang']; const q=tokens(query).filter(t=>cities.includes(t)); const g=tokens(geography).filter(t=>cities.includes(t)); return q.length>0 && g.length>0 && !q.some(t=>g.includes(t));
}
