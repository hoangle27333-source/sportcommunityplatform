/** Read-only by default; --persist writes only seed storage, never CRM or the workbook. */
import { readFile } from 'node:fs/promises';
import { basename } from 'node:path';
import { createHash } from 'node:crypto';
import XLSX from 'xlsx';
import { ingestSeedRows } from '../../src/lib/scout-experimental/seeds';
import { createAdminClient } from '../../src/lib/supabase/admin';
const filename=process.argv.find(a=>a.startsWith('--file='))?.slice(7);
if(!filename)throw new Error('Supply --file=/absolute/path/workbook.xlsx. Default is read-only.');
const bytes=await readFile(filename);const checksum=createHash('sha256').update(bytes).digest('hex');
const workbook=XLSX.read(bytes,{type:'buffer'});const sheet='Talent Database';
if(!workbook.Sheets[sheet])throw new Error('Talent Database sheet is missing.');
const rows=XLSX.utils.sheet_to_json<unknown[]>(workbook.Sheets[sheet],{header:1,defval:null,blankrows:true});
// Preserve actual hyperlink targets, including cells whose displayed text is a label.
for(let index=0;index<rows.length;index++){const cell=workbook.Sheets[sheet][`D${index+1}`];if(cell?.l?.Target)rows[index][3]=cell.l.Target;}
const dataset=ingestSeedRows(rows,basename(filename),checksum,sheet);
if(dataset.profileRows!==97 || dataset.rawUniqueUrls!==96 || dataset.records.length!==95)throw new Error(`Unexpected source: ${dataset.profileRows} rows, ${dataset.records.length} unique URLs. Review the changed workbook before ingesting.`);
if(process.argv.includes('--persist')){
 const db=createAdminClient();
 const {error}=await db.from('scout_seed_datasets').upsert({id:dataset.id,file_name:dataset.fileName,checksum,sheet,profile_rows:dataset.profileRows},{onConflict:'id'});if(error)throw error;
 const saved=await db.from('scout_seed_records').upsert(dataset.records.map(record=>({dataset_id:dataset.id,url:record.url,record})),{onConflict:'dataset_id,url'});if(saved.error)throw saved.error;
}
console.log(JSON.stringify({datasetId:dataset.id,checksum,sheet,profileRows:dataset.profileRows,rawUniqueUrls:dataset.rawUniqueUrls,canonicalUniqueUrls:dataset.records.length,unresolvedUrls:dataset.records.filter(r=>r.needsResolution).length,historicalMetrics:true,mode:process.argv.includes('--persist')?'seed-storage-only':'read-only',providerStarts:0,crmWrites:0}));
