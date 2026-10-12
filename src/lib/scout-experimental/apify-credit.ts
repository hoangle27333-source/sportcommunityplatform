import { apifyApi } from '../apify/runtime';
import { ScoutError } from '../apify/errors';
export function freeCredit(me:any,limits:any,requiredUsd:number) {
 const credits=Number(me.plan?.monthlyUsageCreditsUsd);
 const cap=Number(limits.limits?.maxMonthlyUsageUsd);
 const used=Number(limits.current?.monthlyUsageUsd);
 if(me.isPaying!==false || me.plan?.id!=='FREE' || !Number.isFinite(credits) || !Number.isFinite(cap) || cap>credits || !Number.isFinite(used) || cap-used<requiredUsd+0.15)throw new ScoutError('Apify Free credit is insufficient or paid overage cannot be ruled out.','TRIAL_UNAVAILABLE',409);
 return {remainingUsd:cap-used,cycleEndsAt:limits.monthlyUsageCycle?.endAt,capUsd:cap,usedUsd:used};
}
export async function verifyApifyFreeCredit(requiredUsd:number) {
 const [user,limits]=await Promise.all([apifyApi('users/me'),apifyApi('users/me/limits')]);
 return freeCredit(user.data,limits.data,requiredUsd);
}
