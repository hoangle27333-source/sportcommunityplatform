'use client';
import { useEffect, useRef, useState } from 'react';
import { urlKind, platformMatches } from '@/lib/apify/discovery-quality';
import { scoutFetch } from '@/lib/apify/scout-client';
import { useCurrentUser } from '@/lib/auth/auth-context';
import { useScoutCapabilities } from './use-scout-capabilities';
import { scoutButtonClass, scoutInputClass } from './scout-dialog-frame';

type Destination = 'kol' | 'community' | 'post';
export type InspectedDetails = Record<string, any> & { source?: string; provenance?: Record<string, any>; missingMetrics?: string[] };
export function UrlInspector({ destination, initialUrl = '', sessionId, onDetails, label = 'Inspect Link' }: {
  destination?: Destination; initialUrl?: string; sessionId?: string; onDetails: (details: InspectedDetails, destination: Destination) => void; label?: string;
}) {
  const [url, setUrl] = useState(initialUrl); const [choice, setChoice] = useState<Destination | ''>(destination || '');
  const [busy, setBusy] = useState(false); const [message, setMessage] = useState(''); const [error, setError] = useState('');
  const { isEditor } = useCurrentUser();
  const requestToken = useRef(0);
  useEffect(() => { setUrl(initialUrl); setMessage(''); setError(''); setBusy(false); requestToken.current++; }, [initialUrl]);
  const kind = urlKind(url);
  const detected: Destination | '' = kind === 'post' ? 'post' : kind === 'group' ? 'community' : '';
  const target = destination || detected || choice;
  const platform = ['Instagram','Facebook','TikTok'].find(p => platformMatches(p, url));
  const { availability } = useScoutCapabilities(kind === 'group' ? 'group-details' : 'profile-details');
  const capability = availability(platform || '');
  const mismatch = !!destination && !!detected && destination !== detected;
  useEffect(() => {
    if (!sessionId) return;
    let cancelled = false;
    fetch(`/api/sport-hub/scout?sessionId=${encodeURIComponent(sessionId)}`).then(async response => {
      const result = await response.json();
      if (!response.ok || !result.success || !result.data || result.criteria?.url !== initialUrl) throw new Error(result.error || 'Verified details are unavailable for this link.');
      if (!cancelled && target) {
        const details = result.data;
        onDetails({ ...details, url: details.url || initialUrl, source: 'apify', inspectSessionId: sessionId, missingMetrics: ['followers','avgViews','er'].filter(f => typeof details[f] !== 'number') }, target);
        setMessage('Saved provider observations loaded. Review before saving. No new collection was started.');
      }
    }).catch(e => { if (!cancelled) setError(e.message); });
    return () => { cancelled = true; };
  }, [sessionId]);
  async function inspect(verify = false) {
    if (!target || mismatch) return;
    const token = ++requestToken.current; const requestUrl = url.trim();
    setBusy(true); setError(''); setMessage('');
    try {
      const options = { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ url: requestUrl, type: target, ...(verify ? { action: 'verify' } : {}) }) };
      const response = verify ? await scoutFetch('/api/sport-hub/scout/inspect-url', options) : await fetch('/api/sport-hub/scout/inspect-url', options);
      const result = await response.json(); if (!response.ok || !result.success || !result.data) throw new Error(result.error || 'The link could not be inspected.');
      if (token !== requestToken.current) return;
      const details = result.data;
      const metricFields = target === 'post' ? ['views','likes','comments','er'] : ['followers','avgViews','er'];
      const missingMetrics = metricFields.filter(field => typeof details[field] !== 'number');
      onDetails({ ...details, url: details.url || requestUrl, source: verify ? 'apify' : 'public-metadata', inspectSessionId: verify ? result.sessionId : undefined, missingMetrics,
        ...(details.provenance ? { provenance: details.provenance } : {}) }, target);
      setMessage(details.metadataWarnings?.length ? details.metadataWarnings.join(' ') : verify ? 'Provider observations fetched. Review the fields before saving.' : 'Public metadata inspected. Metrics remain unverified until observed by a provider. Review before saving.');
    } catch (e: any) { if (token === requestToken.current) setError(e.message); }
    finally { if (token === requestToken.current) setBusy(false); }
  }
  return <section aria-label="Inspect social link" className="rounded-xl border border-indigo-100 bg-indigo-50/50 p-3 space-y-3">
    <label className="block text-sm font-semibold">Social link<input type="url" value={url} onChange={e => { requestToken.current++; setUrl(e.target.value); setMessage(''); setError(''); setBusy(false); }} onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); if (!busy && target && !mismatch) void inspect(); } }} placeholder="https://…" className={`${scoutInputClass} mt-1`} /></label>
    {!destination && !detected && <label className="block text-sm">Save destination<select disabled={busy} value={choice} onChange={e => setChoice(e.target.value as Destination)} className={`${scoutInputClass} mt-1`}><option value="">Choose a destination</option><option value="kol">KOLs Directory</option><option value="community">Community & Clubs</option><option value="post">Trending Posts</option></select></label>}
    <p className="text-xs text-slate-600">Destination: {target === 'kol' ? 'KOLs Directory' : target === 'community' ? 'Community & Clubs' : target === 'post' ? 'Trending Posts' : 'Choose a destination'}. Inspection fills a draft; it does not save a record.</p>
    {mismatch && <p role="alert" className="text-xs text-red-700">This link belongs to {detected === 'post' ? 'a post' : 'a community'}. Open the matching add form.</p>}
    <div className="flex flex-wrap gap-2"><button type="button" disabled={!url.trim() || !target || mismatch || busy} onClick={() => inspect()} className={scoutButtonClass}>{busy ? 'Inspecting…' : label}</button>
      {target !== 'post' && <button type="button" disabled={!isEditor || !capability.available || !url || busy || mismatch} onClick={() => inspect(true)} className="rounded-lg border border-indigo-300 bg-white px-3 py-2 text-sm font-semibold disabled:opacity-50">Fetch Verified Details</button>}
    </div>
    {target !== 'post' && url && !capability.available && <p className="text-xs text-amber-800">{capability.reason}</p>}
    {message && <p role="status" className="text-xs text-indigo-800">{message}</p>}
    {error && <p role="alert" className="text-xs text-red-700">{error} <a href="/scout" className="underline">Open Activity</a></p>}
  </section>;
}
