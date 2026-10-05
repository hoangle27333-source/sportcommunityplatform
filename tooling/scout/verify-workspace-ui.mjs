/** Fixture browser checks only: no live authentication, CRM writes or paid provider calls. */
import { chromium } from 'playwright';
import { mkdir, writeFile, rm, access } from 'node:fs/promises';
const ref=new URL(process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://fixture.supabase.co').hostname.split('.')[0];
const fixtureName = `scout-workspace-qa-${process.pid}`;
const fixtureDir = `src/app/templates/${fixtureName}`;
try { await access(fixtureDir); throw new Error('Fixture route already exists; refusing to overwrite.'); } catch(e) { if(e.code !== 'ENOENT') throw e; }
await mkdir(fixtureDir,{recursive:true});
await writeFile(`${fixtureDir}/page.tsx`, `"use client";
import {useState,useEffect} from 'react';
import {useSearchParams} from 'next/navigation';
import {AuthContext} from '@/lib/auth/auth-context';
import {ScoutWorkspace} from '@/components/sport-hub/scout-workspace';
import {KolsPageView} from '@/components/sport-hub/pages/kols-page-view';
import {ScoutTaskLauncher} from '@/components/sport-hub/scout-task-launcher';
const profiles=[{id:'00000000-0000-0000-0000-000000000002',name:'Đỗ Kim Phúc',sport:['Bóng đá'],geography:'Hà Nội',profileUrl:'https://instagram.com/qa_runner',channels:[{platform:'Instagram',url:'https://instagram.com/qa_runner',isPrimary:true,handle:'qa',followers:0,avgViews:0,er:0}],platform:'Instagram',followers:0,avgViews:0,er:0,tier:'Unknown',quotation:0,status:'New Scout (Unverified)',info:''},{id:'00000000-0000-0000-0000-000000000003',name:'CLB Test B',sport:['Cầu lông'],geography:'Toàn quốc',profileUrl:'https://facebook.com/test_b',channels:[{platform:'Facebook',url:'https://facebook.com/test_b',isPrimary:true,handle:'qa',followers:0,avgViews:0,er:0}],platform:'Facebook',followers:0,avgViews:0,er:0,tier:'Unknown',quotation:0,status:'New Scout (Unverified)',info:''}];
function FixtureBody(){const q=useSearchParams();const [index,setIndex]=useState<number|null>(null);return q.get('fixture')==='directory' ? <KolsPageView initialData={{kols:profiles,communities:[],posts:[],reports:[],projects:[],kpis:{}} as any}/> : q.get('fixture')==='launcher' ? <main><button onClick={()=>setIndex(0)}>Open A</button><button onClick={()=>setIndex(1)}>Open B</button>{index!==null && <ScoutTaskLauncher key={profiles[index].id} context={{intent:'content',mode:'entity',entityType:'kol',ids:[profiles[index].id]}} entity={profiles[index]} onClose={()=>setIndex(null)} />}</main> : <ScoutWorkspace/>;}
export default function Page(){const [ready,setReady]=useState(false);useEffect(()=>setReady(true),[]);const q=useSearchParams();const role=q.get('role')==='viewer'?'viewer':'editor';return <div data-fixture-ready={ready}><AuthContext.Provider value={{user:{id:'00000000-0000-0000-0000-000000000001'} as any,profile:{id:'00000000-0000-0000-0000-000000000001',name:'QA',email:'qa@example.com',role},role,isAdmin:false,isEditor:role==='editor',isViewer:role==='viewer',loading:false,refreshUser:async()=>{},signOut:async()=>{}}}><FixtureBody/></AuthContext.Provider></div>;}
`);
const fixtureUrl=`http://localhost:${process.env.SCOUT_QA_PORT || '3000'}/templates/${fixtureName}`;
let fixtureReady=false;
for(let attempt=0;attempt<40;attempt++){const response=await fetch(fixtureUrl);const html=await response.text();if(response.ok && html.includes('data-fixture-ready')){fixtureReady=true;break;}await new Promise(resolve=>setTimeout(resolve,250));}
if(!fixtureReady){await rm(fixtureDir,{recursive:true,force:true});throw new Error('The temporary fixture route did not become ready.');}
const browser=await chromium.launch({headless:true});
const ctx=await browser.newContext({viewport:{width:1440,height:1000}});
const user={id:'00000000-0000-0000-0000-000000000001',email:'qa@example.com',app_metadata:{provider:'email'},user_metadata:{name:'QA Editor'}};
const jwt=`${Buffer.from(JSON.stringify({alg:'HS256',typ:'JWT'})).toString('base64url')}.${Buffer.from(JSON.stringify({sub:user.id,exp:Math.floor(Date.now()/1000)+3600,role:'authenticated'})).toString('base64url')}.fixture`;
await ctx.addCookies([{name:`sb-${ref}-auth-token`,value:'base64-'+Buffer.from(JSON.stringify({access_token:jwt,refresh_token:'qa-refresh',expires_at:Math.floor(Date.now()/1000)+3600,expires_in:3600,token_type:'bearer',user})).toString('base64url'),domain:'localhost',path:'/'}]);
let role='editor',available=true;const starts=[];const errors=[];
const ids=['00000000-0000-0000-0000-000000000002','00000000-0000-0000-0000-000000000003'];
const sid='00000000-0000-0000-0000-000000000010';
const candidate={candidateId:'00000000-0000-0000-0000-000000000011',accountKey:'Instagram:https://instagram.com/qa_runner',username:'qa_runner',name:'Đỗ Kim Phúc',bio:'Football coach Vietnam',platform:'Instagram',url:'https://instagram.com/qa_runner',followers:null,avgViews:null,er:null,classification:'Individual',relevant:true,reviewState:'Needs Review',locationMatch:false,reasons:['Location is unverified'],evidence:['Football coach Vietnam'],isExisting:false,posts:[]};
const profiles=ids.map((id,i)=>({id,name:i?'CLB Test B':'Đỗ Kim Phúc',sport:[i?'Cầu lông':'Bóng đá'],geography:'Hà Nội',profileUrl:i?'https://facebook.com/test_b':'https://instagram.com/qa_runner',channels:[{platform:i?'Facebook':'Instagram',url:i?'https://facebook.com/test_b':'https://instagram.com/qa_runner',isPrimary:true,handle:'qa',followers:0,avgViews:0,er:0}],platform:i?'Facebook':'Instagram',followers:0,avgViews:0,er:0,tier:'Unknown',quotation:0,status:'New Scout (Unverified)',info:''}));
const criteria={keyword:'football',platform:'Instagram',targetType:'Individual KOLs',geography:'Nationwide',limit:5};
const summaries=[{id:sid,kind:'preview',title:'Find Profiles',subject:'football',createdAt:new Date().toISOString(),status:'complete',partial:false,reviewState:'needs-review',remainingCandidates:1,progress:{},warnings:[],counts:{found:1},params:criteria}, {id:'00000000-0000-0000-0000-000000000012',kind:'kol-posts',title:'Collect Posts',subject:'Đỗ Kim Phúc',createdAt:new Date().toISOString(),status:'running',partial:false,reviewState:'none',remainingCandidates:0,progress:{stage:'running'},warnings:[],counts:{},params:{kolId:ids[0]}}];
try {
 await ctx.route(/\/scout\?/,r=>{const url=new URL(r.request().url());return r.fulfill({status:307,headers:{location:fixtureUrl+url.search}});});
 await ctx.route(/\/kols(?:\?|$)/,r=>{const url=new URL(r.request().url());url.searchParams.set('fixture','directory');return r.fulfill({status:307,headers:{location:fixtureUrl+'?'+url.searchParams}});});
 await ctx.route('**/auth/v1/**',r=>r.fulfill({json:{user,...user}}));
 await ctx.route('**/rest/v1/profiles*',r=>r.fulfill({json:{id:user.id,name:'QA Editor',email:user.email,role}}));
 await ctx.route('**/api/sport-hub/**',async r=>{
  const url=new URL(r.request().url()),path=url.pathname,body=r.request().method()==='POST'?r.request().postDataJSON():null;
  if(path.endsWith('/capabilities')){const tasks=['profiles','communities','hashtag','keyword','profile-posts','group-posts','profile-details','group-details','sync','group-sync','comments'];return r.fulfill({json:{success:true,capabilities:Object.fromEntries(['Instagram','Facebook','TikTok'].map(p=>[p,Object.fromEntries(tasks.map(t=>[t,{available:available && !(p==='Instagram'&&t==='keyword'),reason:'This capability has not passed verification.'}]))]))}});}
  if(path.endsWith('/data'))return r.fulfill({json:{success:true,kols:profiles,communities:[],posts:[],reports:[],kpis:{}}});
  if(path.endsWith('/sessions'))return r.fulfill({json:{success:true,sessions:url.searchParams.has('sessionId')?summaries.filter(s=>s.id===url.searchParams.get('sessionId')):summaries,page:1,total:2,hasMore:false}});
  if(path.endsWith('/inspect-url'))return r.fulfill({json:{success:true,data:{name:'Đỗ Kim Phúc',platform:'Instagram',followers:null,avgViews:null,er:null,bio:'Original Vietnamese content',url:body.url}}});
  if(path.endsWith('/record')){starts.push({path,body});return r.fulfill({json:{success:true,record:{id:ids[0]},message:'Saved'}});}
  if(path.endsWith('/scout')&&body?.action==='confirm'){starts.push({path,body});return r.fulfill({json:{success:true,insertedKols:1,insertedPosts:0,summary:'Imported 1 profile; saved 0 observed posts.'}});}
  if(path.endsWith('/scout')){if(body)starts.push({path,body});return r.fulfill({json:{success:true,sessionId:sid,criteria,candidates:[candidate],diagnostics:{providerCount:1,requestedCount:5,excludedCount:0}}});}
  if(body)starts.push({path,body});return r.fulfill({json:{success:true,sessionId:sid,message:'Saved posts.',counts:{inserted:1},posts:[]}});
 });
 await ctx.route('**/api/tracked-accounts',r=>r.fulfill({json:{accounts:[{id:ids[0],display_name:'Tracked A',profile_url:'https://instagram.com/qa_runner'}]}}));
 const page=await ctx.newPage();page.on('pageerror',e=>errors.push(e.message));
 const base=`http://localhost:${process.env.SCOUT_QA_PORT || '3000'}/templates/${fixtureName}`;
 await mkdir('artifacts/scout-workspace',{recursive:true});
 await page.goto(base);await page.waitForLoadState('networkidle');await page.getByRole('button',{name:'Search Profiles',exact:true}).waitFor();
 await page.getByLabel(/Profile type/).selectOption('community');
 const scopes=await page.getByLabel(/Saved account type/).evaluateAll(elements=>elements.map(e=>e.value));if(scopes.some(v=>v!=='kol'))throw new Error('Find Profiles selection changed another task card.');
 await page.getByLabel(/Profile type/).selectOption('kol');
 await page.screenshot({path:'artifacts/scout-workspace/desktop.png',fullPage:true});
 await page.getByRole('button',{name:'Search Profiles',exact:true}).click();
 await page.getByPlaceholder(/Pickleball Vietnam/).fill('football');
 await page.getByRole('button',{name:/Find Candidate/}).click();
 await page.getByText('Needs Review (1)',{exact:true}).waitFor();
 await page.getByLabel(/I verified this individual/).check();
 await page.getByRole('button',{name:/Select All/}).click();
 await page.getByRole('button',{name:/Confirm.*Import/}).click();
 await page.getByRole('dialog',{name:'Task Completed',exact:true}).waitFor();
 await page.getByRole('link',{name:'View Results',exact:true}).click();
 await page.getByRole('button',{name:'Review Profiles',exact:true}).waitFor();
 if(await page.getByRole('dialog').count()!==1)throw new Error('Completion dialog blocked session results.');
 if(!starts.some(s=>s.body?.selected?.[0]?.locationConfirmed))throw new Error('Explicit review was not preserved.');
 await page.goto(`${base}?sessionId=${sid}`);await page.getByRole('button',{name:'Review Profiles',exact:true}).waitFor();
 const before=starts.length;await page.reload();await page.getByRole('button',{name:'Review Profiles',exact:true}).waitFor();
 if(starts.length!==before)throw new Error('Reloading results started a task.');
 await page.getByRole('button',{name:'Review Profiles',exact:true}).click();await page.getByText('Needs Review (1)',{exact:true}).waitFor();
 if(starts.length!==before)throw new Error('Reopening review started a task.');
 await page.getByLabel(/I verified this individual/).check();await page.getByRole('button',{name:/Select All/}).click();
 await page.getByRole('button',{name:/Confirm.*Import/}).click();await page.getByRole('dialog',{name:'Task Completed',exact:true}).waitFor();
 await page.getByRole('link',{name:'View Results',exact:true}).click();await page.getByRole('button',{name:'Review Profiles',exact:true}).waitFor();
 if(await page.getByRole('dialog').count()!==1)throw new Error('Same-session results did not reopen cleanly.');
 await page.goto(`${base}?fixture=launcher`);await page.waitForLoadState('networkidle');await page.getByRole('button',{name:'Open A'}).click();await page.getByLabel('Instagram',{exact:true}).waitFor();
 for(let i=0;i<10;i++){await page.keyboard.press('Tab');const inside=await page.evaluate(()=>!!document.activeElement?.closest('[role="dialog"]'));if(!inside)throw new Error('Task dialog lost keyboard focus.');}
 await page.keyboard.press('Escape');await page.getByRole('button',{name:'Open B'}).click();await page.getByLabel('Facebook',{exact:true}).waitFor();
 if(await page.getByLabel('Instagram',{exact:true}).count())throw new Error('Profile A platform leaked into B.');
 await page.keyboard.press('Escape');
 available=false;await page.goto(`${base}?fixture=launcher`);await page.waitForLoadState('networkidle');await page.getByRole('button',{name:'Open A'}).click();await page.getByText('This capability has not passed verification.',{exact:true}).waitFor();
 if(await page.getByRole('button',{name:'Collect Posts',exact:true}).isEnabled())throw new Error('Unavailable provider can start collection.');
 available=true;await page.goto(base);await page.waitForLoadState('networkidle');await page.getByRole('button',{name:'Add from Link',exact:true}).click();
 await page.getByRole('textbox',{name:'Social link',exact:true}).fill('https://instagram.com/qa_runner');await page.getByRole('button',{name:'Inspect Link',exact:true}).click();
 await page.getByText('Public metadata inspected. Metrics remain unverified until observed by a provider. Review before saving.',{exact:true}).waitFor();
 const nameInput=page.getByPlaceholder(/Hoang Dang Phan/);await nameInput.waitFor();if(await nameInput.inputValue()!=='Đỗ Kim Phúc')throw new Error('Original entity name was changed.');
 await page.getByRole('button',{name:'Save Profile',exact:true}).click();await page.getByRole('dialog',{name:'Task Completed',exact:true}).waitFor();
 const saved=starts.find(s=>s.path.endsWith('/record'));if(saved.body.data.followers!==null || !saved.body.data.missingMetrics.includes('followers'))throw new Error('Unknown metadata became a fake metric.');
 const viewSaved=page.getByRole('link',{name:'View Results',exact:true});
 if(await viewSaved.getAttribute('href')!==`/kols?recordId=${ids[0]}`)throw new Error('Saved profile results do not point to the created record.');
 await page.getByRole('link',{name:'Collect Posts',exact:true}).click();
 await page.getByRole('dialog',{name:'Collect Posts',exact:true}).waitFor();
 if(await page.getByRole('dialog').count()!==1)throw new Error('Completion dialog blocked Collect Posts.');
 if(!new URL(page.url()).searchParams.get('ids')?.includes(ids[0]))throw new Error('Collect Posts lost the saved record.');
 if(starts.filter(s=>!s.path.endsWith('/record') && s.body?.action!=='confirm' && s.path!=='/api/sport-hub/scout').length)throw new Error('Next task navigation collected content automatically.');
 // Repeat the completion state with fixture persistence to exercise both directory links.
 for(const linkName of ['View Results','Open Directory']){
  await page.goto(base);await page.waitForLoadState('networkidle');
  await page.getByRole('button',{name:'Add from Link',exact:true}).click();
  await page.getByPlaceholder(/Hoang Dang Phan/).fill('Đỗ Kim Phúc');
  await page.getByRole('button',{name:'Save Profile',exact:true}).click();
  await page.getByRole('dialog',{name:'Task Completed',exact:true}).waitFor();
  await page.getByRole('link',{name:linkName,exact:true}).click();
  await page.getByRole('heading',{name:'Sports KOLs Directory',exact:true}).waitFor();
  await page.getByRole('dialog',{name:'Task Completed',exact:true}).waitFor({state:'detached'});
  if(linkName==='View Results')await page.getByRole('heading',{name:'Đỗ Kim Phúc',exact:true}).waitFor();
 }
 await page.setViewportSize({width:390,height:844});await page.goto(base);await page.waitForLoadState('networkidle');await page.getByRole('button',{name:'Search Profiles',exact:true}).waitFor();await page.screenshot({path:'artifacts/scout-workspace/mobile.png',fullPage:true});
 const overflow=await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth);if(overflow)throw new Error('Mobile workspace overflows horizontally.');
 role='viewer';await page.goto(`${base}?role=viewer`);await page.getByText('Editor access is required to start or import tasks.',{exact:false}).first().waitFor();if(await page.getByRole('button',{name:'Search Profiles',exact:true}).isEnabled())throw new Error('Viewer can start a task.');
 if(errors.length)throw new Error(errors.join('\n'));
 console.log(JSON.stringify({fixtureOnly:true,checks:['independent task card scopes','workspace desktop/mobile','explicit review import','completion View Results navigation','completion Open Directory navigation','completion Collect Posts preselection','single dialog after navigation','same-session completion results','read-only result reload','resume review','entity A/B reset','keyboard focus and Escape','provider unavailable','original entity name','unknown metric save','viewer gating'],starts:starts.length,pageErrors:errors}));
} catch(e) {const p=ctx.pages().at(-1);if(p){await p.screenshot({path:'artifacts/scout-workspace/failure.png',fullPage:true}).catch(()=>{});console.error((await p.locator('body').innerText()).slice(0,2500));}console.error(JSON.stringify({pageErrors:errors}));throw e;} finally {await browser.close();await rm(fixtureDir,{recursive:true,force:true});}
