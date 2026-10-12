/** Actual Scout components with network fixtures; no provider, auth or CRM mutation. */
const {chromium}=await import(process.env.SCOUT_PLAYWRIGHT_PATH || 'playwright');
import {mkdir,writeFile,rm,access} from 'node:fs/promises';
const dir=`src/app/templates/scout-workspace-qa-search-${process.pid}`;
try{await access(dir);throw new Error('Refusing to overwrite a fixture.');}catch(e){if(e.code!=='ENOENT')throw e;}
await mkdir(dir,{recursive:true});
await writeFile(`${dir}/page.tsx`, `'use client';
import {useState} from 'react';
import {DiscoveryScoutModal} from '@/components/sport-hub/discovery-scout-modal';
import {MarketTrendScoutModal} from '@/components/sport-hub/market-trend-scout-modal';
import {ScoutSessionResults} from '@/components/sport-hub/scout-task-launcher';
import {AuthContext} from '@/lib/auth/auth-context';
const session={id:'00000000-0000-0000-0000-000000000001',kind:'trends',title:'Find Content',subject:'Running',status:'complete',partial:true,remainingCandidates:2,reviewState:'needs-review',warnings:[],counts:{qualified:0,unverified:1,belowTarget:1},params:{keyword:'Running',platform:'TikTok'},progress:{}} as any;
export default function Page(){const [mode,setMode]=useState('');return <AuthContext.Provider value={{user:{id:session.id},profile:{role:'editor'},role:'editor',isAdmin:false,isEditor:true,isViewer:false,loading:false,refreshUser:async()=>{},signOut:async()=>{}} as any}><main><button onClick={()=>setMode('profiles')}>Profile fixture</button><button onClick={()=>setMode('content')}>Content fixture</button><button onClick={()=>setMode('results')}>Results fixture</button>{mode==='profiles' && <DiscoveryScoutModal isOpen onClose={()=>setMode('')} onSuccess={()=>{}}/>}{mode==='content' && <MarketTrendScoutModal isOpen onClose={()=>setMode('')} onSuccess={()=>{}}/>}{mode==='results' && <ScoutSessionResults session={session} onClose={()=>setMode('')} onReview={()=>{}}/>}</main></AuthContext.Provider>;}`);
const base=`http://localhost:${process.env.SCOUT_QA_PORT || '3111'}`;let browser;
try {
 browser=await chromium.launch({headless:true});const page=await browser.newPage({viewport:{width:1280,height:1000}});const errors=[],starts=[];
 page.on('pageerror',e=>errors.push(e.message));
 await page.route('**/api/**',async route=>{
 const url=new URL(route.request().url());let result={success:true};
 if(url.pathname.endsWith('/capabilities'))result={success:true,capabilities:Object.fromEntries(['Facebook','Instagram','TikTok'].map(p=>[p,Object.fromEntries(['profiles','communities','hashtag','keyword','profile-details'].map(t=>[t,{available:true}]))]))};
 else if(url.pathname.endsWith('/plan')){const p=route.request().postDataJSON();result={success:true,plan:{hash:'a'.repeat(64),criteria:{...p,limit:p.limit || 5},maxSessionUsd:p.maxSessionUsd || 1,rounds:[{queries:['running coach Vietnam']},{queries:['vận động viên chạy bộ Vietnam']}],sources:[{platform:'TikTok',task:'keyword',warnings:[]}]}};}
 else if(url.pathname==='/api/sport-hub/scout' && route.request().method()==='POST'){starts.push(route.request().postDataJSON());result={success:true,sessionId:'00000000-0000-0000-0000-000000000001',candidates:[],warnings:[]};}
 else if(url.pathname==='/api/sport-hub/scout/market-trends'){starts.push(route.request().postDataJSON());result={success:true,posts:[],warnings:[]};}
 else if(url.pathname==='/api/sport-hub/scout' && route.request().method()==='GET')result={success:true,counts:{qualified:0,unverified:1,belowTarget:1},posts:[],groups:{qualified:[],needsVerification:[{id:'a',url:'https://tiktok.com/@runner/video/1',platform:'TikTok',caption:'Chạy bộ',reviewState:'Needs Verification',reason:'Location is unverified.',likes:null,comments:null,views:null}],belowTarget:[{id:'b',url:'https://tiktok.com/@runner/video/2',platform:'TikTok',caption:'Chạy bộ Hanoi',reviewState:'Below Target',reason:'Below the interaction threshold.',likes:0,comments:0,views:0}],excluded:[]},searchExecution:{rounds:[{}],uniqueCount:2,duplicateCount:0,unparseableCount:0,stopReason:'plan-exhausted'}};
 await route.fulfill({json:result});
 });
 await page.goto(`${base}/templates/${dir.split('/').pop()}`);await page.getByRole('button',{name:'Profile fixture'}).click();
 await page.getByPlaceholder(/Pickleball Vietnam, Runner Hanoi/).fill('Running');
 await page.getByText('Budget cap $1.00',{exact:false}).waitFor();
 await page.getByRole('button',{name:'Start Scout',exact:true}).click();
 if(starts[0]?.planHash!=='a'.repeat(64) || starts[0]?.geography!=='Vietnam')throw new Error('Profile submission lost plan approval or Vietnam scope.');
 await page.reload();await page.getByRole('button',{name:'Content fixture'}).click();
 await page.getByPlaceholder('Pickleball Vietnam',{exact:true}).fill('Running');
 await page.getByText('Budget cap $1.00',{exact:false}).waitFor();
 await page.getByRole('button',{name:'Start Scout',exact:true}).click();
 if(starts[1]?.searchMode!=='keyword' || starts[1]?.planHash!=='a'.repeat(64))throw new Error('Topic content submission lost its plan.');
 await page.reload();await page.getByRole('button',{name:'Results fixture'}).click();
 await page.getByRole('heading',{name:'Below Target (1)',exact:true}).waitFor();
 await page.getByRole('heading',{name:'Needs Verification (1)',exact:true}).waitFor();
 if(await page.getByText('No Results',{exact:true}).count())throw new Error('Reviewable evidence was labelled No Results.');
 await mkdir('artifacts/scout-search-v4',{recursive:true});await page.screenshot({path:'artifacts/scout-search-v4/results-ui.png',fullPage:true});
 if(errors.length)throw new Error(errors.join('\n'));console.log('Search forms, approved submissions and grouped results passed; zero live API/provider calls.');
} finally {if(browser)await browser.close();await rm(dir,{recursive:true,force:true});}
