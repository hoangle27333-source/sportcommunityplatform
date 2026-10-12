import { inspectAccountDataset } from './account-dataset-review';
/** Offline, reviewer-authored dataset only. Does not collect, import, or assign labels. */
import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { createHash } from 'node:crypto';
import { ACCOUNT_FEATURE_VERSION, encodeAccount, evidenceHash } from '../../src/lib/apify/account-model';
import { ENTITY_TYPES, assessAccountEntity } from '../../src/lib/apify/account-evidence';
const arg=(name:string)=>process.argv.find(value=>value.startsWith(`--${name}=`))?.slice(name.length+3);
const input=arg('input'),output=arg('output'),model=arg('model'),revision=arg('revision');
if(!input || !output || !model || !revision || !/^[a-f0-9]{40}$/.test(revision))throw new Error('Supply --input, --output, --model (local ONNX directory) and --revision (immutable encoder commit).');
const records=JSON.parse(await readFile(input,'utf8'));
if(!Array.isArray(records))throw new Error('Expected an array of reviewer-authored account records.');
const preflight=inspectAccountDataset(records);
if(preflight.issues.length || preflight.pending || preflight.unknown)throw new Error('Resolve dataset review issues and keep Unknown benchmark cases separate before feature export.');
const encoderManifest=JSON.parse(await readFile(resolve(model,'encoder-manifest.json'),'utf8'));
if(encoderManifest.revision!==revision || encoderManifest.encoder!=='sentence-transformers/paraphrase-multilingual-MiniLM-L12-v2')throw new Error('Encoder provenance does not match the requested immutable revision.');
const artifacts:Record<string,string>={};
for(const file of ['onnx/model_quantized.onnx','config.json','tokenizer.json','tokenizer_config.json','special_tokens_map.json']){
 artifacts[file]=createHash('sha256').update(await readFile(resolve(model,file))).digest('hex');
 if(encoderManifest.artifacts?.[file]!==artifacts[file])throw new Error(`Encoder artifact checksum mismatch: ${file}`);
}
const seen=new Set<string>(),rows=[];
for(const record of records) {
  const {profile,annotation}=record;
  if(!profile?.url || !profile.platform || !Array.isArray(profile.posts) || !annotation?.subjectKey || !annotation.reviewers?.length || !annotation.confirmedAt || !annotation.evidenceUrls?.length || !ENTITY_TYPES.includes(annotation.label) || annotation.label==='Unknown')throw new Error('Each record requires profile evidence and an explicit reviewer annotation.');
  if(typeof annotation.subjectKey!=='string' || !annotation.subjectKey.trim() || !Array.isArray(annotation.reviewers) || annotation.reviewers.some((id:unknown)=>typeof id!=='string' || !id.trim()) || !Number.isFinite(Date.parse(annotation.confirmedAt)) || !Array.isArray(annotation.evidenceUrls) || annotation.evidenceUrls.some((url:unknown)=>typeof url!=='string' || !/^https?:\/\//.test(url)))throw new Error(`Invalid reviewer confirmation for ${profile.url}`);
  const hash=evidenceHash(profile);
  if(annotation.evidenceHash!==hash)throw new Error(`Evidence changed for ${profile.url}; obtain a new review.`);
  const key=`${profile.platform}:${profile.url}`;if(seen.has(key))throw new Error(`Duplicate account: ${key}`);seen.add(key);
  const rule=assessAccountEntity(profile);
  rows.push({ruleSuggestedType:rule.suggestedType,ruleStatus:rule.status,accountKey:key,subjectKey:annotation.subjectKey,platform:profile.platform,label:annotation.label,reviewers:annotation.reviewers,evidenceHash:hash,features:await encodeAccount(profile,resolve(model))});
}
await writeFile(output,JSON.stringify({featureVersion:ACCOUNT_FEATURE_VERSION,encoder:'sentence-transformers/paraphrase-multilingual-MiniLM-L12-v2',revision,artifacts,rows},null,2),{flag:'wx'});
process.stdout.write(`Exported ${rows.length} reviewed feature records. No provider calls.\n`);
