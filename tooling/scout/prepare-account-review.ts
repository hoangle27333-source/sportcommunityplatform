/** Creates offline review packets from saved evidence; zero provider starts and no labels assigned. */
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { prepareReviewPackets } from './account-review-packets';
const arg=(name:string)=>process.argv.find(value=>value.startsWith(`--${name}=`))?.slice(name.length+3);
const input=arg('input'),output=arg('output');
if(!input || !output)throw new Error('Supply --input (saved normalized profiles JSON array) and --output (new review packets file).');
if(resolve(input)===resolve(output))throw new Error('Do not overwrite source evidence.');
const profiles=JSON.parse(await readFile(input,'utf8'));if(!Array.isArray(profiles))throw new Error('Expected a saved profile array.');
const packets=prepareReviewPackets(profiles);await mkdir(dirname(resolve(output)),{recursive:true});
await writeFile(output,JSON.stringify(packets,null,2)+'\n',{flag:'wx'});
console.log(`Prepared ${packets.length} review packets. Labels and reviewer confirmation are blank. No provider calls.`);
