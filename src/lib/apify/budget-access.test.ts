import {describe,it,expect,vi} from 'vitest';
const state=vi.hoisted(()=>({role:'viewer',db:vi.fn()}));
vi.mock('@/lib/auth/financial-sanitizer',()=>({getServerUserRole:async()=>({userId:'u',role:state.role})}));
vi.mock('@/lib/supabase/admin',()=>({createAdminClient:state.db}));
import {GET,PUT} from '@/app/api/sport-hub/scout/budget/route';
describe('budget administration permissions',()=>{for(const role of ['viewer','editor']){
 it(`${role} cannot read detailed billing`,async()=>{state.role=role;state.db.mockClear();expect((await GET()).status).toBe(403);expect(state.db).not.toHaveBeenCalled();});
 it(`${role} cannot change policy`,async()=>{state.role=role;state.db.mockClear();const response=await PUT({json:async()=>({sessionUsd:100,dailyUsd:1000,verificationUsd:100,enabled:true})} as any);expect(response.status).toBe(403);expect(state.db).not.toHaveBeenCalled();});
}});
