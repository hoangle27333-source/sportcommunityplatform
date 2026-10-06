/** Freeze shared source so concurrent QA edits cannot corrupt the running dev cache. */
import {mkdtemp,cp,copyFile,symlink,readFile,writeFile,readdir,rm,mkdir} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {spawn} from 'node:child_process';
const artifactDir=process.argv.find(arg=>arg.startsWith('--artifact-dir='))?.slice('--artifact-dir='.length) || 'artifacts/apify-runtime';
const root=process.cwd();const snapshot=await mkdtemp(path.join(tmpdir(),'sport-apify-build-'));
try {
 await cp(path.join(root,'src'),path.join(snapshot,'src'),{recursive:true,filter:source=>!source.includes(`${path.sep}scout-workspace-qa`)});
 for(const name of ['package.json','next.config.ts','tsconfig.json','next-env.d.ts','postcss.config.mjs','postcss.config.cjs','postcss.config.js','tailwind.config.ts','.env.local']) {
  try {await copyFile(path.join(root,name),path.join(snapshot,name));} catch(error) {if(error.code!=='ENOENT')throw error;}
 }
 for(const name of ['node_modules','public'])await symlink(path.join(root,name),path.join(snapshot,name),'dir');
 const config=JSON.parse(await readFile(path.join(snapshot,'tsconfig.json'),'utf8'));config.include=['next-env.d.ts','src/**/*.ts','src/**/*.tsx','.next/types/**/*.ts'];await writeFile(path.join(snapshot,'tsconfig.json'),JSON.stringify(config,null,2));
 const sourceHashes={};async function hashFiles(dir){for(const entry of await readdir(dir,{withFileTypes:true})){const file=path.join(dir,entry.name);if(entry.isDirectory())await hashFiles(file);else if(entry.isFile())sourceHashes[path.relative(snapshot,file)]=createHash('sha256').update(await readFile(file)).digest('hex');}}
 await hashFiles(path.join(snapshot,'src'));await mkdir(path.join(root,artifactDir),{recursive:true});
 let log='';const child=spawn(path.join(root,'node_modules/.bin/next'),['build'],{cwd:snapshot,env:{...process.env,NEXT_DIST_DIR:'.next'}});child.stdout.on('data',chunk=>{log+=chunk;});child.stderr.on('data',chunk=>{log+=chunk;});
 const exitCode=await new Promise((resolve,reject)=>{child.once('error',reject);child.once('exit',code=>resolve(code));});
 await writeFile(path.join(root,artifactDir,'production-build.txt'),log.replace(/\r/g,'').split('\n').map(line=>line.trimEnd()).join('\n'));
 await writeFile(path.join(root,artifactDir,'build-source-receipt.json'),JSON.stringify({recordedAt:new Date().toISOString(),exitCode,excluded:['ephemeral src/app/templates/scout-workspace-qa'],sourceHashes},null,2)+'\n');
 console.log(`Frozen source production build ${exitCode===0 ? 'passed' : 'failed'}.`);if(exitCode!==0){console.error(log.slice(-4000));process.exitCode=1;}
 const qaPort=process.argv.find(arg=>arg.startsWith('--qa-port='))?.split('=')[1];
 if(exitCode===0 && qaPort){const server=spawn(path.join(root,'node_modules/.bin/next'),['start','--port',qaPort],{cwd:snapshot,env:{...process.env,NEXT_DIST_DIR:'.next'},stdio:'inherit'});const stop=()=>server.kill('SIGTERM');process.on('SIGINT',stop);process.on('SIGTERM',stop);await new Promise((resolve,reject)=>{server.once('error',reject);server.once('exit',resolve);});}
} finally {await rm(snapshot,{recursive:true,force:true});}
