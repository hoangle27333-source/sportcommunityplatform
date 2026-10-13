/** Limits are actor-specific: TikTok limits are per query, Facebook search is per run. */
export function providerResultCap(input: Record<string, any>): number {
 const count=(value:any)=>Math.max(1,Number(value?.length) || 1);
 if(input.searchLimit) return Number(input.searchLimit);
 if(input.maxItems) return Number(input.maxItems);
 if(input.resultsPerPage || input.maxProfilesPerQuery) return Number(input.maxProfilesPerQuery || input.resultsPerPage)*count(input.searchQueries || input.hashtags || input.profiles || input.postURLs);
 if(input.directUrls || input.startUrls) return Number(input.resultsLimit || 1)*count(input.directUrls || input.startUrls);
 return Number(input.resultsLimit || 1);
}
export function tiktokDateWindow(days:number) {
 return days<=1?'PAST_24_HOURS':days<=7?'PAST_WEEK':days<=30?'PAST_MONTH':days<=90?'LAST_3_MONTHS':'LAST_6_MONTHS';
}
export type VerifiedSearchOptions = { facebookLocations?:boolean; tiktokVideoFilters?:boolean; tiktokVideoSortings?:('MOST_LIKED'|'MOST_RELEVANT'|'LATEST')[]; dateFilter?:boolean; latestProfilePosts?:boolean };
