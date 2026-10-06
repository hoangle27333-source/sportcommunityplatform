import {describe,it,expect} from 'vitest';
import {providerItemWarning,explainSavedProviderWarnings} from './provider-warnings';
describe('provider item warnings',()=>{
 it('identifies an unavailable profile without implying that valid results failed',()=>{expect(providerItemWarning('Instagram',{username:'ym.badminton',error:'not_found'})).toBe('Instagram: One item (@ym.badminton) was skipped because the provider reports that it no longer exists. Other available results are retained for review.');});
 it('does not display arbitrary upstream text',()=>{expect(providerItemWarning('Facebook',{username:'secret token!',error:'credential=secret'})).not.toContain('secret');});
 it('explains legacy warnings using saved evidence without changing the snapshot',()=>{const warnings=['Provider item unavailable','Provider item unavailable'];const runs=[{platform:'Instagram',raw_rows:[{username:'ym.badminton',error:'not_found'},{username:'valid'}]}];expect(explainSavedProviderWarnings(warnings,runs)).toEqual([providerItemWarning('Instagram',runs[0].raw_rows[0])]);expect(warnings).toHaveLength(2);});
 it('retains other warnings and skips empty dataset markers',()=>{expect(explainSavedProviderWarnings(['Provider item unavailable','Budget exhausted'],[{raw_rows:[{error:'no_items'}]}])).toEqual(['Some provider items could not be accessed. Other available results are retained for review.','Budget exhausted']);});
});
