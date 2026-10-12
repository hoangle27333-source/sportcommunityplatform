import { Worker } from 'bullmq';
import { QUEUE_NAMES, createRedisConnection } from '@/lib/queue';
import { createAdminClient } from '@/lib/supabase/admin';
import {reconcileProviderBilling} from '@/lib/apify/runtime';
import { executeSession } from '@/lib/apify/sessions';
let reconciling=false;
export async function reconcileScoutSessions() {
  if(process.env.SCOUT_LEGACY_WORKER_ENABLED!=='true') return;
  if(reconciling)return;reconciling=true;
  try {
  const db=createAdminClient(); const now=new Date().toISOString();
  const {data,error}=await db.from('scout_sessions').select('id').in('status',['pending','running']).eq('verification',false).eq('execution_engine','legacy').or(`lease_until.is.null,lease_until.lt.${now}`).limit(100);
  if(error) throw error;
  // Legacy consumers are retained only for explicitly enabled maintenance.
  // New Scout sessions are dispatched exclusively through Workflow.
  for(const s of data || []) await import('@/lib/queue').then(({enqueue})=>enqueue(QUEUE_NAMES.socialScout,'session',{sessionId:s.id},{jobId:s.id}));
  const {error:cacheCleanup}=await db.from('scout_provider_cache').delete().lt('expires_at',now); if(cacheCleanup) throw cacheCleanup;
  const {error:cleanup}=await db.from('scout_provider_runs').update({raw_rows:null}).lt('created_at',new Date(Date.now()-30*86400000).toISOString()).not('raw_rows','is',null); if(cleanup) throw cleanup;
  await reconcileProviderBilling();
  } finally {reconciling=false;}
}
export function createSocialScoutWorker() {
  if(process.env.SCOUT_LEGACY_WORKER_ENABLED!=='true') throw new Error('Scout uses Vercel Workflows. Legacy worker is disabled.');
  const worker=new Worker(QUEUE_NAMES.socialScout,async job=> {
    const {data:session,error}=await createAdminClient().from('scout_sessions').select('execution_engine').eq('id',job.data.sessionId).single();
    if(error) throw error;
    if(session?.execution_engine==='workflow') return;
    const pending=await executeSession(job.data.sessionId);
    if(pending) throw new Error('Scout run pending');
  },{connection:createRedisConnection(undefined,QUEUE_NAMES.socialScout),concurrency:1,settings:{backoffStrategy:attempts=>Math.min(30000,5000*attempts)}});
  const timer=setInterval(()=>void reconcileScoutSessions().catch(error=>console.error('[social-scout] Reconciliation failed',error.message)),30000);
  worker.on('closed',()=>clearInterval(timer));
  void reconcileScoutSessions().catch(error=>console.error('[social-scout] Reconciliation failed',error.message));
  return worker;
}
