/** Real mounted UI, fully mocked HTTP. No provider work or application DB mutation. */
import { createRequire } from 'node:module';
import { mkdir, writeFile, rm, readFile } from 'node:fs/promises';
import assert from 'node:assert/strict';
const require = createRequire(import.meta.url);
const { chromium } = require(process.env.SCOUT_PLAYWRIGHT_MODULE || '/Users/Apple/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const name = `scout-workspace-qa-posts-${process.pid}`, directory = `src/app/templates/${name}`;
const base = `http://localhost:${process.env.SCOUT_QA_PORT || 3049}/templates/${name}`;
const fixture = JSON.parse(await readFile('docs/scout-post-workspaces-fixture.json', 'utf8'));
const accounts = Array.from({ length: 21 }, (_, i) => ({ ...fixture.accountsResponse.accounts[0], id: `00000000-0000-4000-8000-${String(i + 1).padStart(12, '0')}`, name: `Runner ${i + 1}`, channels: [{ url: `https://tiktok.com/@example${i + 1}`, platform: 'TikTok', available: true }], urls: [`https://tiktok.com/@example${i + 1}`] }));
const sid = '00000000-0000-4000-8000-000000000999';
let browser, debugPage;
try {
  await mkdir(directory, { recursive: true });
  await writeFile(`${directory}/page.tsx`, `'use client';
import {useState} from 'react';
import {useSearchParams} from 'next/navigation';
import {AuthContext} from '@/lib/auth/auth-context';
import {AccountPostScoutModal} from '@/components/sport-hub/account-post-scout-modal';
import {SuggestedAccountReviewModal} from '@/components/sport-hub/suggested-account-review-modal';
import {TrendingPageView} from '@/components/sport-hub/pages/trending-page-view';
import {ScoutWorkspace} from '@/components/sport-hub/scout-workspace';
export default function Page(){const q=useSearchParams();const [open,setOpen]=useState(false);const [review,setReview]=useState(false);const role=q.get('role')==='viewer'?'viewer':'editor';return <AuthContext.Provider value={{user:{id:'qa'} as any,profile:null,role,isAdmin:false,isEditor:role==='editor',isViewer:role==='viewer',loading:false,refreshUser:async()=>{},signOut:async()=>{}}}><button onClick={()=>setOpen(true)}>QA Open Account Scout</button><button onClick={()=>setReview(true)}>QA Open Review</button>{q.get('view')==='workspace'?<ScoutWorkspace/>:<TrendingPageView initialData={{posts:[],kols:[],communities:[],projects:[],reports:[],kpis:{}} as any}/>} {open&&<AccountPostScoutModal isOpen onClose={()=>setOpen(false)} resumeSessionId={q.get('sessionId')||undefined}/>} {review&&<SuggestedAccountReviewModal isOpen suggestion={${JSON.stringify(fixture.postsResponse.suggestedAccounts[0])}} onClose={()=>setReview(false)} onSuccess={()=>{}}/>}</AuthContext.Provider>}`);
  let ready=false;
  for(let i=0;i<40;i++){const response=await fetch(base);const html=await response.text();if(response.ok&&html.includes('QA Open Account Scout')){ready=true;break;}await new Promise(resolve=>setTimeout(resolve,500));}
  assert(ready,'Temporary UI route did not become ready');
  browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, timezoneId: 'Asia/Ho_Chi_Minh' });
  const page = await context.newPage(), errors = [], posts = []; debugPage=page;
  let plans = [], fail = false, complete = false, previews = 0, imports = 0, patches = 0, retries = 0, empty = false;
  page.on('pageerror', error => errors.push(error.message));
  await context.route('**/api/**', async route => {
    const req = route.request(), url = new URL(req.url()), path = url.pathname, method = req.method(), body = req.postDataJSON();
    const json = (value, status = 200) => route.fulfill({ status, json: value });
    if (path.endsWith('/accounts')) return json({ success: true, accounts });
    if (path.endsWith('/plan')) { plans.push(body); const selected = accounts.filter(a => body.accounts.some(b => b.id === a.id)); return json({ success: true, plan: { hash: 'a'.repeat(64), criteria: body, accounts: selected.map(a => ({ ...a, channelUrls: a.urls })), skipped: [], accountCount: selected.length, channelCount: selected.length, maxSessionUsd: 1, allowedMaxSessionUsd: 1 } }); }
    if (path.endsWith('/account-posts')) { posts.push(body); return json({ success: true, pending: true, status: 'pending', sessionId: sid, progress: { totalAccounts: body.accounts.length, completedAccounts: 0 } }, 202); }
    if (path.endsWith('/scout') && method === 'GET') {
      if (fail) return json({ success: false, status: 'failed', error: 'QA budget exhausted', code: 'BUDGET_EXHAUSTED', posts: [], counts: { saved: 0, failedAccounts: 1 }, accountResults: [] }, 409);
      return json(complete ? { ...fixture.partialBatchResponse, status: 'complete', sessionId: sid } : { ...fixture.pendingBatchResponse, sessionId: sid });
    }
    if (path.endsWith('/suggested-accounts') && method === 'POST') { previews++; return json({ success: true, sessionId: sid, candidates: [{ candidateId: sid, name: body.name, bio: '', verifiedGeography: 'Unknown', url: body.identity.split(':https')[0], followers: null }] }); }
    if (path.endsWith('/suggested-accounts') && method === 'PATCH') { patches++; return json({ success: true, candidate: { candidateId: sid, name: body.name, bio: body.bio, verifiedGeography: body.geography, followers: null } }); }
    if (path.endsWith('/review')) return json({ success: true });
    if (path.endsWith('/scout') && method === 'POST') { imports++; return json({ success: true, partial: true, importedAccounts: [{ entityType: 'kol', id: sid }], importedIds: [sid], postLinkResults: [{ success: false, entityType: 'kol', id: sid, retryable: true, error: 'QA link retry needed' }] }); }
    if (path.endsWith('/post-links')) { retries++; return json({ success: true, linked: 2, conflicts: [] }); }
    if (path.endsWith('/posts')) return json(empty ? { success: true, posts: [], suggestedAccounts: [] } : fixture.postsResponse);
    if (path.endsWith('/data')) return json({ success: true, posts: [], kols: [], communities: [], projects: [], reports: [], kpis: {} });
    if (path.endsWith('/sessions')) return json({ success: true, sessions: url.searchParams.has('sessionId') ? [{ id: sid, kind: 'account-posts', status: 'running', params: {}, progress: {}, counts: {}, warnings: [] }] : [], total: 0 });
    if (path.endsWith('/tracked-accounts')) return json({ accounts: [] });
    return json({ success: true });
  });
  await page.goto(base); await page.getByRole('button', { name: 'QA Open Account Scout' }).click();
  await page.getByText('Runner 1', { exact: true }).waitFor();
  await page.getByRole('button', { name: /Select All .*Matching/ }).click();
  await page.getByRole('button', { name: /Review Batch Plan/ }).click();
  await page.getByRole('button', { name: /Start Scout/ }).waitFor();
  assert.equal(plans.at(-1).accounts.length, 21, 'selection must include pages 1 and 2');
  assert.equal(plans.at(-1).qualityFilter.metricRule, 'views-first');
  await page.getByRole('button', { name: /Start Scout/ }).click();
  await page.getByText('Durable Session', { exact: true }).waitFor();
  assert.equal(posts.length, 1);
  await page.getByRole('button', { name: 'Close & Run in Background' }).click();
  await page.goto(`${base}?view=workspace&sessionId=${sid}`);
  await page.getByText('Durable Session', { exact: true }).waitFor();
  assert.equal(posts.length, 1, 'reload must not POST another batch');
  fail = true;
  await page.getByRole('alert').filter({ hasText: 'QA budget exhausted' }).waitFor();
  await mkdir('artifacts/scout-post-workspaces', { recursive: true });
  await page.screenshot({ path: 'artifacts/scout-post-workspaces/batch-failed-desktop.png', fullPage: true });
  fail = false; await page.goto(base); await page.getByRole('button', { name: 'QA Open Account Scout' }).click();
  await page.getByText('Runner 1', { exact: true }).waitFor();
  await page.getByText('Custom Dates', { exact: true }).click();
  await page.getByTitle('Published From (Local time)').fill('2026-10-11T09:00');
  await page.getByTitle('Published To (Local time)').fill('2026-10-12T09:00');
  await page.getByRole('button', { name: /Select All .*Matching/ }).click();
  await page.getByRole('button', { name: /Review Batch Plan/ }).click();
  await page.getByRole('button', { name: /Start Scout/ }).waitFor();
  assert.equal(plans.at(-1).publishedFrom, '2026-10-11T02:00:00.000Z');
  assert.equal(plans.at(-1).publishedTo, '2026-10-12T02:00:00.000Z');
  await page.goto(base); await page.getByRole('button', { name: 'QA Open Review' }).click();
  await page.getByRole('button', { name: 'Review Candidate Details', exact: true }).last().click();
  await page.getByRole('button', { name: 'Approve Account', exact: true }).waitFor();
  const inputs = page.getByRole('dialog').locator('input[type="text"]');
  await inputs.first().fill('Tên đã sửa');
  for (const checkbox of await page.locator('input[type="checkbox"]').all()) await checkbox.check();
  assert(await page.getByRole('button', { name: 'Approve Account', exact: true }).isDisabled(), 'unsaved edits must block approval');
  await page.getByRole('button', { name: 'Save Edits', exact: true }).click();
  await page.getByRole('button', { name: 'Approve Account', exact: true }).click();
  await page.getByRole('button', { name: /Import to CRM as New Scout/ }).click();
  await page.getByText('QA link retry needed', { exact: true }).waitFor();
  await page.getByRole('button', { name: /Retry Linking/ }).click();
  await page.getByText('2 posts linked', { exact: true }).waitFor();
  assert.equal(imports, 1); assert.equal(patches, 1); assert.equal(retries, 1); assert.equal(previews, 1);
  await page.goto(base); await page.getByText('Chạy bộ mỗi ngày', { exact: false }).first().waitFor();
  await page.getByRole('button', { name: /Trending Posts/ }).first().click();
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({ path: 'artifacts/scout-post-workspaces/posts-mobile.png', fullPage: true });
  empty = true; await page.reload();
  assert.equal(await page.getByText('Chạy bộ mỗi ngày', { exact: false }).count(), 0, 'successful empty response clears stale posts');
  await page.goto(`${base}?role=viewer`);
  assert(await page.getByRole('button', { name: 'Scout Account Posts', exact: true }).isDisabled());
  assert.deepEqual(errors, []);
  const receipt = { fixtureOnly: true, providerStarts: 0, realDatabaseWrites: 0, checks: ['select all across pages', '202 progress immediately', 'reload one POST', 'failed session stops polling', 'Vietnam local dates', 'unsaved review edits', 'partial import and link retry', 'empty response clears rows', 'mobile render', 'viewer controls'], batchPosts: posts.length, pageErrors: errors };
  await writeFile('artifacts/scout-post-workspaces/ui-receipt.json', JSON.stringify(receipt, null, 2));
  console.log(JSON.stringify(receipt));
} catch(error) { if(debugPage){console.error((await debugPage.locator('body').innerText()).slice(-7000));await debugPage.screenshot({path:'artifacts/scout-post-workspaces/ui-error.png',fullPage:true});}throw error; } finally { await browser?.close(); await rm(directory, { recursive: true, force: true }); }
