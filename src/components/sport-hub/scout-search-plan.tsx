'use client';
import { useEffect, useState } from 'react';
import type { SearchPlan } from '@/lib/apify/search-plan';
import { scoutInputClass } from './scout-dialog-frame';
export function useSearchPlan(kind:'preview'|'trends',criteria:Record<string,unknown>,enabled:boolean) {
 const signature=JSON.stringify({kind,...criteria});
 const [state,setState]=useState<{signature:string;plan:SearchPlan|null;error:string;loading:boolean}>({signature:'',plan:null,error:'',loading:false});
 useEffect(()=>{
  if(!enabled)return;const controller=new AbortController();let live=true;
  setState({signature,plan:null,error:'',loading:true});
  const timer=setTimeout(async()=>{try{const response=await fetch('/api/sport-hub/scout/plan',{method:'POST',headers:{'Content-Type':'application/json'},body:signature,signal:controller.signal});const data=await response.json();if(!response.ok)throw new Error(data.error || 'Unable to prepare search.');if(live)setState({signature,plan:data.plan,error:'',loading:false});}catch(e:any){if(live && e.name!=='AbortError')setState({signature,plan:null,error:e.message,loading:false});}},250);
  return()=>{live=false;clearTimeout(timer);controller.abort();};
 },[signature,enabled]);
 return state.signature===signature?state:{signature,plan:null,error:'',loading:enabled};
}
export function ScoutSearchPlan({plan,error,loading,variants,onVariants,budget,onBudget}:{plan:SearchPlan|null;error:string;loading:boolean;variants:string|undefined;onVariants:(v:string)=>void;budget:number|undefined;onBudget:(v:number|undefined)=>void}) {
 return <div className="space-y-2 rounded-xl border border-slate-200 p-3 text-xs">
 {loading?<p role="status">Preparing search…</p>:error?<p role="alert" className="text-amber-800">{error}</p>:plan?<><p className="font-semibold">Target: {plan.criteria.limit} qualified new results · Budget cap ${plan.maxSessionUsd.toFixed(2)}{plan.allowedMaxSessionUsd!==undefined?` · Allowed maximum $${plan.allowedMaxSessionUsd.toFixed(2)}`:''}</p><p>Search and evidence collection run automatically within this cap. Missing evidence remains available for review.</p></>:<p>Enter a topic and choose a platform to prepare your search.</p>}
 {plan?.appliedFilters && <div className="space-y-1" aria-label="Applied collection settings">{plan.appliedFilters.map((filter,index)=><p key={index}><strong>{filter.platform} · {filter.setting} · {filter.mode}:</strong> {filter.detail}</p>)}<p>Up to 10 sampled owned posts per account when evidence is needed. Unverified ordering and incomplete samples remain visible.</p></div>}
 <details><summary className="cursor-pointer font-semibold">Advanced: Search queries and budget</summary><div className="space-y-2 pt-2">
 <label className="block">Additional queries (up to 3)<textarea className={scoutInputClass} value={variants ?? plan?.rounds.flatMap(r=>r.queries).slice(1).join('\n') ?? ''} onChange={e=>onVariants(e.target.value)} placeholder="One query per line" disabled={plan?.criteria.searchMode==='hashtag'}/></label>
 <label className="block">Session budget cap (USD)<input className={scoutInputClass} type="number" min="0.01" max={plan?.allowedMaxSessionUsd ?? 100} step="0.01" value={budget ?? plan?.maxSessionUsd ?? ''} onChange={e=>onBudget(e.target.value?Number(e.target.value):undefined)}/></label>
 {plan && <><p>Queries: {plan.rounds.flatMap(r=>r.queries).join(' · ')}</p><p>Maximum {plan.rounds.length} rounds, {plan.maxSearchRows ?? 120} search rows and {plan.maxHydratedProfiles ?? 10} profile enrichments. Exact hashtag criteria stay unchanged.</p>{plan.sources.map(s=><p key={s.platform}>{s.platform}: {s.rounds?.flatMap(r=>r.queries).join(' · ') || s.task}{s.warnings.length?` · ${s.warnings.join(' ')}`:''}</p>)}</>}
 </div></details></div>;
}
