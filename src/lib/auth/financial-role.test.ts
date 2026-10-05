import {describe,it,expect,vi} from 'vitest';
const state=vi.hoisted(()=>({role:'viewer' as string|null,email:'hoangle27333@gmail.com'}));
vi.mock('@/lib/supabase/server',()=>({
 createClient:async()=>({
  auth:{getUser:async()=>({data:{user:{id:'u',email:state.email,user_metadata:{role:'admin'}}}})},
  from:()=>({select:()=>({eq:()=>({single:async()=>({data:state.role ? {role:state.role}:null})})})})
 })
}));
import {getServerUserRole} from './financial-sanitizer';
import {requireAdmin,requireEditor} from './require-user';
describe('persisted financial/scout roles',()=>{
 it('does not override a revoked admin role using a known email',async()=>{state.role='viewer';expect(await getServerUserRole()).toMatchObject({role:'viewer',isAdmin:false});});
 it('fails closed when the profile role is unavailable',async()=>{state.role=null;expect(await getServerUserRole()).toMatchObject({role:'viewer',isAdmin:false});});
 it('honors a persisted admin independent of email',async()=>{state.role='admin';state.email='admin@example.invalid';expect(await getServerUserRole()).toMatchObject({role:'admin',isAdmin:true});});
 it('denies admin and editor access when profile lookup fails, even with claimed admin metadata',async()=>{state.role=null;await expect(requireAdmin()).rejects.toMatchObject({status:403});await expect(requireEditor()).rejects.toMatchObject({status:403});});
 it('allows persisted editors to work but denies admin access',async()=>{state.role='editor';expect(await requireEditor()).toMatchObject({role:'editor'});await expect(requireAdmin()).rejects.toMatchObject({status:403});});
});
