/** Explicit production CRM verification on an existing account; no profile imports. */
import assert from 'node:assert/strict';
import {writeFile,mkdir,readFile} from 'node:fs/promises';
import {createAdminClient} from '../../src/lib/supabase/admin';
import {executeSession} from '../../src/lib/apify/sessions';
import {commentPreview} from '../../src/lib/apify/tasks';
import {runKolAudienceAudit,getLatestAudienceAudit} from '../../src/lib/sport-hub/audience-audit';
const kolId=process.argv.find(a=>a.startsWith('--kol='))?.slice(6);
if(!process.argv.includes('--production-authorized') || !kolId)throw new Error('Supply --production-authorized and an existing --kol=<uuid>.');
const db=createAdminClient();const {data:owner,error:oe}=await db.from('profiles').select('id').eq('role','admin').limit(1).single();if(oe)throw oe;
const {data:before,error:be}=await db.from('kols').select('*').eq('id',kolId).single();if(be)throw be;
const platform=before.profile_url?.includes('instagram.com')?'Instagram':null;
if(!platform)throw new Error('This verification requires an existing Instagram profile.');
const {data:cap,error:ce}=await db.from('scout_provider_capabilities').select('build').eq('capability_key','apify~instagram-scraper:profile-details:details').eq('verified',true).single();if(ce)throw ce;
let receipt:any={startedAt:new Date().toISOString(),environment:'production',kolId,name:before.name,profileImports:0,steps:[],lockedFields:before.user_locked_fields || []};
if(process.argv.includes('--resume')){receipt=JSON.parse(await readFile('artifacts/apify-runtime/crm-production-receipt.json','utf8'));assert.equal(receipt.kolId,kolId);}
const steps:any[]=receipt.steps;
async function save(){await mkdir('artifacts/apify-runtime',{recursive:true});await writeFile('artifacts/apify-runtime/crm-production-receipt.json',JSON.stringify(receipt,null,2)+'\n');}
async function task(kind:string,params:any){let step:any=steps.find(s=>s.kind===kind);if(!step){let build=cap!.build;if(kind==='comments'){const c=await db.from('scout_provider_capabilities').select('build').eq('capability_key','apify~instagram-scraper:comments:comments').eq('verified',true).single();if(c.error)throw c.error;build=c.data.build;}const {data:s,error}=await db.from('scout_sessions').insert({owner_id:owner!.id,kind,verification:true,runtime_version:2,params:{...params,verificationBuild:build}}).select('id').single();if(error)throw error;step={kind,sessionId:s.id};steps.push(step);await save();}const s={id:step.sessionId};const deadline=Date.now()+15*60000;while(Date.now()<deadline){await executeSession(s.id);const {data:stored,error}=await db.from('scout_sessions').select('status,result').eq('id',s.id).single();if(error)throw error;if(['complete','failed'].includes(stored.status)){Object.assign(step,{status:stored.status,counts:stored.result?.counts,warnings:stored.result?.warnings,code:stored.result?.code,failed:stored.result?.failed});await save();assert.equal(stored.status,'complete',JSON.stringify(step));return stored.result;}await new Promise(r=>setTimeout(r,5000));}throw new Error('Session remains pending; resume the saved ID, do not start a replacement.');}
try {
 await task('sync',{ids:[kolId],entityType:'kol'});
 const {data:after,error}=await db.from('kols').select('*').eq('id',kolId).single();if(error)throw error;
 const aliases:Record<string,string>={avgViews:'avg_views',contact:'contact_info',profileUrl:'profile_url'};
 for(const key of before.user_locked_fields || [])assert.deepEqual(after[aliases[key] || key],before[aliases[key] || key],`Locked field changed: ${key}`);
 assert.equal(after.name,before.name);assert.equal(after.bio,before.bio);assert.equal(after.scout_provenance?.source,'apify');receipt.sync={originalNamePreserved:true,bioReviewPreserved:true,lockedFieldsPreserved:true,observationRunId:after.scout_provenance.runId,missingMetrics:after.scout_missing_metrics};
 await task('kol-posts',{kolId,platform:['Instagram'],limit:10});
 const preview=await commentPreview(kolId);const selectedPostIds=preview.posts.map(p=>p.id);receipt.commentPreview={selectedPostIds,budgetCeilingUsd:preview.budgetCeilingUsd};await save();
 if(!selectedPostIds.length)throw new Error('No recent persisted posts with observed comments; comment gate remains unverified.');
 await task('comments',{kolId,selectedPostIds});
 const {data:comments,error:ec}=await db.from('scout_comment_evidence').select('id,post_id,text,provenance').in('post_id',selectedPostIds);if(ec)throw ec;
 assert(comments.length>0);assert(comments.length<=100);assert(comments.every(c=>c.id && c.text && c.provenance?.runId));receipt.comments={count:comments.length,evidenceIds:comments.map(c=>c.id),provenancePresent:true};
 const countBefore=await db.from('scout_provider_runs').select('id',{count:'exact',head:true});if(countBefore.error)throw countBefore.error;
 const audit=await runKolAudienceAudit(kolId,{force:true,heuristicsOnly:true});assert(audit.auditId,'Audit history must persist');
 const loaded=await getLatestAudienceAudit(kolId);assert.equal(loaded?.auditId,audit.auditId);
 const countAfter=await db.from('scout_provider_runs').select('id',{count:'exact',head:true});if(countAfter.error)throw countAfter.error;assert.equal(countAfter.count,countBefore.count,'Audit must not start scraping');
 receipt.audit={auditId:audit.auditId,commentsScanned:audit.totalCommentsScanned,realAudienceRate:audit.realAudienceRate,seedingRiskLevel:audit.seedingRiskLevel,persistedReload:true,noScraping:true,analyzer:'stored evidence / heuristicsOnly'};
 receipt.status='passed';receipt.finishedAt=new Date().toISOString();await save();console.log(JSON.stringify(receipt,null,2));
} catch(e:any){receipt.status='failed';receipt.error=e.message;await save();throw e;}
