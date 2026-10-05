/** Compare existing receipts; this script only reads runs and never starts Actors. */
import {readFile,writeFile} from 'node:fs/promises';
import {apifyApi} from '../../src/lib/apify/runtime';
import {createAdminClient} from '../../src/lib/supabase/admin';
import {parseProfile} from '../../src/lib/apify/providers';
type MemorySample={build:string;input:Record<string,unknown>;memory:string|number;runId:string;actualUsd:number|null;configuredMemoryMb?:number;elapsedSeconds:number;peakMemoryBytes:number|null;averageMemoryBytes:number|null;profiles:number;coverage:{followers:number;avgViews:number;er:number}};
const db=createAdminClient();const samples:MemorySample[]=[];
for(const path of process.argv.slice(2)){
 const file=JSON.parse(await readFile(path,'utf8'));const checks=Array.isArray(file)?file:file.checks;
 const receipt=checks.find((item:any)=>item.name==='instagram-profile-details' && item.verified);if(!receipt)throw Error('A verified profile-details receipt is required.');
 const runId=receipt.runs[0].provider_run_id;const state=(await apifyApi('actor-runs/'+runId)).data;
 const stored=await db.from('scout_provider_runs').select('normalized_rows').eq('provider_run_id',runId).single();if(stored.error)throw stored.error;
 const profiles=stored.data.normalized_rows.map((row:any)=>parseProfile(row,'Instagram')).filter(Boolean);
 samples.push({build:receipt.build,input:receipt.input,memory:receipt.memory,runId,actualUsd:receipt.runs[0].actual_usd,configuredMemoryMb:state.options?.memoryMbytes,elapsedSeconds:(Date.parse(state.finishedAt)-Date.parse(state.startedAt))/1000,peakMemoryBytes:state.stats?.memMaxBytes ?? null,averageMemoryBytes:state.stats?.memAvgBytes ?? null,profiles:profiles.length,coverage:{followers:profiles.filter((p:any)=>p.followers!==null).length,avgViews:profiles.filter((p:any)=>p.avgViews!==null).length,er:profiles.filter((p:any)=>p.er!==null).length}});
}
const comparable=samples.every(s=>s.build===samples[0].build && JSON.stringify(s.input)===JSON.stringify(samples[0].input));
const report={observedAt:new Date().toISOString(),comparable,samples,decision:'Keep Actor default memory. This small sample does not demonstrate cost savings; live observations are not a controlled precision/recall benchmark.'};
await writeFile('artifacts/apify-runtime/memory-benchmark.json',JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report,null,2));
