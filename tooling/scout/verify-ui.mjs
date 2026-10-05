import { chromium } from 'playwright';
import { mkdir, readFile, writeFile, rm, rmdir } from 'node:fs/promises';
const fixtureDir='src/app/templates/scout-qa';
await mkdir(fixtureDir,{recursive:true});
await writeFile(`${fixtureDir}/page.tsx`,await readFile('tooling/scout/fixture-page.tsx'));
try {
const browser=await chromium.launch({headless:true});
const context=await browser.newContext({viewport:{width:1440,height:1000}});
const url=new URL(process.env.NEXT_PUBLIC_SUPABASE_URL); const ref=url.hostname.split('.')[0];
const user={id:'00000000-0000-0000-0000-000000000001',email:'qa@example.com',app_metadata:{provider:'email'},user_metadata:{name:'QA Admin'}};
const jwt=`${Buffer.from(JSON.stringify({alg:'HS256',typ:'JWT'})).toString('base64url')}.${Buffer.from(JSON.stringify({sub:user.id,exp:Math.floor(Date.now()/1000)+3600,role:'authenticated'})).toString('base64url')}.test`;
await context.addCookies([{name:`sb-${ref}-auth-token`,value:'base64-'+Buffer.from(JSON.stringify({access_token:jwt,refresh_token:'qa-refresh',expires_at:Math.floor(Date.now()/1000)+3600,expires_in:3600,token_type:'bearer',user})).toString('base64url'),domain:'localhost',path:'/'}]);
await context.route('**/auth/v1/**',r=>r.fulfill({json:{user,...user}}));
await context.route('**/rest/v1/profiles*',r=>r.fulfill({json:{id:user.id,name:'QA Admin',email:user.email,role:'admin'}}));
const candidate={candidateId:'00000000-0000-0000-0000-000000000005',username:'qa_runner',name:'QA Runner',bio:'Running coach Vietnam',platform:'Instagram',url:'https://instagram.com/qa_runner',followers:null,avgViews:null,er:null,classification:'Individual',reviewState:'Needs Review',locationMatch:false,reasons:['Location is unverified'],evidence:['Running coach Vietnam'],isExisting:false,posts:[]};
let confirmed=false;let gmv={amount:0,month:'2026-10',source:'QA Report',notes:'',id:'gmv'};
await context.route('**/api/sport-hub/scout',async route=>{const body=route.request().postDataJSON(); if(body.action==='confirm'){confirmed=true; if(body.candidates) throw new Error('Browser must send candidate IDs only'); if(!body.selected?.[0]?.locationConfirmed)throw new Error('Needs Review missing explicit confirmation'); await route.fulfill({json:{success:true,summary:'QA import completed'}}); }else await route.fulfill({json:{success:true,sessionId:'00000000-0000-0000-0000-000000000006',candidates:[candidate],newCount:1}});});
await context.route('**/api/sport-hub/kol/*/gmv',async r=>{if(r.request().method()==='PUT')gmv={...gmv,...r.request().postDataJSON()};await r.fulfill({json:{success:true,record:gmv,records:[gmv]}});});
const page=await context.newPage(); const errors=[];page.on('pageerror',e=>errors.push(e.message));
await mkdir('artifacts/scout-verification',{recursive:true});
await page.goto('http://localhost:3017/templates/scout-qa');await page.getByText('GMV (VND)',{exact:false}).first().waitFor();
await page.screenshot({path:'artifacts/scout-verification/desktop-gmv.png',fullPage:true});

await page.getByRole('button',{name:/Discover|Scout New|Find New/}).first().click();
await page.getByPlaceholder(/Pickleball Vietnam/).fill('run');await page.getByRole('button',{name:/Find Candidate/}).click();
await page.getByText('Needs Review (1)',{exact:true}).waitFor();await page.screenshot({path:'artifacts/scout-verification/desktop-review.png',fullPage:true});
await page.getByLabel(/I verified this individual/).check();
await page.getByRole('button',{name:/Select All/}).click();await page.getByRole('button',{name:/Confirm.*Import/}).click();
if(!confirmed)throw new Error('Import did not reach confirmation');
await page.setViewportSize({width:390,height:844});await page.getByRole('button',{name:'Cards',exact:true}).click();await page.screenshot({path:'artifacts/scout-verification/mobile-gmv.png',fullPage:true});
await page.getByRole('button',{name:/View 360° Dossier/}).click();
await page.getByLabel('GMV Month',{exact:true}).fill('2026-11');await page.getByLabel('GMV (VND)',{exact:true}).fill('1234567');await page.getByLabel('GMV Source',{exact:true}).fill('QA commerce report');await page.getByRole('button',{name:'Save Monthly GMV'}).click();await page.getByText('2026-11 · 1,234,567 VND · QA commerce report',{exact:true}).waitFor();
await page.screenshot({path:'artifacts/scout-verification/mobile-dossier-gmv.png',fullPage:true});
console.log(JSON.stringify({confirmed,gmvSaved:gmv.amount===1234567,errors}));await browser.close();

} finally { await rm(`${fixtureDir}/page.tsx`,{force:true}); await rmdir(fixtureDir); await rmdir('src/app/templates').catch(()=>{}); }
