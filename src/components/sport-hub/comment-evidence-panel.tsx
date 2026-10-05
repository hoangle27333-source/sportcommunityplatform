'use client';
import { useState } from 'react';
import { scoutFetch } from '@/lib/apify/scout-client';
import { useCurrentUser } from '@/lib/auth/auth-context';
import { useScoutCapabilities } from './use-scout-capabilities';

export function CommentEvidencePanel({ endpoint }: { endpoint: string }) {
  const [preview, setPreview] = useState<any>(null); const [selected, setSelected] = useState<string[]>([]);
  const [busy, setBusy] = useState(false); const [message, setMessage] = useState(''); const [error, setError] = useState('');
  const { isEditor } = useCurrentUser(); const { availability } = useScoutCapabilities('comments');
  if (!/\/kol\/[^/]+\/audience-audit$/.test(endpoint)) return null;
  const url = endpoint.replace('/audience-audit', '/comment-evidence');
  const platform = (post: any) => post.platform.includes('Instagram') ? 'Instagram' : post.platform.includes('TikTok') ? 'TikTok' : 'Facebook';
  const selectable = (preview?.posts || []).filter((post: any) => availability(platform(post)).available);
  async function run(start = false) {
    setBusy(true); setMessage(''); setError('');
    try {
      const options = { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(start ? { action: 'start', selectedPostIds: selected } : { action: 'preview' }) };
      const response = start ? await scoutFetch(url, options) : await fetch(url, options);
      const data = await response.json(); if (!response.ok || !data.success) throw new Error(data.error || 'Comment collection failed.');
      if (start) { setMessage(`${data.message || 'Collection completed.'}${data.partial ? ' Some posts could not be collected.' : ''} Run Refresh Audit to analyze the stored evidence.`); setPreview(null); }
      else { setPreview(data); setSelected([]); }
    } catch (e: any) { setError(e.message); } finally { setBusy(false); }
  }
  return <div className="rounded-xl border p-3 text-xs space-y-3 text-left">
    <button type="button" disabled={busy || !isEditor} onClick={() => run()} className="rounded-lg border px-3 py-2 font-semibold disabled:opacity-50">{busy ? 'Collecting Evidence…' : 'Collect Comments'}</button>
    {preview && <div className="space-y-3"><p>Choose up to 5 posts · up to 20 comments per post · {preview.cachedPosts} posts cached · maximum ${preview.budgetCeilingUsd.toFixed(2)}</p>
      {!preview.posts.length && <p>Collect posts with observed comments before starting comment collection.</p>}
      <ul className="space-y-2">{preview.posts.map((post: any) => { const cap = availability(platform(post)); return <li key={post.id}><label className="flex items-start gap-2"><input type="checkbox" checked={selected.includes(post.id)} disabled={busy || !cap.available} onChange={e => setSelected(prev => e.target.checked ? [...prev, post.id] : prev.filter(id => id !== post.id))} /><span>{post.title || post.post_url}{!cap.available && <span className="block text-amber-800">{cap.reason}</span>}</span></label></li>; })}</ul>
      <button type="button" disabled={busy || !selected.length || !selectable.length} onClick={() => run(true)} className="rounded-lg bg-slate-900 text-white px-3 py-2 disabled:opacity-50">Start Collection ({selected.length} Posts)</button>
    </div>}
    {message && <p role="status">{message}</p>}{error && <p role="alert" className="text-red-700">{error} <a href="/scout" className="underline">Open Activity</a></p>}
    <p className="text-slate-500">Evidence is a bounded sample of public comments. Collection and Refresh Audit are separate actions.</p>
  </div>;
}
