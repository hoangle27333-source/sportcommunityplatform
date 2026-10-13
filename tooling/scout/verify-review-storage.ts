/** Verify review persistence on a temporary QA session; never changes user sessions or CRM. */
import { createAdminClient } from '../../src/lib/supabase/admin';
import { guardReviewSnapshot, nextReviewProgress } from '../../src/lib/apify/review-snapshot';
import { writeFile } from 'node:fs/promises';

async function main() {
  const db=createAdminClient();
  const {data:owner,error:ownerError}=await db.from('scout_sessions').select('owner_id').limit(1).single();
  if(ownerError || !owner)throw ownerError || new Error('No Scout owner available.');
  const {data:session,error}=await db.from('scout_sessions').insert({owner_id:owner.owner_id,kind:'preview',status:'complete',params:{keyword:'QA storage only',uiContext:{source:'temporary-review-storage-test'}},progress:{qa:true}}).select('*').single();
  if(error || !session)throw error || new Error('Could not create QA session.');
  let cleaned=false;
  try {
    const progress=nextReviewProgress(session);
    const {data:saved,error:saveError}=await guardReviewSnapshot(db.from('scout_sessions').update({progress,candidates:[],result:{success:true},review_decisions:{qa:{decision:'rejected'}}}).eq('id',session.id).eq('owner_id',owner.owner_id),session)
      .or(`import_lease_until.is.null,import_lease_until.lt.${new Date().toISOString()}`).select('*').maybeSingle();
    if(saveError || !saved || saved.progress.reviewRevision!==progress.reviewRevision)throw saveError || new Error('Review save failed.');
    const {data:stale,error:staleError}=await guardReviewSnapshot(db.from('scout_sessions').update({review_decisions:{}}).eq('id',session.id),session).select('id').maybeSingle();
    if(staleError || stale)throw staleError || new Error('Stale update was accepted.');
    const {data:next,error:nextError}=await guardReviewSnapshot(db.from('scout_sessions').update({progress:nextReviewProgress(saved),review_decisions:{qa:{decision:'pending'}}}).eq('id',session.id),saved).select('*').single();
    if(nextError || next?.review_decisions.qa.decision!=='pending' || !next.progress.qa)throw nextError || new Error('Review reload/next save failed.');
  } finally {
    const {error:deleteError}=await db.from('scout_sessions').delete().eq('id',session.id);
    if(deleteError)throw deleteError;
    const {data:remaining,error:readError}=await db.from('scout_sessions').select('id').eq('id',session.id).maybeSingle();
    if(readError || remaining)throw readError || new Error('Temporary QA session was not removed.');
    cleaned=true;
  }
  const receipt={observedAt:new Date().toISOString(),database:'configured Supabase',reviewSave:true,readBack:true,staleUpdateRejected:true,subsequentReviewSaved:true,temporarySessionRemoved:cleaned,userSessionWrites:0,crmWrites:0,providerCalls:0,modelCalls:0};
  await writeFile('docs/scout/review-storage-live-receipt.json',JSON.stringify(receipt,null,2)+'\n');
  console.log(JSON.stringify(receipt));
}
main().catch(error=>{console.error(error.message);process.exitCode=1;});
