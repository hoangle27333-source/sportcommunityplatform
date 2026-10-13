import {writeFile} from 'node:fs/promises';
import {createAdminClient} from '../../src/lib/supabase/admin';
import {executeStoredReassessment} from '../../src/lib/apify/reassessment';
const db=createAdminClient(),id='f25f737e-e5e5-4311-8d64-d2141b045a6a';
const {data:session,error}=await db.from('scout_sessions').select('*').eq('id',id).single();if(error)throw error;
const {data:before,error:be}=await db.from('scouted_posts').select('id,scout_content_assessment');if(be)throw be;
// Use an in-memory replay envelope and the existing frozen snapshot; do not create or update a session.
const result=await executeStoredReassessment({...session,params:{...session!.params,parentSessionId:id,executionMode:'stored-evidence'}});
const [{data:after,error:ae},{data:source,error:se},{data:runs,error:re}]=await Promise.all([db.from('scouted_posts').select('id,scout_content_assessment'),db.from('scout_sessions').select('*').eq('id',id).single(),db.from('scout_provider_runs').select('id').eq('session_id',id)]);
if(ae || se || re)throw ae || se || re;
const sorted=(rows:any[])=>JSON.stringify(rows.sort((a,b)=>a.id.localeCompare(b.id)));
const proof={providerStarts:result.providerStarts,retained:result.savedPosts.length,topDisplayed:result.posts.length,unverified:result.counts.unverified,unchangedDatabase:sorted(before!)===sorted(after!),unchangedSource:JSON.stringify(session)===JSON.stringify(source),runCount:runs!.length,message:result.message};
if(!proof.unchangedDatabase || !proof.unchangedSource || proof.retained!==13 || proof.providerStarts!==0)throw new Error('Replay acceptance failed.');
await writeFile('artifacts/scout-top-posts/content-filter-replay.json',JSON.stringify(proof,null,2)+'\n');console.log(JSON.stringify(proof));
