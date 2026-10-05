import {beforeEach,describe,it,expect,vi} from 'vitest';
const state=vi.hoisted(()=>({tables:{} as Record<string,any[]>,collect:vi.fn()}));
vi.mock('@/lib/supabase/admin',()=>({createAdminClient:()=>({from(table:string){let value:any;const filters:((row:any)=>boolean)[]=[];const result=()=>{const rows=(state.tables[table] || []).filter(r=>filters.every(f=>f(r)));if(value)rows.forEach(r=>Object.assign(r,value));return {data:structuredClone(rows),error:null};};const q:any={select:()=>q,eq:(k:string,v:any)=>{filters.push(r=>r[k]===v);return q;},in:(k:string,v:any[])=>{filters.push(r=>v.includes(r[k]));return q;},or:()=>q,update:(v:any)=>{value=v;return q;},single:async()=>{const r=result();return {...r,data:r.data[0]};},maybeSingle:async()=>{const r=result();return {...r,data:r.data[0] || null};},then:(resolve:any)=>Promise.resolve(result()).then(resolve)};return q;}})}));
vi.mock('./scout',()=>({scoutSingleKolPosts:state.collect}));vi.mock('./tasks',()=>({}));vi.mock('@/lib/queue',()=>({QUEUE_NAMES:{socialScout:'social-scout'},enqueue:vi.fn()}));vi.mock('@/lib/auth/financial-sanitizer',()=>({getServerUserRole:vi.fn()}));
import {executeSession,resumeSession} from './sessions';
beforeEach(()=>{state.collect.mockReset();state.tables={scout_sessions:[{id:'s',owner_id:'o',kind:'kol-posts',status:'pending',created_at:new Date().toISOString(),params:{kolId:'k',platform:['Instagram'],limit:5},warnings:['Waiting for the worker queue to recover.']}],profiles:[{id:'o',role:'editor'}],scout_provider_runs:[]};});
describe('session failure and recovery',()=>{
 it('persists all-failed outcomes as failed, retains typed errors and never re-executes them on reads',async()=>{
  state.collect.mockResolvedValue({success:false,error:'Scout budget exhausted.',code:'BUDGET_EXHAUSTED',httpStatus:409,counts:{failed:1,inserted:0},warnings:['Instagram: Scout budget exhausted.']});
  expect(await executeSession('s')).toBe(false);expect(state.tables.scout_sessions[0]).toMatchObject({status:'failed',warnings:['Instagram: Scout budget exhausted.'],result:{code:'BUDGET_EXHAUSTED'}});
  expect((await resumeSession('s','o')).status).toBe(409);expect(await executeSession('s')).toBe(false);expect(state.collect).toHaveBeenCalledTimes(1);
 });
 it('clears the queue recovery warning on success and keeps real zero results complete',async()=>{
  state.collect.mockResolvedValue({success:true,counts:{failed:0,inserted:0},posts:[],warnings:[]});await executeSession('s');expect(state.tables.scout_sessions[0]).toMatchObject({status:'complete',warnings:[]});expect((await resumeSession('s','o')).status).toBe(200);
 });
});
