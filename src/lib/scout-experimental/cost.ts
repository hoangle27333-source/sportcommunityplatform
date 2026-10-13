/** Linked Apify trial receipts allocate credit but do not duplicate the provider charge. */
export function experimentalCost(providerRuns:any[],externalRuns:any[]) {
 const runs=[...providerRuns,...externalRuns];
 const apify=externalRuns.filter(r=>r.capability?.provider==='apify');
 return {
  actualUsd:runs.some(r=>r.actual_usd==null)?null:runs.reduce((sum,r)=>sum+Number(r.actual_usd),0),
  reservedUsd:runs.filter(r=>r.actual_usd==null).reduce((sum,r)=>sum+Number(r.reserved_usd || 0),0),
  trialCreditValueUsd:apify.some(r=>r.input?.trialSettled!==true)?null:apify.reduce((sum,r)=>sum+Number(r.input.actualCreditValueUsd || 0),0),
 };
}
