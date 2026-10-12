'use client';
import { useEffect, useState } from 'react';
import type { ProviderSelection } from '@/lib/scout-experimental/types';
export type ExperimentalInputs={seedUrls:string[];seedDatasetId?:string;datasetSeedUrls:string[];providerSelection:ProviderSelection;approvedKeywords:string[];keywordsApproved:boolean};
export const emptyExperimental:ExperimentalInputs={seedUrls:[],datasetSeedUrls:[],providerSelection:{discovery:'apify',profile:'apify',posts:'apify'},approvedKeywords:[],keywordsApproved:false};
export function ExperimentalScoutFields({value,onChange,topic,geography,target}:{value:ExperimentalInputs;onChange:(v:ExperimentalInputs)=>void;topic:string;geography:string;target:string}) {
 const [config,setConfig]=useState<any>(null);
 const [error,setError]=useState('');
 useEffect(()=>{
  const controller=new AbortController();
  const timer=setTimeout(()=>void fetch(`/api/sport-hub/scout/experimental?${new URLSearchParams({topic,geography,target,dataset:value.seedDatasetId || ''})}`,{signal:controller.signal}).then(async r=>{const data=await r.json();if(!r.ok)throw new Error(data.error);setConfig(data);setError('');}).catch(e=>{if(e.name!=='AbortError')setError(e.message);}),200);
  return()=>{clearTimeout(timer);controller.abort();};
 },[topic,geography,target,value.seedDatasetId]);
 const update=(next:Partial<ExperimentalInputs>)=>onChange({...value,...next,keywordsApproved:false});
 const input='w-full rounded-lg border border-slate-200 bg-white p-2 text-xs';
 return <fieldset className="space-y-3 rounded-xl border border-indigo-200 p-3 text-xs" aria-label="Experimental search configuration">
  <legend className="font-semibold">Experimental Search</legend>
  <p>Find authors through public content and seed accounts. Seeds and database accounts do not count as new results. Missing evidence remains unverified.</p>
  <div className="grid gap-2 sm:grid-cols-3">{(['discovery','profile','posts'] as const).map(task=><label key={task}>{task==='discovery'?'Discovery':task==='profile'?'Profile details':'Owned posts'} provider<select className={input} value={value.providerSelection[task]} onChange={e=>update({providerSelection:{...value.providerSelection,[task]:e.target.value}})}>{(task==='discovery'?['brave','apify']:['brightdata','apify']).map(p=><option key={p} value={p}>{p==='brave'?'Brave Search':p==='apify'?'Apify':'Bright Data'}</option>)}</select></label>)}</div>
  <p>Content analysis: Gemini 2.5 Flash-Lite, up to $0.02 per session. Scraping uses verified trial credits. Providers are used only for their selected task; failures never switch providers automatically.</p>
  {error && <p role="alert">{error}</p>}
  {config?.error && <p role="alert">{config.error}</p>}
  {config && <details><summary>Verified capabilities and trial limits</summary>{config.capabilities.length?config.capabilities.map((c:any)=><p key={c.id}>{c.platform} · {c.provider} · {c.operation}: {c.available?(c.paidModel?'Available · budgeted paid model':'Available · trial only'):c.reason} · {Number(c.remainingUnits).toLocaleString('en-US')} units left · ${Number(c.maxValueUsd).toFixed(4)} maximum credit value/request · expires {new Date(c.expiresAt).toLocaleDateString('en-US')}</p>):<p>No verified trial capabilities are configured. Live execution is blocked.</p>}</details>}
  <label className="block">Seed dataset<select className={input} value={value.seedDatasetId || ''} onChange={e=>update({seedDatasetId:e.target.value || undefined,datasetSeedUrls:[]})}><option value="">No dataset</option>{config?.datasets?.map((d:any)=><option key={d.id} value={d.id}>{d.file_name} · {d.profile_rows.toLocaleString('en-US')} historical rows</option>)}</select></label>
  {config?.seeds?.length>0 && <details><summary>Select database seeds (up to 10 total seeds)</summary>{config.seeds.map((s:any)=><label key={s.url} className="flex gap-2 py-1"><input type="checkbox" checked={value.datasetSeedUrls.includes(s.url)} onChange={e=>update({datasetSeedUrls:e.target.checked?[...value.datasetSeedUrls,s.url]:value.datasetSeedUrls.filter(u=>u!==s.url)})}/><span>{s.name} · {s.sport} · {s.platform}</span></label>)}</details>}
  <label className="block">Seed account URLs (one per line, up to 10 total)<textarea className={input} value={value.seedUrls.join('\n')} onChange={e=>update({seedUrls:e.target.value.split('\n')})} placeholder="https://www.facebook.com/example"/></label>
  <button type="button" className="rounded-lg border p-2" disabled={!topic.trim()} onClick={()=>update({approvedKeywords:[...(config?.suggestions?.synonyms || []),...(config?.suggestions?.expansions || [])].slice(0,12)})}>Suggest keywords</button>
  <p>Synonyms: {config?.suggestions?.synonyms?.join(' · ') || 'Enter a topic'}. Broader queries discover candidates; they do not change the qualifying topic.</p>
  <label className="block">Search queries to approve (one per line, up to 12)<textarea className={input} value={value.approvedKeywords.join('\n')} onChange={e=>update({approvedKeywords:e.target.value.split('\n')})}/></label>
  <label className="flex gap-2"><input type="checkbox" checked={value.keywordsApproved} onChange={e=>onChange({...value,keywordsApproved:e.target.checked})}/>I reviewed these queries and seed accounts.</label>
  <p>Maximum 12 executed queries, 60 candidates, 20 profile details, 10 sampled owned posts and 6 images or video clips per account. One verified sport post in the selected location can meet the content-location policy; this does not establish residence.</p>
 </fieldset>;
}
