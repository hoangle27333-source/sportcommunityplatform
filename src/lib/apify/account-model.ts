import type { AccountModelPolicy } from './account-model-policy';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { resolve, relative, isAbsolute } from 'node:path';
import { accountEvidence, assessAccountEntity, ENTITY_TYPES, latestOwnedPosts, type EntityAssessment, type EntityType } from './account-evidence';
import type { SocialProfile } from './providers';

export const ACCOUNT_FEATURE_VERSION = 'profile-post-mean-128-v1';
export type AccountModelManifest = {
  version: string; featureVersion: typeof ACCOUNT_FEATURE_VERSION; encoder: 'sentence-transformers/paraphrase-multilingual-MiniLM-L12-v2';
  revision: string; artifacts: Record<string,string>; classes: EntityType[]; coefficients: number[][]; intercepts: number[];
  thresholds: Partial<Record<EntityType,number>>; qualityGate: boolean; runtimeGate: boolean; testReceipt: string;
};
let manifestPromise:Promise<AccountModelManifest> | undefined;
let encoderRoot:string | undefined;
let encoderPromise: Promise<any> | undefined;
const cache = new Map<string,EntityAssessment>();
export function evidenceHash(profile:SocialProfile) {
  return createHash('sha256').update(JSON.stringify({featureVersion:ACCOUNT_FEATURE_VERSION,platform:profile.platform,url:profile.url,name:profile.name,bio:profile.bio,category:profile.category,entityType:profile.entityType,location:profile.location,posts:latestOwnedPosts(profile).map(p=>({url:p.url,caption:p.caption,publishedAt:p.publishedAt,location:p.location,isRepost:p.isRepost})),coverage:accountEvidence(profile).coverage})).digest('hex');
}
export function validateManifest(manifest:AccountModelManifest) {
  if(manifest.featureVersion!==ACCOUNT_FEATURE_VERSION || manifest.encoder!=='sentence-transformers/paraphrase-multilingual-MiniLM-L12-v2' || !/^[a-f0-9]{40}$/.test(manifest.revision))throw new Error('Model revision or feature version is invalid.');
  if(!manifest.version || manifest.classes.length!==6 || new Set(manifest.classes).size!==6 || manifest.classes.some(c=>!ENTITY_TYPES.includes(c) || c==='Unknown'))throw new Error('Model taxonomy is invalid.');
  if(manifest.coefficients.length!==6 || manifest.intercepts.length!==6 || manifest.coefficients.some(row=>row.length!==770 || row.some(n=>!Number.isFinite(n))) || manifest.intercepts.some(n=>!Number.isFinite(n)))throw new Error('Classifier dimensions are invalid.');
  if(!Object.keys(manifest.artifacts || {}).length || !manifest.artifacts['onnx/model_quantized.onnx'])throw new Error('Model checksums are missing.');
  for(const threshold of Object.values(manifest.thresholds))if(threshold!==undefined && (!Number.isFinite(threshold) || threshold<0 || threshold>1))throw new Error('Classifier threshold is invalid.');
}
export function scoreAccount(features:number[], manifest:AccountModelManifest) {
  if(features.length!==770 || features.some(n=>!Number.isFinite(n)))throw new Error('Account features are invalid.');
  const logits=manifest.coefficients.map((row,i)=>row.reduce((sum,w,j)=>sum+w*features[j],manifest.intercepts[i]));
  const maximum=Math.max(...logits), exp=logits.map(n=>Math.exp(n-maximum)), total=exp.reduce((a,b)=>a+b,0);
  return Object.fromEntries(manifest.classes.map((label,i)=>[label,exp[i]/total])) as Partial<Record<EntityType,number>>;
}
async function loadEncoder(root:string) {
  const {pipeline,env}=await import('@huggingface/transformers');
  env.allowRemoteModels=false;env.localModelPath=root;
  return pipeline('feature-extraction',root,{dtype:'q8',device:'cpu'});
}
/** Used by both offline feature export and deployed inference. Never fetches a remote model. */
export async function encodeAccount(profile:SocialProfile,root:string):Promise<number[]> {
  if(encoderRoot && encoderRoot!==resolve(root))throw new Error('Encoder artifact path changed within an inference process.');
  encoderRoot=resolve(root);
  encoderPromise ||= loadEncoder(root).catch(error=>{encoderPromise=undefined;throw error;});
  const encoder=await encoderPromise;
  async function embed(text:string) {
    if(!text.trim())return Array(384).fill(0) as number[];
    const encoded=encoder.tokenizer(text,{add_special_tokens:false});
    const ids=Array.from(encoded.input_ids.data as Iterable<bigint>).map(Number);
    const chunks:string[]=[];
    for(let i=0;i<Math.min(ids.length,126*16);i+=126)chunks.push(encoder.tokenizer.decode(ids.slice(i,i+126),{skip_special_tokens:true}));
    const vectors:number[][]=[];
    for(const chunk of chunks){const out=await encoder(chunk,{pooling:'mean',normalize:true,truncation:true,max_length:128});vectors.push(Array.from(out.data as Iterable<number>));}
    return Array.from({length:384},(_,j)=>vectors.reduce((sum,v)=>sum+v[j],0)/Math.max(1,vectors.length));
  }
  const text=[profile.name,profile.bio,profile.category,profile.entityType].filter(Boolean).join('\n');
  const profileVector=await embed(text), posts=latestOwnedPosts(profile,5).filter(p=>p.caption.trim());
  const postVectors:number[][]=[];for(const post of posts)postVectors.push(await embed(post.caption));
  return [...profileVector,...Array.from({length:384},(_,j)=>postVectors.reduce((sum,v)=>sum+v[j],0)/Math.max(1,postVectors.length)),Number(!!text.trim()),Number(posts.length>0)];
}
export async function readAccountManifest(root:string) {
  const manifest:AccountModelManifest=JSON.parse(await readFile(resolve(root,'manifest.json'),'utf8'));validateManifest(manifest);
  for(const [path,checksum] of Object.entries(manifest.artifacts)) {
    const full=resolve(root,path),rel=relative(root,full);
    if(rel.startsWith('..') || isAbsolute(rel) || !/^[a-f0-9]{64}$/.test(checksum))throw new Error('Invalid model artifact path/checksum.');
    if(createHash('sha256').update(await readFile(full)).digest('hex')!==checksum)throw new Error('Model artifact checksum mismatch.');
  }
  return manifest;
}
export async function classifyAccount(profile:SocialProfile,expectedRevision?:string,expectedMode?:AccountModelPolicy['mode']):Promise<EntityAssessment> {
  const rule=assessAccountEntity(profile), hash=evidenceHash(profile);
  const fallback={...rule,evidenceHash:hash};
  const mode=process.env.SCOUT_ACCOUNT_MODEL_MODE || 'off';
  if(expectedMode && expectedMode!==mode)return {...fallback,status:'uncertain',missingInformation:[...fallback.missingInformation,'Account model mode changed; reassess with the current policy.']};
  if(mode==='off')return fallback;
  try {
    const root=resolve(process.env.SCOUT_ACCOUNT_MODEL_PATH || 'models/scout-account');
    const manifest=await (manifestPromise ||= readAccountManifest(root).catch(error=>{manifestPromise=undefined;throw error;}));
    if(expectedRevision && expectedRevision!==manifest.version)throw new Error('Search model revision changed.');
    const key=`${hash}:${manifest.version}:${mode}`;if(cache.has(key))return cache.get(key)!;
    const scores=scoreAccount(await encodeAccount(profile,root),manifest);
    const label=manifest.classes.reduce((a,b)=>(scores[a] || 0)>=(scores[b] || 0)?a:b);
    const threshold=manifest.thresholds[label];
    const supported=threshold!==undefined && (scores[label] || 0)>=threshold;
    const model:EntityAssessment={suggestedType:label,status:supported?'supported':'uncertain',source:'model',scores,evidence:[profile.url,...latestOwnedPosts(profile,5).map(p=>p.url)],missingInformation:supported?[]:['Classifier confidence is below the calibrated threshold.'],modelVersion:manifest.version,evidenceHash:hash};
    const result=mode==='active' && manifest.qualityGate && manifest.runtimeGate && !!manifest.testReceipt ? rule.suggestedType==='Brand/Business' && rule.status==='supported'?{...fallback,scores,modelVersion:manifest.version}:model : {...fallback,scores,modelVersion:`shadow:${manifest.version}`};
    if(cache.size>=256)cache.delete(cache.keys().next().value!);cache.set(key,result);return result;
  } catch {
    return {...fallback,...(mode==='active'?{status:'uncertain' as const}:{}),missingInformation:[...fallback.missingInformation,'Open-source classifier is unavailable; rule assessment is shown.']};
  }
}
