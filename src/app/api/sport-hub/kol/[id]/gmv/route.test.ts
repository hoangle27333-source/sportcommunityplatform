import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
const state = vi.hoisted(() => ({ user: { userId: null as string | null, isAdmin: false }, save: vi.fn(), db: vi.fn() }));
vi.mock('@/lib/auth/financial-sanitizer', () => ({ getServerUserRole: async () => state.user }));
vi.mock('@/lib/sport-hub/gmv', () => ({ saveGMV: state.save }));
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: state.db }));
import { GET, PUT } from './route';
const params = { params: Promise.resolve({ id: 'kol' }) };
beforeEach(() => { state.user = { userId:null,isAdmin:false }; state.save.mockReset(); state.db.mockReset(); });
describe('GMV API authorization', () => {
  it('denies anonymous reads before querying the database', async () => { const res=await GET(new NextRequest('http://local/gmv'),params); expect(res.status).toBe(401); expect(state.db).not.toHaveBeenCalled(); });
  it('denies viewer/editor writes before reading the payload', async () => { state.user.userId='viewer'; const res=await PUT(new NextRequest('http://local/gmv',{method:'PUT',body:JSON.stringify({amount:123})}),params); expect(res.status).toBe(403); expect(state.save).not.toHaveBeenCalled(); });
  it('persists admin submissions with the authenticated actor', async () => { state.user={userId:'admin',isAdmin:true}; state.save.mockResolvedValue({ amount:0 }); const value={amount:0,month:'2026-10',source:'Report'}; const res=await PUT(new NextRequest('http://local/gmv',{method:'PUT',body:JSON.stringify(value)}),params); expect(res.status).toBe(200); expect(state.save).toHaveBeenCalledWith('kol',value,'admin'); });
  it('reports failed DB writes rather than success', async () => { state.user={userId:'admin',isAdmin:true}; state.save.mockRejectedValue(new Error('Database unavailable')); const res=await PUT(new NextRequest('http://local/gmv',{method:'PUT',body:'{}'}),params); expect(res.status).toBe(500); expect((await res.json()).success).toBe(false); });
});
