import {expect,it} from 'vitest';
import {providerResultCap,tiktokDateWindow} from './search-input';
it('allocates total run caps from actor-specific per-query limits',()=>{
 expect(providerResultCap({searchQueries:['Running','Chạy bộ'],resultsPerPage:10})).toBe(20);
 expect(providerResultCap({searchQueries:['a','b'],maxProfilesPerQuery:5})).toBe(10);
 expect(providerResultCap({categories:['a','b'],resultsLimit:10})).toBe(10);
 expect(providerResultCap({searchLimit:5,resultsLimit:1})).toBe(5);
 expect(providerResultCap({directUrls:['a','b'],resultsLimit:5})).toBe(10);
 expect(providerResultCap({searchQueries:['a','b'],maxItems:10})).toBe(10);
});
it('chooses a covering date enum, leaving exact cutoff assessment to the app',()=>{
 expect([1,3,7,14,30].map(tiktokDateWindow)).toEqual(['PAST_24_HOURS','PAST_WEEK','PAST_WEEK','PAST_MONTH','PAST_MONTH']);
});
