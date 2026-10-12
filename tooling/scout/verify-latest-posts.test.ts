import { expect,it } from 'vitest';
import { mkdtemp,writeFile,readFile,rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join,resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
it('offline CLI writes a verification proposal without enabling capability or starting providers',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'scout-latest-cli-'));
 try{
  const rows=Array.from({length:10},(_,i)=>({webVideoUrl:`https://tiktok.com/@runner/video/${i}`,authorMeta:{name:'runner'},createTimeISO:`2026-10-${String(10-i).padStart(2,'0')}T00:00:00Z`,text:'Synthetic test evidence'}));
  const run={id:'fixture-run',platform:'TikTok',task:'profile-posts',actor:'clockworks~tiktok-scraper',build:'0.0.612',build_id:'fixture-build-id',state:'succeeded',observed_at:'2026-10-11T00:00:00Z',input:{profiles:['runner'],resultsPerPage:10,profileSorting:'latest',profileScrapeSections:['videos']},normalized_rows:rows};
  const reference={accountUrl:'https://tiktok.com/@runner',observedAt:run.observed_at,reviewers:['fixture-reviewer'],evidenceUrls:['https://tiktok.com/@runner'],allPublicPosts:false,posts:rows.map(row=>({url:row.webVideoUrl,publishedAt:row.createTimeISO}))};
  await writeFile(join(dir,'runs.json'),JSON.stringify([run]));await writeFile(join(dir,'reference.json'),JSON.stringify(reference));
  const result=spawnSync(process.execPath,['--import=tsx',resolve('tooling/scout/verify-latest-posts.ts'),`--run=${join(dir,'runs.json')}`,'--run-id=fixture-run',`--reference=${join(dir,'reference.json')}`,'--pinned-build=0.0.612','--pinned-build-id=fixture-build-id',`--output=${join(dir,'receipt.json')}`],{encoding:'utf8',env:{...process.env,APIFY_TOKEN:'',SUPABASE_SERVICE_ROLE_KEY:''}});
  expect(result.status,result.stderr).toBe(0);expect(JSON.parse(await readFile(join(dir,'receipt.json'),'utf8'))).toMatchObject({verified:true,providerStarts:0,databaseWrites:0,capabilityEnabled:false});
 }finally{await rm(dir,{recursive:true,force:true});}
});
