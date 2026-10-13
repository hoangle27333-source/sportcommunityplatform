export type DiscoveryUnit={platform:string;query:string;method:string};
export function discoveryTask(method:string):'profiles'|'keyword'|'hashtag' {
 return method==='profile'?'profiles':method==='hashtag'?'hashtag':'keyword';
}
/** Approved query text is immutable. Methods may expand; eligibility does not. */
export function discoveryUnits(queries:string[],platforms:string[],provider:string,supported:(unit:DiscoveryUnit)=>boolean=()=>true):DiscoveryUnit[] {
 const result:DiscoveryUnit[]=[];const seen=new Set<string>();
 for(const query of queries) {
  const content=platforms.map(platform=>({platform,query,method:provider==='brave'?'web-content':platform==='Instagram'?'hashtag':'content-author'})).filter(u=>provider!=='apify' || u.platform!=='Instagram' || /^#?[\p{L}\p{N}_]+$/u.test(query));
  const profiles=provider==='apify'?platforms.map(platform=>({platform,query,method:'profile'})):[];
  for(const unit of [...content,...profiles]) {
   const key=JSON.stringify(unit);if(seen.has(key)||!supported(unit))continue;
   seen.add(key);result.push(unit);if(result.length===12)return result;
  }
 }
 return result;
}
/** Prefer a verified method that returned useful candidates. Never create a new query. */
export function prioritizeApprovedUnits(units:DiscoveryUnit[],outcomes:{platform:string;method:string;newCandidates:number}[]):DiscoveryUnit[] {
 const score=(unit:DiscoveryUnit)=>{
  const matches=outcomes.filter(o=>o.platform===unit.platform&&o.method===unit.method);
  return matches.length?matches.reduce((sum,o)=>sum+o.newCandidates,0)/matches.length:1;
 };
 const platforms=[...new Set(units.map(u=>u.platform))];
 const buckets=platforms.map(platform=>units.filter(u=>u.platform===platform).sort((a,b)=>score(b)-score(a)));
 return Array.from({length:Math.max(0,...buckets.map(b=>b.length))},(_,i)=>buckets.flatMap(b=>b[i]?[b[i]]:[])).flat();
}
