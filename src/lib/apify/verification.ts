/** Paid contract gates must prove identity and reconciled cost, not just item counts. */
export function profileIdentity(value: string): string | null {
  try {
    const url = new URL(value);
    const host = url.hostname.toLowerCase().replace(/^(www\.|m\.)/, '');
    const path = url.pathname.replace(/\/+$/, '').toLowerCase();
    return `${host}${path}${path === '/profile.php' ? `?id=${url.searchParams.get('id') || ''}` : ''}`;
  } catch { return null; }
}

export function verificationGate({ count, requestedProfiles = [], observedProfiles = [], runs }: {
  count: number;
  requestedProfiles?: string[];
  observedProfiles?: string[];
  runs: Array<{ provider_run_id?: string | null; build_id?: string | null; actual_usd?: number | null; reserved_usd?: number; warnings?: string[] | null }>;
}): { verified: boolean; reasons: string[] } {
  const reasons: string[] = [];
  if (count < 1) reasons.push('No valid output observed.');
  const observed = new Set(observedProfiles.map(profileIdentity).filter(Boolean));
  const requested = requestedProfiles.map(profileIdentity);
  if (requested.some(identity => !identity || !observed.has(identity))) reasons.push('Requested profile identities are missing from output.');
  if (!runs.length) reasons.push('No provider run receipt.');
  for (const run of runs) {
    if (!run.provider_run_id || !run.build_id) reasons.push('Run/build provenance is incomplete.');
    if (run.warnings?.length) reasons.push('Provider output is partial.');
    if (typeof run.actual_usd !== 'number' || !Number.isFinite(run.actual_usd) || run.actual_usd < 0) reasons.push('Actual cost is unresolved.');
    else if (typeof run.reserved_usd !== 'number' || run.actual_usd > run.reserved_usd + 0.000001) reasons.push('Actual cost exceeds the reserved cap.');
  }
  return { verified: reasons.length === 0, reasons: [...new Set(reasons)] };
}
