import { beforeEach, describe, expect, it, vi } from 'vitest';
const state = vi.hoisted(() => ({ tables: {} as Record<string, any[]>, failTable: '', owner: '00000000-0000-0000-0000-000000000001' }));
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: () => ({ from(table: string) {
  let filters: [string, any][] = [];let leaseFilter:((r:any)=>boolean)|null=null; let op = 'select'; let value: any;
  const result = () => {
    if (state.failTable === table && op !== 'select') return { data: null, error: new Error('Database write failed') };
    const rows = state.tables[table] ||= []; const matching = rows.filter(r => filters.every(([k,v]) => (k==='params' && typeof v==='string' ? JSON.stringify(r[k])===v : r[k] === v)) && (!leaseFilter || leaseFilter(r)));
    if (op === 'insert' || op === 'upsert') { const entry = { id: 'saved-' + rows.length, ...value }; rows.push(entry); return { data: entry, error: null }; }
    if (op === 'update') matching.forEach(r => Object.assign(r, value));
    return { data: matching, error: null };
  };
  const query: any = {or:(condition:string)=>{const field=condition.split('.')[0];leaseFilter=r=>!r[field] || Date.parse(r[field])<Date.now();return query;}, select: () => query, eq: (k: string,v: any) => { filters.push([k,v]); return query; }, limit: () => query, order: () => query,
    single: async () => { const r = result(); return { ...r, data: Array.isArray(r.data) ? r.data[0] : r.data }; }, maybeSingle: async () => { const r = result(); return { ...r, data: Array.isArray(r.data) ? r.data[0] : r.data }; },
    insert: (v: any) => { op = 'insert'; value = v; return query; }, upsert: (v: any) => { op = 'upsert'; value = v; return query; }, update: (v: any) => { op = 'update'; value = v; return query; },
    then: (resolve: any, reject: any) => Promise.resolve(result()).then(resolve,reject) };
  return query;
},rpc:async()=>({data:null,error:null}) }) }));
vi.mock('./providers', async () => { const actual = await vi.importActual<any>('./providers'); return { ...actual, scrape: vi.fn() }; });
import { ingestSelectedCandidates, previewDiscoveryCandidates, scoutMarketTrends, scoutSingleKolPosts } from './scout';
import { scrape } from './providers';
import badmintonSearch from './fixtures/facebook-badminton-search.json';
import { canonicalUrl } from './discovery-quality';
const candidate = { candidateId: 'c1', accountKey: 'Instagram:https://instagram.com/alex', platform: 'Instagram', username: 'alex', name: 'Alex', bio: 'Running coach Vietnam', url: 'https://instagram.com/alex', classification: 'Individual', relevant: true, locationMatch: true, verifiedGeography: 'Nationwide', reviewState: 'Matched', followers: 0, avgViews: null, er: null, avatarUrl: '', isExisting: false };
beforeEach(() => {
  state.tables = { scout_sessions: [{ id: 's', created_at:'2026-10-05T00:00:00Z', owner_id: state.owner, kind: 'preview', status: 'complete', params: { keyword: 'run', platform: 'Instagram', targetType: 'Individual KOLs', geography: 'Nationwide' }, candidates: [{ ...candidate }] }], kols: [], communities: [], scout_feedback: [], scouted_posts: [] }; state.failTable = ''; vi.mocked(scrape).mockReset();
});
describe('Server-owned preview and import', () => {
  it('returns five distinct badminton profiles, persists links, and imports the reviewed selection without collapsing accounts', async () => {
    vi.mocked(scrape).mockResolvedValue(badmintonSearch);
    const preview = await previewDiscoveryCandidates({ sessionId: 's', keyword: 'badminton', platform: 'Facebook', limit: 5 });
    expect(preview.candidates).toHaveLength(5);
    expect(preview.diagnostics.providerCount).toBe(15);
    expect(preview.partial).toBe(false);
    expect(new Set(preview.candidates.map(c => c.accountKey)).size).toBe(5);
    expect(state.tables.scout_sessions[0].candidates).toEqual(preview.candidates);
    const selected = preview.candidates.map(c => ({candidateId: c.candidateId, classification: 'Individual' as const, relevant: true, locationConfirmed: true}));
    state.tables.scout_sessions[0].params = preview.criteria;
    const imported = await ingestSelectedCandidates({ sessionId: 's', actorId: state.owner, selected });
    expect(imported.insertedKols).toBe(5);
    expect(state.tables.kols.map(k => k.profile_url)).toEqual(badmintonSearch.slice(0, 5).map(r => canonicalUrl(r.url)));
    expect((await ingestSelectedCandidates({ sessionId: 's', actorId: state.owner, selected })).updatedKols).toBe(5);
    expect(state.tables.kols).toHaveLength(5);
  });
  it('blocks an old search-page preview before any import or review write', async () => {
    Object.assign(state.tables.scout_sessions[0].candidates[0], { platform: 'Facebook', url: 'https://facebook.com/search/top', accountKey: 'Facebook:https://facebook.com/search/top' });
    await expect(ingestSelectedCandidates({sessionId: 's', actorId: state.owner, selected: [{candidateId: 'c1'}]})).rejects.toMatchObject({code: 'INVALID_PROFILE_URL'});
    expect(state.tables.kols).toHaveLength(0);
    expect(state.tables.scout_sessions[0].review_decisions).toBeUndefined();
  });
  it('reports a shortfall instead of promising five profiles', async () => {
    vi.mocked(scrape).mockResolvedValue(badmintonSearch.slice(0, 1));
    const preview = await previewDiscoveryCandidates({sessionId: 's', keyword: 'badminton', platform: 'Facebook', limit: 5});
    expect(preview.partial).toBe(true);
    expect(preview.warnings[0]).toContain('Only 1 of 5');
    expect(preview.diagnostics).toMatchObject({providerCount: 1, returnedCount: 1, requestedCount: 5});
  });
  it('blocks a concurrent import before CRM writes',async()=>{state.tables.scout_sessions[0].import_lease_until=new Date(Date.now()+120000).toISOString();await expect(ingestSelectedCandidates({sessionId:'s',actorId:state.owner,selected:[{candidateId:'c1'}]})).rejects.toMatchObject({code:'IMPORT_IN_PROGRESS'});expect(state.tables.kols).toHaveLength(0);});
  it('imports only server snapshot values and preserves zero', async () => { const result = await ingestSelectedCandidates({ sessionId: 's', actorId: state.owner, selected: [{ candidateId: 'c1', followers: 900000 } as any] }); expect(result.insertedKols).toBe(1); expect(state.tables.kols[0]).toMatchObject({ followers: 0, quotation: 0, status: 'New Scout (Unverified)' }); expect(state.tables.kols[0].scout_missing_metrics).toContain('avgViews'); });
  it('rejects IDs absent from the preview', async () => { await expect(ingestSelectedCandidates({ sessionId: 's', actorId: state.owner, selected: [{ candidateId: 'not-in-snapshot' }] })).rejects.toThrow('not in this preview'); expect(state.tables.kols).toHaveLength(0); });
  it('rejects a preview owned by another user', async () => { await expect(ingestSelectedCandidates({ sessionId: 's', actorId: 'other', selected: [{ candidateId: 'c1' }] })).rejects.toThrow(); expect(state.tables.kols).toHaveLength(0); });
  it('requires all three explicit Needs Review decisions', async () => { state.tables.scout_sessions[0].candidates[0].reviewState = 'Needs Review'; await expect(ingestSelectedCandidates({ sessionId: 's', actorId: state.owner, selected: [{ candidateId: 'c1', classification: 'Individual', relevant: true }] })).rejects.toThrow('Confirm'); });
  it('persists explicit review and then imports', async () => { state.tables.scout_sessions[0].candidates[0].reviewState = 'Needs Review'; await ingestSelectedCandidates({ sessionId: 's', actorId: state.owner, selected: [{ candidateId: 'c1', classification: 'Individual', relevant: true, locationConfirmed: true }] }); expect(state.tables.scout_sessions[0].review_decisions.c1.actorId).toBe(state.owner); });
  it('rejects a known wrong entity type', async () => { state.tables.scout_sessions[0].candidates[0].classification = 'Community'; await expect(ingestSelectedCandidates({ sessionId: 's', actorId: state.owner, selected: [{ candidateId: 'c1' }] })).rejects.toThrow('wrong entity'); });
  it('rejects a preview invalidated by newer team feedback', async () => { state.tables.scout_feedback = [{ account_key:candidate.accountKey, reason:'Not Relevant', context_key:'running|nationwide' }]; await expect(ingestSelectedCandidates({sessionId:'s',actorId:state.owner,selected:[{candidateId:'c1'}]})).rejects.toMatchObject({code:'PREVIEW_STALE'}); expect(state.tables.kols).toHaveLength(0); });
  it('rejects duplicate selections before writing', async () => { await expect(ingestSelectedCandidates({ sessionId: 's', actorId: state.owner, selected: [{ candidateId: 'c1' },{ candidateId: 'c1' }] })).rejects.toThrow('unique candidates'); });
  it('deduplicates previously stored www/trailing slash profile URLs', async () => { state.tables.kols = [{ id: 'existing', profile_url: 'https://www.instagram.com/alex/', scout_missing_metrics: [], user_locked_fields: [], bio: 'Original' }]; const result = await ingestSelectedCandidates({ sessionId: 's', actorId: state.owner, selected: [{ candidateId: 'c1' }] }); expect(result.updatedKols).toBe(1); expect(state.tables.kols).toHaveLength(1); expect(state.tables.kols[0].bio).toBe('Original'); });
  it('does not report a successful import after a failed DB write', async () => { state.failTable = 'kols'; await expect(ingestSelectedCandidates({ sessionId: 's', actorId: state.owner, selected: [{ candidateId: 'c1' }] })).rejects.toThrow('Database write failed'); });
});
describe('Feedback replay and trending posts', () => {
  const raw = { username: 'alex', fullName: 'Alex', biography: 'Running coach Vietnam', followersCount: 100 };
  it('replays negative feedback only in its exact query context', async () => { state.tables.scout_feedback = [{ account_key: candidate.accountKey, context_key: 'running|nationwide', reason: 'Not Relevant' }]; vi.mocked(scrape).mockResolvedValue([raw]); expect((await previewDiscoveryCandidates({ sessionId:'s', keyword:'run', platform:'Instagram' })).candidates).toHaveLength(0); expect((await previewDiscoveryCandidates({ sessionId:'s', keyword:'run', geography:'Hanoi', platform:'Instagram' })).candidates).toHaveLength(1); });
  it('uses team classification before the automatic classifier', async () => { state.tables.scout_feedback = [{ account_key: candidate.accountKey, classification:'Community', reason:'Wrong Entity Type' }]; vi.mocked(scrape).mockResolvedValue([raw]); expect((await previewDiscoveryCandidates({ sessionId:'s', keyword:'run', platform:'Instagram' })).candidates).toHaveLength(0); });
  it('saves matching hashtags, preserves multiple posts and deduplicates retries', async () => {
    vi.mocked(scrape).mockResolvedValue([{ url:'https://instagram.com/p/a', caption:'#run', ownerUsername:'alex',timestamp:new Date().toISOString(),location:'Vietnam', likesCount:0 },{ url:'https://instagram.com/p/b', caption:'#run', ownerUsername:'alex',timestamp:new Date().toISOString(),location:'Vietnam' },{ url:'https://instagram.com/p/no', caption:'#runner', ownerUsername:'alex',timestamp:new Date().toISOString(),location:'Vietnam' }]);
    const params = { keyword:'#run', searchMode:'hashtag' as const, sessionId:'s', platform:'Instagram' };
    expect((await scoutMarketTrends(params)).totalScouted).toBe(2); expect(state.tables.scouted_posts[0].likes).toBe(0); expect(state.tables.scouted_posts[0].scout_missing_metrics).toContain('views'); expect((await scoutMarketTrends(params)).totalScouted).toBe(0);
  });
  it('does not report successful posts on a failed DB insert', async () => { state.failTable='scouted_posts'; vi.mocked(scrape).mockResolvedValue([{ url:'https://instagram.com/p/a', caption:'#run',timestamp:new Date().toISOString(), location:'Vietnam' }]); await expect(scoutMarketTrends({ keyword:'#run', sessionId:'s', platform:'Instagram' })).rejects.toThrow('Database write failed'); });
});

describe('post collection outcomes',()=>{
 it('preserves a typed all-platform budget failure rather than success',async()=>{
  state.tables.kols=[{id:'k',name:'Runner',profile_url:'https://instagram.com/alex',sports:[]}];
  vi.mocked(scrape).mockRejectedValue(Object.assign(new Error('Scout budget exhausted.'),{code:'BUDGET_EXHAUSTED',status:409}));
  expect(await scoutSingleKolPosts('k',5,['Instagram'],'s')).toMatchObject({success:false,allFailed:true,partial:false,code:'BUDGET_EXHAUSTED',httpStatus:409,counts:{inserted:0,failed:1}});
 });
 it('keeps an observed empty dataset as successful zero results',async()=>{
  state.tables.kols=[{id:'k',name:'Runner',profile_url:'https://instagram.com/alex',sports:[]}];vi.mocked(scrape).mockResolvedValue([]);
  expect(await scoutSingleKolPosts('k',5,['Instagram'],'s')).toMatchObject({success:true,allFailed:false,partial:false,counts:{inserted:0,failed:0}});
 });
 it('reports topic collection failures with their provider error code',async()=>{
  vi.mocked(scrape).mockRejectedValue(Object.assign(new Error('Provider unavailable.'),{code:'PROVIDER_UNAVAILABLE',status:503}));
  expect(await scoutMarketTrends({keyword:'#run',platform:'Instagram',sessionId:'s'})).toMatchObject({success:false,allFailed:true,code:'PROVIDER_UNAVAILABLE',httpStatus:503});
 });
});
