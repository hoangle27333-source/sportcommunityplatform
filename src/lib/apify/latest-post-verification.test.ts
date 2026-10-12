import { expect,it } from 'vitest';
import { verifyLatestPostSample, type LatestPostReference,type LatestSampleRun } from './latest-post-verification';
import { parsePost } from './providers';
const posts=()=>Array.from({length:10},(_,i)=>parsePost({webVideoUrl:`https://tiktok.com/@runner/video/${i}`,authorMeta:{name:'runner'},text:'Chạy bộ',createTimeISO:`2026-10-${String(10-i).padStart(2,'0')}`},'TikTok')!);
const run:LatestSampleRun={id:'run-1',platform:'TikTok',actor:'clockworks~tiktok-scraper',task:'profile-posts',state:'succeeded',build:'immutable-id',build_id:'immutable-id',observed_at:'2026-10-11T00:00:00Z',input:{profiles:['runner'],resultsPerPage:10,profileSorting:'latest',profileScrapeSections:['videos']}};
const reference=():LatestPostReference=>({accountUrl:'https://tiktok.com/@runner',observedAt:run.observed_at,reviewers:['reviewer-1'],evidenceUrls:['https://tiktok.com/@runner'],allPublicPosts:false,posts:posts().map(post=>({url:post.url,publishedAt:post.publishedAt!}))});
it('requires an independently reviewed exact latest list, not merely date sorting',()=>{
 expect(verifyLatestPostSample(run,posts().reverse(),reference(),'immutable-id').verified).toBe(true);
 const observed=posts();observed[0].publishedAt='2020-01-01';expect(verifyLatestPostSample(run,observed,reference(),'immutable-id').verified).toBe(false);
});
it('fails on wrong build, missing timestamps, biased inputs and reposts',()=>{
 expect(verifyLatestPostSample({...run,build_id:'different'},posts(),reference(),'immutable-id').verified).toBe(false);
 expect(verifyLatestPostSample({...run,input:{...run.input,leastDiggs:100}},posts(),reference(),'immutable-id').verified).toBe(false);
 const observed=posts();observed[0].publishedAt=undefined;observed[1].isRepost=true;expect(verifyLatestPostSample(run,observed,reference(),'immutable-id').verified).toBe(false);
});
it('keeps short/unreviewed/wrong-owner references unverified',()=>{
 const ref=reference();ref.posts=ref.posts.slice(0,2);expect(verifyLatestPostSample(run,posts().slice(0,2),ref,'immutable-id').verified).toBe(false);
 ref.allPublicPosts=true;expect(verifyLatestPostSample(run,posts().slice(0,2),ref,'immutable-id').verified).toBe(true);
 ref.reviewers=[];expect(verifyLatestPostSample(run,posts().slice(0,2),ref,'immutable-id').verified).toBe(false);
 const wrong=posts();wrong[0].authorUrl='https://tiktok.com/@someoneelse';expect(verifyLatestPostSample(run,wrong,reference(),'immutable-id').verified).toBe(false);
});
it('compares build version and immutable observed build ID separately and rejects a different account input',()=>{
 expect(verifyLatestPostSample({...run,build:'0.0.612',build_id:'build-id'},posts(),reference(),'0.0.612','build-id').verified).toBe(true);
 expect(verifyLatestPostSample({...run,input:{...run.input,profiles:['different']}},posts(),reference(),'immutable-id').verified).toBe(false);
});
