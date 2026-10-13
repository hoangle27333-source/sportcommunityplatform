import { it,expect } from 'vitest';
import { discoveryUnits,prioritizeApprovedUnits } from './discovery-plan';
it('a single approved keyword includes content authors before profile search',()=>{
 expect(discoveryUnits(['badminton'],['Facebook'],'apify').map(u=>u.method)).toEqual(['content-author','profile']);
});
it('can discover authors when profile search is unavailable',()=>{
 const units=discoveryUnits(['badminton'],['Facebook','TikTok'],'apify',u=>u.method!=='profile');
 expect(units.map(u=>u.platform)).toEqual(['Facebook','TikTok']);expect(units.every(u=>u.method==='content-author')).toBe(true);
});
it('uses only verified methods and respects Instagram hashtag compatibility',()=>{
 const units=discoveryUnits(['badminton training','badminton'],['Instagram'],'apify',u=>u.method==='hashtag');
 expect(units).toEqual([{platform:'Instagram',query:'badminton',method:'hashtag'}]);
});
it('interleaves methods/platforms within the global cap and never changes query text',()=>{
 const queries=['badminton','cầu lông','training','tournament'];
 const units=discoveryUnits(queries,['Facebook','TikTok','Instagram'],'apify');
 expect(units).toHaveLength(12);expect(units.slice(0,3).map(u=>u.platform)).toEqual(['Facebook','TikTok','Instagram']);
 expect(units.every(u=>queries.includes(u.query))).toBe(true);
});
it('prioritizes productive approved methods without starving another platform',()=>{
 const units=discoveryUnits(['one','two'],['Facebook','TikTok'],'apify');
 const ranked=prioritizeApprovedUnits(units,[{platform:'Facebook',method:'profile',newCandidates:0},{platform:'Facebook',method:'content-author',newCandidates:4}]);
 expect(ranked[0].method).toBe('content-author');expect(ranked[1].platform).toBe('TikTok');expect(ranked).toHaveLength(units.length);
 expect(new Set(ranked.map(u=>JSON.stringify(u)))).toEqual(new Set(units.map(u=>JSON.stringify(u))));
});
