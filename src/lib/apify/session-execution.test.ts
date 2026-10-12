import { boundedScoutStep } from './execution-budget';
import {beforeEach,describe,it,expect,vi} from 'vitest';
const state=vi.hoisted(()=>({tables:{} as Record<string,any[]>,collect:vi.fn(),scrape:vi.fn(),preview:vi.fn()}));
vi.mock('@/lib/supabase/admin',()=>({createAdminClient:()=>({from(table:string){let value:any;const filters:((row:any)=>boolean)[]=[];const result=()=>{const rows=(state.tables[table] || []).filter(r=>filters.every(f=>f(r)));if(value)rows.forEach(r=>Object.assign(r,value));return {data:structuredClone(rows),error:null};};const q:any={select:()=>q,order:()=>q,eq:(k:string,v:any)=>{filters.push(r=>r[k]===v);return q;},in:(k:string,v:any[])=>{filters.push(r=>v.includes(r[k]));return q;},or:()=>q,update:(v:any)=>{value=v;return q;},single:async()=>{const r=result();return {...r,data:r.data[0]};},maybeSingle:async()=>{const r=result();return {...r,data:r.data[0] || null};},then:(resolve:any)=>Promise.resolve(result()).then(resolve)};return q;}})}));
vi.mock('./providers',async()=>({...await vi.importActual<any>('./providers'),scrape:state.scrape}));
vi.mock('./scout',async()=>{const actual=await vi.importActual<any>('./scout');return {...actual,scoutSingleKolPosts:state.collect,previewDiscoveryCandidates:(...args:any[])=>state.preview.getMockImplementation()?state.preview(...args):actual.previewDiscoveryCandidates(...args)};});vi.mock('./tasks',()=>({}));vi.mock('@/lib/queue',()=>({QUEUE_NAMES:{socialScout:'social-scout'},enqueue:vi.fn()}));vi.mock('@/lib/auth/financial-sanitizer',()=>({getServerUserRole:vi.fn()}));
import {executeSession,resumeSession} from './sessions';
beforeEach(()=>{state.collect.mockReset();state.scrape.mockReset();state.preview.mockReset();state.tables={scout_sessions:[{id:'s',owner_id:'o',kind:'kol-posts',status:'pending',created_at:new Date().toISOString(),params:{kolId:'k',platform:['Instagram'],limit:5},warnings:['Waiting for the worker queue to recover.']}],profiles:[{id:'o',role:'editor'}],scout_provider_runs:[]};});
describe('session failure and recovery',()=>{
 it('reads legacy item warnings from stored evidence without restarting or mutating the preview',async()=>{
  const session=state.tables.scout_sessions[0];Object.assign(session,{kind:'preview',status:'complete',result:{success:true,candidates:[{candidateId:'c'}],warnings:['Provider item unavailable']}});
  state.tables.scout_provider_runs=[{session_id:'s',platform:'Instagram',raw_rows:[{username:'ym.badminton',error:'not_found'}]}];
  const before=structuredClone(session);const response=await resumeSession('s','o');const body=await response.json();
  expect(body.warnings[0]).toContain('@ym.badminton');expect(body.candidates).toEqual([{candidateId:'c'}]);expect(session).toEqual(before);expect(state.scrape).not.toHaveBeenCalled();
  await expect(resumeSession('s','other')).rejects.toMatchObject({code:'NOT_FOUND'});
 });

 it('executes a persisted multi-platform preview through per-platform adapters and reopens without another run',async()=>{
  Object.assign(state.tables.scout_sessions[0],{kind:'preview',params:{keyword:'running',platform:['Instagram','Facebook'],limit:1}});
  state.scrape.mockImplementation(async(_id,platform)=>platform==='Instagram'?[{username:'runner',fullName:'Running Coach',biography:'Running coach Vietnam',followersCount:100}]:[{url:'https://facebook.com/runningcoach',name:'Running Coach Vietnam',description:'Running coach Vietnam',followersCount:5000}]);
  expect(await executeSession('s')).toBe(false);
  const stored=state.tables.scout_sessions[0];expect(stored.status).toBe('complete');expect(stored.result.candidates.map((c:any)=>c.followers)).toEqual([5000,100]);
  expect(state.scrape.mock.calls.map(call=>call[1])).toEqual(['Instagram','Facebook']);
  const reopened=await resumeSession('s','o');expect(reopened.status).toBe(200);expect((await reopened.json()).criteria.platform).toEqual(['Instagram','Facebook']);
  expect(await executeSession('s')).toBe(false);expect(state.scrape).toHaveBeenCalledTimes(2);
 });
 it('persists all-failed outcomes as failed, retains typed errors and never re-executes them on reads',async()=>{
  state.collect.mockResolvedValue({success:false,error:'Scout budget exhausted.',code:'BUDGET_EXHAUSTED',httpStatus:409,counts:{failed:1,inserted:0},warnings:['Instagram: Scout budget exhausted.']});
  expect(await executeSession('s')).toBe(false);expect(state.tables.scout_sessions[0]).toMatchObject({status:'failed',warnings:['Instagram: Scout budget exhausted.'],result:{code:'BUDGET_EXHAUSTED'}});
  expect((await resumeSession('s','o')).status).toBe(409);expect(await executeSession('s')).toBe(false);expect(state.collect).toHaveBeenCalledTimes(1);
 });
 it('clears the queue recovery warning on success and keeps real zero results complete',async()=>{
  state.collect.mockResolvedValue({success:true,counts:{failed:0,inserted:0},posts:[],warnings:[]});await executeSession('s');expect(state.tables.scout_sessions[0]).toMatchObject({status:'complete',warnings:[]});expect((await resumeSession('s','o')).status).toBe(200);
 });
});

it('starts the processing deadline on first claim rather than when an old task was queued',async()=>{
 state.tables.scout_sessions[0].created_at='2026-01-01T00:00:00Z';
 state.collect.mockRejectedValue(Object.assign(new Error('still running'),{code:'PROVIDER_UNAVAILABLE'}));
 expect(await executeSession('s')).toBe(true);expect(state.tables.scout_sessions[0].status).toBe('running');expect(state.tables.scout_sessions[0].execution_started_at).toBeTruthy();
});
it('blocks the legacy consumer for workflow-owned sessions and honors revoked roles inside a step',async()=>{
 state.tables.scout_sessions[0].execution_engine='workflow';
 await expect(executeSession('s')).rejects.toMatchObject({code:'WORKFLOW_MANAGED'});
 state.tables.profiles[0].role='viewer';await boundedScoutStep(()=>executeSession('s'),'s');
 expect(state.tables.scout_sessions[0].result.code).toBe('FORBIDDEN');expect(state.collect).not.toHaveBeenCalled();
});

it('finalizes expired adaptive search from saved evidence instead of failing PENDING or starting new runs',async()=>{
 const {isStoredEvidence}=await import('./stored-evidence');
 Object.assign(state.tables.scout_sessions[0],{kind:'preview',execution_engine:'workflow',execution_started_at:new Date(Date.now()-16*60000).toISOString(),params:{keyword:'Pickleball',platform:['TikTok'],searchPlan:{maxSessionUsd:1}}});
 state.tables.scout_provider_runs=[{session_id:'s',state:'succeeded',platform:'TikTok',task:'profiles',normalized_rows:[{username:'coach'}],actual_usd:.05,reserved_usd:.25}];
 state.preview.mockImplementation(async()=>{expect(isStoredEvidence()).toBe(true);return {success:true,candidates:[{name:'Coach'}],groups:{qualified:[]},totalFound:1};});
 expect(await boundedScoutStep(()=>executeSession('s'),'s')).toBe(false);
 expect(state.tables.scout_sessions[0]).toMatchObject({status:'complete',progress:{stage:'complete'},result:{partial:true,stopReason:'time-limit',diagnostics:{stopReason:'time-limit'},candidates:[{name:'Coach'}]}});
 expect(state.tables.scout_sessions[0].result.warnings.join(' ')).toContain('time limit');expect(state.scrape).not.toHaveBeenCalled();
});
it('reports a typed time limit when expired adaptive search has no saved evidence',async()=>{
 Object.assign(state.tables.scout_sessions[0],{kind:'preview',execution_started_at:new Date(Date.now()-16*60000).toISOString(),params:{searchPlan:{maxSessionUsd:1}}});
 await executeSession('s');expect(state.tables.scout_sessions[0]).toMatchObject({status:'failed',progress:{stage:'failed'},result:{code:'SEARCH_TIME_LIMIT',httpStatus:408}});expect(state.preview).not.toHaveBeenCalled();expect(state.scrape).not.toHaveBeenCalled();
});
