import { Worker } from 'bullmq';
import { QUEUE_NAMES, createRedisConnection } from '@/lib/queue';
import { createAdminClient } from '@/lib/supabase/admin';
import {reconcileProviderBilling} from '@/lib/apify/runtime';
import { executeSession, enqueueScoutSession } from '@/lib/apify/sessions';
let reconciling=false;
export async function reconcileScoutSessions() {
  if(reconciling)return;reconciling=true;
  try {
  const db=createAdminClient(); const now=new Date().toISOString();
  const {data,error}=await db.from('scout_sessions').select('id').in('status',['pending','running']).eq('verification',false).or(`lease_until.is.null,lease_until.lt.${now}`).limit(100);
  if(error) throw error;
  for(const s of data || []) await enqueueScoutSession(s.id);
  const {error:cacheCleanup}=await db.from('scout_provider_cache').delete().lt('expires_at',now); if(cacheCleanup) throw cacheCleanup;
  const {error:cleanup}=await db.from('scout_provider_runs').update({raw_rows:null}).lt('created_at',new Date(Date.now()-30*86400000).toISOString()).not('raw_rows','is',null); if(cleanup) throw cleanup;
  await reconcileProviderBilling();
  } finally {reconciling=false;}
}
export function createSocialScoutWorker() {
  const worker=new Worker(QUEUE_NAMES.socialScout,async job=> {
    const pending=await executeSession(job.data.sessionId);
    if(pending) throw new Error('Scout run pending');
  },{connection:createRedisConnection(undefined,QUEUE_NAMES.socialScout),concurrency:1,settings:{backoffStrategy:attempts=>Math.min(30000,5000*attempts)}});
  const timer=setInterval(()=>void reconcileScoutSessions().catch(error=>console.error('[social-scout] Reconciliation failed',error.message)),30000);
  worker.on('closed',()=>clearInterval(timer));
  void reconcileScoutSessions().catch(error=>console.error('[social-scout] Reconciliation failed',error.message));
  return worker;
}
