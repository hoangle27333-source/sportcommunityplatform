'use client';
import { useState } from 'react';
import { scoutFetch } from '@/lib/apify/scout-client';
import { connectedPlatforms, taskRequest } from '@/lib/apify/scout-workspace';
import { canonicalUrl, platformMatches } from '@/lib/apify/discovery-quality';
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
  const platforms = latest ? connected.filter(p => eligibleUrls.some(u => platformMatches(p, u))) : (selected || connected).filter(p => availability(p).available);
  const [limit, setLimit] = useState(initialCriteria.limit || 10);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  async function submit(event: React.FormEvent) {
    event.preventDefault(); setBusy(true); setError('');
    try {
      const request = taskRequest({ intent: 'content', mode: 'entity', entityType, ids: [entity.id], source }, {
        platform: platforms, limit: latest ? 30 : limit,
        ...(latest ? { collectionMode: 'latest-30', channelUrls: eligibleUrls, forceRefresh: true } : {}),
      });
      const response = await scoutFetch(request.url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(request.body) });
      const result = await response.json(); if (!result.success) throw new Error(result.error || 'Post collection failed.');
      onSuccess(result);
    } catch (e: any) { setError(e.message); } finally { setBusy(false); }
  }
  return <ScoutDialogFrame title={latest ? 'Update latest 30 posts' : 'Collect Posts'} description={`Collect public posts from ${entity.name}. You can close this form while the task runs.`} onClose={onClose}>
    <form onSubmit={submit} className="space-y-5">
      <div className="rounded-xl bg-slate-50 p-3"><strong>{entity.name}</strong><p className="text-xs text-slate-500">{(entity.sport || []).map(s => t(s)).join(' · ')} · {t(entity.geography)}</p></div>
      <fieldset className="space-y-2"><legend className="mb-2 text-sm font-semibold">{latest ? 'Connected channels' : 'Connected platforms'}</legend>
        {!connected.length && <p className="text-sm text-amber-800">Add a supported profile or community channel before collecting posts.</p>}
        {latest ? urls.map(url => { const capability = channelAvailability(url); return <label key={url} className="block rounded-lg border p-3 text-sm">
          <span className="flex items-start gap-2"><input type="checkbox" checked={eligibleUrls.includes(url)} disabled={busy || !capability.available} onChange={e => setSelectedUrls(e.target.checked ? [...eligibleUrls, url] : eligibleUrls.filter(u => u !== url))} /><span className="break-all">{url}</span></span>
          {!capability.available && <span className="mt-1 block text-xs text-amber-800">{capability.reason}</span>}
        </label>; }) : connected.map(platform => { const capability = availability(platform); return <label key={platform} className="block rounded-lg border p-3 text-sm">
          <span className="flex items-center gap-2"><input type="checkbox" checked={platforms.includes(platform)} disabled={busy || !capability.available} onChange={e => setSelected(e.target.checked ? [...platforms, platform] : platforms.filter(p => p !== platform))} />{platform}</span>
          {!capability.available && <span className="mt-1 block text-xs text-amber-800">{capability.reason}</span>}
        </label>; })}
      </fieldset>
      {latest ? <p className="text-xs text-slate-500">Collect up to 30 public posts per selected channel, then measure the 30 newest dated posts across the club. Missing metrics are excluded. Inaccessible posts may be missing. Collection uses your Scout budget.</p> : <details><summary className="cursor-pointer text-sm font-semibold">Advanced</summary><label className="mt-3 block text-sm">Maximum posts across selected platforms<select value={limit} onChange={e => setLimit(Number(e.target.value))} className={`${scoutInputClass} mt-1`}><option value={5}>5</option><option value={10}>10</option><option value={20}>20</option><option value={30}>30</option></select></label></details>}
      <p className="text-xs text-slate-500">Collected posts are saved and deduplicated. Comments are collected separately after you review the posts.</p>
      {error && <p role="alert" className="text-sm text-red-700">{error} <a href="/scout" className="underline">Open Activity</a></p>}
      <button className={scoutButtonClass} disabled={busy || !platforms.length}>{busy ? 'Collecting…' : latest ? 'Update latest 30 posts' : 'Collect Posts'}</button>
    </form>
  </ScoutDialogFrame>;
}
