/** Offline preflight, no encoder/model loading, provider calls or labels assigned. */
import { readFile,writeFile,mkdir } from 'node:fs/promises';
import { resolve,dirname } from 'node:path';
import { inspectAccountDataset } from './account-dataset-review';
const arg=(name:string)=>process.argv.find(value=>value.startsWith(`--${name}=`))?.slice(name.length+3);
if(!arg('input') || !arg('output'))throw new Error('Supply --input=<review packet array> and --output=<new dataset status JSON>.');
const input=resolve(arg('input')!),output=resolve(arg('output')!);if(input===output)throw new Error('Do not overwrite reviewer data.');
const records=JSON.parse(await readFile(input,'utf8'));if(!Array.isArray(records))throw new Error('Expected a reviewer packet array.');
const report=inspectAccountDataset(records);await mkdir(dirname(output),{recursive:true});await writeFile(output,JSON.stringify(report,null,2)+'\n',{flag:'wx'});
console.log(JSON.stringify({total:report.total,reviewed:report.reviewed,pending:report.pending,unknown:report.unknown,issues:report.issues.length,missingSlices:report.missing.length,trainingInputReady:report.trainingInputReady,qualityGate:false,runtimeGate:false}));
if(report.issues.length || !report.trainingInputReady)process.exitCode=1;
