/** Resume one explicitly supplied UI-created session; never create or reconcile other sessions. */
import { Queue, Worker } from 'bullmq';
import { randomUUID } from 'node:crypto';
import { writeFile } from 'node:fs/promises';
import { z } from 'zod';
import { createAdminClient } from '../../src/lib/supabase/admin';
import { createRedisConnection } from '../../src/lib/queue';
import { executeSession } from '../../src/lib/apify/sessions';
const id=z.string().uuid().parse(process.argv.find(a=>a.startsWith('--session='))?.slice(10));
const db=createAdminClient();
const {data:initial,error}=await db.from('scout_sessions').select('id,kind,status,params,verification').eq('id',id).single();
if(error)throw error;
if(initial.verification || initial.kind!=='kol-posts' || initial.params.limit!==5 || JSON.stringify(initial.params.platform)!=='["Instagram"]')throw Error('This audit runner accepts only the bounded UI post audit session.');
const name='scout-ui-audit-'+randomUUID(),producer=createRedisConnection(),consumer=createRedisConnection();
const queue=new Queue(name,{connection:producer});
const worker=new Worker(name,async()=>{if(await executeSession(id))throw Error('Provider is still running');},{connection:consumer,concurrency:1,settings:{backoffStrategy:attempt=>Math.min(30000,5000*attempt)}});
try {
 await queue.add('session',{sessionId:id},{jobId:id,attempts:30,backoff:{type:'scout'},removeOnComplete:true});
 const deadline=Date.now()+300000;let stored:any;
 while(Date.now()<deadline){const response=await db.from('scout_sessions').select('status,result,warnings').eq('id',id).single();if(response.error)throw response.error;stored=response.data;console.log(JSON.stringify({sessionId:id,status:stored.status}));if(['complete','failed'].includes(stored.status))break;await new Promise(r=>setTimeout(r,5000));}
 const runs=await db.from('scout_provider_runs').select('provider_run_id,state,actual_usd').eq('session_id',id);if(runs.error)throw runs.error;
 const receipt={recordedAt:new Date().toISOString(),sessionId:id,queue:'isolated local Redis worker; production queue unavailable',status:stored.status,counts:stored.result?.counts,warnings:stored.warnings,runs:runs.data};
 await writeFile('artifacts/scout-workspace/chrome-live-session.json',JSON.stringify(receipt,null,2)+'\n');console.log(JSON.stringify(receipt));
} finally {await worker.close();await queue.close();await producer.quit();await consumer.quit();}
