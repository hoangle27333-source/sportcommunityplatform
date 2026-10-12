/** Measure actual Next traces, including Workflow's combined flow/step handler. No deployment. */
import { readFile, stat, mkdir, writeFile } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
const arg=name=>process.argv.find(value=>value.startsWith(`--${name}=`))?.slice(name.length+3);
const build=resolve(arg('build') || '.next'), target=arg('target') || `${process.platform}-${process.arch}`;
if(!/^(linux|darwin|win32)-(x64|arm64)$/.test(target))throw new Error('Unsupported target.');
const encoderOnly=process.argv.includes('--encoder-only');
const [platform,arch]=target.split('-'),required=['config.json','tokenizer.json','tokenizer_config.json','special_tokens_map.json','onnx/model_quantized.onnx',...(encoderOnly?[]:['manifest.json'])];
const traces=['app/.well-known/workflow/v1/flow/route.js.nft.json','app/api/sport-hub/scout/route.js.nft.json','app/api/sport-hub/scout/reassess/route.js.nft.json'];
const routes=[];
for(const relative of traces){
 const trace=resolve(build,'server',relative), paths=JSON.parse(await readFile(trace,'utf8')).files, failures=[];
 let bytes=0;const missing=[];
 for(const path of paths){try{bytes+=(await stat(resolve(dirname(trace),path))).size;}catch{missing.push(path);}}
 if(missing.length)failures.push(`Missing traced files: ${missing.length}`);
 for(const artifact of required)if(!paths.some(path=>path.endsWith(`/models/scout-account/${artifact}`)))failures.push(`Untraced model artifact: ${artifact}`);
 if(!paths.some(path=>path.endsWith(`/onnxruntime-node/bin/napi-v3/${platform}/${arch}/onnxruntime_binding.node`)))failures.push('Target ONNX native binding is missing.');
 const nativeRoot=`/onnxruntime-node/bin/napi-v3/${platform}/${arch}/`;
 const hasRuntimeLibrary=paths.some(path=>path.includes(nativeRoot) && (platform==='linux'?/libonnxruntime\.so(?:\.|$)/.test(path):platform==='darwin'?/libonnxruntime.*\.dylib$/.test(path):/onnxruntime\.dll$/.test(path)));
 if(!hasRuntimeLibrary)failures.push('Target ONNX runtime library is missing.');
 const wrongNative=paths.filter(path=>path.includes('/onnxruntime-node/bin/napi-v3/') && !path.includes(`/napi-v3/${platform}/${arch}/`));
 if(wrongNative.length)failures.push(`Unneeded ONNX native files: ${wrongNative.length}`);
 if(paths.some(path=>/libonnxruntime_providers_(cuda|tensorrt)\.so$/.test(path)))failures.push('GPU libraries are not used by CPU Scout inference.');
 if(bytes>=250000000)failures.push('Uncompressed trace exceeds the 250 MB gate.');
 routes.push({trace:relative,bytes,megabytes:Number((bytes/1000000).toFixed(2)),passed:failures.length===0,failures});
}
const receipt={recordedAt:new Date().toISOString(),target,encoderOnly,routes,bundleGate:routes.every(route=>route.passed),runtimeGate:false,releaseReady:false};
if(arg('output')){const output=resolve(arg('output'));await mkdir(dirname(output),{recursive:true});await writeFile(output,JSON.stringify(receipt,null,2)+'\n');}
console.log(JSON.stringify(receipt,null,2));if(!receipt.bundleGate)process.exitCode=1;
