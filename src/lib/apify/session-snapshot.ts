import { createAdminClient } from '@/lib/supabase/admin';

/** Server-owned immutable task values. CAS preserves snapshots from other scopes. */
export async function sessionSnapshot(sessionId:string, namespace:'retrievalWindows'|'providerBuilds', key:string, create:(createdAt:string)=>Promise<string>) {
 const db=createAdminClient();
 for(let attempt=0;attempt<5;attempt++) {
  const {data:session,error}=await db.from('scout_sessions').select('params,created_at').eq('id',sessionId).single(); if(error)throw error;
  if(!session)throw new Error('Scout session not found.');
  const params=session.params || {};const saved=params[namespace]?.[key];
  if(typeof saved==='string')return saved;
  const value=await create(params.executionMode==='stored-evidence' ? params.evidenceCreatedAt || session.created_at : session.created_at);
  if(params.searchStrategy==='seed_content_v1' || JSON.stringify(params).length>4000) {
   // Send large plans in a POST body; merge this scope under a database row lock.
   const {data:claimed,error:writeError}=await db.rpc('save_scout_session_snapshot',{p_session:sessionId,p_namespace:namespace,p_key:key,p_value:value});if(writeError)throw writeError;
   if(typeof claimed==='string')return claimed;
  } else {
   // Preserve the historical executor path for small v4/v5 session parameters.
   const {data:claimed,error:writeError}=await db.from('scout_sessions').update({params:{...params,[namespace]:{...params[namespace],[key]:value}}}).eq('id',sessionId).eq('params',JSON.stringify(params)).select('id').maybeSingle();if(writeError)throw writeError;
   if(claimed)return value;
  }
 }
 throw new Error('Unable to preserve the Scout task input. No provider run was started.');
}
