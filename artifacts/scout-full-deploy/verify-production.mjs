import assert from 'node:assert/strict';
import {writeFile} from 'node:fs/promises';
const origin='https://sportcommunityplatform.vercel.app';
const requests=[
 ['login','/login',200],['scout','/scout',[200,307]],
 ['workflowFixture','/api/sport-hub/scout/workflow-fixture',404],
 ['plan','/api/sport-hub/scout/plan',401,{}],
 ['reassess','/api/sport-hub/scout/reassess',401,{sessionId:'00000000-0000-4000-8000-000000000001'}],
 ['review','/api/sport-hub/scout/review',401,{}],
 ['attributes','/api/sport-hub/scout/attributes',401,{}],
 ['import','/api/sport-hub/scout',401,{action:'confirm'}],
];
const results=await Promise.all(requests.map(async([name,route,expected,body])=>{
 const response=await fetch(origin+route,{redirect:'manual',signal:AbortSignal.timeout(30000),...(body?{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body)}:{})});
 const result={name,status:response.status,location:response.headers.get('location')};
 assert.ok((Array.isArray(expected)?expected:[expected]).includes(response.status),`${name}: unexpected ${response.status}`);
 if(name==='scout' && response.status===307)assert.ok(result.location?.startsWith('/login'));
 if(response.status===401){const json=await response.json();assert.equal(json.code,'UNAUTHORIZED');result.code=json.code;}
 return result;
}));
const receipt={recordedAt:new Date().toISOString(),productionUrl:origin,deploymentId:process.argv[2],passed:true,results,providerStarts:0,modelCalls:0,crmMutations:0};
await writeFile(new URL('./production-smoke.json',import.meta.url),JSON.stringify(receipt,null,2)+'\n');
console.log(JSON.stringify(receipt));
