/** Authenticated hosted verification using only the six saved Brave responses. No new provider or CRM calls. */
import {spawn} from 'node:child_process';
import {mkdtemp,writeFile,readFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {createServerClient} from '@supabase/ssr';
import {createAdminClient} from '../../src/lib/supabase/admin';
import {savedExperimentalProfiles} from '../../src/lib/scout-experimental/saved';
import {buildBraveRequest} from '../../src/lib/scout-experimental/brave';
import {stableJson} from '../../src/lib/apify/runtime';
import {buildExperimentalPlan} from '../../src/lib/scout-experimental/plan';
import {previewDiscoveryCandidates} from '../../src/lib/apify/scout';
import {withStoredEvidence} from '../../src/lib/apify/stored-evidence';
import {requestSchema} from '../../src/lib/apify/sessions';
const target=process.argv.find(x=>x.startsWith('--url='))?.slice(6);if(!target)throw new Error('Pass --url=deployment URL');
const db=createAdminClient();const pilot=JSON.parse(await readFile('docs/scout/brave-live-receipt.json','utf8'));
const {data:source,error:se}=await db.from('scout_sessions').select('*').eq('id',pilot.sessionId).single();if(se)throw se;
const params=requestSchema.parse({keyword:'badminton',searchStrategy:'seed_content_v1',platform:['Facebook','TikTok','Instagram'],geography:'Ho Chi Minh City',targetType:'Individual KOLs',limit:5,minFollowers:1000,keywordsApproved:true,approvedKeywords:['cầu lông huấn luyện viên Hồ Chí Minh','badminton coach Vietnam'],seedUrls:[],maxSessionUsd:1,maxModelUsd:.02,providerSelection:{discovery:'brave',profile:'apify',posts:'apify'}});
const plan=await buildExperimentalPlan(params);
if(!source.candidates?.length){
 const profiles=await savedExperimentalProfiles(source.id);
 const result:any=await withStoredEvidence([],()=>previewDiscoveryCandidates({...params,keyword:params.keyword!,geography:String(params.geography),searchPlan:plan,sessionId:source.id,savedExperimentalProfiles:profiles}));
 const {error}=await db.from('scout_sessions').update({params:{...params,searchPlan:plan,planHash:plan.hash,assessmentRevision:7,uiContext:{source:'brave-saved-response-verification'}},candidates:result.candidates,result:{...result,braveVerification:pilot,searchCost:{actualUsd:.03,reservedUsd:0,approvedCapUsd:.03},verificationMode:'Saved Brave results; no live profile/posts hydration'},progress:{stage:'complete'},status:'complete'}).eq('id',source.id);if(error)throw error;
}
const {data:user,error:ue}=await db.auth.admin.getUserById(source.owner_id);if(ue || !user.user?.email)throw ue || new Error('Pilot owner unavailable.');
const {data:link,error:le}=await db.auth.admin.generateLink({type:'magiclink',email:user.user.email});if(le)throw le;
const cookies=new Map<string,string>();
const auth=createServerClient(process.env.NEXT_PUBLIC_SUPABASE_URL!,process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,{cookies:{getAll:()=>[...cookies].map(([name,value])=>({name,value})),setAll:(values:{name:string;value:string}[])=>values.forEach(({name,value})=>cookies.set(name,value))}});
const {error:ae}=await auth.auth.verifyOtp({type:'magiclink',token_hash:link.properties.hashed_token});if(ae)throw ae;
const privateDir=await mkdtemp(tmpdir()+'/brave-release-');const config=privateDir+'/curl.conf';
await writeFile(config,`header = ${JSON.stringify('Cookie: '+[...cookies].map(([k,v])=>`${k}=${v}`).join('; '))}\nheader = "Content-Type: application/json"\nsilent\nshow-error\n`,{mode:0o600});
const cli='/Users/Apple/.npm/_npx/67eb4586ca667318/node_modules/vercel/dist/index.js';
async function call(path:string,body?:unknown){
 const bodyFile=privateDir+'/body.json';if(body!==undefined)await writeFile(bodyFile,JSON.stringify(body),{mode:0o600});
 const flags=['--config',config,...(body!==undefined?['--request','POST','--data-binary','@'+bodyFile]:[])];
 let output='';let err='';const child=spawn(process.execPath,[cli,'curl',path,'--deployment',target!,'--',...flags]);child.stdout.on('data',x=>output+=x);child.stderr.on('data',x=>err+=x);const code=await new Promise(r=>child.on('close',r));if(code)throw new Error(`Hosted request failed (${code}); no credentials logged.`);
 try{return JSON.parse(output);}catch{throw new Error(`Hosted request did not return JSON: ${path}`);}
}
try{
 const config=await call('/api/sport-hub/scout/experimental?topic=badminton&geography=Ho%20Chi%20Minh%20City&target=Individual%20KOLs');
 if(config.braveBudget?.remainingUsd!==4.47 || config.capabilities.filter((c:any)=>c.provider==='brave'&&c.available).length!==3)throw new Error('Hosted Brave configuration is unavailable.');
 const approved=await call('/api/sport-hub/scout/plan',{kind:'preview',...params});if(!approved.success || approved.plan.experimental.units.length!==6)throw new Error('Hosted Brave plan failed.');
 for(const unit of approved.plan.experimental.units)if(stableJson(unit.braveRequest)!==stableJson(buildBraveRequest(unit.platform,unit.query)))throw new Error('Hosted request differs from the approved builder.');
 const first=await call('/api/sport-hub/scout?sessionId='+source.id);const second=await call('/api/sport-hub/scout?sessionId='+source.id);
 if(!first.success || JSON.stringify(first.candidates)!==JSON.stringify(second.candidates) || !first.candidates?.some((c:any)=>c.searchHints?.length))throw new Error('Hosted saved-result reload failed.');
 const candidate=first.candidates.find((c:any)=>c.searchHints?.length);
 const blocked=await call('/api/sport-hub/scout',{action:'confirm',sessionId:source.id,selected:[{candidateId:candidate.candidateId}]});if(blocked.success)throw new Error('Unapproved import unexpectedly succeeded.');
 const reassessed=await call('/api/sport-hub/scout/reassess',{sessionId:source.id});if(!reassessed.success || !reassessed.sessionId)throw new Error('Hosted reassessment failed.');
 let child:any;
 const deadline=Date.now()+90000;
 do{child=await call('/api/sport-hub/scout?sessionId='+reassessed.sessionId);if(!child.pending && child.success && child.providerStarts===0)break;await new Promise(r=>setTimeout(r,3000));}while(Date.now()<deadline);
 if(child.pending || !child.success || child.providerStarts!==0)throw new Error('Stored Brave reassessment has not completed.');
 const replay=await call('/api/sport-hub/scout/reassess',{sessionId:source.id});if(replay.sessionId!==reassessed.sessionId)throw new Error('Stored reassessment identity drifted.');
 for(const table of ['scout_provider_runs','scout_external_runs']){const {count,error}=await db.from(table).select('id',{count:'exact',head:true}).eq('session_id',reassessed.sessionId);if(error || count!==0)throw error || new Error('Stored reassessment started a provider.');}
 const receipt={target,sourceSessionId:source.id,storedChildId:reassessed.sessionId,availableBravePlatforms:3,approvedBraveCalls:6,exactApprovedRequestsVerified:true,savedCandidateCount:first.candidates.length,qualifiedCount:first.candidates.filter((c:any)=>c.resultGroup==='Qualified').length,stableReload:true,unapprovedImportBlocked:true,reassessmentProviderStarts:0,braveApiValueUsd:.03,crmWrites:0,observedAt:new Date().toISOString()};
 await writeFile(target.includes('sportcommunityplatform.vercel.app')?'docs/scout/brave-production-receipt.json':'docs/scout/brave-preview-receipt.json',JSON.stringify(receipt,null,2)+'\n');console.log(JSON.stringify(receipt));
}finally{await rm(privateDir,{recursive:true,force:true});}
