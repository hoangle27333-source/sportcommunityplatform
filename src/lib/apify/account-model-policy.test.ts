import {afterEach,expect,it} from 'vitest';
import {currentAccountModelPolicy,plannedAccountModelPolicy,assertAccountModelPolicy,accountModelPolicyKey} from './account-model-policy';
afterEach(()=>{delete process.env.SCOUT_ACCOUNT_MODEL_MODE;delete process.env.SCOUT_ACCOUNT_MODEL_REVISION;});
it('defaults old plans to rule-only and rejects mode/revision drift',()=>{
 const old=plannedAccountModelPolicy({modelRevision:'rules-5'});expect(old.mode).toBe('off');expect(()=>assertAccountModelPolicy(old)).not.toThrow();
 process.env.SCOUT_ACCOUNT_MODEL_MODE='shadow';expect(()=>assertAccountModelPolicy(old)).toThrow();expect(accountModelPolicyKey(currentAccountModelPolicy())).toBe('5:shadow:rules-5');
});
it('rejects invalid mode configuration instead of silently activating a model',()=>{
 process.env.SCOUT_ACCOUNT_MODEL_MODE='enabled';expect(()=>currentAccountModelPolicy()).toThrow();
});
