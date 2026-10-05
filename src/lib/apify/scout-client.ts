type Pending = { sessionId: string; criteria: string; url: string };
const prefix = 'sport-hub:scout-session:';
/** Compatibility for form drafts only. Server history is the source of truth. */
export function pendingScout(url: string): Pending | null {
  try {
    for (let i = localStorage.length - 1; i >= 0; i--) {
      const key = localStorage.key(i);
      if (!key?.startsWith(prefix)) continue;
      const item = JSON.parse(localStorage.getItem(key) || 'null');
      if (item?.url === url) return item;
    }
  } catch { /* Storage is optional. */ }
  return null;
}
function persist(pending: Pending | null, id: string) {
  try { if (pending) localStorage.setItem(prefix + id, JSON.stringify(pending)); else localStorage.removeItem(prefix + id); }
  catch { /* Server sessions survive disabled browser storage. */ }
}
export async function scoutFetch(url: string, init: RequestInit = {}) {
  const criteria = typeof init.body === 'string' ? init.body : '';
  const body = criteria ? JSON.parse(criteria) : {};
  // Resuming is a read. A new submission always means an explicit new task.
  const response = body.action === 'resume'
    ? await fetch(`/api/sport-hub/scout?sessionId=${encodeURIComponent(body.sessionId)}`)
    : await fetch(url, init);
  let result = await response.json();
  if (!response.ok) throw new Error(result.error || 'Scout failed');
  const sessionId = result.sessionId;
  const deadline = Date.now() + 8 * 60 * 1000;
  let polls = 0;
  while (result.pending) {
    persist({ sessionId, criteria, url }, sessionId);
    window.dispatchEvent(new CustomEvent('scout-progress', { detail: { url, ...result } }));
    if (Date.now() > deadline) throw new Error('This task is still running. Open Scout Activity to view its progress and results.');
    await new Promise(resolve => setTimeout(resolve, Math.min(30000, 5000 * (++polls))));
    const poll = await fetch(`/api/sport-hub/scout?sessionId=${encodeURIComponent(sessionId)}`);
    result = await poll.json();
    if (!poll.ok) {
      persist(null, sessionId);
      window.dispatchEvent(new CustomEvent('scout-finished', { detail: { sessionId, success: false } }));
      throw new Error(result.error || 'Scout failed');
    }
  }
  if (sessionId) {
    persist(null, sessionId);
    window.dispatchEvent(new CustomEvent('scout-finished', { detail: { ...result, sessionId } }));
  }
  return { ok: true, json: async () => result };
}
