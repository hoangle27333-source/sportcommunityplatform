/** Explicit, bounded activation. Dry-run by default; never changes administrative budgets. */
import { mkdir,readFile,writeFile } from 'node:fs/promises';
import { createAdminClient } from '../../src/lib/supabase/admin';
import { apifyApi } from '../../src/lib/apify/runtime';
import { verifyApifyFreeCredit } from '../../src/lib/scout-experimental/apify-credit';
const db=createAdminClient();
const credit=await verifyApifyFreeCredit(.1);
const {data:verified,error}=await db.from('scout_provider_capabilities').select('capability_key,verified,build');if(error)throw error;
const model='gemini-2.5-flash-lite';
const available=await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}`,{headers:{'x-goog-api-key':process.env.GEMINI_API_KEY!},signal:AbortSignal.timeout(15000)});
if(!available.ok)throw new Error(`Pinned model unavailable: HTTP ${available.status}`);
const walletId='apify-free-2026-10-05';
const budget=Math.floor(Math.min(.8,credit.remainingUsd-.15)*100)/100;
const receipt={observedAt:new Date().toISOString(),credit,allocatedUsd:budget,source:'Authenticated Apify users/me and users/me/limits; isPaying=false, FREE, max monthly usage <= included credits',model,modelAvailable:true,adminBudgetsChanged:false};
const hosts=new Set<string>();
try{const pilot=JSON.parse(await readFile('private/scout-dataset/seed-content-apify-pilot.json','utf8'));for(const s of Object.values(pilot.stages) as any[])for(const row of s.rows || [])for(const m of row.media || []){try{const h=new URL(m.thumbnail).hostname;if(h.endsWith('.fbcdn.net'))hosts.add(h);}catch{}}}catch{}
const {data:mediaRuns,error:mediaError}=await db.from('scout_provider_runs').select('actor,task,build,platform,normalized_rows').in('platform',['TikTok','Instagram']).eq('state','succeeded').order('created_at',{ascending:false}).limit(10);if(mediaError)throw mediaError;
for(const run of mediaRuns || [])if(verified?.some(v=>v.verified&&v.build===run.build&&v.capability_key.startsWith(run.actor+':'+run.task+':')))for(const row of run.normalized_rows || [])for(const value of [row.videoMeta?.coverUrl,row.displayUrl,row.thumbnailUrl,row.videoMeta?.downloadAddr])try{const u=new URL(value);if(u.protocol==='https:'&&['tiktokcdn.com','tiktokcdn-us.com','tiktokcdn-eu.com','cdninstagram.com'].some(domain=>u.hostname.endsWith('.'+domain)))hosts.add(u.hostname);}catch{}
const minima:Record<string,number>={};
for(const actor of [...new Set((verified || []).filter(v=>v.verified).map(v=>v.capability_key.split(':')[0]))].filter(actor=>!actor.includes('comments')&&!actor.includes('groups'))){const {data}=await apifyApi('acts/'+actor);const pricing=data.pricingInfos?.filter((p:any)=>Date.parse(p.startedAt)<=Date.now()).sort((a:any,b:any)=>Date.parse(b.startedAt)-Date.parse(a.startedAt))[0];if(!pricing)throw new Error('Provider pricing is unavailable.');minima[actor]=Number(pricing.minimalMaxTotalChargeUsd || 0);}
const {data:policy,error:policyError}=await db.from('scout_budget_settings').select('run_usd,tiktok_run_usd').single();if(policyError)throw policyError;
const rows:any[]=[];
for(const platform of ['Facebook','Instagram','TikTok'])for(const operation of ['discovery','profile','posts']){
 const actors=platform==='Facebook'?['facebook-search-scraper','facebook-pages-scraper','facebook-posts-scraper']:platform==='Instagram'?['instagram-scraper']:['tiktok-scraper'];
 const tasks=operation==='discovery'?['profiles','keyword','hashtag']:operation==='profile'?['profile-details']:['profile-posts'];
 const builds=Object.fromEntries((verified || []).filter(v=>v.verified&&actors.some(a=>v.capability_key.split(':')[0].endsWith('~'+a))&&tasks.includes(v.capability_key.split(':')[1])).map(v=>[v.capability_key,v.build]));
 if(!Object.keys(builds).length)throw new Error(`${platform} ${operation} lacks verified builds.`);
 const minimumRunCapUsd=Math.max(.05,...Object.keys(builds).map(key=>minima[key.split(':')[0]] || 0));const allowed=Number(platform==='TikTok'?policy.tiktok_run_usd:policy.run_usd);
 rows.push({provider:'apify',operation,platform,revision:'verified-free-20261012-2',verified:minimumRunCapUsd<=allowed,expires_at:credit.cycleEndsAt,total_units:50,units_per_request:1,max_value_usd:minimumRunCapUsd,config:{minimumRunCapUsd,...(minimumRunCapUsd>allowed?{blockedReason:'Provider minimum reservation exceeds administrative policy.'}:{}),builds,trialAccountId:walletId,trialOnly:true,billingDisabled:true,receiptUrl:'https://console.apify.com/billing'}});
}
rows.push({provider:'gemini',operation:'analysis',platform:'*',revision:'flash-lite-budgeted-20261012-1',verified:true,expires_at:credit.cycleEndsAt,total_units:32,units_per_request:1,max_value_usd:.005,config:{model,paidModel:true,pricingRevision:'2026-10-12-flash-lite-0.10-0.40',mediaHosts:[...hosts],receiptUrl:'https://ai.google.dev/gemini-api/docs/pricing'}});
if(process.argv.includes('--apply')){
 const {data:wallet,error:we}=await db.from('scout_trial_accounts').select('*').eq('id',walletId).maybeSingle();if(we)throw we;
 if(!wallet){const {error}=await db.from('scout_trial_accounts').insert({id:walletId,provider:'apify',verified:true,expires_at:credit.cycleEndsAt,total_value_usd:budget,receipt});if(error)throw error;}
 for(const row of rows){const {data:previous,error:pe}=await db.from('scout_trial_capabilities').select('id,used_units').eq('provider',row.provider).eq('operation',row.operation).eq('platform',row.platform).maybeSingle();if(pe)throw pe;const {error}=await db.from('scout_trial_capabilities').upsert({...row,...(previous?{id:previous.id,used_units:previous.used_units}:{})},{onConflict:'provider,operation,platform'});if(error)throw error;}
 await mkdir('docs/scout',{recursive:true});await writeFile('docs/scout/activation-receipt.json',JSON.stringify({...receipt,capabilities:rows.map(({config,...row})=>({...row,builds:config.builds,mediaHosts:config.mediaHosts})),applied:true},null,2)+'\n');
}
console.log(JSON.stringify({...receipt,capabilities:rows.length,applied:process.argv.includes('--apply')}));
