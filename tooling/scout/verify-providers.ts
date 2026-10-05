/** All paid verification uses the production reservation ledger; never imports CRM records. */
import { mkdir,writeFile } from 'node:fs/promises';
import {createAdminClient} from '../../src/lib/supabase/admin';
import {providerPlans,parseProfile,parsePost,PendingScout} from '../../src/lib/apify/providers';
import {apifyApi,capabilityKey,executePlan} from '../../src/lib/apify/runtime';
import {verificationGate} from '../../src/lib/apify/verification';
const db=createAdminClient();const checks:any[]=[];const results:any[]=[];
const select=process.argv.find(a=>a.startsWith('--check='))?.split('=')[1];
const batch=process.argv.includes('--batch');
const dateFilter=process.argv.includes('--date-filter');
const newerThan=new Date(Date.now()-30*86400000).toISOString();
const memoryArg=process.argv.find(a=>a.startsWith('--memory='))?.split('=')[1];const memory=memoryArg ? Number(memoryArg) : undefined;
if(memory!==undefined && ![128,256,512,1024,2048,4096].includes(memory))throw new Error('Memory must be a supported power of two.');
const record=async()=>{await mkdir('artifacts/apify-runtime',{recursive:true});const now=new Date().toISOString();const report=JSON.stringify({verifiedAt:now,checks:results},null,2);await writeFile('artifacts/apify-runtime/provider-verification.json',report);await writeFile(`artifacts/apify-runtime/verification-${now.replace(/[:.]/g,'-')}.json`,report);console.log(JSON.stringify(results,null,2));};
try {
 const {data:budget,error:migration}=await db.from('scout_budget_settings').select('id,run_usd,tiktok_run_usd').single();if(migration)throw new Error('Runtime migration is unavailable. No paid verification was started.');
 const {data:owner,error}=await db.from('profiles').select('id').eq('role','admin').limit(1).single();if(error)throw error;
 for(const platform of ['Instagram','Facebook','TikTok']) {
  for(const task of (platform==='TikTok' ? ['profiles','hashtag'] : platform==='Facebook' ? ['profiles','hashtag','communities','keyword'] : ['profiles','hashtag','communities']) as Array<'profiles'|'hashtag'|'communities'|'keyword'>)for(const [index,plan] of providerPlans(platform,task,['profiles','communities'].includes(task)?'running':'#chaybo',1,'Nationwide').entries())checks.push({name:`${platform.toLowerCase()}-${task}-${index}`,platform,task,plan});
  const url=platform==='Instagram'?'https://www.instagram.com/nike/':platform==='Facebook'?'https://www.facebook.com/nike/':'https://www.tiktok.com/@nike';
  for(const task of ['profile-details','profile-posts'] as const)checks.push({name:`${platform.toLowerCase()}-${task}`,platform,task,plan:providerPlans(platform,task,url,1)[0]});
 }
 // Comment contracts use public post URLs supplied explicitly; discovery does not infer a post from a profile URL.
 const comments=process.env.APIFY_VERIFY_COMMENT_URLS ? JSON.parse(process.env.APIFY_VERIFY_COMMENT_URLS) : {};
 for(const platform of ['Instagram','Facebook','TikTok'])if(comments[platform])checks.push({name:`${platform.toLowerCase()}-comments`,platform,task:'comments',plan:providerPlans(platform,'comments',comments[platform],20)[0]});else results.push({name:`${platform.toLowerCase()}-comments`,verified:false,reason:'No public test post URL configured.'});
 if(process.env.APIFY_VERIFY_GROUP_URL)checks.push({name:'facebook-group-feed',platform:'Facebook',task:'profile-posts',plan:providerPlans('Facebook','profile-posts',process.env.APIFY_VERIFY_GROUP_URL,1)[0]});
 checks.push({name:'facebook-group-search',platform:'Facebook',task:'communities',plan:{actor:'parseforge~facebook-groups-search-scraper',input:{searchQueries:['Saigon run club'],maxItems:1,proxyConfiguration:{useApifyProxy:true,apifyProxyGroups:['RESIDENTIAL']}}}});
 for(const check of checks.filter(c=>!select || select.split(',').includes(c.name))) {
  if(batch && check.task!=='profile-details')continue;
  if(dateFilter){if(check.task!=='profile-posts' || !['apify~instagram-scraper','apify~facebook-posts-scraper'].includes(check.plan.actor))continue;check.plan.input.onlyPostsNewerThan=newerThan;}
  if(batch){if(check.platform==='Instagram')check.plan.input.directUrls=['https://www.instagram.com/nike/','https://www.instagram.com/adidas/'];else if(check.platform==='Facebook')check.plan.input.startUrls=[{url:'https://www.facebook.com/nike/'},{url:'https://www.facebook.com/adidas/'}];else check.plan.input.profiles=['nike','adidas'];}
  let session:any;
  const requestedProfiles=check.task==='profile-details' ? (check.platform==='TikTok' ? check.plan.input.profiles.map((handle:string)=>`https://www.tiktok.com/@${handle}`) : check.platform==='Instagram' ? check.plan.input.directUrls : check.plan.input.startUrls.map((item:any)=>item.url)) : [];
  try {
   const actor=(await apifyApi(`acts/${check.plan.actor}`)).data;
   const minimum=actor.pricingInfos?.at(-1)?.minimalMaxTotalChargeUsd;
   const runCap=Number(check.platform==='TikTok' ? budget!.tiktok_run_usd : budget!.run_usd);
   if(typeof minimum==='number' && minimum>runCap){results.push({name:check.name,verified:false,blocked:true,reason:`Actor minimum run cap exceeds the $${runCap.toFixed(2)} platform policy.`,minimumRunCapUsd:minimum,paidRunStarted:false});continue;}
   const buildId=actor.taggedBuilds?.latest?.buildId;if(!buildId)throw new Error('Actor does not expose a latest immutable build.');
   const build=(await apifyApi(`actor-builds/${buildId}`)).data;const buildNumber=build.buildNumber;if(!buildNumber)throw new Error('Build number unavailable.');
   const {data,error}=await db.from('scout_sessions').insert({owner_id:owner.id,kind:'verification',verification:true,runtime_version:2,params:{verificationBuild:buildNumber,...(memory ? {memory} : {})}}).select('id').single();if(error)throw error;session=data;
   let rows:any[]=[];const deadline=Date.now()+240000;
   while(true){try{rows=await executePlan(session.id,check.platform,check.task,check.plan);break;}catch(e){if(!(e instanceof PendingScout) || Date.now()>deadline)throw e;await new Promise(r=>setTimeout(r,5000));}}
   const parsed=check.task==='comments' ? rows : rows.map(r=>['profiles','profile-details','communities'].includes(check.task)?parseProfile(r,check.platform):parsePost(r,check.platform)).filter(Boolean);
   const {data:runs,error:runError}=await db.from('scout_provider_runs').select('provider_run_id,build_id,dataset_ids,actual_usd,reserved_usd,warnings,usage,pricing').eq('session_id',session.id);if(runError)throw runError;
   const gate=verificationGate({count:parsed.length,requestedProfiles,observedProfiles:parsed.map((profile:any)=>profile.url || ''),runs:runs || []});
   if(dateFilter && parsed.some((post:any)=>!post.publishedAt || Date.parse(post.publishedAt)<Date.parse(newerThan))) {gate.verified=false;gate.reasons.push('Date-filter output includes missing or out-of-window publication times.');}
   if(check.task==='comments' && parsed.length>20){gate.verified=false;gate.reasons.push('Comment output exceeds the requested sample quota.');}
   const receipt={platform:check.platform,task:check.task,actor:check.plan.actor,input:check.plan.input,name:check.name,verified:gate.verified,reasons:gate.reasons,build:buildNumber,count:rows.length,parsed:parsed.length,runs,memory:memory || 'Actor default',pricingModel:actor.pricingInfos?.at(-1)?.pricingModel || 'UNKNOWN',dataAliases:['default'],supportsBatch:batch,supportsDateFilter:dateFilter};results.push(receipt);
   const {error:save}=await db.from('scout_sessions').update({status:'complete',result:{success:receipt.verified,counts:{validated:parsed.length}}}).eq('id',session.id);if(save)throw save;
   // Memory experiments never change the production capability/build receipt.
   if(receipt.verified && !memory){const {data:prior}=await db.from('scout_provider_capabilities').select('receipt,build').eq('capability_key',capabilityKey(check.plan,check.task)).maybeSingle();if(prior && prior.build===buildNumber){if(prior.receipt?.supportsBatch)receipt.supportsBatch=true;if(prior.receipt?.supportsDateFilter)receipt.supportsDateFilter=true;}const {error}=await db.from('scout_provider_capabilities').upsert({capability_key:capabilityKey(check.plan,check.task),actor:check.plan.actor,build:buildNumber,verified:true,receipt,verified_at:new Date().toISOString()});if(error)throw error;}
  }catch(e:any){results.push({name:check.name,verified:false,reason:e.message,code:e.code});if(session)await db.from('scout_sessions').update({status:'failed',result:{success:false,error:e.message,code:e.code}}).eq('id',session.id);}
 }
}catch(e:any){results.push({verified:false,blocked:true,reason:e.message});process.exitCode=1;}
await record();
