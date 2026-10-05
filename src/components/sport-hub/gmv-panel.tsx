'use client';
import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { formatNumber } from '@/lib/i18n';
export function GMVPanel({ kolId, isAdmin }: { kolId: string; isAdmin: boolean }) {
  const [records, setRecords] = useState<any[]>([]); const [error, setError] = useState(''); const [saving, setSaving] = useState(false);
  const [month, setMonth] = useState(''); const [amount, setAmount] = useState(''); const [source, setSource] = useState(''); const [notes, setNotes] = useState('');
  async function load() { const response = await fetch(`/api/sport-hub/kol/${kolId}/gmv`); const data = await response.json(); if (!response.ok) throw new Error(data.error); setRecords(data.records); setError(''); }
  useEffect(() => { setRecords([]); setMonth(''); setAmount(''); setSource(''); setNotes(''); if (isAdmin) load().catch(e => setError(e.message)); }, [kolId, isAdmin]);
  async function save(e: React.FormEvent) { e.preventDefault(); setSaving(true); try {
    const res = await fetch(`/api/sport-hub/kol/${kolId}/gmv`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ month, amount: Number(amount), source, notes }) });
    const result = await res.json(); if (!res.ok) throw new Error(result.error); await load(); toast.success('GMV saved'); window.dispatchEvent(new Event('sport-hub-data-changed'));
  } catch (e: any) { toast.error(e.message); } finally { setSaving(false); } }
  return <section className="rounded-2xl border border-slate-200 p-4 space-y-3"><h4 className="font-bold">GMV (VND)</h4>{!isAdmin ? <p>Admin Only</p> : <>
    <p className="text-xs text-slate-500">Monthly reported gross merchandise value. Each creator displays their latest reported month.</p>
    {error && <p role="alert" className="text-red-700">{error}</p>}
    <form onSubmit={save} className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
      <label>GMV Month<input required type="month" value={month} onChange={e => setMonth(e.target.value)} className="block w-full border rounded p-2" /></label>
      <label>GMV (VND)<input required type="number" min="0" step="0.01" value={amount} onChange={e => setAmount(e.target.value)} className="block w-full border rounded p-2" /></label>
      <label>GMV Source<input required value={source} onChange={e => setSource(e.target.value)} className="block w-full border rounded p-2" /></label>
      <label>Notes<input value={notes} onChange={e => setNotes(e.target.value)} className="block w-full border rounded p-2" /></label>
      <button disabled={saving} className="rounded bg-indigo-600 text-white p-2">{saving ? 'Saving…' : 'Save Monthly GMV'}</button>
    </form>
    {records.length ? <ul className="space-y-2">{records.map(r => <li key={r.id} className="flex flex-wrap justify-between gap-2 border-t pt-2 text-xs"><span>{r.month} · {formatNumber(Number(r.amount))} VND · {r.source}</span><button type="button" onClick={() => { setMonth(r.month); setAmount(String(r.amount)); setSource(r.source); setNotes(r.notes); }} className="text-indigo-700">Edit</button></li>)}</ul> : <p className="text-sm text-slate-500">No GMV recorded.</p>}
  </>}</section>;
}
