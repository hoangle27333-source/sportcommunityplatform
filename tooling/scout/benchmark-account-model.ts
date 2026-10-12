/** Run on the preview runtime against local reviewed profiles; no collection or CRM writes. */
import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { performance } from 'node:perf_hooks';
import { encodeAccount, readAccountManifest } from '../../src/lib/apify/account-model';
const arg=(name:string)=>process.argv.find(value=>value.startsWith(`--${name}=`))?.slice(name.length+3);
const root=arg('model'),input=arg('input'),output=arg('output');
if(!root || !input || !output)throw new Error('Supply --model, --input (five reviewed profiles), --output.');
const start=performance.now();
await readAccountManifest(resolve(root));
const records=JSON.parse(await readFile(input,'utf8')).slice(0,5);if(records.length!==5)throw new Error('Five reviewed profiles are required.');
for(const record of records)await encodeAccount(record.profile,resolve(root));const coldMs=performance.now()-start;
const warmStart=performance.now();for(const record of records)await encodeAccount(record.profile,resolve(root));const warmMs=performance.now()-warmStart;
const receipt={coldMs,warmMs,maxRssBytes:process.resourceUsage().maxRSS*1024,host:process.env.VERCEL_ENV || 'local',deployment:process.env.VERCEL_DEPLOYMENT_ID || null,passedTiming:coldMs<60000 && warmMs<15000,passedMemory:process.resourceUsage().maxRSS*1024<1.5*1024**3,runtimeGate:false};
await writeFile(output,JSON.stringify(receipt,null,2));process.stdout.write(JSON.stringify(receipt)+'\n');
