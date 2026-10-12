import { afterEach, expect, it } from 'vitest';
import { classifyAccount, evidenceHash, scoreAccount, validateManifest, type AccountModelManifest } from './account-model';
import { parseProfile } from './providers';
const manifest=():AccountModelManifest=>({version:'test-1',featureVersion:'profile-post-mean-128-v1',encoder:'sentence-transformers/paraphrase-multilingual-MiniLM-L12-v2',revision:'a'.repeat(40),artifacts:{'onnx/model_quantized.onnx':'a'.repeat(64)},classes:['Individual','Community','Club','Brand/Business','Media/Event','Other'],coefficients:Array.from({length:6},()=>Array(770).fill(0)),intercepts:[2,0,0,0,0,0],thresholds:{Individual:.9},qualityGate:false,runtimeGate:false,testReceipt:''});
afterEach(()=>{delete process.env.SCOUT_ACCOUNT_MODEL_MODE;delete process.env.SCOUT_ACCOUNT_MODEL_PATH;});
it('validates the feature and taxonomy contract and rejects non-finite features',()=>{
 const m=manifest();expect(()=>validateManifest(m)).not.toThrow();expect(()=>scoreAccount(Array(770).fill(NaN),m)).toThrow();
 m.coefficients[0].pop();expect(()=>validateManifest(m)).toThrow();
});
it('uses numerically stable softmax without claiming calibration',()=>{
 const m=manifest();m.intercepts=[1000,999,998,997,996,995];const scores=scoreAccount(Array(770).fill(0),m);
 expect(Object.values(scores).reduce((a,b)=>a+b,0)).toBeCloseTo(1);expect(scores.Individual).toBeGreaterThan(scores.Club!);
});
it('does not load or activate an untrained model by default',async()=>{
 const p=parseProfile({url:'https://instagram.com/runner',name:'Running Coach',bio:'Running athlete'},'Instagram')!;
 expect(await classifyAccount(p)).toMatchObject({source:'rules',modelVersion:'account-rules-5'});
 const old=evidenceHash(p);p.bio+=' new evidence';expect(evidenceHash(p)).not.toBe(old);
});
it('fails back to an inspectable rule assessment if artifacts are unavailable',async()=>{
 process.env.SCOUT_ACCOUNT_MODEL_MODE='active';process.env.SCOUT_ACCOUNT_MODEL_PATH='/missing-scout-model';
 const result=await classifyAccount(parseProfile({url:'https://instagram.com/runner',name:'Runner'},'Instagram')!);
 expect(result.source).toBe('rules');expect(result.missingInformation.join(' ')).toContain('unavailable');
});
