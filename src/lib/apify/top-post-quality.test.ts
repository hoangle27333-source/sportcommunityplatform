import {describe,it,expect} from 'vitest';
import {parsePost} from './providers';
import {assessTopPost,compareTopPosts,topCandidateBudget} from './top-post-quality';
const post=parsePost({url:'https://facebook.com/posts/1',text:'chạy bộ',time:'2026-10-10T12:00:00Z',likes:20,comments:1,shares:0,views:10},'Facebook')!;
const from='2026-10-09T00:00:00.000Z',to='2026-10-11T00:00:00.000Z';
describe('top-post ordering and evidence',()=>{
 it('ranks views before likes, then comments, shares, date and URL',()=>{
  const rows=[{...post,url:'b',views:10,likes:99999},{...post,url:'a',views:100,likes:0}];
  expect(rows.sort(compareTopPosts).map(p=>p.url)).toEqual(['a','b']);
  for(const key of ['likes','comments','shares'] as const)expect(compareTopPosts({...post,[key]:2},{...post,[key]:1})).toBeLessThan(0);
  expect(compareTopPosts({...post,publishedAt:to},post)).toBeLessThan(0);
  expect(compareTopPosts({...post,url:'a'},{...post,url:'b'})).toBeLessThan(0);
 });
 it('preserves zero, puts missing views last and parses share variants',()=>{
  expect(compareTopPosts({...post,views:0},{...post,views:null,likes:9999})).toBeLessThan(0);
  expect(parsePost({url:post.url,shareCount:0},'TikTok')).toBeNull();
  expect(parsePost({url:post.url,shareCount:0},'Facebook')?.shares).toBe(0);
  expect(parsePost({url:post.url,sharesCount:12},'Facebook')?.shares).toBe(12);
  expect(parsePost({url:post.url},'Facebook')?.shares).toBeNull();
 });
 it('accepts low observed metrics by default and applies thresholds only when enabled',()=>{
  const criteria={keyword:'Running',geography:'Any location',selectionMode:'top' as const};
  expect(assessTopPost(post,criteria,from,to).resultGroup).toBe('Qualified');
  expect(assessTopPost(post,{...criteria,thresholdsEnabled:true},from,to).resultGroup).toBe('Below Target');
 });
 it('accepts exact date boundaries and rejects both out-of-window sides',()=>{
  const criteria={keyword:'Running',geography:'Any location'};
  for(const date of [from,to])expect(assessTopPost({...post,publishedAt:date},criteria,from,to).resultGroup).toBe('Qualified');
  for(const date of ['2026-10-08T23:59:59.000Z','2026-10-11T00:00:00.001Z'])expect(assessTopPost({...post,publishedAt:date},criteria,from,to).resultGroup).toBe('Excluded');
  expect(assessTopPost({...post,publishedAt:undefined},criteria,from,to).resultGroup).toBe('Needs Verification');
 });
 it('requires exact hashtags and independent geography',()=>{
  expect(assessTopPost(post,{keyword:'#running',searchMode:'hashtag',geography:'Any location'},from,to).resultGroup).toBe('Excluded');
  expect(assessTopPost(post,{keyword:'Running',geography:'Vietnam'},from,to).resultGroup).toBe('Needs Verification');
  expect(assessTopPost({...post,location:'Hanoi'},{keyword:'Running',geography:'Ho Chi Minh City'},from,to).resultGroup).toBe('Excluded');
 });
 it('retains missing views with interactions but no metrics needs verification',()=>{
  expect(assessTopPost({...post,views:null},{keyword:'Running',geography:'Any location'},from,to).resultGroup).toBe('Qualified');
  expect(assessTopPost({...post,views:null,likes:null,comments:null,shares:null},{keyword:'Running',geography:'Any location'},from,to).resultGroup).toBe('Needs Verification');
 });
 it.each([['Football','bóng đá'],['Cycling','đạp xe'],['Basketball','bóng rổ'],['Badminton','cầu lông']])('matches %s from observed Vietnamese text', (keyword,caption)=>{
  expect(assessTopPost({...post,caption},{keyword,geography:'Any location'},from,to).resultGroup).toBe('Qualified');
 });
 it('bounds the balanced pool',()=>{expect([1,10,20,50].map(topCandidateBudget)).toEqual([60,60,120,120]);});
});
