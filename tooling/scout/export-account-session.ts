/** Explicit read-only export of an owned completed Scout session. Never starts a provider. */
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { createAdminClient } from '../../src/lib/supabase/admin';
import { profilesFromSavedRuns } from './saved-account-evidence';
import { canonicalUrl } from '../../src/lib/apify/discovery-quality';
import { parseProfile, parsePost } from '../../src/lib/apify/providers';
import { prepareReviewPackets } from './account-review-packets';
const arg=(name:string)=>process.argv.find(value=>value.startsWith(`--${name}=`))?.slice(name.length+3);
const sessionId=arg('session'),ownerId=arg('owner'),output=arg('output'),runsOutput=arg('runs-output');
if(output && runsOutput && resolve(output)===resolve(runsOutput))throw new Error('Evidence export and review packet paths must differ.');
const uuid=/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
if(!sessionId || !ownerId || !uuid.test(sessionId) || !uuid.test(ownerId) || !output)throw new Error('Supply --session=<UUID>, --owner=<UUID>, --output=<new private JSON file>.');
const db=createAdminClient();
const {data:session,error}=await db.from('scout_sessions').select('id,owner_id,kind,status,created_at,result').eq('id',sessionId).eq('owner_id',ownerId).single();
if(error || !session || session.status!=='complete' || session.kind!=='preview' || session.result?.success===false)throw new Error('An owned completed account-discovery session is required.');
const {data:runs,error:runError}=await db.from('scout_provider_runs').select('id,platform,task,state,actor,build,build_id,input,observed_at,normalized_rows,raw_rows,warnings').eq('session_id',sessionId).eq('state','succeeded').order('created_at',{ascending:true});
if(runError)throw runError;if(!runs?.length)throw new Error('No saved successful provider evidence is available.');
const packets=prepareReviewPackets(profilesFromSavedRuns(runs)).map(packet=>({...packet,sourceSession:{id:session.id,createdAt:session.created_at,providerRunIds:runs.filter(run=>run.platform===packet.profile.platform && (run.normalized_rows ?? run.raw_rows ?? []).some((row:any)=>canonicalUrl(parseProfile(row,run.platform)?.url || parsePost(row,run.platform)?.authorUrl || '')===canonicalUrl(packet.profile.url))).map(run=>run.id)}}));
if(!packets.length)throw new Error('Saved evidence contains no parseable account profiles. No new collection was started.');
await mkdir(dirname(resolve(output)),{recursive:true});await writeFile(output,JSON.stringify(packets,null,2)+'\n',{flag:'wx'});
if(runsOutput){await mkdir(dirname(resolve(runsOutput)),{recursive:true});await writeFile(runsOutput,JSON.stringify(runs,null,2)+'\n',{flag:'wx'});}
console.log(`Exported ${packets.length} unlabeled account review packets from saved evidence. Database writes: 0; provider starts: 0.`);
