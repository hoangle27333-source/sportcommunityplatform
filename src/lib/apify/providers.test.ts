import { beforeEach, describe, expect, it, vi } from 'vitest';
const run = vi.hoisted(()=>vi.fn());
const receipt=vi.hoisted(()=>({verified:true,receipt:{supportsDateFilter:false}}));
vi.mock('@/lib/supabase/admin',()=>({createAdminClient:()=>({from:()=>({select:()=>({eq:()=>({maybeSingle:async()=>({data:receipt,error:null})})})})})}));
vi.mock('./runtime',()=>({executePlan:run,capabilityKey:()=> 'fixture'}));
import { scrape, PendingScout } from './providers';
beforeEach(()=>{process.env.APIFY_TOKEN='test-token';run.mockReset();receipt.verified=true;receipt.receipt.supportsDateFilter=false;});
describe('Provider planning and dispatch',()=>{
 it('dispatches separate Facebook profile and page inputs',async()=>{run.mockResolvedValue([]);await scrape('s','Facebook','profiles','run',5,'Hanoi');expect(run).toHaveBeenCalledTimes(2);expect(run.mock.calls.map(c=>c[3].input.searchType)).toEqual(['profiles','pages']);expect(run.mock.calls.every(c=>c[3].input.locations[0]==='Hanoi')).toBe(true);});
 it('omits Actor date filters until their capability is verified',async()=>{run.mockResolvedValue([]);await scrape('s','Instagram','profile-posts','https://instagram.com/nike',1,'',{newerThan:'2026-10-01'});expect(run.mock.calls[0][3].input.onlyPostsNewerThan).toBeUndefined();});
 it('uses verified date filters and rejects an unverified receipt',async()=>{run.mockResolvedValue([]);receipt.receipt.supportsDateFilter=true;await scrape('s','Instagram','profile-posts','https://instagram.com/nike',1,'',{newerThan:'2026-10-01'});expect(run.mock.calls[0][3].input.onlyPostsNewerThan).toBe('2026-10-01');receipt.verified=false;await scrape('s','Instagram','profile-posts','https://instagram.com/nike',1,'',{newerThan:'2026-10-01'});expect(run.mock.calls[1][3].input.onlyPostsNewerThan).toBeUndefined();});
 it('preserves pending semantics',async()=>{run.mockRejectedValue(new PendingScout());await expect(scrape('s','Instagram','profiles','run',1)).rejects.toBeInstanceOf(PendingScout);});
 it('does not dispatch when token is absent',async()=>{delete process.env.APIFY_TOKEN;await expect(scrape('s','Instagram','profiles','run',1)).rejects.toMatchObject({code:'NOT_CONFIGURED'});expect(run).not.toHaveBeenCalled();});
});
