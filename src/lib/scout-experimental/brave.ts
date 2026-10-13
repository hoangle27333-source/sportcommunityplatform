import { canonicalUrl, platformMatches, urlKind } from '../apify/discovery-quality';
import { ScoutError } from '../apify/errors';
import { parseProfile, type SocialProfile } from '../apify/providers';

export const BRAVE_ADAPTER_REVISION = 'brave-web-1';
export const BRAVE_PRICING_REVISION = 'brave-search-20261013-0.005';
export const BRAVE_REQUEST_USD = 0.005;
export const BRAVE_MONTHLY_USD = 4.5;
const domains: Record<string,string> = { Facebook:'facebook.com', TikTok:'tiktok.com', Instagram:'instagram.com' };
export type BraveRequest = { revision:typeof BRAVE_ADAPTER_REVISION; platform:string; approvedQuery:string; params:Record<string,string> };
export type BraveResult = {
 provider:'brave'; revision:typeof BRAVE_ADAPTER_REVISION; url:string; canonicalUrl:string;
 kind:ReturnType<typeof urlKind>; title:string; snippet:string; platform:string;
 query:{requested:string;original?:string;altered?:string;cleaned?:string}; observedAt:string;
};
export function buildBraveRequest(platform:string, approvedQuery:string, count=15):BraveRequest {
 const domain=domains[platform];
 if(!domain || typeof approvedQuery!=='string' || !approvedQuery.trim())throw new ScoutError('Brave requires a supported platform and a non-empty query.','INVALID_BRAVE_QUERY',400);
 // Reject exclusions, OR branches and malformed site operators that can escape our domain.
 if(/\bOR\b|\|/i.test(approvedQuery))throw new ScoutError('Brave discovery does not support OR branches. Use separate approved queries.','INVALID_BRAVE_QUERY',400);
 const sites=[...approvedQuery.matchAll(/(-?)\bsite\s*:\s*([^\s)]+)/gi)];
 if(sites.some(([,negative,site])=>negative || site.toLowerCase()!==domain) || /\bsite\s*:/i.test(approvedQuery) && !sites.length)throw new ScoutError('The query contains a conflicting or invalid site operator.','INVALID_BRAVE_QUERY',400);
 const q=`site:${domain} ${approvedQuery.trim()}`;
 if(Array.from(q).length>600 || q.split(/\s+/u).length>75 || !Number.isInteger(count) || count<1 || count>20)throw new ScoutError('Brave queries allow at most 600 characters, 75 words and 20 results.','INVALID_BRAVE_QUERY',400);
 return {revision:BRAVE_ADAPTER_REVISION,platform,approvedQuery,params:{q,count:String(count),search_lang:'vi',ui_lang:'en-US',spellcheck:'false',result_filter:'web',text_decorations:'false',offset:'0'}};
}
export function normalizeBraveResponse(raw:any, request:BraveRequest, observedAt=new Date().toISOString()):BraveResult[] {
 if(!raw || raw.type!=='search' || !raw.query || typeof raw.query.original!=='string' || (raw.web!==undefined && raw.web!==null && !Array.isArray(raw.web.results)))throw new ScoutError('Brave returned an invalid search response.','BRAVE_SCHEMA_INVALID',502);
 const query={requested:request.params.q,original:raw.query.original,altered:raw.query.altered,cleaned:raw.query.cleaned};
 if(query.original!==query.requested || query.altered && query.altered!==query.requested)throw new ScoutError('Brave changed the approved query. Review the saved request.','BRAVE_QUERY_CHANGED',502);
 const seen=new Set<string>();
 return (raw.web?.results || []).slice(0,Number(request.params.count)).flatMap((row:any)=>{
  if(!row || typeof row.url!=='string' || typeof row.title!=='string' || row.description!==undefined && typeof row.description!=='string')throw new ScoutError('Brave returned an invalid web result.','BRAVE_SCHEMA_INVALID',502);
  const url=canonicalUrl(row.url);
  if(!url || !platformMatches(request.platform,url) || seen.has(url))return [];seen.add(url);
  return [{provider:'brave',revision:BRAVE_ADAPTER_REVISION,url:row.url,canonicalUrl:url,kind:urlKind(url),title:row.title,snippet:row.description || '',platform:request.platform,query,observedAt} satisfies BraveResult];
 });
}
export function braveIdentity(row:BraveResult,platform:string):SocialProfile|null {
 if(row.revision!==BRAVE_ADAPTER_REVISION || row.platform!==platform || !platformMatches(platform,row.canonicalUrl) || !['profile','group'].includes(urlKind(row.canonicalUrl)))return null;
 const profile=parseProfile({profileUrl:row.canonicalUrl},platform);
 return profile ? {...profile,searchHints:[row],discoveryPaths:[{method:'web-content',sourceUrl:row.url,query:row.query.requested,depth:0}]} : null;
}
