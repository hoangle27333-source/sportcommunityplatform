/** Offline verification of exported run evidence. Produces a proposal, never enables a capability. */
import { z } from 'zod';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { parsePost } from '../../src/lib/apify/providers';
import { verifyLatestPostSample } from '../../src/lib/apify/latest-post-verification';
const arg=(name:string)=>process.argv.find(value=>value.startsWith(`--${name}=`))?.slice(name.length+3);
const input=arg('run'),referenceFile=arg('reference'),build=arg('pinned-build'),buildId=arg('pinned-build-id'),output=arg('output');
if(!input || !referenceFile || !build || !buildId || !output)throw new Error('Supply --run=<exported run JSON>, --reference=<independent reviewed latest list>, --pinned-build=<pinned build version> --pinned-build-id=<observed immutable build ID from core capability receipt>, --output=<new receipt JSON>.');
const exported=JSON.parse(await readFile(input,'utf8'));
const selected=Array.isArray(exported)?exported.find(run=>run.id===arg('run-id')):exported;
if(!selected)throw new Error('Select --run-id when using an exported run array.');
const run=z.object({id:z.string().min(1),platform:z.enum(['Instagram','TikTok','Facebook']),task:z.string(),actor:z.string(),build:z.string(),build_id:z.string(),state:z.string(),observed_at:z.string().datetime({offset:true}),input:z.record(z.any()),normalized_rows:z.array(z.any()).nullable().optional(),raw_rows:z.array(z.any()).nullable().optional()}).parse(selected);
const reference=z.object({accountUrl:z.string().url(),observedAt:z.string().datetime({offset:true}),reviewers:z.array(z.string().trim().min(1)).min(1),evidenceUrls:z.array(z.string().url()).min(1),allPublicPosts:z.boolean(),posts:z.array(z.object({url:z.string().url(),publishedAt:z.string().datetime({offset:true})})).min(1).max(10)}).parse(JSON.parse(await readFile(referenceFile,'utf8')));
const rows=run.normalized_rows ?? run.raw_rows ?? [];
if(!Array.isArray(rows))throw new Error('Expected saved provider rows.');
const posts=rows.map(row=>parsePost(row,run.platform));
const report=verifyLatestPostSample(run,posts.filter(post=>post!==null),reference,build,buildId);
if(posts.some(post=>!post)){report.verified=false;report.reasons.push('Unparseable provider rows prevent capability verification.');}
const receipt={...report,capabilityEnabled:false,providerStarts:0,databaseWrites:0};
await mkdir(dirname(resolve(output)),{recursive:true});await writeFile(output,JSON.stringify(receipt,null,2)+'\n',{flag:'wx'});
console.log(JSON.stringify(receipt));if(!receipt.verified)process.exitCode=1;
