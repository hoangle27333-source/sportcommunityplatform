/** Explicit spreadsheet import. Dry-run by default; no providers or model activation. */
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { resolve, basename, join } from 'node:path';
import { createHash } from 'node:crypto';
import { isDeepStrictEqual } from 'node:util';
import * as XLSX from 'xlsx';
import { createAdminClient } from '../../src/lib/supabase/admin';
import { canonicalUrl, platformMatches } from '../../src/lib/apify/discovery-quality';
import { inspectAccountDataset } from './account-dataset-review';
import { prepareTalentDataset, talentCrmRecord, talentId, type TalentRow } from './talent-dataset';

const arg=(name:string)=>process.argv.find(v=>v.startsWith(`--${name}=`))?.slice(name.length+3);
const sourcePath=arg('source'), output=arg('output');
if(!sourcePath || !output)throw new Error('Supply --source=<xlsx> --output=<private directory>. Add --apply only for an authorized system import.');
const bytes=await readFile(resolve(sourcePath));
const source={filename:basename(sourcePath),sha256:createHash('sha256').update(bytes).digest('hex')};
const workbook=XLSX.read(bytes,{type:'buffer'});
if(workbook.SheetNames.length!==1 || workbook.SheetNames[0]!=='Talent Database')throw new Error('Unexpected workbook structure.');
const sheet=workbook.Sheets['Talent Database'];
const values=XLSX.utils.sheet_to_json<(string|number|null)[]>(sheet,{header:1,defval:null,blankrows:true});
if(JSON.stringify(values[0])!==JSON.stringify(['No','Sport Category','Name',null,'Followers','Region','Talent Profile']))throw new Error('Unexpected source headers.');
// Worksheet dimensions can include styled empty tails; they are not source records.
while(values.length && !values[values.length-1].some(v=>v!==null && String(v).trim()))values.pop();
const rows:TalentRow[]=values.map((values,i)=>({row:i+1,values,links:values.map((_,c)=>sheet[XLSX.utils.encode_cell({r:i,c})]?.l?.Target || null)}));
const dataset=prepareTalentDataset(rows,source);
const preflight=inspectAccountDataset(dataset.reviewPackets);
if(preflight.issues.length)throw new Error(`Review dataset validation failed: ${JSON.stringify(preflight.issues)}`);
const dir=resolve(output);await mkdir(dir,{recursive:true});
const save=async(name:string,value:unknown)=>writeFile(join(dir,name),JSON.stringify(value,null,2)+'\n');
await save('normalized-dataset.json',dataset);await save('review-packets.json',dataset.reviewPackets);
await save('unresolved-accounts.json',dataset.unresolved);await save('dataset-status.json',preflight);
const db=createAdminClient();
const existing=await db.from('kols').select('*');if(existing.error)throw existing.error;
const accountKey=(r:any)=>{
  const url=canonicalUrl(r.profile_url || '');
  const platform=['Facebook','TikTok','Instagram'].find(p=>platformMatches(p,url));
  return url && platform ? `${platform}:${url.toLowerCase()}` : r.scout_provenance?.accountKey;
};
const links=dataset.accounts.map(a=>({accountKey:a.key,sourceRows:a.sourceRows.map(s=>s.row),
  existing:existing.data.filter(r=>r.id===a.id || accountKey(r)===a.key).map(r=>({id:r.id,name:r.name}))}));
const prefix=`talent/${source.sha256}`;
const records=dataset.accounts.filter(a=>!links.find(l=>l.accountKey===a.key)!.existing.length).map(a=>talentCrmRecord(a,source,`scout-datasets/${prefix}`));
const plan={...dataset.summary,source,storageBucket:'scout-datasets',storagePrefix:prefix,
  systemBefore:existing.data.length,toInsert:records.length,matchedExisting:links.filter(l=>l.existing.length).length,
  existingRecordsOverwritten:0,apply:process.argv.includes('--apply')};
await save('import-plan.json',plan);
console.log(JSON.stringify(plan));
if(!plan.apply)process.exit(0);

const buckets=await db.storage.listBuckets();if(buckets.error)throw buckets.error;
const bucket=buckets.data.find(b=>b.id==='scout-datasets');
if(bucket?.public)throw new Error('Scout datasets bucket must remain private.');
if(!bucket){const created=await db.storage.createBucket('scout-datasets',{public:false,fileSizeLimit:20*1024*1024});if(created.error)throw created.error;}
const storage=db.storage.from('scout-datasets');
async function immutableUpload(name:string,content:Buffer,contentType:string){
  const uploaded=await storage.upload(`${prefix}/${name}`,content,{contentType,upsert:false});
  if(uploaded.error){
    const saved=await storage.download(`${prefix}/${name}`);if(saved.error || !saved.data)throw uploaded.error;
    const remote=Buffer.from(await saved.data.arrayBuffer());
    if(!remote.equals(content))throw new Error(`Stored source differs: ${name}`);
  }
  const verify=await storage.download(`${prefix}/${name}`);if(verify.error || !verify.data)throw verify.error;
  if(!Buffer.from(await verify.data.arrayBuffer()).equals(content))throw new Error(`Storage read-back failed: ${name}`);
}
await immutableUpload('source.xlsx',bytes,'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
for(const name of ['normalized-dataset.json','review-packets.json','unresolved-accounts.json','dataset-status.json'])await immutableUpload(name,await readFile(join(dir,name)),'application/json');
// Stable IDs make a repeated import safe without overwriting existing CRM fields.
const inserted=records.length ? await db.from('kols').upsert(records,{onConflict:'id',ignoreDuplicates:true}).select('id') : {data:[],error:null};
if(inserted.error)throw inserted.error;
const after=await db.from('kols').select('*');if(after.error)throw after.error;
const mapping=dataset.accounts.map(a=>({accountKey:a.key,sourceRows:a.sourceRows.map(s=>s.row),
  crmIds:after.data.filter(r=>r.id===a.id || accountKey(r)===a.key).map(r=>r.id)}));
if(mapping.some(m=>!m.crmIds.length))throw new Error('Some source accounts are missing from CRM after import.');
const originalIds=new Set(existing.data.map(r=>r.id));
for(const before of existing.data){
  const current=after.data.find(r=>r.id===before.id);
  if(!current || !isDeepStrictEqual(current,before))throw new Error(`Existing CRM record changed: ${before.id}`);
}
for(const expected of records){
  const actual=after.data.find(r=>r.id===expected.id)!;
  for(const [key,value] of Object.entries(expected)){
    if(!isDeepStrictEqual(actual[key],value))throw new Error(`CRM field read-back failed: ${expected.id}/${key}`);
  }
}
const receipt={...plan,inserted:inserted.data?.length || 0,systemAfter:after.data.length,
  newRecordIds:after.data.filter(r=>!originalIds.has(r.id)).map(r=>r.id),mapping,
  storageVerified:true,crmReadBackVerified:true,existingRecordsUnchanged:true,
  trainingInputReady:false,confirmedTrainingLabels:0,providerStarts:0};
await save('import-receipt.json',receipt);
const stored=await storage.upload(`${prefix}/crm-links.json`,Buffer.from(JSON.stringify(mapping,null,2)+'\n'),{contentType:'application/json',upsert:true});if(stored.error)throw stored.error;
const audit=await db.from('audit_log').upsert({id:talentId(`dataset:${source.sha256}`),actor_id:null,action:'import',entity:'talent_dataset',entity_id:source.sha256,
  detail:{source,storagePrefix:`scout-datasets/${prefix}`,sourceRows:dataset.summary.sourceTalentRows,uniqueAccounts:dataset.accounts.length,
    crmIds:mapping.flatMap(m=>m.crmIds),authorization:'Explicit user request to import the supplied talent spreadsheet',trainingLabelsConfirmed:0}},
  {onConflict:'id',ignoreDuplicates:true});if(audit.error)throw audit.error;
const remoteReceipt=await storage.upload(`${prefix}/import-receipt.json`,Buffer.from(JSON.stringify(receipt,null,2)+'\n'),{contentType:'application/json',upsert:true});if(remoteReceipt.error)throw remoteReceipt.error;
console.log(JSON.stringify({inserted:receipt.inserted,systemAfter:receipt.systemAfter,storageVerified:true,crmReadBackVerified:true,existingRecordsUnchanged:true,providerStarts:0}));
