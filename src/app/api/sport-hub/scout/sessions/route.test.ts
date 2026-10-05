import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
const state=vi.hoisted(()=>({owner:'owner-a',role:'viewer',loggedIn:true,missingRuntime:false,queries:[] as any[],rows:[] as any[]}));
vi.mock('@/lib/apify/sessions',()=>({
  scoutReadAccess:async()=>{if(!state.loggedIn)throw {message:'Please log in',status:401};return state.owner;},
  scoutFailure:(e:any)=>Response.json({success:false,error:e.message},{status:e.status || (e.name==='ZodError'?400:500)}),
}));
vi.mock('@/lib/supabase/admin',()=>({createAdminClient:()=>({from(table:string){
  const entry={table,filters:[] as any[],columns:'',range:[0,0]};state.queries.push(entry);
  const q:any={ select:(cols:string)=>{entry.columns=cols;return q;},eq:(key:string,value:any)=>{entry.filters.push([key,value]);return q;},neq:()=>q,order:()=>q,in:()=>q,
    range:(a:number,b:number)=>{entry.range=[a,b];return q;},then:(resolve:any)=>{
      if(state.missingRuntime && entry.columns.includes('progress'))return resolve({error:{code:'42703'}});
      const rows=state.rows.filter(row=>entry.filters.every(([k,v])=>row[k]===v));return resolve({data:rows.slice(entry.range[0],entry.range[1]+1),count:rows.length,error:null});
    }};return q;
}})}));
import { GET } from './route';
beforeEach(()=>{state.loggedIn=true;state.missingRuntime=false;state.owner='owner-a';state.queries=[];state.rows=[
  {id:'a',owner_id:'owner-a',verification:false,kind:'preview',status:'complete',params:{keyword:'Running'},candidates:[{candidateId:'c',reviewState:'Matched'}]},
  {id:'b',owner_id:'owner-b',verification:false,kind:'preview',status:'complete',params:{keyword:'Private'}}
];});
describe('owned Scout history',()=>{
 it('lets an authenticated viewer read only their own sessions',async()=>{
  const response=await GET(new NextRequest('http://localhost/api/sport-hub/scout/sessions'));const data=await response.json();
  expect(data.sessions.map((s:any)=>s.id)).toEqual(['a']);expect(data.sessions[0].reviewState).toBe('needs-review');expect(state.queries[0].filters).toContainEqual(['owner_id','owner-a']);
 });
 it('supports status and bounded pagination',async()=>{
  state.rows.push({...state.rows[0],id:'c',status:'running'});const r=await GET(new NextRequest('http://localhost/api/sport-hub/scout/sessions?status=complete&pageSize=1'));
  expect((await r.json()).sessions).toHaveLength(1);expect(state.queries[0].filters).toContainEqual(['status','complete']);
 });
 it('rejects unauthenticated reads and invalid pagination',async()=>{
  state.loggedIn=false;expect((await GET(new NextRequest('http://localhost/api/sport-hub/scout/sessions'))).status).toBe(401);expect(state.queries).toHaveLength(0);
  state.loggedIn=true;expect((await GET(new NextRequest('http://localhost/api/sport-hub/scout/sessions?page=0'))).status).toBe(400);
 });
 it('reads legacy sessions when only runtime columns are missing, retaining owner filters',async()=>{
  state.missingRuntime=true;const data=await (await GET(new NextRequest('http://localhost/api/sport-hub/scout/sessions'))).json();
  expect(data.runtimeReady).toBe(false);expect(data.sessions.map((s:any)=>s.id)).toEqual(['a']);expect(state.queries.every(q=>q.filters.some(([k,v]:any)=>k==='owner_id'&&v==='owner-a'))).toBe(true);
 });
});
