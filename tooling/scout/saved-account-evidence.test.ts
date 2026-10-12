import { expect, it } from 'vitest';
import { profilesFromSavedRuns } from './saved-account-evidence';
import type { SavedProviderRun } from '../../src/lib/apify/stored-evidence';
const runs:SavedProviderRun[]=[
 {platform:'Instagram',task:'profiles',state:'succeeded',normalized_rows:[{url:'https://instagram.com/alex',username:'alex',name:'Alex',bio:''}]},
 {platform:'Instagram',task:'profile-details',state:'succeeded',normalized_rows:[{url:'https://instagram.com/alex',username:'alex',fullName:'Alex',biography:'Chạy bộ tại Hà Nội',followersCount:0}]},
 {platform:'Instagram',task:'profile-posts',state:'succeeded',normalized_rows:[{url:'https://instagram.com/p/one',ownerUsername:'alex',caption:'Chạy bộ #HCMC',timestamp:'2026-10-10'},{url:'https://instagram.com/p/foreign',ownerUsername:'someoneelse',caption:'Not this account'}]},
];
it('merges saved hydration and owned posts without inventing completeness or changing source rows',()=>{
 const original=JSON.stringify(runs);const [profile]=profilesFromSavedRuns(runs);
 expect(profile.bio).toBe('Chạy bộ tại Hà Nội');expect(profile.followers).toBe(0);expect(profile.posts).toHaveLength(1);expect(profile.latestPostsVerified).toBe(false);expect(JSON.stringify(runs)).toBe(original);
});
it('ignores pending runs and deduplicates replayed post observations',()=>{
 const result=profilesFromSavedRuns([...runs,runs[2],{...runs[0],state:'running',normalized_rows:[{url:'https://instagram.com/other',name:'Pending'}]}]);
 expect(result).toHaveLength(1);expect(result[0].posts).toHaveLength(1);
});
