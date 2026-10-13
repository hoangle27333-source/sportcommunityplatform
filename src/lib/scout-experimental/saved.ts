import { createAdminClient } from '../supabase/admin';
import { mergeProfileEvidence, type SocialProfile } from '../apify/providers';
import { resultIdentity,normalizeBrightProfile,normalizeBrightPost } from './providers';
import { experimentalApifyProfile,experimentalApifyPost } from './apify-adapter';
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
  for(const row of run.response){const p=cap.operation==='profile'?(cap.provider==='brightdata'?normalizeBrightProfile(row,cap.platform):experimentalApifyProfile(row,cap.platform)):resultIdentity(row,cap.platform);if(p)pool.set(p.url,pool.has(p.url)?mergeProfileEvidence(pool.get(p.url)!,p):p);}
 }
 for(const run of runs || []){
  const cap=caps?.find(c=>c.id===run.capability_id);if(!cap)continue;
  if(cap.operation==='posts' && Array.isArray(run.response)){
   const p=pool.get(run.input?.url);if(!p)continue;
   const posts=run.response.map(row=>cap.provider==='brightdata'?normalizeBrightPost(row,p.platform):experimentalApifyPost(row,p)).filter(post=>post?.authorUrl===p.url&&!post.isRepost);
   p.posts=[...new Map([...p.posts,...posts].map(post=>[post!.url,post!])).values()].slice(0,10);
  }
 }
 for(const run of runs || []){
  const cap=caps?.find(c=>c.id===run.capability_id);
  if(cap?.operation==='analysis' && run.response?.inputHash){const p=pool.get(run.input?.url);if(p)p.contentEvidence=run.response;}
 }
 for(const task of tasks || [])if(task.result?.url)pool.set(task.result.url,task.result);
 return [...pool.values()].filter(p=>!p.knownSeed&&!knownUrls.includes(p.url)&&!p.identityAliases?.some(url=>knownUrls.includes(url)));
}
