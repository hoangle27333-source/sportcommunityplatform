import {describe,it,expect} from 'vitest';
import {roleAccess} from './role-policy';
describe('UI access from persisted role',()=>{
 it.each([null,undefined,'unknown','admin@example.com',{role:'admin'}])('does not grant access from missing or invalid role %j',role=>{expect(roleAccess(role)).toEqual({isAdmin:false,isEditor:false,isViewer:false});});
 it('keeps a revoked admin at viewer privileges',()=>{expect(roleAccess('viewer')).toEqual({isAdmin:false,isEditor:false,isViewer:true});});
 it('allows editor tasks without admin billing',()=>{expect(roleAccess('editor')).toEqual({isAdmin:false,isEditor:true,isViewer:false});});
 it('allows a persisted admin',()=>{expect(roleAccess('admin')).toEqual({isAdmin:true,isEditor:true,isViewer:false});});
});
