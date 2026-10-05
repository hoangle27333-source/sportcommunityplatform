/** Isolated Redis queue, real session/executor, verification ledger; no CRM writes. */
import { Queue, Worker } from 'bullmq';
import { randomUUID } from 'node:crypto';
import assert from 'node:assert/strict';
import { writeFile } from 'node:fs/promises';
import { createAdminClient } from '../../src/lib/supabase/admin';
import { QUEUE_NAMES, createRedisConnection } from '../../src/lib/queue';
import { executeSession } from '../../src/lib/apify/sessions';
import { profileIdentity } from '../../src/lib/apify/verification';
const db=createAdminClient();
const owner=await db.from('profiles').select('id').eq('role','admin').limit(1).single();if(owner.error)throw owner.error;
const capability=await db.from('scout_provider_capabilities').select('build').eq('capability_key','apify~instagram-scraper:profile-details:details').eq('verified',true).single();if(capability.error)throw capability.error;
const resumeId=process.argv.find(arg=>arg.startsWith('--session='))?.slice('--session='.length);
const session=resumeId ? await db.from('scout_sessions').select('id').eq('id',resumeId).eq('verification',true).eq('kind','inspect').eq('params->>url','https://www.instagram.com/nike/').single() : await db.from('scout_sessions').insert({owner_id:owner.data.id,kind:'inspect',verification:true,runtime_version:2,params:{url:'https://www.instagram.com/nike/',platform:'Instagram',verificationBuild:capability.data.build}}).select('id').single();if(session.error)throw session.error;
const queueName='social-scout-verification-'+randomUUID();const producerConnection=createRedisConnection(undefined,QUEUE_NAMES.socialScout);const workerConnection=createRedisConnection(undefined,QUEUE_NAMES.socialScout);const queue=new Queue(queueName,{connection:producerConnection});
const worker=new Worker(queueName,async job=>{if(await executeSession(job.data.sessionId))throw new Error('Pending provider');},{connection:workerConnection,settings:{backoffStrategy:attempt=>Math.min(30000,5000*attempt)}});
try{
 await queue.add('session',{sessionId:session.data.id},{jobId:session.data.id,attempts:60,backoff:{type:'scout'}});
 const deadline=Date.now()+300000;let stored:any;
 while(Date.now()<deadline){const response=await db.from('scout_sessions').select('status,result').eq('id',session.data.id).single();if(response.error)throw response.error;stored=response.data;if(['complete','failed'].includes(stored.status))break;await new Promise(resolve=>setTimeout(resolve,5000));}
 assert.equal(stored.status,'complete');assert.equal(profileIdentity(stored.result.data.url),'instagram.com/nike');
 assert.equal(await executeSession(session.data.id),false);
 const runs=await db.from('scout_provider_runs').select('provider_run_id,actual_usd,reserved_usd').eq('session_id',session.data.id);if(runs.error)throw runs.error;assert.equal(runs.data.length,1);
 const receipt={observedAt:new Date().toISOString(),sessionId:session.data.id,status:stored.status,queue:'isolated BullMQ queue using executeSession',completedReplay:'no new run',runs:runs.data,crmWrites:0};await writeFile('artifacts/apify-runtime/worker-runtime-receipt.json',JSON.stringify(receipt,null,2)+'\n');console.log(JSON.stringify(receipt,null,2));
}finally{await worker.close();await queue.close();await producerConnection.quit();await workerConnection.quit();}
