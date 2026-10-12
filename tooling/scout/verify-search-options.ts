/** Explicit paid probe of optional inputs on the EXISTING pinned build; never imports content or profiles. */
import {createAdminClient} from '../../src/lib/supabase/admin';
import {executePlan,capabilityKey} from '../../src/lib/apify/runtime';
import {providerPlans,parsePost,parseProfile,PendingScout} from '../../src/lib/apify/providers';
import {verificationGate} from '../../src/lib/apify/verification';
import {assessProfile} from '../../src/lib/apify/discovery-quality';
const arg=(name:string)=>process.argv.find(a=>a.startsWith(`--${name}=`))?.split('=').slice(1).join('=');
const option=arg('option'),budget=Number(arg('budget-usd'));
if(!process.argv.includes('--allow-paid') || !['facebook-locations','tiktok-video-filters','instagram-date-filter'].includes(option || '') || !Number.isFinite(budget) || budget<=0 || budget>1)throw new Error('Supply --allow-paid, --budget-usd=<approved cap up to 1> and --option=facebook-locations|tiktok-video-filters|instagram-date-filter.');
const platform=option==='facebook-locations'?'Facebook':option==='tiktok-video-filters'?'TikTok':'Instagram';
const task=platform==='Facebook'?'profiles':platform==='TikTok'?'keyword':'hashtag';
const db=createAdminClient();const {data:policy,error:policyError}=await db.rpc('scout_search_budget_policy');if(policyError || policy!==4)throw new Error('Apply the search budget migration before paid verification.');
const plan=providerPlans(platform,task,platform==='Instagram'?'chaybo':'chạy bộ Vietnam',5,'Vietnam')[0];
const key=capabilityKey(plan,task);const {data:prior,error}=await db.from('scout_provider_capabilities').select('*').eq('capability_key',key).single();if(error || !prior?.verified || !prior.build || ['latest','stable','beta'].includes(prior.build))throw new Error('An existing verified immutable build is required.');
const cutoff=new Date(Date.now()-7*86400000).toISOString();
if(platform==='Facebook')plan.input.locations=['Vietnam'];
if(platform==='TikTok'){plan.input.videoSearchSorting='MOST_LIKED';plan.input.videoSearchDateFilter='PAST_WEEK';}
if(platform==='Instagram')plan.input.onlyPostsNewerThan=cutoff;
const {data:owner,error:roleError}=await db.from('profiles').select('id').eq('role','admin').limit(1).single();if(roleError)throw roleError;
const {data:session,error:saveError}=await db.from('scout_sessions').insert({owner_id:owner.id,kind:'verification',verification:true,runtime_version:3,params:{verificationBuild:prior.build,maxSessionUsd:budget}}).select('id').single();if(saveError)throw saveError;
try {
 let rows:any[]=[];const deadline=Date.now()+240000;
 while(true){try{rows=await executePlan(session.id,platform,task,plan);break;}catch(e){if(!(e instanceof PendingScout) || Date.now()>deadline)throw e;await new Promise(resolve=>setTimeout(resolve,5000));}}
 const parsed=rows.map(r=>platform==='Facebook'?parseProfile(r,platform):parsePost(r,platform)).filter(Boolean) as any[];
 const {data:runs,error:readError}=await db.from('scout_provider_runs').select('provider_run_id,build_id,actual_usd,reserved_usd,warnings').eq('session_id',session.id);if(readError)throw readError;
 const gate=verificationGate({count:parsed.length,runs:runs || []});
 if(platform==='Facebook' && parsed.some(p=>!assessProfile(p,'Running','Vietnam','Individual KOLs').locationMatch)){gate.verified=false;gate.reasons.push('Location filter did not produce independently verified Vietnam results.');}
 if(platform!=='Facebook' && parsed.some(p=>!p.publishedAt || Date.parse(p.publishedAt)<Date.parse(cutoff))){gate.verified=false;gate.reasons.push('Date filter returned unknown or out-of-window publication dates.');}
 if(platform==='TikTok' && parsed.some((p,i)=>p.likes===null || i>0 && p.likes>parsed[i-1].likes)){gate.verified=false;gate.reasons.push('MOST_LIKED order could not be verified from observed likes.');}
 const report={option,build:prior.build,sessionId:session.id,verified:gate.verified,reasons:gate.reasons,count:parsed.length,actualUsd:(runs || []).some(r=>r.actual_usd==null)?null:(runs || []).reduce((sum,r)=>sum+Number(r.actual_usd),0)};
 if(gate.verified){const flag=platform==='Facebook'?'facebookLocations':platform==='TikTok'?'tiktokVideoFilters':'dateFilter';const receipt={...prior.receipt,...(platform==='Instagram'?{supportsDateFilter:true}:{}),verifiedSearchOptions:{...prior.receipt?.verifiedSearchOptions,[flag]:true},searchOptionVerification:{...prior.receipt?.searchOptionVerification,[flag]:report}};
 const {data:updated,error:updateError}=await db.from('scout_provider_capabilities').update({receipt}).eq('capability_key',key).eq('build',prior.build).eq('receipt',JSON.stringify(prior.receipt)).select('capability_key').maybeSingle();if(updateError || !updated)throw new Error('The capability changed during verification; no option was enabled.');}
 const {error:resultError}=await db.from('scout_sessions').update({status:'complete',result:report}).eq('id',session.id);if(resultError)throw resultError;
 console.log(JSON.stringify(report,null,2));if(!gate.verified)process.exitCode=1;
} catch(e:any){await db.from('scout_sessions').update({status:'failed',result:{success:false,error:e.message}}).eq('id',session.id);throw e;}
