import { ScoutError } from './errors';
export type AccountModelPolicy={version:5;revision:string;mode:'off'|'shadow'|'active'};
export function currentAccountModelPolicy():AccountModelPolicy {
 const mode=process.env.SCOUT_ACCOUNT_MODEL_MODE || 'off';
 if(!['off','shadow','active'].includes(mode))throw new ScoutError('Account model mode is invalid.','MODEL_POLICY_UNAVAILABLE',503);
 return {version:5,revision:process.env.SCOUT_ACCOUNT_MODEL_REVISION || 'rules-5',mode:mode as AccountModelPolicy['mode']};
}
export function accountModelPolicyKey(policy:AccountModelPolicy){return `${policy.version}:${policy.mode}:${policy.revision}`;}
/** Old v5 plans were rule-only. Never reinterpret them as approval for active inference. */
export function plannedAccountModelPolicy(plan:{modelRevision?:string;modelMode?:AccountModelPolicy['mode']}):AccountModelPolicy {
 return {version:5,revision:plan.modelRevision || 'rules-5',mode:plan.modelMode || 'off'};
}
export function assertAccountModelPolicy(policy:AccountModelPolicy){
 if(accountModelPolicyKey(policy)!==accountModelPolicyKey(currentAccountModelPolicy()))throw new ScoutError('Account assessment policy changed. Reassess saved evidence or review a new collection plan.','MODEL_POLICY_STALE',409);
}
