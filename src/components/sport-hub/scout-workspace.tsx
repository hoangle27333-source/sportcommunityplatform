'use client';
import { useEffect, useState } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { Users, FileSearch, RefreshCw } from 'lucide-react';
import { useCurrentUser } from '@/lib/auth/auth-context';
import type { ScoutContext, ScoutIntent, ScoutSessionSummary } from '@/lib/apify/scout-workspace';
import { PlatformHeader } from './platform-header';
import { ScoutActivity } from './scout-activity';
import { ScoutTaskLauncher, ScoutSessionResults, type ScoutSubject } from './scout-task-launcher';
import { AudienceAuditSection } from './audience-audit-panel';
import { ScoutDialogFrame, scoutInputClass } from './scout-dialog-frame';
import type { KOL, Community } from './types';

export function ScoutWorkspace() {
  const { isEditor, loading } = useCurrentUser(); const query = useSearchParams(); const router = useRouter();
  const [kols, setKols] = useState<KOL[]>([]); const [communities, setCommunities] = useState<Community[]>([]); const [tracked, setTracked] = useState<ScoutSubject[]>([]);
  const [dataError, setDataError] = useState(''); const [context, setContext] = useState<ScoutContext | null>(null);
  const [session, setSession] = useState<ScoutSessionSummary | null>(null); const [reviewId, setReviewId] = useState<string>();
  const [criteria, setCriteria] = useState<Record<string, any>>();
  const [entityTypes,setEntityTypes]=useState<Record<ScoutIntent,'kol'|'community'|'tracked'>>({profiles:'kol',content:'kol',refresh:'kol'});
  const [resultNavigation, setResultNavigation] = useState(0);
  const [audience, setAudience] = useState<string>(); const [sessionError, setSessionError] = useState('');
  async function loadSubjects() {
    try {
      const [dataResponse, trackedResponse] = await Promise.all([fetch('/api/sport-hub/data'), fetch('/api/tracked-accounts')]);
      const data = await dataResponse.json(); if (!dataResponse.ok || !data.success) throw new Error(data.error || 'Unable to load saved profiles.');
      setKols(data.kols || []); setCommunities(data.communities || []);
      const accounts = await trackedResponse.json(); if (!trackedResponse.ok) throw new Error(accounts.error || 'Unable to load tracked accounts.');
      setTracked((accounts.accounts || []).map((a: any) => ({ id: a.id, name: a.display_name || a.username || a.profile_url, profileUrl: a.profile_url })));
      setDataError('');
    } catch (e: any) { setDataError(e.message); }
  }
  useEffect(() => { void loadSubjects(); }, []);
  useEffect(() => {
    dismiss();
    const id = query.get('sessionId');
    if (id) {
      let cancelled = false;
      fetch(`/api/sport-hub/scout/sessions?sessionId=${encodeURIComponent(id)}`).then(async response => {
        const value = await response.json(); if (!response.ok || !value.success || !value.sessions[0]) throw new Error(value.error || 'Task not found.');
        if (!cancelled) setSession(value.sessions[0]);
      }).catch(e => { if (!cancelled) setSessionError(e.message); });
      return () => { cancelled = true; };
    }
    const intent = query.get('intent'); const type = query.get('type'); const mode = query.get('mode');
    if (['profiles','content','refresh'].includes(intent || '')) {
      setReviewId(query.get("inspectSessionId") || undefined);
      setContext({ intent: intent as ScoutIntent, mode: ['entity','link'].includes(mode || '') ? mode as 'entity' | 'link' : 'search', entityType: type === 'community' || (!type && query.get('url')?.includes('/groups/')) ? 'community' : type === 'tracked' ? 'tracked' : 'kol', ids: query.get('ids')?.split(',').filter(Boolean), url: query.get('url') || undefined, source: '/scout' });
    }
    if (query.get('section') === 'audience' && query.get('kolId')) setAudience(query.get('kolId')!);
  }, [query, resultNavigation]);
  function dismiss() { setContext(null); setSession(null); setReviewId(undefined); setCriteria(undefined); setAudience(undefined); setSessionError(''); }
  function navigate(href: string) {
    dismiss();
    const target = new URL(href, 'http://scout.local').searchParams.get('sessionId');
    // Review/import can finish while the URL still points to this same session.
    if (target && target === query.get('sessionId')) setResultNavigation(value => value + 1);
  }
  function close() { dismiss(); router.replace('/scout', { scroll: false }); }
  function launch(intent: ScoutIntent, mode: ScoutContext['mode']) { dismiss(); setContext({ intent, mode, entityType: entityTypes[intent], source: '/scout' }); }
  const subjects = (context?.entityType || 'kol') === 'community' ? communities : (context?.entityType || 'kol') === 'tracked' ? tracked : kols;
  function retryOrReview(review: boolean) {
    if (!session) return;
    const p = session.params; setCriteria(p); setReviewId(review ? session.id : undefined);
    const kind = session.kind;
    const nextContext: ScoutContext = {
      intent: kind === 'preview' || kind === 'inspect' ? 'profiles' : ['trends','kol-posts','community-posts'].includes(kind) ? 'content' : 'refresh',
      mode: kind === 'inspect' ? 'link' : ['kol-posts','community-posts','sync','tracked'].includes(kind) ? 'entity' : 'search',
      entityType: p.communityId || p.entityType === 'community' || p.targetType === 'Communities & Clubs' ? 'community' : kind === 'tracked' ? 'tracked' : 'kol',
      ids: (p.ids || [p.kolId || p.communityId || p.trackedAccountId].filter(Boolean)) as string[], url: p.url as string | undefined, source: '/scout',
    };
    if (kind === 'comments') { setAudience(String(p.kolId)); setSession(null); return; }
    setContext(nextContext); setSession(null);
  }
  return <div className="min-h-screen bg-slate-50 text-slate-900"><PlatformHeader /><main className="mx-auto max-w-7xl space-y-6 px-4 py-8 sm:px-6 pb-32">
    <div><h1 className="text-2xl font-bold">Scout</h1><p className="mt-1 text-sm text-slate-600">Find profiles, collect content and refresh data. Follow every task in Activity.</p></div>
    {!loading && !isEditor && <p className="rounded-xl border bg-white p-4 text-sm">Editor access is required to start or import tasks. Your existing activity remains available.</p>}
    <div className="grid gap-4 md:grid-cols-3">{[
      { intent: 'profiles' as const, title: 'Find Profiles', description: 'Find KOLs and communities, or add a profile from a link.', icon: Users, primary: 'Search Profiles', secondary: 'Add from Link' },
      { intent: 'content' as const, title: 'Collect Content', description: 'Find posts by topic, collect a saved profile’s posts, or add a post link.', icon: FileSearch, primary: 'Find Content', secondary: 'Add Post Link' },
      { intent: 'refresh' as const, title: 'Refresh Data', description: 'Refresh observed metrics for saved KOLs, communities and tracked accounts.', icon: RefreshCw, primary: 'Choose Accounts', secondary: '' },
    ].map(card => <section key={card.intent} className="rounded-2xl border bg-white p-5"><card.icon className="mb-3 h-6 w-6 text-indigo-600" /><h2 className="font-bold">{card.title}</h2><p className="my-2 text-sm text-slate-600">{card.description}</p>
      <label className="mt-4 block text-xs">{card.intent === 'profiles' ? 'Profile type' : 'Saved account type'}<select value={entityTypes[card.intent]} onChange={e => setEntityTypes(previous=>({...previous,[card.intent]:e.target.value as 'kol'|'community'|'tracked'}))} className={`${scoutInputClass} mt-1`}><option value="kol">KOLs & Creators</option><option value="community">Communities & Clubs</option>{card.intent === 'refresh' && <option value="tracked">Tracked Accounts</option>}</select></label>
      <div className="mt-4 flex flex-wrap gap-2"><button type="button" disabled={loading || !isEditor} onClick={() => launch(card.intent, card.intent === 'refresh' ? 'entity' : 'search')} className="rounded-lg bg-indigo-600 px-3 py-2 text-sm font-semibold text-white disabled:opacity-50">{card.primary}</button>
        {card.intent === 'content' && <button type="button" disabled={loading || !isEditor} onClick={() => launch('content','entity')} className="rounded-lg border px-3 py-2 text-sm disabled:opacity-50">Collect Posts</button>}
        {card.secondary && <button type="button" disabled={loading || !isEditor} onClick={() => launch(card.intent,'link')} className="rounded-lg border px-3 py-2 text-sm disabled:opacity-50">{card.secondary}</button>}</div>
    </section>)}</div>
    {dataError && <p role="alert" className="text-sm text-red-700">{dataError} <button type="button" onClick={loadSubjects} className="underline">Reload Profiles</button></p>}
    {sessionError && <p role="alert" className="text-sm text-red-700">{sessionError}</p>}
    <ScoutActivity onOpen={s => { dismiss(); setSession(s); router.replace(`/scout?sessionId=${s.id}`, { scroll: false }); }} />
    {context && <ScoutTaskLauncher key={`${context.intent}:${context.mode}:${context.entityType}:${reviewId || criteria?.keyword || ''}:${context.ids?.join(',') || ''}:${context.url || ''}`} context={context} subjects={subjects} entity={context.intent === 'content' && context.ids?.length === 1 ? subjects.find(s => s.id === context.ids?.[0]) as KOL | Community : undefined} initialCriteria={criteria} resumeSessionId={reviewId} onClose={close} onNavigate={navigate} onSuccess={loadSubjects} />}
    {session && <ScoutSessionResults key={session.id} session={session} onClose={close} onReview={() => retryOrReview(true)} onRetry={() => retryOrReview(false)} />}
    {audience && <ScoutDialogFrame title="Audience Evidence" onClose={close} wide><AudienceAuditSection endpoint={`/api/sport-hub/kol/${audience}/audience-audit`} subjectName={kols.find(k => k.id === audience)?.name || 'Saved Profile'} emptyMessage="Collect posts, then collect a bounded comment sample before refreshing the audit." /></ScoutDialogFrame>}
  </main></div>;
}
