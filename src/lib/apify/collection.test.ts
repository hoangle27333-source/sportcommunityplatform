import {describe,expect,it,vi} from 'vitest';
vi.mock('@/lib/supabase/admin',()=>({createAdminClient:vi.fn()}));
import {quotas,roundRobin} from './collection';
import {channelUrl,observedMetrics} from './tasks';
import {parseProfile,parsePost} from './providers';
import {normalizeAuditCache} from '@/lib/sport-hub/audience-audit';
describe('Cross-platform evidence correctness',()=>{
 it('allocates fairly regardless of selection order',()=>{expect(quotas(['TikTok','Facebook','Instagram'],5)).toEqual(quotas(['Instagram','TikTok','Facebook'],5));expect(quotas(['TikTok','Facebook','Instagram'],5).map(p=>p.limit)).toEqual([2,2,1]);});
 it('interleaves platforms before truncating',()=>{expect(roundRobin([['fb1','fb2'],['ig1','ig2'],['tt1']],4)).toEqual(['fb1','ig1','tt1','fb2']);});
 it('resolves independent persisted channels',()=>{const entity={profile_url:'https://www.facebook.com/runner',channels:[{url:'https://www.instagram.com/runner/',isPrimary:true}]};expect(channelUrl(entity,'Instagram')).toContain('instagram.com/runner');expect(channelUrl(entity,'Facebook')).toContain('facebook.com/runner');expect(channelUrl(entity,'TikTok')).toBeUndefined();});
 it('keeps zero observations and excludes incomplete ER denominators',()=>{const profile=parseProfile({username:'runner',followersCount:100},'Instagram')!;const posts=[parsePost({url:'https://www.instagram.com/p/a/',likesCount:0,commentsCount:0,videoViewCount:0},'Instagram')!,parsePost({url:'https://www.instagram.com/p/b/',likesCount:10},'Instagram')!];expect(observedMetrics(profile,posts)).toMatchObject({avgViews:0,er:0,viewsSample:1,erSample:1});});
 it('does not let legacy empty samples claim safe audience',()=>{const cached=normalizeAuditCache({totalCommentsScanned:0,realAudienceRate:100,seedingRate:0,seedingRiskLevel:'Low'} as any);expect(cached).toMatchObject({realAudienceRate:null,seedingRate:null,seedingRiskLevel:'Unknown'});});
});
