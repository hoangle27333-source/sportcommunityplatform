import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
/** Download only the pinned ONNX encoder/tokenizer, never datasets or labels. */
import { mkdir, writeFile, readFile, access } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { createHash } from 'node:crypto';
const revision='2c4055b12046f11709e9df2c122e59ffbdc2f900';
const root=resolve(process.argv.find(v=>v.startsWith('--output='))?.slice(9) || 'models/scout-account');
const files=['onnx/model_quantized.onnx','config.json','tokenizer.json','tokenizer_config.json','special_tokens_map.json'];
await mkdir(root,{recursive:true});
try{await access(resolve(root,'manifest.json'));throw new Error('Refusing to overwrite an existing trained model.');}catch(e){if(e.code!=='ENOENT')throw e;}
const artifacts={};
for(const file of files) {
 await mkdir(dirname(resolve(root,file)),{recursive:true});
 await promisify(execFile)('curl',['--fail','--location','--silent','--show-error','--retry','2','--connect-timeout','20','--max-time','300','--output',resolve(root,file),`https://huggingface.co/Xenova/paraphrase-multilingual-MiniLM-L12-v2/resolve/${revision}/${file}`]);
 const bytes=await readFile(resolve(root,file));
 artifacts[file]=createHash('sha256').update(bytes).digest('hex');
 process.stdout.write(`${file}: ${bytes.length} bytes\n`);
}
await writeFile(resolve(root,'encoder-manifest.json'),JSON.stringify({encoder:'sentence-transformers/paraphrase-multilingual-MiniLM-L12-v2',distribution:'Xenova/paraphrase-multilingual-MiniLM-L12-v2',revision,artifacts},null,2));
process.stdout.write('Pinned encoder prepared. No classifier is trained or activated.\n');
