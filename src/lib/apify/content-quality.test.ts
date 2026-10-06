import {describe,it,expect} from 'vitest';
import {parsePost} from './providers';
import {assessTopicPost,assessEngagement,comparePostEngagement} from './content-quality';
const cutoff='2026-09-06T00:00:00Z';
describe('observed content matching',()=>{
 it('recognizes group permalinks and provider time without inventing profile identities',()=>{const post=parsePost({url:'https://facebook.com/groups/123/permalink/456/',text:'Cầu lông TP. Hồ Chí Minh',time:'2026-10-06T03:12:26.000Z'},'Facebook')!;expect(post.publishedAt).toBe('2026-10-06T03:12:26.000Z');expect(assessTopicPost(post,'Badminton Vietnam',['TP. Hồ Chí Minh'],cutoff).state).toBe('matched');});
 it('reads epoch seconds and accepts a Vietnamese caption with explicit city',()=>{const post=parsePost({url:'https://facebook.com/permalink.php?story_fbid=456&id=123',text:'Giải Cầu lông Việt Nam TP. Hồ Chí Minh',timestamp:1788882868},'Facebook')!;expect(post.publishedAt).toBe('2026-09-08T15:54:28.000Z');expect(assessTopicPost(post,'Badminton Vietnam',['TP. Hồ Chí Minh'],cutoff).state).toBe('matched');});
 it('keeps missing location unverified and rejects observed conflicting city',()=>{const post=parsePost({webVideoUrl:'https://tiktok.com/@runner/video/123',text:'#caulong #badminton',createTimeISO:'2026-10-06T02:03:29Z'},'TikTok')!;expect(assessTopicPost(post,'Badminton Vietnam','Ho Chi Minh City',cutoff).state).toBe('unverified');const hanoi=parsePost({webVideoUrl:post.url,text:post.caption,createTimeISO:post.publishedAt,locationMeta:{city:'Hanoi'}},'TikTok')!;expect(assessTopicPost(hanoi,'Badminton Vietnam','Ho Chi Minh City',cutoff).state).toBe('excluded');});
 it('does not turn event dates or sports selections into publication or location evidence',()=>{const post=parsePost({url:'https://facebook.com/posts/123',text:'Cầu lông TP. Hồ Chí Minh event 06/10/2026'},'Facebook')!;expect(assessTopicPost(post,'Badminton Vietnam','Ho Chi Minh City',cutoff).state).toBe('unverified');expect(assessTopicPost({...post,publishedAt:'2026-04-17T00:00:00Z'},'Badminton Vietnam','Ho Chi Minh City',cutoff).state).toBe('excluded');});
});

describe('observed engagement selection',()=>{
 const post=parsePost({url:'https://facebook.com/posts/123',text:'badminton',time:'2026-10-06T03:12:26Z'},'Facebook')!;
 it('does not qualify low or missing metrics as high engagement',()=>{
  expect(assessEngagement({...post,likes:2,comments:0,views:20},{}).state).toBe('excluded');
  expect(assessEngagement(post,{}).state).toBe('unverified');
  expect(assessEngagement({...post,likes:0,comments:0,views:0},{}).state).toBe('excluded');
 });
 it('accepts observed threshold boundaries and honors custom thresholds',()=>{
  expect(assessEngagement({...post,likes:90,comments:10},{}).state).toBe('matched');
  expect(assessEngagement({...post,views:10000},{}).state).toBe('matched');
  expect(assessEngagement({...post,likes:90,comments:10},{minInteractions:101}).state).toBe('excluded');
 });
 it('ranks stronger interactions before provider order without treating unknown as zero',()=>{
  const low={...post,likes:2,comments:0,views:1000000};const high={...post,likes:200,comments:10,views:20000};
  expect([low,post,high].sort(comparePostEngagement)).toEqual([high,low,post]);
 });
});
