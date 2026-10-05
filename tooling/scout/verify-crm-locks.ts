/** Explicit production sync verification of a real KOL with locked fields. */
import assert from 'node:assert/strict';
import {writeFile,readFile} from 'node:fs/promises';
import {createAdminClient} from '../../src/lib/supabase/admin';
import {executeSession} from '../../src/lib/apify/sessions';
if(!process.argv.includes('--production-authorized'))throw new Error('Explicit production authorization required.');
const db=createAdminClient();const kolId='afe0f2d8-f6ac-4d2c-9b1f-785ff44a28d1';
const before=await db.from('kols').select('*').eq('id',kolId).single();if(before.error)throw before.error;
const owner=await db.from('profiles').select('id').eq('role','admin').limit(1).single();if(owner.error)throw owner.error;
const cap=await db.from('scout_provider_capabilities').select('build').eq('capability_key','clockworks~tiktok-scraper:profile-details:default').eq('verified',true).single();if(cap.error)throw cap.error;
const file='artifacts/apify-runtime/crm-locks-receipt.json';let receipt:any;
if(process.argv.includes('--resume'))receipt=JSON.parse(await readFile(file,'utf8'));else{const s=await db.from('scout_sessions').insert({owner_id:owner.data.id,kind:'sync',verification:true,runtime_version:2,params:{ids:[kolId],entityType:'kol',verificationBuild:cap.data.build}}).select('id').single();if(s.error)throw s.error;receipt={environment:'production',startedAt:new Date().toISOString(),kolId,name:before.data.name,sessionId:s.data.id,lockedFields:before.data.user_locked_fields,profileImports:0};await writeFile(file,JSON.stringify(receipt,null,2));}
const until=Date.now()+10*60000;while(Date.now()<until){await executeSession(receipt.sessionId);const s=await db.from('scout_sessions').select('status,result').eq('id',receipt.sessionId).single();if(s.error)throw s.error;if(['complete','failed'].includes(s.data.status)){receipt.status=s.data.status;receipt.counts=s.data.result?.counts;receipt.failed=s.data.result?.failed;await writeFile(file,JSON.stringify(receipt,null,2));assert.equal(s.data.status,'complete',JSON.stringify(receipt));break;}await new Promise(r=>setTimeout(r,5000));}
assert.equal(receipt.status,'complete','Resume the saved session ID; do not create a replacement.');
const after=await db.from('kols').select('*').eq('id',kolId).single();if(after.error)throw after.error;
assert(before.data.user_locked_fields?.length,'Verification must exercise locked fields');for(const key of before.data.user_locked_fields)assert.deepEqual(after.data[key],before.data[key],`Locked field changed: ${key}`);assert.equal(after.data.name,before.data.name);assert.equal(after.data.bio,before.data.bio);assert.equal(after.data.scout_provenance?.source,'apify');receipt.lockedFieldsPreserved=true;receipt.bioReviewPreserved=true;receipt.observationRunId=after.data.scout_provenance.runId;receipt.finishedAt=new Date().toISOString();await writeFile(file,JSON.stringify(receipt,null,2)+'\n');console.log(JSON.stringify(receipt,null,2));
