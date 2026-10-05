'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useCurrentUser } from '@/lib/auth/auth-context';
import type { ScoutSessionSummary } from '@/lib/apify/scout-workspace';
import { scoutInputClass } from './scout-dialog-frame';

export function useScoutActivity(page = 1, status = '', pageSize = 20) {
  const { user, loading } = useCurrentUser();
  const generation = useRef(0);
  const [sessions, setSessions] = useState<ScoutSessionSummary[]>([]);
  const [error, setError] = useState(''); const [hasMore, setHasMore] = useState(false);
  const [busy, setBusy] = useState(true);
  const [runtimeReady, setRuntimeReady] = useState(true);
  const read = useCallback(async () => {
    const requestId = ++generation.current;
    if (!user) { setSessions([]); setBusy(false); return; }
    try {
      const response = await fetch(`/api/sport-hub/scout/sessions?page=${page}&pageSize=${pageSize}${status ? `&status=${status}` : ''}`, { cache: 'no-store' });
      const data = await response.json(); if (!response.ok || !data.success) throw new Error(data.error || 'Unable to load activity.');
      if (requestId !== generation.current) return;
      setRuntimeReady(data.runtimeReady !== false); setSessions(data.sessions); setHasMore(data.hasMore); setError('');
    } catch (e: any) { if (requestId === generation.current) setError(e.message); } finally { if (requestId === generation.current) setBusy(false); }
  }, [user?.id, page, status, pageSize]);
  useEffect(() => { if (loading) return; setBusy(true); void read(); const timer = setInterval(read, 10000);
    window.addEventListener('scout-progress', read); window.addEventListener('scout-finished', read);
    return () => { generation.current++; clearInterval(timer); window.removeEventListener('scout-progress', read); window.removeEventListener('scout-finished', read); };
  }, [read, loading]);
  return { sessions, error, hasMore, busy: busy || loading, runtimeReady, read };
}
export function sessionStatus(session: ScoutSessionSummary) {
  if (session.status === 'pending') return 'Queued';
  if (session.status === 'running') return 'Running';
  if (session.status === 'failed') return 'Failed';
  return session.partial ? 'Completed with Warnings' : session.empty ? 'No Results' : 'Complete';
}
export function ScoutActivity({ onOpen }: { onOpen: (session: ScoutSessionSummary) => void }) {
  const [page, setPage] = useState(1); const [status, setStatus] = useState('');
  const { sessions, error, hasMore, busy, runtimeReady, read } = useScoutActivity(page, status);
  return <section id="activity" className="rounded-2xl border border-slate-200 bg-white p-5">
    <div className="flex flex-wrap items-center justify-between gap-3"><div><h2 className="text-lg font-bold">Activity</h2><p className="text-sm text-slate-500">Your running tasks, saved results and profiles awaiting review.</p></div>
      <div className="flex gap-2"><label className="sr-only" htmlFor="scout-status">Filter task status</label><select id="scout-status" value={status} onChange={e => { setStatus(e.target.value); setPage(1); }} className={scoutInputClass}><option value="">All statuses</option><option value="pending">Queued</option><option value="running">Running</option><option value="complete">Complete</option><option value="failed">Failed</option></select><button type="button" onClick={read} className="rounded-lg border px-3 text-sm">Refresh</button></div>
    </div>
    {!runtimeReady && <p role="status" className="mt-4 text-sm text-amber-800">Existing sessions are available. New provider collections require the Scout runtime upgrade.</p>}
    {error && <p role="alert" className="mt-4 text-sm text-red-700">{error}</p>}
    {busy && <p role="status" className="mt-4 text-sm text-slate-500">Loading Activity…</p>}
    {!busy && !error && !sessions.length && <p className="mt-6 text-sm text-slate-500">No Scout tasks found. Start with one of the three actions above.</p>}
    <ul className="mt-4 divide-y">{sessions.map(session => <li key={session.id} className="flex flex-col items-start justify-between gap-3 py-4 sm:flex-row sm:items-center">
      <div className="min-w-0 w-full sm:flex-1"><p className="text-sm font-semibold">{session.title}</p><p className="break-words text-sm text-slate-600">{session.subject}</p><p className="mt-1 text-xs text-slate-500">{Object.entries(session.counts).map(([name,count]) => `${count.toLocaleString("en-US")} ${name.replace(/([A-Z])/g," $1").toLowerCase()}`).join(" · ")}</p>{session.warnings.length > 0 && <p className="mt-1 text-xs text-amber-800">{session.warnings[0]}</p>}<p className="mt-1 text-xs text-slate-400">{new Date(session.createdAt).toLocaleString('en-US', { timeZone: 'Asia/Ho_Chi_Minh' })}</p></div>
      <div className="flex flex-wrap items-center gap-2"><span className="rounded-full bg-slate-100 px-2 py-1 text-xs">{sessionStatus(session)}</span>{session.reviewState === 'needs-review' && <span className="rounded-full bg-amber-50 px-2 py-1 text-xs text-amber-800">{session.remainingCandidates} Need Review</span>}
        <button type="button" onClick={() => onOpen(session)} className="rounded-lg border border-indigo-200 px-3 py-2 text-sm font-semibold text-indigo-700">View Results</button></div>
    </li>)}</ul>
    <div className="mt-4 flex items-center justify-end gap-3 text-sm"><button type="button" disabled={page === 1} onClick={() => setPage(p => p - 1)} className="rounded-lg border px-3 py-2 disabled:opacity-40">Previous</button><span>Page {page}</span><button type="button" disabled={!hasMore} onClick={() => setPage(p => p + 1)} className="rounded-lg border px-3 py-2 disabled:opacity-40">Next</button></div>
  </section>;
}
export function ScoutProgressPanel() {
  const pathname = usePathname();
  const { sessions, error } = useScoutActivity(1, '', 50);
  const [expanded, setExpanded] = useState(false);
  const [dismissed, setDismissed] = useState('');
  const active = sessions.filter(s => s.status === 'pending' || s.status === 'running' || s.reviewState === 'needs-review');
  const signature = active.map(s => `${s.id}:${s.status}:${s.remainingCandidates}`).join(',');
  if (pathname === "/scout" || !active.length || signature === dismissed || error) return null;
  return <aside aria-label="Scout task progress" className="fixed bottom-3 left-3 z-40 w-80 max-w-[calc(100vw-1.5rem)] rounded-xl border bg-white p-3 shadow-lg text-xs">
    <div className="flex justify-between gap-3"><Link href="/scout#activity" className="font-semibold">Scout Activity</Link><button type="button" onClick={() => setDismissed(signature)} aria-label="Dismiss task progress">Dismiss</button></div>
    <button type="button" onClick={() => setExpanded(v => !v)} aria-expanded={expanded} className="mt-2 underline sm:hidden">{expanded ? "Hide Tasks" : `${active.length} Active / Review Tasks`}</button>
    <div className={expanded ? "" : "hidden sm:block"}>
    {active.slice(0, 5).map(s => <div key={s.id} className="mt-3"><p className="font-semibold">{s.title} · {sessionStatus(s)}</p><p className="truncate text-slate-500">{s.subject}</p><Link href={`/scout?sessionId=${s.id}`} className="mt-1 inline-block text-indigo-700 underline">View Results{s.reviewState === 'needs-review' ? ' · Needs Review' : ''}</Link></div>)}
    {active.length > 5 && <Link href="/scout#activity" className="mt-3 block text-indigo-700 underline">View All Tasks in Activity</Link>}
    </div>
  </aside>;
}
