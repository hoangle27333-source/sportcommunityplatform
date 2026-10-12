'use client';
import {AccountSizeFields,savedSizeCriteria} from './account-size-fields';
import { ScoutSearchPlan, useSearchPlan } from './scout-search-plan';
import { useState } from 'react';
import { canonicalScopes } from '@/lib/apify/geography';
import type { ScoutSessionSummary } from '@/lib/apify/scout-workspace';
import { ScoutDialogFrame, scoutInputClass, scoutButtonClass } from './scout-dialog-frame';
export function BroadenSearchModal({session,onClose}:{session:ScoutSessionSummary;onClose:()=>void}) {
 const p=session.params as any;const originalGeography=canonicalScopes(p.geography || 'Nationwide');
 const [keyword,setKeyword]=useState(p.keyword || '');const [geography,setGeography]=useState(Array.isArray(originalGeography)?originalGeography.join(', '):originalGeography);
 const [variants,setVariants]=useState<string|undefined>(p.queryVariants?.join('\n'));const [mode,setMode]=useState(p.searchMode || (p.keyword?.startsWith('#')?'hashtag':'keyword'));
 const [days,setDays]=useState(p.recentDays ?? 7);const [interactions,setInteractions]=useState(p.minInteractions ?? 100);const [views,setViews]=useState(p.minViews ?? 10000);
 const [sizeCriteria,setSizeCriteria]=useState(savedSizeCriteria(p));
 const [busy,setBusy]=useState(false);const [error,setError]=useState('');const [maxSessionUsd,setMaxSessionUsd]=useState<number|undefined>(p.maxSessionUsd);
 const payload={...(session.kind==='preview'?{...sizeCriteria,assessmentRevision:6}:{}),keyword:keyword.trim(),geography:geography===(Array.isArray(originalGeography)?originalGeography.join(', '):originalGeography)?originalGeography:geography,queryVariants:variants===undefined?undefined:(session.kind==='preview' || mode==='keyword')?variants.split(/\n|,/).map((v:string)=>v.trim()).filter(Boolean):[],maxSessionUsd,...(session.kind==='trends'?{searchMode:mode,recentDays:days,minInteractions:interactions,minViews:views}:{})};
 const searchPlan=useSearchPlan(session.kind==='preview'?'preview':'trends',{...p,...payload},!!keyword.trim());
 const changes=Object.entries(payload).filter(([key,value])=>JSON.stringify(value)!==JSON.stringify(key==='geography'?originalGeography:key==='queryVariants'?p.queryVariants || []:key==='searchMode'?p.searchMode || (p.keyword?.startsWith('#')?'hashtag':'keyword'):p[key]));
 async function submit(e:React.FormEvent){e.preventDefault();setBusy(true);setError('');try{if(!searchPlan.plan)throw new Error(searchPlan.error || 'Wait for the search plan to be ready.');const response=await fetch(session.kind==='preview'?'/api/sport-hub/scout':'/api/sport-hub/scout/market-trends',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({...p,...payload,planHash:searchPlan.plan.hash,parentSessionId:session.id,executionMode:undefined,forceRefresh:false})});const data=await response.json();if(!response.ok)throw new Error(data.error || 'Unable to start search.');window.location.assign(`/scout?sessionId=${encodeURIComponent(data.sessionId)}`);}catch(e:any){setError(e.message);setBusy(false);}}
 return <ScoutDialogFrame title="Broaden Search" description="Review the changes before starting a new collection. Your original task is preserved." onClose={onClose}>
 <form onSubmit={submit} className="space-y-4">
 <label className="block text-sm">Search query<input required value={keyword} onChange={e=>setKeyword(e.target.value)} className={scoutInputClass}/></label>
 {session.kind==='preview' && <AccountSizeFields value={sizeCriteria} onChange={setSizeCriteria}/>}
 <label className="block text-sm">Geography<select value={geography} onChange={e=>setGeography(e.target.value)} className={scoutInputClass}>{[...new Set([Array.isArray(originalGeography)?originalGeography.join(', '):originalGeography,'Vietnam','Any location'])].map(value=><option key={value}>{value}</option>)}</select></label>
 <p className="text-xs text-slate-500">Nationwide and Any location apply no geography filter. Vietnam requires observed country or city evidence.</p>
 {session.kind==='trends' && <><label className="block text-sm">Search mode<select value={mode} onChange={e=>setMode(e.target.value)} className={scoutInputClass}><option value="hashtag">Exact hashtag</option><option value="keyword">Topic keywords</option></select></label>
 <label className="block text-sm">Recent days<input type="number" min={1} max={30} required value={days} onChange={e=>setDays(Number(e.target.value))} className={scoutInputClass}/></label>
 <label className="block text-sm">Minimum likes + comments<input type="number" min={1} max={1000000} required value={interactions} onChange={e=>setInteractions(Number(e.target.value))} className={scoutInputClass}/></label>
 <label className="block text-sm">Minimum views (alternative threshold)<input type="number" min={1} max={1000000000} required value={views} onChange={e=>setViews(Number(e.target.value))} className={scoutInputClass}/></label></>}
 <div className="rounded-lg border p-3 text-sm"><p className="font-semibold">Changes to review</p>{changes.length?<ul>{changes.map(([key,value])=><li key={key}>{({keyword:'Search query',geography:'Geography',queryVariants:'Query variants',searchMode:'Search mode',recentDays:'Recent days',minInteractions:'Minimum interactions',minViews:'Minimum views',sizeMetric:'Audience metric',assessmentRevision:'Assessment revision',maxSessionUsd:'Session budget cap',maxFollowers:'Maximum followers',minMembers:'Minimum members',maxMembers:'Maximum members',minFollowers:'Minimum followers'} as any)[key]}: {Array.isArray(value)?value.join(', ') || 'None':['minFollowers','maxFollowers','minMembers','maxMembers'].includes(key)?(value===undefined?'Not set':Number(value).toLocaleString('en-US')):String(value)}</li>)}</ul>:<p>No criteria changed.</p>}</div>
 <ScoutSearchPlan {...searchPlan} variants={variants} onVariants={setVariants} budget={maxSessionUsd} onBudget={setMaxSessionUsd}/>
 {error && <p role="alert" className="text-sm text-red-700">{error}</p>}
 <div className="flex gap-3"><button type="button" onClick={onClose} disabled={busy} className={scoutButtonClass}>Cancel</button><button type="submit" disabled={busy || !keyword.trim() || !searchPlan.plan || searchPlan.loading} className={scoutButtonClass}>{busy?'Starting…':'Start Scout'}</button></div>
 </form></ScoutDialogFrame>;
}
