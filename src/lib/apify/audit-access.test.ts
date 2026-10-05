import {beforeEach,describe,it,expect,vi} from 'vitest';
const state=vi.hoisted(()=>({access:vi.fn(),read:vi.fn(),audit:vi.fn()}));
vi.mock('./sessions',()=>({scoutAccess:state.access,scoutReadAccess:state.read}));
vi.mock('@/lib/sport-hub/audience-audit',()=>({runKolAudienceAudit:state.audit,runCommunityAudienceAudit:state.audit,runPostAudienceAudit:state.audit,getLatestAudienceAudit:state.audit,getLatestCommunityAudienceAudit:state.audit,getLatestPostAudienceAudit:state.audit}));
import * as kol from '@/app/api/sport-hub/kol/[id]/audience-audit/route';
import * as community from '@/app/api/sport-hub/community/[id]/audience-audit/route';
import * as post from '@/app/api/sport-hub/post/[id]/audience-audit/route';
beforeEach(()=>{state.access.mockReset();state.read.mockReset();state.audit.mockReset();});
describe('audit endpoint write permissions',()=>{for(const [name,route] of Object.entries({kol,community,post})) {
 it(`${name}: viewer cannot mutate audit history`,async()=>{state.access.mockRejectedValue(Object.assign(new Error('Editor access required'),{status:403}));const response=await route.POST({json:async()=>({})} as any,{params:Promise.resolve({id:'k'})});expect(response.status).toBe(403);expect(state.audit).not.toHaveBeenCalled();});
 it(`${name}: anonymous cannot read stored audits`,async()=>{state.read.mockRejectedValue(Object.assign(new Error('Please log in'),{status:401}));expect((await route.GET({} as any,{params:Promise.resolve({id:'k'})})).status).toBe(401);expect(state.audit).not.toHaveBeenCalled();});
}});
