/** Synthetic runtime fixtures only: not labels, model-quality evidence or activation authority. */
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { resolve, dirname, relative, isAbsolute } from 'node:path';
import { createHash } from 'node:crypto';
import { performance } from 'node:perf_hooks';
import { encodeAccount } from '../../src/lib/apify/account-model';
import type { SocialProfile } from '../../src/lib/apify/providers';
const arg=(name:string)=>process.argv.find(value=>value.startsWith(`--${name}=`))?.slice(name.length+3);
const root=resolve(arg('model') || 'models/scout-account');
const start=performance.now();
const manifest=JSON.parse(await readFile(resolve(root,'encoder-manifest.json'),'utf8'));
if(!/^[a-f0-9]{40}$/.test(manifest.revision) || !manifest.artifacts?.['onnx/model_quantized.onnx'])throw new Error('Pinned encoder manifest required.');
for(const [file,hash] of Object.entries(manifest.artifacts)){
 const full=resolve(root,file),rel=relative(root,full);
 if(rel.startsWith('..') || isAbsolute(rel) || createHash('sha256').update(await readFile(full)).digest('hex')!==hash)throw new Error('Invalid encoder artifact checksum.');
}
const captions=['Chạy bộ sáng nay tại Hà Nội. Hẹn cả nhóm cuối tuần!', 'Running and training together every Saturday.', 'Đăng ký lớp cầu lông tại câu lạc bộ.', 'New marathon event highlights and results.', 'Our running shoes are available to order.'];
const profiles=captions.map((caption,i)=>({platform:'Instagram',url:`https://instagram.com/fixture${i}`,name:`Runtime fixture ${i}`,bio:caption,category:'',entityType:'',location:'',posts:Array.from({length:5},(_,j)=>({url:`https://instagram.com/p/fixture${i}-${j}`,authorUrl:`https://instagram.com/fixture${i}`,caption:captions[(i+j)%5],publishedAt:`2026-10-${10-j}`,location:'',isRepost:false}))}) as unknown as SocialProfile);
async function batch(){for(const profile of profiles){const features=await encodeAccount(profile,root);if(features.length!==770 || features.some(value=>!Number.isFinite(value)))throw new Error('Encoder returned invalid features.');}}
await batch();const coldMs=performance.now()-start;
const warm=performance.now();await batch();const warmMs=performance.now()-warm;
const maxRssBytes=process.resourceUsage().maxRSS*1024;
const receipt={kind:'synthetic-encoder-smoke',target:`${process.platform}-${process.arch}`,node:process.version,encoderRevision:manifest.revision,accounts:5,postsPerAccount:5,coldMs,warmMs,maxRssBytes,passedTiming:coldMs<60000 && warmMs<15000,passedMemory:maxRssBytes<1.5*1024**3,runtimeGate:false,qualityGate:false};
if(arg('output')){const output=resolve(arg('output')!);await mkdir(dirname(output),{recursive:true});await writeFile(output,JSON.stringify(receipt,null,2)+'\n');}
console.log(JSON.stringify(receipt));
