import { expect, it } from 'vitest';
import { mkdtemp, mkdir, writeFile, readFile, rm, open } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, dirname, relative, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
const script=resolve('tooling/scout/verify-account-bundle.mjs');
async function fixture(work:(root:string)=>Promise<void>){
 const root=await mkdtemp(join(tmpdir(),'scout-bundle-gate-'));
 try{
  const files=['models/scout-account/config.json','models/scout-account/tokenizer.json','models/scout-account/tokenizer_config.json','models/scout-account/special_tokens_map.json','models/scout-account/onnx/model_quantized.onnx','node_modules/onnxruntime-node/bin/napi-v3/linux/x64/onnxruntime_binding.node','node_modules/onnxruntime-node/bin/napi-v3/linux/x64/libonnxruntime.so.1'];
  for(const file of files){await mkdir(dirname(join(root,file)),{recursive:true});await writeFile(join(root,file),'fixture');}
  for(const route of ['.well-known/workflow/v1/flow','api/sport-hub/scout','api/sport-hub/scout/reassess']){
   const trace=join(root,'.next/server/app',route,'route.js.nft.json');await mkdir(dirname(trace),{recursive:true});await writeFile(trace,JSON.stringify({version:1,files:files.map(file=>relative(dirname(trace),join(root,file)))}));
  }
  await work(root);
 }finally{await rm(root,{recursive:true,force:true});}
}
const run=(root:string,encoderOnly=true)=>spawnSync(process.execPath,[script,`--build=${join(root,'.next')}`,'--target=linux-x64',...(encoderOnly?['--encoder-only']:[])],{encoding:'utf8'});
it('checks the combined Workflow route and keeps encoder smoke separate from release readiness',async()=>fixture(async root=>{
 const result=run(root);expect(result.status).toBe(0);const receipt=JSON.parse(result.stdout);expect(receipt.routes).toHaveLength(3);expect(receipt).toMatchObject({bundleGate:true,runtimeGate:false,releaseReady:false});
 expect(run(root,false).status).toBe(1);
}));
it('fails when a traced artifact is missing or the uncompressed bundle is oversized',async()=>fixture(async root=>{
 const model=join(root,'models/scout-account/onnx/model_quantized.onnx');const handle=await open(model,'r+');await handle.truncate(250000000);await handle.close();
 expect(run(root).status).toBe(1);await rm(model);expect(run(root).status).toBe(1);
}));
it('rejects unused GPU providers even when the trace is below the size limit',async()=>fixture(async root=>{
 const file=join(root,'node_modules/onnxruntime-node/bin/napi-v3/linux/x64/libonnxruntime_providers_cuda.so');await writeFile(file,'unused GPU fixture');
 const trace=join(root,'.next/server/app/.well-known/workflow/v1/flow/route.js.nft.json');const manifest=JSON.parse(await readFile(trace,'utf8'));manifest.files.push(relative(dirname(trace),file));await writeFile(trace,JSON.stringify(manifest));
 const result=run(root);expect(result.status).toBe(1);expect(result.stdout).toContain('GPU libraries are not used');
}));
