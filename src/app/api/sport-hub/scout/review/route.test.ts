import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
const state = vi.hoisted(() => ({ actor: 'owner', forbidden: false, session: null as any, conflict: false, writeFailure: false }));
vi.mock('@/lib/apify/sessions', () => ({
  scoutAccess: async () => { if (state.forbidden) throw {message:'Editor access required',status:403}; return state.actor; },
  scoutFailure: (e: any) => Response.json({success:false,error:e.message,code:e.code},{status:e.status || (e.name === 'ZodError' ? 400 : 500)}),
}));
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: () => ({ from: () => {
  const filters: [string, any][] = []; let payload: any;
  const query: any = { select: () => query, eq: (key: string, value: any) => {filters.push([key,value]); return query;}, or: () => query, update: (value: any) => {payload=value;return query;},
    single: async () => ({data: state.session?.owner_id === state.actor ? structuredClone(state.session) : null,error:null}),
    maybeSingle: async () => {
      if (state.writeFailure) return {data:null,error:new Error('Write failed')};
      if (state.conflict || Date.parse(state.session.import_lease_until || '') > Date.now() || !filters.some(([k,v]) => k==='review_decisions' && v===JSON.stringify(state.session.review_decisions))) return {data:null,error:null};
      Object.assign(state.session,payload); return {data:{id:state.session.id},error:null};
    },
  }; return query;
} }) }));
import { POST } from './route';
const sessionId = '00000000-0000-0000-0000-000000000010';
const candidateId = '00000000-0000-0000-0000-000000000011';
function request(body: any) { return POST(new NextRequest('http://localhost/api/sport-hub/scout/review',{method:'POST',body:JSON.stringify({sessionId,candidateId,...body})})); }
beforeEach(() => {
  state.actor='owner';state.forbidden=false;state.conflict=false;state.writeFailure=false;
  state.session={id:sessionId,owner_id:'owner',kind:'preview',status:'complete',params:{targetType:'Individual KOLs'},candidates:[{candidateId,reviewState:'Needs Review',classification:'Unknown'}],review_decisions:{other:{decision:'rejected'}},progress:{}};
});
describe('persisted profile review', () => {
  it('requires all three verification checks before approval', async () => {
    for (const missing of ['typeConfirmed','relevant','locationConfirmed']) {
      const checks:any={typeConfirmed:true,relevant:true,locationConfirmed:true};delete checks[missing];
      expect((await request({decision:'approved',...checks})).status).toBe(400);
    }
    expect(state.session.review_decisions[candidateId]).toBeUndefined();
  });
  it('persists approval with actor and evidence confirmation without overwriting other decisions', async () => {
    expect((await request({decision:'approved',typeConfirmed:true,relevant:true,locationConfirmed:true})).status).toBe(200);
    expect(state.session.review_decisions[candidateId]).toMatchObject({decision:'approved',classification:'Individual',relevant:true,locationConfirmed:true,actorId:'owner'});
    expect(state.session.review_decisions.other).toEqual({decision:'rejected'});
  });
  it('persists rejection and permits an explicit return to pending', async () => {
    expect((await request({decision:'rejected'})).status).toBe(200);
    expect(state.session.review_decisions[candidateId].decision).toBe('rejected');
    expect((await request({decision:'pending'})).status).toBe(200);
    expect(state.session.review_decisions[candidateId]).not.toHaveProperty('locationConfirmed');
  });
  it('blocks viewers, other owners, imported profiles and incomplete previews', async () => {
    state.forbidden=true;expect((await request({decision:'rejected'})).status).toBe(403);
    state.forbidden=false;state.actor='another';expect((await request({decision:'rejected'})).status).toBe(404);
    state.actor='owner';state.session.progress.importedCandidateIds=[candidateId];expect((await request({decision:'rejected'})).status).toBe(409);
    state.session.progress={};state.session.status='running';expect((await request({decision:'rejected'})).status).toBe(400);
  });
  it('rejects concurrent changes and failed writes without reporting success', async () => {
    state.conflict=true;expect((await request({decision:'rejected'})).status).toBe(409);
    state.conflict=false;state.session.import_lease_until=new Date(Date.now()+60000).toISOString();expect((await request({decision:'rejected'})).status).toBe(409);
    state.session.import_lease_until=null;state.writeFailure=true;expect((await request({decision:'rejected'})).status).toBe(500);
    expect(state.session.review_decisions[candidateId]).toBeUndefined();
  });
  it('supports batch approval for multiple candidate reviews at once', async () => {
    const candidate2 = '00000000-0000-0000-0000-000000000022';
    state.session.candidates.push({ candidateId: candidate2, reviewState: 'Needs Review', classification: 'Unknown' });
    const res = await POST(new NextRequest('http://localhost/api/sport-hub/scout/review', {
      method: 'POST',
      body: JSON.stringify({
        sessionId,
        reviews: [
          { candidateId, decision: 'approved', typeConfirmed: true, relevant: true, locationConfirmed: true },
          { candidateId: candidate2, decision: 'approved', typeConfirmed: true, relevant: true, locationConfirmed: true },
        ],
      }),
    }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.count).toBe(2);
    expect(state.session.review_decisions[candidateId].decision).toBe('approved');
    expect(state.session.review_decisions[candidate2].decision).toBe('approved');
  });
});
