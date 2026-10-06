/** Explain skipped provider items without exposing arbitrary provider error text. */
export function providerItemWarning(platform: string, item: {error?: unknown; username?: unknown}) {
  const handle = typeof item.username === 'string' && /^[\w.]{1,80}$/.test(item.username) ? ` (@${item.username})` : '';
  const reason = item.error === 'not_found' ? 'the provider reports that it no longer exists' : item.error === 'private' ? 'the provider reports that it is private' : 'the provider could not access it';
  return `${platform}: One item${handle} was skipped because ${reason}. Other available results are retained for review.`;
}
export function explainSavedProviderWarnings(warnings: string[], runs: {platform?: string; raw_rows?: any[]; warnings?: string[]}[]) {
  if (!warnings.includes('Provider item unavailable')) return [...new Set(warnings)];
  const details = runs.flatMap(run => (run.raw_rows || []).filter(item => item.error && item.error !== 'no_items').map(item => providerItemWarning(run.platform || 'Provider', item)));
  return [...new Set(warnings.flatMap(warning => warning === 'Provider item unavailable' ? details.length ? details : ['Some provider items could not be accessed. Other available results are retained for review.'] : [warning]))];
}
