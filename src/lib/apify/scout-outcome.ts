/** Normalize old single-platform failure receipts without rewriting stored evidence. */
export function scoutOutcome(kind:string,params:Record<string,any>,result:any) {
 if(!result)return result;
 const platforms=Array.isArray(params.platform) ? params.platform : [params.platform];
 const counts=result.counts || {};
 const legacyAllFailed=['kol-posts','community-posts','trends'].includes(kind) && platforms.length===1 && counts.failed===1 && !counts.inserted && !counts.refreshed && !counts.duplicate && !result.posts?.length;
 if(result.success!==false && !result.allFailed && !legacyAllFailed)return result;
 const error=result.error || result.warnings?.join(' ') || result.message || 'Scout task failed.';
 const code=result.code || (/budget exhausted/i.test(error) ? 'BUDGET_EXHAUSTED' : 'SCOUT_ERROR');
 return {...result,success:false,partial:false,allFailed:true,error,code,httpStatus:result.httpStatus || (code==='BUDGET_EXHAUSTED' ? 409 : 502)};
}
