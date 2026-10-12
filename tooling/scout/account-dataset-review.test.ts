import {expect,it} from 'vitest';
import {inspectAccountDataset} from './account-dataset-review';
import {prepareReviewPackets} from './account-review-packets';
import {parseProfile} from '../../src/lib/apify/providers';
import {mkdtemp,writeFile,readFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import {spawnSync} from 'node:child_process';
const packet=()=>prepareReviewPackets([parseProfile({url:'https://instagram.com/alex',username:'alex',name:'Alex',bio:'Running athlete'},'Instagram')!])[0];
it('reports unlabeled packets as pending without turning proposals into labels',()=>{
 const p=packet(),before=JSON.stringify(p),report=inspectAccountDataset([p]);expect(report).toMatchObject({pending:1,reviewed:0,trainingInputReady:false,qualityGate:false,runtimeGate:false});expect(report.missing).toHaveLength(18);expect(JSON.stringify(p)).toBe(before);
});
it('rejects stale confirmation, duplicate accounts and incomplete reviewer metadata',()=>{
 const p:any=packet();Object.assign(p.annotation,{label:'Individual',subjectKey:'subject-alex',reviewers:['one','two'],confirmedAt:'2026-10-11T00:00:00Z',evidenceUrls:[p.profile.url]});
 expect(inspectAccountDataset([p])).toMatchObject({reviewed:1,twoReviewers:1});expect(inspectAccountDataset([p,p]).issues[0].code).toBe('DUPLICATE_ACCOUNT');
 p.profile.bio='Changed';expect(inspectAccountDataset([p]).issues[0].code).toBe('EVIDENCE_CHANGED');p.annotation.reviewers=[];expect(inspectAccountDataset([p]).issues[0].code).toBe('REVIEW_INCOMPLETE');
});
it('preserves reviewed Unknown cases outside classifier training counts',()=>{
 const p:any=packet();Object.assign(p.annotation,{label:'Unknown',subjectKey:'sparse',reviewers:['one'],confirmedAt:'2026-10-11T00:00:00Z',evidenceUrls:[p.profile.url]});expect(inspectAccountDataset([p])).toMatchObject({unknown:1,reviewed:0,trainingInputReady:false});
});
it('CLI reports missing reviews and feature export rejects them before opening model artifacts',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'scout-dataset-cli-'));
 try{
  const input=join(dir,'packets.json'),output=join(dir,'report.json');await writeFile(input,JSON.stringify([packet()]));
  const run=(file:string,args:string[])=>spawnSync(process.execPath,['--import=tsx',resolve(file),...args],{encoding:'utf8',env:{...process.env,APIFY_TOKEN:'',SUPABASE_SERVICE_ROLE_KEY:''}});
  const report=run('tooling/scout/verify-account-dataset.ts',[`--input=${input}`,`--output=${output}`]);
  expect(report.status,report.stderr).toBe(1);expect(JSON.parse(await readFile(output,'utf8'))).toMatchObject({pending:1,trainingInputReady:false,qualityGate:false,runtimeGate:false});
  const features=run('tooling/scout/export-account-features.ts',[`--input=${input}`,`--output=${join(dir,'features.json')}`,`--model=${join(dir,'nonexistent-model')}`,'--revision=2c4055b12046f11709e9df2c122e59ffbdc2f900']);
  expect(features.status).toBe(1);expect(features.stderr).toContain('Resolve dataset review issues');expect(features.stderr).not.toContain('ENOENT');
 }finally{await rm(dir,{recursive:true,force:true});}
});
