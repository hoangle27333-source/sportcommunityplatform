import { createAdminClient } from '../supabase/admin';
import { mergeProfileEvidence, type SocialProfile } from '../apify/providers';
import { resultIdentity } from './providers';
/** Read-only recovery: never polls, starts a provider or invokes a model. */
export async function savedExperimentalProfiles(sessionId:string,knownUrls:string[]=[]):Promise<SocialProfile[]> {
 const db=createAdminClient();
 const [{data:tasks,error},{data:runs,error:runError}]=await Promise.all([
  db.from('scout_task_checkpoints').select('task_key,result').eq('session_id',sessionId).like('task_key','experimental-profile:%'),
  db.from('scout_external_runs').select('response,input,capability_id').eq('session_id',sessionId).eq('state','succeeded'),
 ]);
 if(error || runError)throw error || runError;
 const {data:caps,error:capError}=await db.from('scout_trial_capabilities').select('id,platform,provider,operation');if(capError)throw capError;
 const pool=new Map<string,SocialProfile>();
 for(const run of runs || []) {
  const cap=caps?.find(c=>c.id===run.capability_id);
  if(!cap || !['discovery','profile'].includes(cap.operation) || !Array.isArray(run.response))continue;
  for(const row of run.response){const p=resultIdentity(row,cap.platform);if(p)pool.set(p.url,pool.has(p.url)?mergeProfileEvidence(pool.get(p.url)!,p):p);}
 }
 for(const task of tasks || [])if(task.result?.url)pool.set(task.result.url,task.result);
 return [...pool.values()].filter(p=>!knownUrls.includes(p.url));
}
