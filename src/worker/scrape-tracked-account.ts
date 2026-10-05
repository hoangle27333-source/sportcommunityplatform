import {createHash} from 'node:crypto';
import type { Job } from 'bullmq';
import { createAdminClient } from '@/lib/supabase/admin';
import { enqueue,QUEUE_NAMES } from '@/lib/queue';
/** Compatibility dispatcher for jobs already in the old Playwright queue. */
export async function processScrapeTrackedAccount(job:Job):Promise<void> {
 const db=createAdminClient();
 const hex=createHash('sha256').update(`${job.queueName}:${job.id}:${job.data.trackedAccountId}`).digest('hex');
 const sessionId=job.data.scoutSessionId || `${hex.slice(0,8)}-${hex.slice(8,12)}-4${hex.slice(13,16)}-a${hex.slice(17,20)}-${hex.slice(20,32)}`;
 const {data:account,error}=await db.from('tracked_accounts').select('created_by').eq('id',job.data.trackedAccountId).single();if(error)throw error;
 const {error:save}=await db.from('scout_sessions').upsert({id:sessionId,owner_id:account.created_by,kind:'tracked',runtime_version:2,params:{trackedAccountId:job.data.trackedAccountId}},{onConflict:'id',ignoreDuplicates:true});if(save)throw save;
 if(!job.data.scoutSessionId)await job.updateData({...job.data,scoutSessionId:sessionId});
 await enqueue(QUEUE_NAMES.socialScout,'session',{sessionId},{jobId:sessionId,attempts:180,backoff:{type:'scout',delay:5000},removeOnComplete:true,removeOnFail:true});
}
