/** Real Scout components, intercepted API fixtures. Zero live provider/CRM calls. */
import { mkdir, writeFile, rm, access } from 'node:fs/promises';
const {chromium}=await import(process.env.SCOUT_PLAYWRIGHT_PATH || 'playwright');
const dir=`src/app/templates/scout-account-qa-${process.pid}`;
try{await access(dir);throw new Error('Fixture path exists.');}catch(e){if(e.code!=='ENOENT')throw e;}
await mkdir(dir,{recursive:true});
await writeFile(`${dir}/page.tsx`, `'use client';
import {useState,useEffect} from 'react';
import {DiscoveryScoutModal} from '@/components/sport-hub/discovery-scout-modal';
import {AuthContext} from '@/lib/auth/auth-context';
export default function Page(){const [open,setOpen]=useState(false);const [ready,setReady]=useState(false);useEffect(()=>setReady(true),[]);return <AuthContext.Provider value={{user:{id:'fixture'},profile:{role:'editor'},role:'editor',isEditor:true,isAdmin:false,isViewer:false,loading:false,refreshUser:async()=>{},signOut:async()=>{}} as any}><button disabled={!ready} onClick={()=>setOpen(true)}>Open Scout fixture</button>{open && <DiscoveryScoutModal isOpen onClose={()=>setOpen(false)} onSuccess={()=>{}}/>}</AuthContext.Provider>;}`);
const id='00000000-0000-0000-0000-000000000001';
const geo={state:'passed',reason:'Recent post location meets the selected scope.',mode:'profile-or-recent-posts',profileLocation:'Hanoi',coverage:{requested:10,collected:1,dated:1,partial:true,latestVerified:false},observations:[{raw:'Saigon',canonical:'Ho Chi Minh City',source:'geotag',postId:'post1',postUrl:'https://instagram.com/p/post1',publishedAt:'2026-10-10',status:'observed'}]};
let candidate={candidateId:id,accountKey:'Instagram:https://instagram.com/alex',name:'Alex Runner',username:'alex',url:'https://instagram.com/alex',platform:'Instagram',bio:'Running athlete',category:'Athlete',entityType:'person',location:'Hanoi',followers:1000,avgViews:null,er:null,likes:null,comments:null,avatarUrl:'',posts:[],classification:'Individual',reviewState:'Matched',resultGroup:'Qualified',relevant:true,locationMatch:true,verifiedGeography:'Ho Chi Minh City',reasons:[geo.reason],evidence:['Running athlete'],isExisting:false,provenance:{},entityAssessment:{suggestedType:'Individual',status:'supported',source:'rules',evidence:['Running athlete'],missingInformation:[],modelVersion:'account-rules-5'},geographyAssessment:geo};
let browser, page;
try {
 browser=await chromium.launch({headless:true,...(process.env.SCOUT_CHROME_PATH?{executablePath:process.env.SCOUT_CHROME_PATH}:{})});
 page=await browser.newPage({viewport:{width:1280,height:1000}}); const errors=[],requests=[];
 page.on('pageerror',error=>{errors.push(error.message);console.error('Page error:',error.message);});
 await page.route('**/api/**',async route=>{
  const path=new URL(route.request().url()).pathname,body=route.request().method()==='POST'?route.request().postDataJSON():{};let result={success:true};
  if(path.endsWith('/capabilities'))result={success:true,capabilities:Object.fromEntries(['Instagram','TikTok','Facebook'].map(p=>[p,Object.fromEntries(['profiles','communities'].map(task=>[task,{available:true}]))]))};
  else if(path.endsWith('/plan'))result={success:true,plan:{hash:'a'.repeat(64),criteria:body,maxSessionUsd:1,rounds:[{queries:['Running Ho Chi Minh City']},{queries:['Running']}],sources:[{platform:'Instagram',task:'profiles',warnings:[]}],appliedFilters:[{platform:'Instagram',setting:'Recent locations',mode:'Local verification',detail:'Up to 10 latest owned posts.'}]}};
  else if(path.endsWith('/feedback')){requests.push({path,body});candidate={...candidate,classification:body.entityType==='Individual'?'Individual':'Brand/Business',reviewState:body.entityType==='Individual'?'Matched':'Excluded',entityAssessment:{...candidate.entityAssessment,suggestedType:body.entityType,reviewedType:body.entityType,source:'review'}};result={success:true,candidate};}
  else if(path.endsWith('/review')){requests.push({path,body});result={success:true,decision:{decision:body.decision,classification:'Individual',entityType:body.entityType,relevant:true,locationConfirmed:true}};}
  else if(path==='/api/sport-hub/scout'){requests.push({path,body});if(body.action==='confirm')throw new Error('UI fixture must not import.');result={success:true,sessionId:id,candidates:[candidate],criteria:{...body},warnings:[]};}
  await route.fulfill({json:result});
 });
 const fixtureUrl=`http://localhost:${process.env.SCOUT_QA_PORT || '3111'}/templates/${dir.split('/').pop()}`;
 for(let attempt=0;attempt<10;attempt++){const response=await page.goto(fixtureUrl,{waitUntil:'domcontentloaded',timeout:120000});if(response?.status()===200)break;if(response?.status()!==404)throw new Error(`Fixture returned ${response?.status()}`);await new Promise(resolve=>setTimeout(resolve,1000));}
 await page.getByRole('button',{name:'Open Scout fixture'}).waitFor({timeout:60000});
 await page.getByRole('button',{name:'Open Scout fixture'}).click();
 await page.getByPlaceholder(/Pickleball Vietnam, Runner Hanoi/).fill('Running');
 await page.getByLabel('Geography evidence').selectOption('profile-or-recent-posts');
 await page.getByText('Up to 10 latest owned posts.',{exact:false}).first().waitFor();
 await page.getByRole('button',{name:'Start Scout',exact:true}).click();
 await page.getByRole('region',{name:'Account evidence'}).waitFor();
 if(requests[0]?.body.accountPolicyVersion!==5 || requests[0]?.body.geographyMode!=='profile-or-recent-posts' || !requests[0]?.body.entityTypes.includes('Individual'))throw new Error('Account settings were not submitted.');
 await page.getByText('Recent post location meets the selected scope.',{exact:true}).last().waitFor();
 await page.getByLabel('Correct account type for Alex Runner').selectOption('Brand/Business');
 await page.getByRole('button',{name:'Save type correction',exact:true}).click();
 await page.getByText('This type is retained for Scout review and cannot be imported into the current CRM.').waitFor();
 await page.getByLabel('Type',{exact:true}).selectOption('Individual');
 if(await page.getByRole('region',{name:'Account evidence'}).count())throw new Error('Entity type filter did not hide the business.');
 await page.getByLabel('Type',{exact:true}).selectOption('All');
 await page.getByLabel('Correct account type for Alex Runner').selectOption('Individual');
 await page.getByRole('button',{name:'Save type correction',exact:true}).click();
 await page.getByRole('button',{name:'Approve for Import',exact:true}).click();
 await page.getByText('Reviewed type:',{exact:false}).waitFor();
 if(!requests.some(r=>r.path.endsWith('/review') && r.body.entityType==='Individual'))throw new Error('Review lost the explicit entity type.');
 await page.setViewportSize({width:390,height:844});
 await mkdir('artifacts/scout-account-qa',{recursive:true});await page.screenshot({path:'artifacts/scout-account-qa/mobile-review.png',fullPage:true});
 if(errors.length)throw new Error(errors.join('\n'));
 console.log('Actual Scout UI: settings, latest-post evidence, type corrections, filtering and approval passed; zero provider calls/imports.');
} catch(error) { if(page) { console.error(await page.locator('body').innerText()); await page.screenshot({path:'/tmp/scout-account-ui-failure.png',fullPage:true}); } throw error; } finally {if(browser)await browser.close();await rm(dir,{recursive:true,force:true});}
