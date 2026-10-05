import { createAdminClient } from '../../src/lib/supabase/admin';
const db=createAdminClient();
for (const [table,cols] of [['kols','id,name,profile_url,platform,channels,scout_identity,user_locked_fields'],['scout_sessions','id,created_at,status,params,result,candidates'],['scout_requests','*'],['scout_provider_capabilities','*'],['scout_provider_runs','id,session_id,actor,task,input,state,provider_run_id,dataset_id,raw_rows,normalized_rows,warnings']]) {
 let q=db.from(table).select(cols);
 if(table==='kols')q=q.ilike('name','%badminton%');
 if(table==='scout_sessions'||table==='scout_requests')q=q.order('created_at',{ascending:false}).limit(12);
 if(table==='scout_provider_runs')q=q.order('created_at',{ascending:false}).limit(8);
 const {data,error}=await q;
 console.log(JSON.stringify({table,error,data},null,2));
}
