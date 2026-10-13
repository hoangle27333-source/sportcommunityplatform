'use client';
import { useState } from 'react';
import { Flame, Sparkles } from 'lucide-react';
import { scoutFetch } from '@/lib/apify/scout-client';
import { connectedPlatforms, taskRequest } from '@/lib/apify/scout-workspace';
import { canonicalUrl, platformMatches } from '@/lib/apify/discovery-quality';
import { TopPostFields, QualityFilterFields, topPostDefaults, validateTopPostDates } from './top-post-fields';
import { ScoutSearchPlan, useSearchPlan } from './scout-search-plan';
import { t } from '@/lib/i18n';
import type { KOL, Community } from './types';
import { ScoutDialogFrame, scoutButtonClass, scoutInputClass } from './scout-dialog-frame';
import { useScoutCapabilities } from './use-scout-capabilities';

export function EntityPostScoutModal({ entity, entityType, onClose, onSuccess, source, initialCriteria = {} }: {
  entity: KOL | Community; entityType: 'kol' | 'community'; onClose: () => void; onSuccess: (result: any) => void; source?: string; initialCriteria?: Record<string, any>;
}) {
  const latest = entityType === 'community' && initialCriteria.collectionMode === 'latest-30';
  const connected = connectedPlatforms(entity);
  const urls = [...new Set([entityType === 'community' ? (entity as Community).groupUrl : (entity as KOL).profileUrl, ...(entity.channels || []).map(c => c.url)].map(u => canonicalUrl(u || '')).filter(u => connected.some(p => platformMatches(p, u))))];
  const group = entityType === 'community' && urls.some(u => u.includes('/groups/'));
  const { capabilities, availability: profileAvailability } = useScoutCapabilities('profile-posts');
  function channelAvailability(url: string) {
    const platform = connected.find(p => platformMatches(p, url))!;
    return platform === 'Facebook' && url.includes('/groups/') ? capabilities?.Facebook?.['group-posts'] || { available: false, reason: 'Checking provider availability…' } : profileAvailability(platform);
  }
  function availability(platform: string) { return platform === 'Facebook' && group ? capabilities?.Facebook?.['group-posts'] || { available: false, reason: 'Checking provider availability…' } : profileAvailability(platform); }
  const [selectedUrls, setSelectedUrls] = useState<string[] | null>(initialCriteria.channelUrls || null);
  const eligibleUrls = (selectedUrls || urls).filter(url => channelAvailability(url).available);
  const [selected, setSelected] = useState<string[] | null>(() => initialCriteria.platform ? (Array.isArray(initialCriteria.platform) ? initialCriteria.platform : [initialCriteria.platform]).filter((p: string) => connected.includes(p as any)) : null);
  const [top,setTop]=useState(!latest && (initialCriteria.selectionMode==='top' || !initialCriteria.collectionMode));
  const platforms = latest || top ? connected.filter(p => eligibleUrls.some(u => platformMatches(p, u))) : (selected || connected).filter(p => availability(p).available);
  const [topFields,setTopFields]=useState(()=>topPostDefaults(initialCriteria));
  const [maxSessionUsd,setMaxSessionUsd]=useState<number|undefined>();
  const [limit, setLimit] = useState(initialCriteria.limit || 10);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const planCriteria={...topFields,platform:platforms,limit,channelUrls:eligibleUrls,maxSessionUsd,[entityType==='community'?'communityId':'kolId']:entity.id};
  const searchPlan=useSearchPlan(entityType==='community'?'community-posts':'kol-posts',planCriteria,top && !!eligibleUrls.length);
  async function submit(event: React.FormEvent) {
    event.preventDefault(); setBusy(true); setError('');
    try {
      if(top)validateTopPostDates(topFields);
      if(top && !searchPlan.plan)throw new Error(searchPlan.error || 'Wait for the top-post plan to be ready.');
      const request = taskRequest({ intent: 'content', mode: 'entity', entityType, ids: [entity.id], source }, {
        platform: platforms, qualityFilter:topFields.qualityFilter, limit: latest ? 30 : limit,
        ...(top?{...planCriteria,planHash:searchPlan.plan!.hash}:{}),
        ...(latest ? { collectionMode: 'latest-30', channelUrls: eligibleUrls, forceRefresh: true } : {}),
      });
      const response = await scoutFetch(request.url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(request.body) });
      const result = await response.json(); if (!result.success) throw new Error(result.error || 'Post collection failed.');
      onSuccess(result);
    } catch (e: any) { setError(e.message); } finally { setBusy(false); }
  }
  return <ScoutDialogFrame title={latest ? 'Update latest 30 posts' : top?'Find Top Posts':'Collect Posts'} description={`Collect public posts from ${entity.name}. You can close this form while the task runs.`} onClose={onClose}>
    <form onSubmit={submit} className="space-y-5">
      <div className="rounded-xl bg-slate-50 p-3"><strong>{entity.name}</strong><p className="text-xs text-slate-500">{(entity.sport || []).map(s => t(s)).join(' · ')} · {t(entity.geography)}</p></div>
      {!latest && (
        <div>
          <div className="grid grid-cols-2 gap-1.5 p-1 bg-slate-100 rounded-xl border border-slate-200">
            <button
              type="button"
              disabled={busy}
              onClick={() => setTop(true)}
              className={`flex items-center justify-center space-x-2 py-2 px-3 rounded-lg text-xs font-bold transition cursor-pointer ${
                top
                  ? 'bg-white text-indigo-700 shadow-xs border border-slate-200/80'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <Flame className="w-3.5 h-3.5 text-amber-500 fill-amber-500" />
              <span>Find Top Posts</span>
            </button>

            <button
              type="button"
              disabled={busy}
              onClick={() => setTop(false)}
              className={`flex items-center justify-center space-x-2 py-2 px-3 rounded-lg text-xs font-bold transition cursor-pointer ${
                !top
                  ? 'bg-white text-indigo-700 shadow-xs border border-slate-200/80'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <Sparkles className="w-3.5 h-3.5 text-slate-400" />
              <span>Incremental Posts</span>
            </button>
          </div>
        </div>
      )}
      {top ? <TopPostFields value={topFields} onChange={setTopFields} disabled={busy} /> : <QualityFilterFields value={topFields} onChange={setTopFields} disabled={busy} />}
      <fieldset className="space-y-2"><legend className="mb-2 text-sm font-semibold">{latest || top ? 'Connected channels' : 'Connected platforms'}</legend>
        {!connected.length && <p className="text-sm text-amber-800">Add a supported profile or community channel before collecting posts.</p>}
        {latest || top ? urls.map(url => { const capability = channelAvailability(url); return <label key={url} className="block rounded-lg border p-3 text-sm">
          <span className="flex items-start gap-2"><input type="checkbox" checked={eligibleUrls.includes(url)} disabled={busy || !capability.available} onChange={e => setSelectedUrls(e.target.checked ? [...eligibleUrls, url] : eligibleUrls.filter(u => u !== url))} /><span className="break-all">{url}</span></span>
          {!capability.available && <span className="mt-1 block text-xs text-amber-800">{capability.reason}</span>}
        </label>; }) : connected.map(platform => { const capability = availability(platform); return <label key={platform} className="block rounded-lg border p-3 text-sm">
          <span className="flex items-center gap-2"><input type="checkbox" checked={platforms.includes(platform)} disabled={busy || !capability.available} onChange={e => setSelected(e.target.checked ? [...platforms, platform] : platforms.filter(p => p !== platform))} />{platform}</span>
          {!capability.available && <span className="mt-1 block text-xs text-amber-800">{capability.reason}</span>}
        </label>; })}
      </fieldset>
      {latest ? (
        <p className="text-xs text-slate-500">Collect up to 30 public posts per selected channel, then measure the 30 newest dated posts across the club. Missing metrics are excluded. Inaccessible posts may be missing. Collection uses your Scout budget.</p>
      ) : (
        <div>
          <label className="mt-3 block text-xs font-bold text-slate-700 mb-1.5">
            {top ? 'Target Sample Size' : 'Collection limit'}
          </label>
          <div className="grid grid-cols-4 gap-1.5">
            {[5, 10, 20, 30].map((num) => (
              <button
                key={num}
                type="button"
                disabled={busy}
                onClick={() => setLimit(num)}
                className={`py-1.5 px-2 rounded-lg text-xs font-semibold border transition text-center cursor-pointer ${
                  limit === num
                    ? 'bg-slate-900 border-slate-900 text-white shadow-xs font-bold'
                    : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-50 hover:border-slate-300'
                }`}
              >
                {num} posts
              </button>
            ))}
          </div>
        </div>
      )}
      <p className="text-xs text-slate-500">Collected posts are saved and deduplicated. Comments are collected separately after you review the posts.</p>
      {error && <p role="alert" className="text-sm text-red-700">{error} <a href="/scout" className="underline">Open Activity</a></p>}
      {top && <ScoutSearchPlan {...searchPlan} variants={undefined} onVariants={()=>{}} budget={maxSessionUsd} onBudget={setMaxSessionUsd}/>}
      <button className={scoutButtonClass} disabled={busy || !platforms.length || !topFields.qualityFilter}>{busy ? 'Collecting…' : latest ? 'Update latest 30 posts' : top?'Find Top Posts':'Collect Posts'}</button>
    </form>
  </ScoutDialogFrame>;
}
