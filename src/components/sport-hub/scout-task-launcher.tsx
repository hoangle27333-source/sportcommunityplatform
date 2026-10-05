'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useCurrentUser } from '@/lib/auth/auth-context';
import type { ScoutContext, ScoutSessionSummary } from '@/lib/apify/scout-workspace';
import { DiscoveryScoutModal } from './discovery-scout-modal';
import { MarketTrendScoutModal } from './market-trend-scout-modal';
import { EntityPostScoutModal } from './entity-post-scout-modal';
import { RefreshDataModal } from './refresh-data-modal';
import { AddKolModal, AddCommunityModal, AddPostModal } from './action-modals';
import { ScoutDialogFrame, scoutButtonClass, scoutInputClass } from './scout-dialog-frame';
import type { KOL, Community } from './types';

export type ScoutSubject = { id: string; name: string; profileUrl?: string; groupUrl?: string; channels?: { url?: string; isPrimary?: boolean }[] };
export function ScoutTaskLauncher({ context, subjects = [], entity, resumeSessionId, initialCriteria, onClose, onNavigate, onSuccess }: {
  context: ScoutContext; subjects?: ScoutSubject[]; entity?: KOL | Community;
  resumeSessionId?: string; initialCriteria?: Record<string, any>;
  onClose: () => void; onNavigate?: (href: string) => void; onSuccess?: (result?: any) => void;
}) {
  const { isEditor, loading } = useCurrentUser();
  const [result, setResult] = useState<any>(null);
  const [selectionReady, setSelectionReady] = useState(!!context.ids?.length || !!entity);
  const [selected, setSelected] = useState<string[]>(context.ids || []);
  const [linkReady, setLinkReady] = useState(!!context.entityType || !!context.url);
  const [linkType, setLinkType] = useState<'kol' | 'community'>(context.entityType === 'community' ? 'community' : 'kol');
  function success(value?: any) { onSuccess?.(value); setResult(value || { message: 'Record saved. Review the new record in its directory.' }); }
  if (loading) {
    return (
      <ScoutDialogFrame title="Scout" onClose={onClose}>
        <div className="flex items-center justify-center py-12">
          <div className="h-6 w-6 animate-spin rounded-full border-2 border-indigo-600 border-t-transparent" />
        </div>
      </ScoutDialogFrame>
    );
  }
  if (!isEditor) return <ScoutDialogFrame title="Scout" onClose={onClose}><p>Editor access is required to start or import Scout tasks. You can view your existing tasks in Activity.</p></ScoutDialogFrame>;
  const resultEntityType = context.mode === 'link' && context.intent === 'profiles' ? linkType : context.entityType;
  const destination = resultEntityType === 'tracked' ? '/analytics/tracked' : context.intent === 'content' ? '/trending' : resultEntityType === 'community' ? '/community' : '/kols';
  const resultSessionId = result?.sessionId || resumeSessionId;
  const savedId = result?.record?.id;
  const resultsHref = savedId && context.intent === 'profiles' ? `${destination}?recordId=${encodeURIComponent(savedId)}` : resultSessionId ? `/scout?sessionId=${encodeURIComponent(resultSessionId)}` : destination;
  const collectHref = `/scout?intent=content&mode=entity&type=${resultEntityType || 'kol'}${savedId ? `&ids=${encodeURIComponent(savedId)}` : ''}`;
  const dismissForNavigation = onNavigate || onClose;
  if (result) return <ScoutDialogFrame title={result.partial ? 'Completed with Warnings' : 'Task Completed'} description="Review the saved results or choose the next task." onClose={onClose}>
    <p role="status" className="text-sm">{result.summary || result.message || 'Results are ready in Activity.'}</p>
    {typeof result.insertedPosts === 'number' && <p className="mt-2 text-sm">{result.insertedPosts} observed posts saved with these profiles.</p>}
    {result.warnings?.length > 0 && <ul className="my-3 text-sm text-amber-800">{result.warnings.map((w: string, i: number) => <li key={i}>{w}</li>)}</ul>}
    <div className="mt-4 flex flex-wrap gap-3"><Link className={scoutButtonClass} onClick={() => dismissForNavigation(resultsHref)} href={resultsHref}>View Results</Link>
      <Link className="rounded-lg border px-3 py-2 text-sm" onClick={() => dismissForNavigation(destination)} href={destination}>Open {context.entityType === 'tracked' ? 'Analytics' : context.intent === 'content' ? 'Posts' : 'Directory'}</Link>
      {entity && context.intent === 'content' && context.entityType === 'kol' && <Link className="rounded-lg border px-3 py-2 text-sm" onClick={() => dismissForNavigation(`/scout?kolId=${entity.id}&section=audience`)} href={`/scout?kolId=${entity.id}&section=audience`}>Review Audience Evidence</Link>}
      {context.intent === 'profiles' && <Link className="rounded-lg border px-3 py-2 text-sm" onClick={() => dismissForNavigation(collectHref)} href={collectHref}>Collect Posts</Link>}
    </div>
  </ScoutDialogFrame>;
  if (context.mode === 'link') {
    if (context.intent === 'content') return <AddPostModal isOpen onClose={onClose} onSuccess={success} keepResultOpen initialUrl={context.url} inspectSessionId={resumeSessionId} />;
    if (!linkReady) return <ScoutDialogFrame title="Add a Profile from a Link" onClose={onClose}>
      <label className="block text-sm">Save destination<select value={linkType} onChange={e => setLinkType(e.target.value as 'kol' | 'community')} className={`${scoutInputClass} mt-1`}><option value="kol">KOLs Directory</option><option value="community">Community & Clubs</option></select></label>
      <button type="button" onClick={() => setLinkReady(true)} className={`${scoutButtonClass} mt-4`}>Continue</button>
    </ScoutDialogFrame>;
    return linkType === 'kol' ? <AddKolModal key="kol" isOpen onClose={onClose} onSuccess={success} keepResultOpen initialUrl={context.url} inspectSessionId={resumeSessionId} /> : <AddCommunityModal key="community" isOpen onClose={onClose} onSuccess={success} keepResultOpen initialUrl={context.url} inspectSessionId={resumeSessionId} />;
  }
  if (context.intent === 'profiles') return <DiscoveryScoutModal keepResultOpen isOpen defaultTargetType={context.entityType === 'community' ? 'Communities & Clubs' : 'Individual KOLs'} onClose={onClose} onSuccess={success} resumeSessionId={resumeSessionId} initialCriteria={initialCriteria} source={context.source} />;
  if (context.intent === 'content' && context.mode !== 'entity') return <MarketTrendScoutModal isOpen onClose={onClose} onSuccess={success} initialCriteria={initialCriteria} source={context.source} />;
  const picked = entity ? [entity] : subjects.filter(s => selected.includes(s.id));
  if (!selectionReady || !picked.length) return <ScoutDialogFrame title={context.intent === 'content' ? 'Collect Posts' : 'Refresh Data'} onClose={onClose}>
    <label className="block text-sm font-semibold">{context.intent === 'content' ? 'Choose a saved profile' : 'Choose accounts to refresh'}<select multiple={context.intent === 'refresh'} value={context.intent === 'refresh' ? selected : selected[0] || ''} onChange={e => setSelected(Array.from(e.target.selectedOptions, option => option.value))} className={`${scoutInputClass} mt-2`}>
      {context.intent === 'content' && <option value="">Choose a profile</option>}{subjects.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}</select></label>
    {!subjects.length && <p className="mt-3 text-sm">No saved profiles available. Add a profile in its directory first.</p>}
    {selected.length > 50 && <p role="alert" className="mt-3 text-sm text-amber-800">Choose up to 50 accounts per refresh.</p>}
    <button type="button" className={`${scoutButtonClass} mt-4`} disabled={!picked.length || selected.length > 50} onClick={() => setSelectionReady(true)}>Continue</button>
  </ScoutDialogFrame>;
  if (context.intent === 'content') return <EntityPostScoutModal key={picked[0].id} entity={picked[0] as KOL | Community} entityType={context.entityType === 'community' ? 'community' : 'kol'} initialCriteria={initialCriteria} onClose={onClose} onSuccess={success} source={context.source} />;
  return <RefreshDataModal context={context} entities={picked} onClose={onClose} onSuccess={success} />;
}

/** Opening a result never submits or retries a task. */
export function ScoutSessionResults({ session, onClose, onReview, onRetry }: {
  session: ScoutSessionSummary; onClose: () => void; onReview: () => void; onRetry: () => void;
}) {
  const [result, setResult] = useState<any>(null); const [error, setError] = useState('');
  const { isEditor } = useCurrentUser();
  useEffect(() => {
    let cancelled = false;
    async function read() {
      try {
        const response = await fetch(`/api/sport-hub/scout?sessionId=${encodeURIComponent(session.id)}`);
        const data = await response.json(); if (!cancelled) { setResult(data); setError(!response.ok ? data.error || 'Task failed.' : ''); }
      } catch { if (!cancelled) setError('Unable to read results. The task has not been restarted.'); }
    }
    void read(); const timer = setInterval(read, 10000); return () => { cancelled = true; clearInterval(timer); };
  }, [session.id]);
  const destination = session.kind === 'tracked' ? '/analytics/tracked' : ['trends','kol-posts','community-posts'].includes(session.kind) ? '/trending' : session.params.entityType === 'community' || session.params.targetType === 'Communities & Clubs' ? '/community' : '/kols';
  return <ScoutDialogFrame title={session.title} description={session.subject} onClose={onClose} wide>
    <p role="status" className="text-sm font-semibold">{result?.pending ? result.status === 'pending' ? 'Queued' : 'Running' : result?.partial ? 'Completed with Warnings' : error || session.status === 'failed' || result?.success === false ? 'Failed' : result ? (['trends','kol-posts','community-posts'].includes(session.kind) && !result.posts?.length && !result.counts?.refreshed && !result.counts?.duplicate ? 'No Results' : 'Complete') : 'Loading…'}</p>
    {session.reviewState === 'needs-review' && <p className="mt-2 text-sm">{session.remainingCandidates} profiles need review before import.</p>}
    {result?.sourceFreshness?.length > 0 && <p className="mt-2 text-xs text-slate-500">Observed {new Date(result.sourceFreshness.at(-1)).toLocaleString('en-US', { timeZone: 'Asia/Ho_Chi_Minh' })}</p>}
    {result?.message && <p className="mt-2 text-sm">{result.message}</p>}
    {error && <p role="alert" className="mt-2 text-red-700">{error}</p>}
    {result?.code && <p className="mt-1 text-xs text-slate-500">{result.code}</p>}
    {result?.counts && <dl className="mt-3 grid grid-cols-2 gap-2">{Object.entries(result.counts).filter(([,v]) => typeof v === 'number').map(([k,v]) => <div key={k} className="rounded-lg bg-slate-50 p-3"><dt className="text-xs capitalize">{k.replace(/([A-Z])/g,' $1')}</dt><dd className="font-semibold">{Number(v).toLocaleString('en-US')}</dd></div>)}</dl>}
    {(result?.warnings || session.warnings).length > 0 && <ul className="mt-3 space-y-1 text-sm text-amber-800">{(result?.warnings || session.warnings).map((w: string, i: number) => <li key={i}>{w}</li>)}</ul>}
    {result?.posts?.length > 0 && <ul className="mt-4 divide-y">{result.posts.map((p: any, i: number) => <li key={p.id || i} className="py-3 text-sm"><a href={typeof p.post_url === 'string' && /^https?:\/\//.test(p.post_url) ? p.post_url : undefined} target="_blank" rel="noopener noreferrer" className="underline">{p.title || 'Open Post'}</a><p className="text-xs text-slate-500">{p.platform}</p></li>)}</ul>}
    {result?.data && session.kind === 'inspect' && <dl className="mt-4 space-y-2 text-sm">{['name','url','followers','avgViews','er'].map(k => <div key={k}><dt className="text-xs capitalize text-slate-500">{{name:'Name',url:'Profile URL',followers:'Followers',avgViews:'Average Views',er:'Engagement Rate (%)'}[k]}</dt><dd>{result.data[k] == null ? 'Unknown' : typeof result.data[k] === 'number' ? result.data[k].toLocaleString('en-US') : String(result.data[k])}</dd></div>)}</dl>}
    <div className="mt-5 flex flex-wrap gap-2">
      {session.kind === 'preview' && result?.success && !result?.pending && !error && isEditor && <button type="button" className={scoutButtonClass} onClick={onReview}>Review Profiles</button>}
      <Link className="rounded-lg border px-3 py-2 text-sm" href={destination}>Open {destination === '/trending' ? 'Posts' : destination === '/analytics/tracked' ? 'Analytics' : 'Directory'}</Link>
      {session.kind === 'inspect' && result?.data && <Link className="rounded-lg border px-3 py-2 text-sm" href={`/scout?intent=profiles&mode=link&type=${String(session.params.url || '').includes('/groups/') ? 'community' : 'kol'}&inspectSessionId=${session.id}&url=${encodeURIComponent(String(session.params.url || ''))}`}>Review in Add Form</Link>}
      {(session.status === 'failed' || result?.success===false) && isEditor && <button type="button" className="rounded-lg border px-3 py-2 text-sm" onClick={onRetry}>Retry with These Criteria</button>}
      {session.kind === 'kol-posts' && result?.success && result.posts?.length > 0 && !result?.pending && !error && <Link className="rounded-lg border px-3 py-2 text-sm" href={`/scout?kolId=${session.params.kolId}&section=audience`}>Collect Comments / Refresh Audit</Link>}
    </div>
  </ScoutDialogFrame>;
}
