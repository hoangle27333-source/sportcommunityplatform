'use client';
import { useEffect, useState } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { Users, FileSearch, RefreshCw, Flame, Layers, Plus } from 'lucide-react';
import { useCurrentUser } from '@/lib/auth/auth-context';
import type { ScoutContext, ScoutIntent, ScoutSessionSummary } from '@/lib/apify/scout-workspace';
import { PlatformHeader } from './platform-header';
import { ScoutActivity } from './scout-activity';
import { ScoutTaskLauncher, ScoutSessionResults, type ScoutSubject } from './scout-task-launcher';
import { AudienceAuditSection } from './audience-audit-panel';
import { ScoutDialogFrame, scoutInputClass } from './scout-dialog-frame';
import { AccountPostScoutModal } from './account-post-scout-modal';
import type { KOL, Community } from './types';

export function ScoutWorkspace() {
  const { isEditor, loading } = useCurrentUser();
  const query = useSearchParams();
  const router = useRouter();

  const [kols, setKols] = useState<KOL[]>([]);
  const [communities, setCommunities] = useState<Community[]>([]);
  const [tracked, setTracked] = useState<ScoutSubject[]>([]);
  const [dataError, setDataError] = useState('');
  const [context, setContext] = useState<ScoutContext | null>(null);
  const [session, setSession] = useState<ScoutSessionSummary | null>(null);
  const [reviewId, setReviewId] = useState<string>();
  const [criteria, setCriteria] = useState<Record<string, any>>();
  const [entityTypes, setEntityTypes] = useState<Record<ScoutIntent, 'kol' | 'community' | 'tracked'>>({
    profiles: 'kol',
    content: 'kol',
    refresh: 'kol',
  });
  const [resultNavigation, setResultNavigation] = useState(0);
  const [audience, setAudience] = useState<string>();
  const [sessionError, setSessionError] = useState('');
  const [subjectsLoading, setSubjectsLoading] = useState(true);

  const [accountResumeId, setAccountResumeId] = useState<string>();
  // Dedicated Account Posts Modal State
  const [isAccountPostsModalOpen, setIsAccountPostsModalOpen] = useState(false);
  const [preselectedAccount, setPreselectedAccount] = useState<{
    entityType: 'kol' | 'community';
    id: string;
  } | undefined>();

  async function loadSubjects() {
    setSubjectsLoading(true);
    try {
      const dataResponse = await fetch('/api/sport-hub/data');
      const data = await dataResponse.json();
      if (!dataResponse.ok || !data.success) throw new Error(data.error || 'Unable to load saved profiles.');
      setKols(data.kols || []);
      setCommunities(data.communities || []);
      setDataError('');
    } catch (e: any) {
      setDataError(e.message || 'Unable to load saved profiles.');
    } finally {
      setSubjectsLoading(false);
    }
    try {
      const trackedResponse = await fetch('/api/tracked-accounts');
      if (trackedResponse.ok) {
        const accounts = await trackedResponse.json();
        setTracked(
          (accounts.accounts || []).map((a: any) => ({
            id: a.id,
            name: a.display_name || a.username || a.profile_url,
            profileUrl: a.profile_url,
          }))
        );
      }
    } catch {
      // Non-fatal if tracked accounts cannot be loaded
    }
  }

  useEffect(() => {
    void loadSubjects();
  }, []);

  function openSessionDirect(s: ScoutSessionSummary) {
    if (s.kind === 'account-posts') { setAccountResumeId(s.id); setIsAccountPostsModalOpen(true); setSession(null); return; }
    if (s.kind === 'preview' && s.status === 'complete') {
      const p = s.params || {};
      setCriteria(p);
      setReviewId(s.id);
      setContext({
        intent: 'profiles',
        mode: 'search',
        entityType:
          p.communityId || p.entityType === 'community' || p.targetType === 'Communities & Clubs'
            ? 'community'
            : 'kol',
        ids: (p.ids || [p.kolId || p.communityId || p.trackedAccountId].filter(Boolean)) as string[],
        url: p.url as string | undefined,
        source: '/scout',
      });
      setSession(null);
    } else {
      setSession(s);
    }
  }

  useEffect(() => {
    dismiss();
    const id = query.get('sessionId');
    if (id) {
      let cancelled = false;
      fetch(`/api/sport-hub/scout/sessions?sessionId=${encodeURIComponent(id)}`)
        .then(async response => {
          const value = await response.json();
          if (!response.ok || !value.success || !value.sessions[0])
            throw new Error(value.error || 'Task not found.');
          if (!cancelled) openSessionDirect(value.sessions[0]);
        })
        .catch(e => {
          if (!cancelled) setSessionError(e.message);
        });
      return () => {
        cancelled = true;
      };
    }
    const intent = query.get('intent');
    const type = query.get('type');
    const mode = query.get('mode');
    if (['profiles', 'content', 'refresh'].includes(intent || '')) {
      const entityType =
        type === 'community' || (!type && query.get('url')?.includes('/groups/'))
          ? 'community'
          : type === 'tracked'
          ? 'tracked'
          : 'kol';
      const ids = query.get('ids')?.split(',').filter(Boolean);

      // If single account entity content was requested, preselect in dedicated flow or legacy flow
      if (intent === 'content' && mode === 'entity' && ids?.length === 1 && entityType !== 'tracked') {
        setPreselectedAccount({ entityType, id: ids[0] });
        setIsAccountPostsModalOpen(true);
      } else {
        setReviewId(query.get('inspectSessionId') || undefined);
        setContext({
          intent: intent as ScoutIntent,
          mode: ['entity', 'link'].includes(mode || '') ? (mode as 'entity' | 'link') : 'search',
          entityType,
          ids,
          url: query.get('url') || undefined,
          source: '/scout',
        });
      }
    }
    if (query.get('section') === 'audience' && query.get('kolId')) setAudience(query.get('kolId')!);
  }, [query, resultNavigation]);

  function dismiss() {
    setContext(null);
    setSession(null);
    setReviewId(undefined);
    setCriteria(undefined);
    setAudience(undefined);
    setSessionError('');
    setIsAccountPostsModalOpen(false);
    setAccountResumeId(undefined);
    setPreselectedAccount(undefined);
  }

  function navigate(href: string) {
    dismiss();
    const target = new URL(href, 'http://scout.local').searchParams.get('sessionId');
    if (target && target === query.get('sessionId')) setResultNavigation(value => value + 1);
  }

  function close() {
    dismiss();
    router.replace('/scout', { scroll: false });
  }

  function launch(intent: ScoutIntent, mode: ScoutContext['mode']) {
    dismiss();
    setContext({ intent, mode, entityType: entityTypes[intent], source: '/scout' });
  }

  const subjects =
    (context?.entityType || 'kol') === 'community'
      ? communities
      : (context?.entityType || 'kol') === 'tracked'
      ? tracked
      : kols;

  function retryOrReview(review: boolean) {
    if (!session) return;
    const p = session.params;
    setCriteria(p);
    setReviewId(review ? session.id : undefined);
    const kind = session.kind;
    const nextContext: ScoutContext = {
      intent:
        kind === 'preview' || kind === 'inspect'
          ? 'profiles'
          : ['trends', 'kol-posts', 'community-posts'].includes(kind)
          ? 'content'
          : 'refresh',
      mode:
        kind === 'inspect'
          ? 'link'
          : ['kol-posts', 'community-posts', 'sync', 'tracked'].includes(kind)
          ? 'entity'
          : 'search',
      entityType:
        p.communityId || p.entityType === 'community' || p.targetType === 'Communities & Clubs'
          ? 'community'
          : kind === 'tracked'
          ? 'tracked'
          : 'kol',
      ids: (p.ids || [p.kolId || p.communityId || p.trackedAccountId].filter(Boolean)) as string[],
      url: p.url as string | undefined,
      source: '/scout',
    };
    if (kind === 'comments') {
      setAudience(String(p.kolId));
      setSession(null);
      return;
    }
    setContext(nextContext);
    setSession(null);
  }

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900">
      <PlatformHeader />
      <main className="mx-auto max-w-7xl space-y-6 px-4 py-8 sm:px-6 pb-32">
        <div>
          <h1 className="text-2xl font-bold">Scout</h1>
          <p className="mt-1 text-sm text-slate-600">
            Find profiles, scout account posts, discover trending content, and refresh data. Follow every task in Activity.
          </p>
        </div>

        {!loading && !isEditor && (
          <p className="rounded-xl border bg-white p-4 text-sm">
            Editor access is required to start or import tasks. Your existing activity remains available.
          </p>
        )}

        {/* 4 Separate Entry Point Cards */}
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          {/* Card 1: Find Profiles */}
          <section className="rounded-2xl border bg-white p-5 flex flex-col justify-between">
            <div>
              <Users className="mb-3 h-6 w-6 text-indigo-600" />
              <h2 className="font-bold text-sm">Find Profiles</h2>
              <p className="my-2 text-xs text-slate-600">
                Find KOLs and communities, or add a profile from a direct social link.
              </p>
              <label className="mt-3 block text-xs">
                Profile type
                <select
                  value={entityTypes.profiles}
                  onChange={e =>
                    setEntityTypes(prev => ({ ...prev, profiles: e.target.value as 'kol' | 'community' }))
                  }
                  className={`${scoutInputClass} mt-1`}
                >
                  <option value="kol">KOLs & Creators</option>
                  <option value="community">Communities & Clubs</option>
                </select>
              </label>
            </div>
            <div className="mt-4 flex flex-wrap gap-2 pt-2 border-t border-slate-100">
              <button
                type="button"
                disabled={loading || !isEditor}
                onClick={() => launch('profiles', 'search')}
                className="rounded-lg bg-indigo-600 px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-50 cursor-pointer"
              >
                Search Profiles
              </button>
              <button
                type="button"
                disabled={loading || !isEditor}
                onClick={() => launch('profiles', 'link')}
                className="rounded-lg border px-3 py-1.5 text-xs font-semibold disabled:opacity-50 cursor-pointer hover:bg-slate-50"
              >
                Add from Link
              </button>
            </div>
          </section>

          {/* Card 2: Scout Account Posts */}
          <section className="rounded-2xl border bg-white p-5 flex flex-col justify-between">
            <div>
              <Layers className="mb-3 h-6 w-6 text-violet-600" />
              <h2 className="font-bold text-sm">Scout Account Posts</h2>
              <p className="my-2 text-xs text-slate-600">
                Collect latest or top posts from saved creators or communities across selected channels.
              </p>
            </div>
            <div className="mt-4 flex flex-wrap gap-2 pt-2 border-t border-slate-100">
              <button
                type="button"
                disabled={loading || !isEditor}
                onClick={() => {
                  setPreselectedAccount(undefined);
                  setIsAccountPostsModalOpen(true);
                }}
                className="rounded-lg bg-gradient-to-r from-violet-600 to-indigo-600 text-white px-3 py-1.5 text-xs font-semibold shadow-xs disabled:opacity-50 cursor-pointer hover:from-violet-500 hover:to-indigo-500"
              >
                Scout Account Posts
              </button>
              <button
                type="button"
                disabled={loading || !isEditor}
                onClick={() => launch('content', 'entity')}
                className="rounded-lg border px-3 py-1.5 text-xs font-semibold disabled:opacity-50 cursor-pointer hover:bg-slate-50"
              >
                Single Account
              </button>
            </div>
          </section>

          {/* Card 3: Scout Trending Posts */}
          <section className="rounded-2xl border bg-white p-5 flex flex-col justify-between">
            <div>
              <Flame className="mb-3 h-6 w-6 text-rose-600" />
              <h2 className="font-bold text-sm">Scout Trending Posts</h2>
              <p className="my-2 text-xs text-slate-600">
                Discover viral sports posts & reels by topic, keyword, or hashtag, or add a post link.
              </p>
            </div>
            <div className="mt-4 flex flex-wrap gap-2 pt-2 border-t border-slate-100">
              <button
                type="button"
                disabled={loading || !isEditor}
                onClick={() => launch('content', 'search')}
                className="rounded-lg bg-gradient-to-r from-rose-600 to-amber-600 text-white px-3 py-1.5 text-xs font-semibold shadow-xs disabled:opacity-50 cursor-pointer hover:from-rose-500 hover:to-amber-500"
              >
                Find Top Posts
              </button>
              <button
                type="button"
                disabled={loading || !isEditor}
                onClick={() => launch('content', 'link')}
                className="rounded-lg border px-3 py-1.5 text-xs font-semibold disabled:opacity-50 cursor-pointer hover:bg-slate-50"
              >
                Add Post Link
              </button>
            </div>
          </section>

          {/* Card 4: Refresh Data */}
          <section className="rounded-2xl border bg-white p-5 flex flex-col justify-between">
            <div>
              <RefreshCw className="mb-3 h-6 w-6 text-emerald-600" />
              <h2 className="font-bold text-sm">Refresh Data</h2>
              <p className="my-2 text-xs text-slate-600">
                Refresh observed metrics for saved KOLs, communities and tracked accounts.
              </p>
              <label className="mt-3 block text-xs">
                Saved account type
                <select
                  value={entityTypes.refresh}
                  onChange={e =>
                    setEntityTypes(prev => ({
                      ...prev,
                      refresh: e.target.value as 'kol' | 'community' | 'tracked',
                    }))
                  }
                  className={`${scoutInputClass} mt-1`}
                >
                  <option value="kol">KOLs & Creators</option>
                  <option value="community">Communities & Clubs</option>
                  <option value="tracked">Tracked Accounts</option>
                </select>
              </label>
            </div>
            <div className="mt-4 flex flex-wrap gap-2 pt-2 border-t border-slate-100">
              <button
                type="button"
                disabled={loading || !isEditor}
                onClick={() => launch('refresh', 'entity')}
                className="rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-50 cursor-pointer hover:bg-emerald-500"
              >
                Choose Accounts
              </button>
            </div>
          </section>
        </div>

        {dataError && (
          <p role="alert" className="text-sm text-red-700">
            {dataError}{' '}
            <button type="button" onClick={loadSubjects} className="underline">
              Reload Profiles
            </button>
          </p>
        )}
        {sessionError && <p role="alert" className="text-sm text-red-700">{sessionError}</p>}

        <ScoutActivity
          onOpen={s => {
            dismiss();
            openSessionDirect(s);
            router.replace(`/scout?sessionId=${s.id}`, { scroll: false });
          }}
        />

        {/* Dedicated Account Posts Scout Modal */}
        {isAccountPostsModalOpen && (
          <AccountPostScoutModal
            isOpen={isAccountPostsModalOpen}
            onClose={() => {
              setIsAccountPostsModalOpen(false);
              setAccountResumeId(undefined);
              router.replace('/scout', { scroll: false });
              setPreselectedAccount(undefined);
            }}
            key={accountResumeId || preselectedAccount?.id || 'new-account-scout'}
            resumeSessionId={accountResumeId}
            preselectedAccount={preselectedAccount}
            onSuccess={loadSubjects}
            source="/scout"
          />
        )}

        {context && (
          <ScoutTaskLauncher
            key={`${context.intent}:${context.mode}:${context.entityType}:${reviewId || criteria?.keyword || ''}:${context.ids?.join(',') || ''}:${context.url || ''}`}
            context={context}
            subjects={subjects}
            loadingSubjects={subjectsLoading}
            onEntityTypeChange={type => {
              setEntityTypes(prev => ({ ...prev, [context.intent]: type }));
              setContext(prev => (prev ? { ...prev, entityType: type, ids: undefined } : null));
            }}
            entity={
              context.intent === 'content' && context.ids?.length === 1
                ? (subjects.find(s => s.id === context.ids?.[0]) as KOL | Community)
                : undefined
            }
            initialCriteria={criteria}
            resumeSessionId={reviewId}
            onClose={close}
            onNavigate={navigate}
            onSuccess={loadSubjects}
          />
        )}

        {session && (
          <ScoutSessionResults
            key={session.id}
            session={session}
            onClose={close}
            onReview={() => retryOrReview(true)}
            onRetry={() => retryOrReview(false)}
          />
        )}

        {audience && (
          <ScoutDialogFrame title="Audience Evidence" onClose={close} wide>
            <AudienceAuditSection
              endpoint={`/api/sport-hub/kol/${audience}/audience-audit`}
              subjectName={kols.find(k => k.id === audience)?.name || 'Saved Profile'}
              emptyMessage="Collect posts, then collect a bounded comment sample before refreshing the audit."
            />
          </ScoutDialogFrame>
        )}
      </main>
    </div>
  );
}
