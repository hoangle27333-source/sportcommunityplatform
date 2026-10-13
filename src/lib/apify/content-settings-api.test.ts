import { beforeEach,describe,it,expect,vi } from 'vitest';
import { NextRequest } from 'next/server';
const state=vi.hoisted(()=>({role:'admin',userId:'admin-id',policy:{enabled:true,minViews:1000,minInteractions:50,metricRule:'views-first',policyVersion:1},writes:0}));
vi.mock('@/lib/auth/financial-sanitizer',()=>({getServerUserRole:async()=>({userId:state.userId,role:state.role})}));
vi.mock('@/lib/apify/sessions',()=>({scoutFailure:(e:any)=>Response.json({success:false,error:e.message},{status:e.status || 400})}));
vi.mock('@/lib/supabase/admin',()=>({createAdminClient:()=>({from:()=>({select:()=>({eq:()=>({single:async()=>({data:{settings:state.policy},error:null})})}),update:(value:any)=>({eq:async()=>{state.writes++;state.policy=value.settings;return {error:null};}})})})}));
import {GET,PUT} from '@/app/api/sport-hub/scout/content-settings/route';
const req=(policy:any)=>new NextRequest('http://localhost/api/sport-hub/scout/content-settings',{method:'PUT',body:JSON.stringify(policy)});
beforeEach(()=>{state.role='admin';state.userId='admin-id';state.writes=0;});
describe('content settings authorization',()=>{
 it('allows authenticated reads but rejects editor writes',async()=>{state.role='editor';expect((await GET()).status).toBe(200);expect((await PUT(req(state.policy))).status).toBe(403);expect(state.writes).toBe(0);});
 it('rejects anonymous reads',async()=>{state.userId='';expect((await GET()).status).toBe(401);});
 it('persists validated admin defaults and reads them back',async()=>{const policy={...state.policy,enabled:false,minViews:2000};expect((await PUT(req(policy))).status).toBe(200);expect((await (await GET()).json()).settings).toEqual(policy);expect(state.writes).toBe(1);});
 it('rejects invalid thresholds before writing',async()=>{expect((await PUT(req({...state.policy,minInteractions:0}))).status).toBe(400);expect(state.writes).toBe(0);});
});
