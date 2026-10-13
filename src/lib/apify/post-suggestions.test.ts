import { beforeEach, describe, expect, it, vi } from 'vitest';
const state = vi.hoisted(() => ({ tables: {} as Record<string, any[]>, accounts: [] as any[], role: 'editor', rpcFailure: '', owner: '00000000-0000-4000-8000-000000000001', serial: 100 }));
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: () => ({
  from(table: string) {
    const filters: [string, any][] = []; let operation = 'read', value: any, bounds = [0, 100000]; let leaseFilter = false;
    const result = () => {
      const rows = state.tables[table] ||= [];
      const matched = rows.filter(row => filters.every(([key, expected]) => key === 'progress->>reviewRevision' ? (row.progress?.reviewRevision ?? null) === expected : row[key] === expected) && (!leaseFilter || !row.import_lease_until || Date.parse(row.import_lease_until) < Date.now()));
      if (operation === 'insert' || operation === 'upsert') { const inserted = { id: `00000000-0000-4000-8000-${String(state.serial++).padStart(12, '0')}`, ...structuredClone(value) }; rows.push(inserted); return { data: inserted, error: null }; }
      if (operation === 'update') matched.forEach(row => Object.assign(row, structuredClone(value)));
      return { data: matched.slice(bounds[0], bounds[1] + 1), error: null };
    };
    const q: any = { select: () => q, eq: (k: string, v: any) => { filters.push([k, v]); return q; }, is: (k: string, v: any) => { filters.push([k, v]); return q; }, order: () => q, limit: () => q, range: (from: number, to: number) => { bounds = [from, to]; return q; }, or: () => { leaseFilter = true; return q; }, insert: (v: any) => { value = v; operation = 'insert'; return q; }, upsert: (v: any) => { value = v; operation = 'upsert'; return q; }, update: (v: any) => { value = v; operation = 'update'; return q; },
      single: async () => { const r = result(); return { ...r, data: structuredClone(Array.isArray(r.data) ? r.data[0] : r.data) }; }, maybeSingle: async () => { const r = result(); return { ...r, data: structuredClone(Array.isArray(r.data) ? r.data[0] : r.data) }; }, then: (resolve: any, reject: any) => Promise.resolve(result()).then(resolve, reject) };
    return q;
  },
  rpc: async (_name: string, input: any) => {
    if (state.rpcFailure) return { data: null, error: new Error(state.rpcFailure) };
    const row = state.tables.scouted_posts.find(p => p.id === input.p_post);
    if (row.author_account && JSON.stringify(row.author_account) !== JSON.stringify(input.p_author_account)) return { data: null, error: new Error('POST_ACCOUNT_CONFLICT') };
    Object.assign(row, { author_account: input.p_author_account, ...(input.p_author_account?.entityType === 'kol' ? { kol_id: input.p_author_account.id } : {}) }); return { data: row, error: null };
  },
}) }));
vi.mock('./post-accounts', async () => ({ ...await vi.importActual<any>('./post-accounts'),loadPostAccounts: async () => [...state.accounts, ...(state.tables.kols || []).map(row => ({ entityType: 'kol', id: row.id, name: row.name, urls: [row.profile_url] })), ...(state.tables.communities || []).map(row => ({ entityType: 'community', id: row.id, name: row.name, urls: [row.group_url] }))], matchPostAuthor: (accounts: any[], platform: string, url: string) => { const matched = accounts.filter(a => a.urls.includes(url)); return matched.length === 1 ? { entityType: matched[0].entityType, id: matched[0].id } : undefined; } }));
vi.mock('./sessions', () => ({ scoutAccess: async () => { if (state.role !== 'editor') { const { ScoutError } = await import('./errors'); throw new ScoutError('Editor access required', 'FORBIDDEN', 403); } return state.owner; }, scoutReadAccess: async () => state.owner, scoutFailure: (e: any) => Response.json({ success: false, error: e.message, code: e.code }, { status: e.status || 400 }) }));
vi.mock('./providers', async () => ({ ...await vi.importActual<any>('./providers'), scrape: vi.fn() }));
import { NextRequest } from 'next/server';
import { createSuggestedAccountPreview, readSuggestedAccounts, relinkPostAuthor } from './post-suggestions';
import { POST, PATCH } from '@/app/api/sport-hub/scout/suggested-accounts/route';
import { POST as review } from '@/app/api/sport-hub/scout/review/route';
import { ingestSelectedCandidates } from './scout';
import { scrape } from './providers';
const url = 'https://tiktok.com/@runner', identity = `TikTok:${url}`;
const request = (body: any) => new NextRequest('http://localhost/api', { method: 'POST', body: JSON.stringify(body) });
beforeEach(() => {
  state.serial = 100; state.role = 'editor'; state.accounts = []; state.rpcFailure = ''; vi.mocked(scrape).mockReset();
  state.tables = { kols: [], communities: [], scout_feedback: [], scout_sessions: [], scouted_posts: [1, 2].map(n => ({ id: `00000000-0000-4000-8000-${String(n + 10).padStart(12, '0')}`, author: 'Nguyễn Văn A', platform: 'TikTok Video', author_identity: identity, author_profile_url: url, collection_sources: [{ kind: 'topic', keyword: 'Running' }] })) };
});
describe('saved-post account review and import', () => {
  it('opens a preview without provider work, keeps unknown metrics and original names', async () => {
    const value = await createSuggestedAccountPreview(state.owner, { identity, entityType: 'kol' });
    expect(value).toMatchObject({ providerStarts: 0, candidates: [{ name: 'Nguyễn Văn A', followers: null, verifiedGeography: 'Unknown', reviewState: 'Needs Review' }] });
    expect(value.candidates[0].provenance.postIds).toHaveLength(2); expect(scrape).not.toHaveBeenCalled();
  });
  it('rejects viewers and rejects a verification session belonging to another owner/profile', async () => {
    state.role = 'viewer'; expect((await POST(request({ identity, entityType: 'kol' }))).status).toBe(403); expect(state.tables.scout_sessions).toHaveLength(0);
    state.role = 'editor'; state.tables.scout_sessions.push({ id: state.owner, owner_id: 'other-owner', kind: 'inspect', status: 'complete', result: { success: true, data: { url, platform: 'TikTok' } } });
    await expect(createSuggestedAccountPreview(state.owner, { identity, entityType: 'kol', verificationSessionId: state.owner })).rejects.toMatchObject({ code: 'INVALID_VERIFICATION' });
    expect(scrape).not.toHaveBeenCalled();
  });
  it('edits invalidate approval and importing requires explicit review', async () => {
    const value = await createSuggestedAccountPreview(state.owner, { identity, entityType: 'kol' });
    const candidateId = value.candidates[0].candidateId;
    await expect(ingestSelectedCandidates({ sessionId: value.sessionId, actorId: state.owner, selected: [{ candidateId }] })).rejects.toMatchObject({ code: 'REVIEW_REQUIRED' });
    expect((await review(request({ sessionId: value.sessionId, candidateId, decision: 'approved', typeConfirmed: true, relevant: true, locationConfirmed: true }))).status).toBe(200);
    expect((await PATCH(request({ sessionId: value.sessionId, candidateId, name: 'Tên được sửa', geography: 'Hanoi' }))).status).toBe(200);
    const session = state.tables.scout_sessions[0]; expect(session.review_decisions[candidateId]).toBeUndefined(); expect(session.candidates[0].name).toBe('Tên được sửa');
    session.import_lease_until = new Date(Date.now() + 60000).toISOString();
    expect((await PATCH(request({ sessionId: value.sessionId, candidateId, name: 'Blocked' }))).status).toBe(409); expect(session.candidates[0].name).toBe('Tên được sửa');
  });
  it('imports an approved account and links existing topic posts without duplicating them', async () => {
    const value = await createSuggestedAccountPreview(state.owner, { identity, entityType: 'kol' });
    const candidateId = value.candidates[0].candidateId;
    await review(request({ sessionId: value.sessionId, candidateId, decision: 'approved', typeConfirmed: true, relevant: true, locationConfirmed: true }));
    const result = await ingestSelectedCandidates({ sessionId: value.sessionId, actorId: state.owner, selected: [{ candidateId }] });
    expect(result).toMatchObject({ success: true, insertedKols: 1, postLinkResults: [{ linked: 2 }] });
    expect(state.tables.kols[0]).toMatchObject({ name: 'Nguyễn Văn A', status: 'New Scout (Unverified)', geography: 'Unknown' });
    expect(state.tables.scouted_posts).toHaveLength(2); expect(await readSuggestedAccounts()).toEqual([]);
    expect(await relinkPostAuthor('kol', state.tables.kols[0].id)).toMatchObject({ linked: 0 }); expect(scrape).not.toHaveBeenCalled();
  });
  it('links to an account added after preview rather than adding another record', async () => {
    const value = await createSuggestedAccountPreview(state.owner, { identity, entityType: 'kol' });
    const candidateId = value.candidates[0].candidateId;
    await review(request({ sessionId: value.sessionId, candidateId, decision: 'approved', typeConfirmed: true, relevant: true, locationConfirmed: true }));
    state.tables.kols.push({ id: state.owner, profile_url: url, name: 'Existing', scout_missing_metrics: [], user_locked_fields: [] });
    expect(await ingestSelectedCandidates({ sessionId: value.sessionId, actorId: state.owner, selected: [{ candidateId }] })).toMatchObject({ insertedKols: 0, updatedKols: 1 });
    expect(state.tables.kols).toHaveLength(1); expect(state.tables.kols[0].name).toBe('Existing');
    expect(state.tables.scouted_posts.every(p => p.kol_id === state.owner)).toBe(true);
  });
  it('keeps successful import review state when linking fails and supports an independent retry', async () => {
    const value = await createSuggestedAccountPreview(state.owner, { identity, entityType: 'kol' }); const candidateId = value.candidates[0].candidateId;
    await review(request({ sessionId: value.sessionId, candidateId, decision: 'approved', typeConfirmed: true, relevant: true, locationConfirmed: true }));
    state.rpcFailure = 'Temporary database issue';
    const result = await ingestSelectedCandidates({ sessionId: value.sessionId, actorId: state.owner, selected: [{ candidateId }] });
    expect(result).toMatchObject({ success: true, partial: true, insertedKols: 1, postLinkResults: [{ success: false, retryable: true }] });
    expect(state.tables.scout_sessions[0].progress.importedCandidateIds).toContain(candidateId);
    state.rpcFailure = ''; expect(await relinkPostAuthor('kol', state.tables.kols[0].id)).toMatchObject({ linked: 2 }); expect(scrape).not.toHaveBeenCalled();
  });
});
