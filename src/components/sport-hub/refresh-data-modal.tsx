'use client';
import { useState } from 'react';
import { scoutFetch } from '@/lib/apify/scout-client';
import { connectedPlatforms, taskRequest, type ScoutContext } from '@/lib/apify/scout-workspace';
import { ScoutDialogFrame, scoutButtonClass } from './scout-dialog-frame';
import { useScoutCapabilities } from './use-scout-capabilities';

export function RefreshDataModal({ context, entities, onClose, onSuccess }: {
  context: ScoutContext; entities: { id: string; name: string; channels?: { url?: string; isPrimary?: boolean }[]; profileUrl?: string; groupUrl?: string }[];
  onClose: () => void; onSuccess: (result: any) => void;
}) {
  const { capabilities, loading, error: capabilityError } = useScoutCapabilities('sync');
  const [busy, setBusy] = useState(false); const [error, setError] = useState('');
  const checks = entities.map(entity => {
    const url = entity.channels?.find(c => c.isPrimary)?.url || entity.profileUrl || entity.groupUrl || entity.channels?.[0]?.url;
    const platform = connectedPlatforms({ profileUrl: url })[0];
    const group = url?.includes('/groups/');
    const capability = platform && capabilities?.[platform]?.[group ? 'group-sync' : 'sync'];
    return { entity, available: !!capability?.available, reason: capability?.reason || capabilityError || (loading ? 'Checking provider availability…' : 'Add a supported primary channel before refreshing this account.') };
  });
  const ready = checks.filter(c => c.available);
  async function start() {
    setBusy(true); setError('');
    try {
      if (context.entityType === 'tracked') {
        const results = []; const warnings: string[] = [];
        for (const { entity } of ready) {
          try {
          const request = taskRequest({ ...context, ids: [entity.id] }, {});
          const response = await scoutFetch(request.url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(request.body) });
          const result = await response.json(); if (!result.success) throw new Error(result.error || result.message || 'Account refresh failed.'); results.push(result);
          } catch (failure: any) { warnings.push(`${entity.name}: ${failure.message || 'Refresh failed.'} Open Activity to check this task before retrying.`); }
        }
        if (!results.length) throw new Error(warnings.join(' '));
        onSuccess({ success: true, partial: !!warnings.length || ready.length !== entities.length, warnings, message: `Refreshed ${results.length} of ${entities.length} accounts.`, counts: { refreshed: results.length, failed: warnings.length, skipped: entities.length - ready.length }, sessionId: results.at(-1)?.sessionId });
      } else {
        const request = taskRequest({ ...context, ids: ready.map(c => c.entity.id) }, {});
        const response = await scoutFetch(request.url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(request.body) });
        const result = await response.json(); if (!result.success) throw new Error(result.error || result.message || 'Data refresh failed.'); onSuccess(result);
      }
    } catch (e: any) { setError(e.message); } finally { setBusy(false); }
  }
  return <ScoutDialogFrame title="Refresh Data" onClose={onClose} description="Refresh observed metrics from the primary connected channel. Locked fields remain protected.">
    <ul className="space-y-2">{checks.map(({ entity, available, reason }) => <li key={entity.id} className="rounded-lg border p-3 text-sm"><strong>{entity.name}</strong>{!available && <p className="mt-1 text-xs text-amber-800">{reason}</p>}</li>)}</ul>
    <p className="my-4 text-sm text-slate-600">{ready.length} of {entities.length} accounts can be refreshed. Missing observations keep the existing values. Profile changes may require review.</p>
    {ready.length > 50 && <p role="alert" className="mb-3 text-sm text-amber-800">Choose up to 50 accounts per refresh.</p>}
    {error && <p role="alert" className="mb-3 text-sm text-red-700">{error} <a href="/scout" className="underline">Open Activity</a></p>}
    <button type="button" disabled={busy || !ready.length || ready.length > 50 || loading} onClick={start} className={scoutButtonClass}>{busy ? 'Refreshing…' : `Refresh ${ready.length} ${ready.length === 1 ? 'Account' : 'Accounts'}`}</button>
  </ScoutDialogFrame>;
}
