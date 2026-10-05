/** Atomic reservation-only fixture on the target runtime; never calls Apify. */
import {createAdminClient} from '../../src/lib/supabase/admin';
import {writeFile} from 'node:fs/promises';
import assert from 'node:assert/strict';
const db=createAdminClient();
const owner=await db.from('profiles').select('id').eq('role','admin').limit(1).single();if(owner.error)throw owner.error;
const session=await db.from('scout_sessions').insert({owner_id:owner.data.id,kind:'verification',verification:true,runtime_version:2,params:{fixture:'reservation-only'}}).select('id').single();if(session.error)throw session.error;
let runId:string|undefined;
try{
 const claims=await Promise.all(Array.from({length:10},()=>db.rpc('reserve_scout_run',{p_session:session.data.id,p_key:'reservation-only',p_cache:'reservation-only',p_actor:'fixture-no-provider',p_platform:'Instagram',p_task:'verification',p_build:'fixture',p_input:{fixture:'reservation-only'}})));
 for(const claim of claims)if(claim.error)throw claim.error;
 runId=claims[0].data.run.id;
 assert.equal(claims.filter(c=>c.data.claimed).length,1);assert.equal(new Set(claims.map(c=>c.data.run.id)).size,1);
 assert.ok(Number(claims[0].data.run.reserved_usd)>0 && Number(claims[0].data.run.reserved_usd)<=0.25);
 const settled=await db.rpc('settle_scout_run',{p_run:runId,p_state:'verification-no-provider',p_amount:0,p_pricing:null,p_usage:null,p_events:null});if(settled.error)throw settled.error;
 const stored=await db.from('scout_provider_runs').select('actual_usd,provider_run_id').eq('id',runId).single();if(stored.error)throw stored.error;assert.equal(Number(stored.data.actual_usd),0);assert.equal(stored.data.provider_run_id,null);
 const receipt={observedAt:new Date().toISOString(),sessionId:session.data.id,parallelClaims:10,uniqueReservation:1,reservedUsd:Number(claims[0].data.run.reserved_usd),settledUsd:0,paidRunsStarted:0};
 await writeFile('artifacts/apify-runtime/remote-budget-receipt.json',JSON.stringify(receipt,null,2)+'\n');
 const saved=await db.from('scout_sessions').update({status:'complete',result:{success:true,reservationOnly:true}}).eq('id',session.data.id);if(saved.error)throw saved.error;console.log(JSON.stringify(receipt,null,2));
}catch(error){if(runId)await db.rpc('settle_scout_run',{p_run:runId,p_state:'verification-no-provider',p_amount:0,p_pricing:null,p_usage:null,p_events:null});await db.from('scout_sessions').update({status:'failed',result:{success:false,reservationOnly:true}}).eq('id',session.data.id);throw error;}
