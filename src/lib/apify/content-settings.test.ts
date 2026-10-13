import {describe,it,expect,vi} from 'vitest';
const state=vi.hoisted(()=>({settings:{enabled:true,minViews:1000,minInteractions:50,metricRule:'views-first',policyVersion:1}}));
vi.mock('@/lib/supabase/admin',()=>({createAdminClient:()=>({from:()=>({select:()=>({eq:()=>({single:async()=>({data:{settings:state.settings},error:null})})})})})}));
import { assessContentFilter, DEFAULT_CONTENT_FILTER, resolveContentFilter } from './content-settings';
import { assessTopPost,channelMembership } from './top-post-quality';
import { parsePost } from './providers';
const post=parsePost({url:'https://facebook.com/posts/1',text:'chạy bộ',time:'2026-10-10T00:00:00Z',views:999,likes:99999,comments:0,shares:0},'Facebook')!;
describe('content filter',()=>{
 it('uses known views exclusively, including zero, and accepts the exact boundary',()=>{
  expect(assessContentFilter(post,DEFAULT_CONTENT_FILTER).state).toBe('failed');
  expect(assessContentFilter({...post,views:0},DEFAULT_CONTENT_FILTER).state).toBe('failed');
  expect(assessContentFilter({...post,views:1000,likes:0},DEFAULT_CONTENT_FILTER).state).toBe('passed');
 });
 it('falls back to observed reactions, comments and shares; partial metrics remain recorded',()=>{
  expect(assessContentFilter({...post,views:null,likes:40,comments:null,shares:10},DEFAULT_CONTENT_FILTER)).toMatchObject({state:'passed',value:50,missingFields:['views','comments']});
  expect(assessContentFilter({...post,views:null,likes:0,comments:null,shares:null},DEFAULT_CONTENT_FILTER).state).toBe('failed');
 });
 it('keeps wholly unknown metrics and does not filter when disabled',()=>{
  expect(assessContentFilter({...post,views:null,likes:null,comments:null,shares:null},DEFAULT_CONTENT_FILTER).state).toBe('unknown');
  expect(assessContentFilter(post,{...DEFAULT_CONTENT_FILTER,enabled:false}).state).toBe('passed');
 });
 it('uses total reactions once rather than adding likes again',()=>{
  const parsed=parsePost({url:post.url,likes:40,reactionsCount:45,comments:2,shares:3},'Facebook')!;
  expect(parsed.likes).toBe(45);expect(assessContentFilter(parsed,DEFAULT_CONTENT_FILTER).value).toBe(50);
 });
 it('filters known low quality even when geography is unknown; rejects known scope failures while disabled',()=>{
  const criteria={keyword:'Running',geography:'Vietnam',qualityFilter:DEFAULT_CONTENT_FILTER};
  expect(assessTopPost(post,criteria,'2026-10-09T00:00:00Z','2026-10-11T00:00:00Z').resultGroup).toBe('Below Target');
  expect(assessTopPost(post,{...criteria,qualityFilter:{...DEFAULT_CONTENT_FILTER,enabled:false}},'2026-10-11T00:00:00Z','2026-10-12T00:00:00Z').resultGroup).toBe('Excluded');
 });
 it('distinguishes missing membership from conflicting groups',()=>{
  expect(channelMembership({...post,authorUrl:''},'https://facebook.com/runner')).toBe('unknown');
  expect(channelMembership(post,'https://facebook.com/groups/123')).toBe('unknown');
  expect(channelMembership(post,'https://facebook.com/groups/123',{groupUrl:'https://facebook.com/groups/456'})).toBe('failed');
 });
 it('freezes a resolved policy and accepts explicit overrides independently of changed defaults',async()=>{
  const frozen=await resolveContentFilter({});state.settings={...state.settings,minViews:5000};
  expect((await resolveContentFilter({qualityFilter:frozen})).minViews).toBe(1000);
  expect((await resolveContentFilter({})).minViews).toBe(5000);
  expect((await resolveContentFilter({thresholdsEnabled:false})).enabled).toBe(false);
 });
});
