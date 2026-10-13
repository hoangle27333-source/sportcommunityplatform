import { beforeEach, describe, expect, it, vi } from 'vitest';
const state = vi.hoisted(() => ({ tables: {} as Record<string, any[]>, failTable: '', owner: '00000000-0000-0000-0000-000000000001', beforeClaim:null as null|(()=>void) }));
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: () => ({ from(table: string) {
  let filters: [string, any][] = [];let leaseFilter:((r:any)=>boolean)|null=null; let op = 'select'; let value: any;
  const result = () => {
    if (state.failTable === table && op !== 'select') return { data: null, error: new Error('Database write failed') };
    if(table==='scout_sessions' && op==='update' && value?.import_token && state.beforeClaim){const fn=state.beforeClaim;state.beforeClaim=null;fn();}
    const rows = state.tables[table] ||= []; const matching = rows.filter(r => filters.every(([k,v]) => (k==='params' && typeof v==='string' ? JSON.stringify(r[k])===v : (k==='progress->>reviewRevision' ? (r.progress?.reviewRevision ?? null)===v : r[k]===v))) && (!leaseFilter || leaseFilter(r)));
    if (op === 'insert' || op === 'upsert') { const entry = { id: 'saved-' + rows.length, ...value }; rows.push(entry); return { data: entry, error: null }; }
    if (op === 'update') matching.forEach(r => Object.assign(r, value));
    return { data: matching, error: null };
  };
  const query: any = {or:(condition:string)=>{const field=condition.split('.')[0];leaseFilter=r=>!r[field] || Date.parse(r[field])<Date.now();return query;}, select: () => query, is:(k:string,v:any)=>{filters.push([k,v]);return query;}, eq: (k: string,v: any) => { if(table==='scout_sessions' && k==='updated_at')throw new Error('column scout_sessions.updated_at does not exist'); filters.push([k,v]); return query; }, limit: () => query, order: () => query,
    single: async () => { const r = result(); return { ...r, data: structuredClone(Array.isArray(r.data) ? r.data[0] : r.data) }; }, maybeSingle: async () => { const r = result(); return { ...r, data: Array.isArray(r.data) ? r.data[0] : r.data }; },
    insert: (v: any) => { op = 'insert'; value = v; return query; }, upsert: (v: any) => { op = 'upsert'; value = v; return query; }, update: (v: any) => { if(table==='scout_sessions' && 'updated_at' in v)throw new Error('column scout_sessions.updated_at does not exist'); op = 'update'; value = v; return query; },
    then: (resolve: any, reject: any) => Promise.resolve(result()).then(resolve,reject) };
  return query;
},rpc:async()=>({data:null,error:null}) }) }));
vi.mock('./providers', async () => { const actual = await vi.importActual<any>('./providers'); return { ...actual, scrape: vi.fn() }; });
import { compareDiscoveryMetrics, ingestSelectedCandidates, previewDiscoveryCandidates, scoutMarketTrends, scoutSingleKolPosts, scoutLatestCommunityPosts } from './scout';
import { scrape,parseProfile } from './providers';
import { NextRequest } from 'next/server';
import { POST as saveAttributes } from '@/app/api/sport-hub/scout/attributes/route';
import { POST as saveReview } from '@/app/api/sport-hub/scout/review/route';
import { contextKey } from './discovery-quality';
vi.mock('@/lib/apify/sessions',()=>({scoutAccess:async()=>state.owner,scoutFailure:(e:any)=>Response.json({success:false,error:e.message,code:e.code},{status:e.status || 400})}));
import badmintonSearch from './fixtures/facebook-badminton-search.json';
import { canonicalUrl } from './discovery-quality';
const candidate = { candidateId: 'c1', accountKey: 'Instagram:https://instagram.com/alex', platform: 'Instagram', username: 'alex', name: 'Alex', bio: 'Running coach Vietnam', url: 'https://instagram.com/alex', classification: 'Individual', relevant: true, locationMatch: true, verifiedGeography: 'Nationwide', reviewState: 'Matched', followers: 0, avgViews: null, er: null, avatarUrl: '', isExisting: false };
beforeEach(() => {
  state.beforeClaim=null;
  state.tables = { scout_sessions: [{ id: 's', created_at:'2026-10-05T00:00:00Z', owner_id: state.owner, kind: 'preview', status: 'complete', params: { keyword: 'run', platform: 'Instagram', targetType: 'Individual KOLs', geography: 'Nationwide' }, candidates: [{ ...candidate }] }], kols: [], communities: [], scout_feedback: [], scouted_posts: [] }; state.failTable = ''; vi.mocked(scrape).mockReset();
});
describe('Server-owned preview and import', () => {
  it('persists follower criteria and assessment groups from a profile preview',async()=>{
    vi.mocked(scrape).mockResolvedValue([
      {url:'https://instagram.com/alex',username:'alex',name:'Alex',bio:'Running athlete',category:'Athlete',followers:1000},
      {url:'https://instagram.com/below',username:'below',name:'Below',bio:'Running athlete',category:'Athlete',followers:999},
      {url:'https://instagram.com/unknown',username:'unknown',name:'Unknown',bio:'Running athlete',category:'Athlete'},
    ]);
    const result=await previewDiscoveryCandidates({sessionId:'s',keyword:'Running',platform:'Instagram',geography:'Nationwide',minFollowers:1000,limit:1});
    expect(result.criteria.minFollowers).toBe(1000);
    expect(result.groups?.qualified.map(c=>c.username)).toEqual(['alex']);
    expect(result.groups?.excluded.map(c=>c.username)).toEqual(['below']);
    expect(result.groups?.needsVerification.map(c=>c.username)).toEqual(['unknown']);
    expect(state.tables.scout_sessions[0].candidates).toEqual(result.candidates);
  });
  it('blocks insufficient or unknown followers even with a saved approval',async()=>{
    const session=state.tables.scout_sessions[0];session.params.minFollowers=1000;
    session.review_decisions={c1:{decision:'approved',classification:'Individual',relevant:true,locationConfirmed:true}};
    for(const followers of [999,null]){
      session.candidates[0].followers=followers;
      await expect(ingestSelectedCandidates({sessionId:'s',actorId:state.owner,selected:[{candidateId:'c1'}]})).rejects.toMatchObject({code:'FOLLOWER_THRESHOLD_REQUIRED'});
      expect(state.tables.kols).toHaveLength(0);
    }
  });
  it('returns every eligible badminton profile above the minimum and imports only the reviewed selection', async () => {
    vi.mocked(scrape).mockResolvedValue(badmintonSearch);
    const preview = await previewDiscoveryCandidates({ sessionId: 's', keyword: 'badminton', platform: 'Facebook', limit: 5 });
    expect(preview.candidates.length).toBeGreaterThan(5);
    expect(preview.diagnostics.providerCount).toBe(15);
    expect(preview.partial).toBe(true);
    expect(preview.warnings.join(" ")).toContain("Followers were unavailable");
    expect(new Set(preview.candidates.map(c => c.accountKey)).size).toBe(preview.candidates.length);
    expect(state.tables.scout_sessions[0].candidates).toEqual(preview.candidates);
    const selected = preview.candidates.slice(0, 5).map(c => ({candidateId: c.candidateId, classification: 'Individual' as const, relevant: true, locationConfirmed: true}));
    state.tables.scout_sessions[0].params = preview.criteria;
    state.tables.scout_sessions[0].review_decisions=Object.fromEntries(selected.map(c=>[c.candidateId,{...c,decision:'approved'}]));
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
    expect(preview.warnings.join(' ')).toContain('0/5 qualified new accounts');
    expect(preview.diagnostics).toMatchObject({providerCount: 1, returnedCount: 1, requestedCount: 5});
  });
  it('blocks a concurrent import before CRM writes',async()=>{state.tables.scout_sessions[0].import_lease_until=new Date(Date.now()+120000).toISOString();await expect(ingestSelectedCandidates({sessionId:'s',actorId:state.owner,selected:[{candidateId:'c1'}]})).rejects.toMatchObject({code:'IMPORT_IN_PROGRESS'});expect(state.tables.kols).toHaveLength(0);});
  it('imports only server snapshot values and preserves zero', async () => { state.tables.scout_sessions[0].review_decisions={c1:{decision:'approved'}}; const result = await ingestSelectedCandidates({ sessionId: 's', actorId: state.owner, selected: [{ candidateId: 'c1', followers: 900000 } as any] }); expect(result.insertedKols).toBe(1); expect(state.tables.kols[0]).toMatchObject({ followers: 0, quotation: 0, status: 'New Scout (Unverified)' }); expect(state.tables.kols[0].scout_missing_metrics).toContain('avgViews'); });
  it('blocks importing a rejected profile even with explicit confirmation', async () => {
    state.tables.scout_sessions[0].review_decisions = { c1: { decision: 'rejected' } };
    await expect(ingestSelectedCandidates({sessionId:'s', actorId:state.owner, selected:[{candidateId:'c1',classification:'Individual',relevant:true,locationConfirmed:true}]})).rejects.toMatchObject({code:'REVIEW_REQUIRED'});
    expect(state.tables.kols).toHaveLength(0);
  });
  it('blocks a stale tab from importing approval returned to pending', async () => {
    state.tables.scout_sessions[0].review_decisions = { c1: { decision: 'pending' } };
    await expect(ingestSelectedCandidates({sessionId:'s', actorId:state.owner, selected:[{candidateId:'c1',classification:'Individual',relevant:true,locationConfirmed:true}]})).rejects.toMatchObject({code:'REVIEW_REQUIRED'});
    expect(state.tables.kols).toHaveLength(0);
  });
  it('uses persisted approval when resuming a Needs Review import', async () => {
    state.tables.scout_sessions[0].candidates[0].reviewState = 'Needs Review';
    state.tables.scout_sessions[0].review_decisions = { c1: { decision:'approved',classification:'Individual',relevant:true,locationConfirmed:true } };
    expect((await ingestSelectedCandidates({sessionId:'s',actorId:state.owner,selected:[{candidateId:'c1'}]})).insertedKols).toBe(1);
    expect(state.tables.scout_sessions[0].review_decisions.c1.decision).toBe('approved');
  });
  it('rejects IDs absent from the preview', async () => { await expect(ingestSelectedCandidates({ sessionId: 's', actorId: state.owner, selected: [{ candidateId: 'not-in-snapshot' }] })).rejects.toThrow('not in this preview'); expect(state.tables.kols).toHaveLength(0); });
  it('rejects a preview owned by another user', async () => { await expect(ingestSelectedCandidates({ sessionId: 's', actorId: 'other', selected: [{ candidateId: 'c1' }] })).rejects.toThrow(); expect(state.tables.kols).toHaveLength(0); });
  it('requires all three explicit Needs Review decisions', async () => { state.tables.scout_sessions[0].candidates[0].reviewState = 'Needs Review'; await expect(ingestSelectedCandidates({ sessionId: 's', actorId: state.owner, selected: [{ candidateId: 'c1', classification: 'Individual', relevant: true }] })).rejects.toThrow('Confirm'); });
  it('persists explicit review and then imports', async () => { state.tables.scout_sessions[0].review_decisions={c1:{decision:'approved',classification:'Individual',relevant:true,locationConfirmed:true}}; state.tables.scout_sessions[0].candidates[0].reviewState = 'Needs Review'; await ingestSelectedCandidates({ sessionId: 's', actorId: state.owner, selected: [{ candidateId: 'c1', classification: 'Individual', relevant: true, locationConfirmed: true }] }); expect(state.tables.scout_sessions[0].review_decisions.c1.actorId).toBe(state.owner); });
  it('rejects a known wrong entity type', async () => { state.tables.scout_sessions[0].candidates[0].classification = 'Community'; await expect(ingestSelectedCandidates({ sessionId: 's', actorId: state.owner, selected: [{ candidateId: 'c1' }] })).rejects.toThrow('wrong entity'); });
  it('rejects a preview invalidated by newer team feedback', async () => { state.tables.scout_feedback = [{ account_key:candidate.accountKey, reason:'Not Relevant', context_key:'running|nationwide' }]; await expect(ingestSelectedCandidates({sessionId:'s',actorId:state.owner,selected:[{candidateId:'c1'}]})).rejects.toMatchObject({code:'PREVIEW_STALE'}); expect(state.tables.kols).toHaveLength(0); });
  it('rejects duplicate selections before writing', async () => { await expect(ingestSelectedCandidates({ sessionId: 's', actorId: state.owner, selected: [{ candidateId: 'c1' },{ candidateId: 'c1' }] })).rejects.toThrow('unique candidates'); });
  it('deduplicates previously stored www/trailing slash profile URLs', async () => { state.tables.scout_sessions[0].review_decisions={c1:{decision:'approved'}}; state.tables.kols = [{ id: 'existing', profile_url: 'https://www.instagram.com/alex/', scout_missing_metrics: [], user_locked_fields: [], bio: 'Original' }]; const result = await ingestSelectedCandidates({ sessionId: 's', actorId: state.owner, selected: [{ candidateId: 'c1' }] }); expect(result.updatedKols).toBe(1); expect(state.tables.kols).toHaveLength(1); expect(state.tables.kols[0].bio).toBe('Original'); });
  it('does not report a successful import after a failed DB write', async () => { state.tables.scout_sessions[0].review_decisions={c1:{decision:'approved'}}; state.failTable = 'kols'; await expect(ingestSelectedCandidates({ sessionId: 's', actorId: state.owner, selected: [{ candidateId: 'c1' }] })).rejects.toThrow('Database write failed'); });
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

describe('Multi-platform discovery ranking', () => {
  const profile = (username: string, followersCount?: number) => ({username, fullName: username, biography: 'Running coach Vietnam', followersCount});
  it('returns all platforms including unknown metrics above the minimum and persists the ranked preview', async () => {
    vi.mocked(scrape).mockImplementation(async (_id, platform) => platform === 'Instagram' ? [profile('low', 10), profile('unknown'), profile('high', 90000)] : [{url:'https://facebook.com/runner',name:'Runner',description:'Running coach Vietnam',followersCount:50000}]);
    const result = await previewDiscoveryCandidates({sessionId:'s',keyword:'running',platform:['Instagram','Facebook'],limit:2});
    expect(result.candidates.map(c => c.followers)).toEqual([90000,50000,10,null]);
    expect(result.criteria.platform).toEqual(['Instagram','Facebook']);
    expect(state.tables.scout_sessions[0].candidates).toEqual(result.candidates);
    expect(vi.mocked(scrape).mock.calls.map(c=>c[4])).toEqual([6,6]);
  });
  it('keeps observed zero above unknown and uses views then ER as tie breakers', () => {
    const measurements = [{followers:null,avgViews:99999,er:99},{followers:0,avgViews:null,er:null},{followers:100,avgViews:5,er:9},{followers:100,avgViews:20,er:1},{followers:100,avgViews:20,er:2}];
    expect(measurements.sort(compareDiscoveryMetrics)).toEqual([{followers:100,avgViews:20,er:2},{followers:100,avgViews:20,er:1},{followers:100,avgViews:5,er:9},{followers:0,avgViews:null,er:null},{followers:null,avgViews:99999,er:99}]);
  });
  it('keeps a successful platform when another fails and identifies the failed platform', async () => {
    vi.mocked(scrape).mockImplementation(async (_id, platform) => {if(platform==='Facebook')throw Object.assign(new Error('Unavailable'),{code:'PROVIDER_UNAVAILABLE',status:503});return [profile('runner',100)];});
    const result = await previewDiscoveryCandidates({sessionId:'s',keyword:'running',platform:['Instagram','Facebook'],limit:1});
    expect(result.candidates).toHaveLength(1);expect(result.partial).toBe(true);expect(result.failed[0]).toMatchObject({platform:'Facebook',code:'PROVIDER_UNAVAILABLE'});
  });
  it('does not disguise all-platform failure as an empty successful preview', async () => {
    vi.mocked(scrape).mockRejectedValue(Object.assign(new Error('Budget exhausted'),{code:'TIKTOK_RUN_BUDGET_EXHAUSTED',status:429}));
    await expect(previewDiscoveryCandidates({sessionId:'s',keyword:'running',platform:['Instagram','Facebook']})).rejects.toMatchObject({code:'TIKTOK_RUN_BUDGET_EXHAUSTED',status:429});
  });
  it('returns all communities above the minimum ordered by member counts', async () => {
    vi.stubEnv('APIFY_FACEBOOK_GROUP_SEARCH_VERIFIED','true');
    vi.stubEnv('APIFY_FACEBOOK_GROUP_SEARCH_VERIFIED', 'true');
    try {
    vi.mocked(scrape).mockResolvedValue([{url:'https://facebook.com/groups/123',name:'Running Club Vietnam',description:'Running community Vietnam',membersCount:100},{url:'https://facebook.com/groups/456',name:'Running Community Vietnam',description:'Running group Vietnam',membersCount:50000}]);
    const result=await previewDiscoveryCandidates({sessionId:'s',keyword:'running',targetType:'Communities & Clubs',platform:'Facebook',limit:1});
    expect(result.candidates.map(c => c.members)).toEqual([50000,100]);
    vi.unstubAllEnvs();
    } finally { vi.unstubAllEnvs(); }
  });
});

describe('Facebook discovery audience details',()=>{
 const search=[{url:'https://facebook.com/runner',name:'Running Coach',bio:'Running coach Vietnam'}];
 it('enriches missing followers with matching detail observations and preserves identity through import',async()=>{
  vi.mocked(scrape).mockImplementation(async(_id,_platform,task)=>task==='profiles'?search:[{pageUrl:'https://facebook.com/runner',pageName:'runner',title:'Running Coach',followers:12000,_provenance:{runId:'details-run',fetchedAt:'2026-10-06T00:00:00Z'}}]);
  const result=await previewDiscoveryCandidates({sessionId:'s',platform:'Facebook',keyword:'running',limit:1});
  expect(result.candidates[0]).toMatchObject({followers:12000,url:'https://facebook.com/runner',provenance:{runId:'details-run'}});expect(result.partial).toBe(false);
  expect(vi.mocked(scrape).mock.calls[1][6]).toEqual({urls:['https://facebook.com/runner']});
  state.tables.scout_sessions[0].candidates=result.candidates;state.tables.scout_sessions[0].params=result.criteria;
  state.tables.scout_sessions[0].review_decisions={[result.candidates[0].candidateId]:{decision:'approved'}};
  await ingestSelectedCandidates({sessionId:'s',actorId:state.owner,selected:[{candidateId:result.candidates[0].candidateId,classification:'Individual',relevant:true,locationConfirmed:true}]});expect(state.tables.kols[0].followers).toBe(12000);
 });
 it('does not assign another account audience or use likes as followers',async()=>{
  vi.mocked(scrape).mockImplementation(async(_id,_platform,task)=>task==='profiles'?search:[{pageUrl:'https://facebook.com/other',title:'Other',followers:999999},{pageUrl:'https://facebook.com/runner',title:'Runner',likes:20000}]);
  const result=await previewDiscoveryCandidates({sessionId:'s',platform:'Facebook',keyword:'running',limit:1});expect(result.candidates[0].followers).toBeNull();expect(result.partial).toBe(true);
 });
 it('retains search profiles when the details budget is exhausted',async()=>{
  vi.mocked(scrape).mockImplementation(async(_id,_platform,task)=>{if(task==='profile-details')throw Object.assign(new Error('Budget exhausted'),{code:'BUDGET_EXHAUSTED'});return search;});
  const result=await previewDiscoveryCandidates({sessionId:'s',platform:'Facebook',keyword:'running',limit:1});expect(result.candidates).toHaveLength(1);expect(result.warnings.join(' ')).toContain('Budget exhausted');
 });
 it('stops discovery when a detail run has an ambiguous start',async()=>{
  vi.mocked(scrape).mockImplementation(async(_id,_platform,task)=>{if(task==='profile-details')throw Object.assign(new Error('Unknown start'),{code:'START_UNKNOWN'});return search;});
  await expect(previewDiscoveryCandidates({sessionId:'s',platform:['Facebook','TikTok'],keyword:'running'})).rejects.toMatchObject({code:'START_UNKNOWN'});expect(vi.mocked(scrape).mock.calls).toHaveLength(2);
 });
});

describe('saved content evidence recovery',()=>{
 it('saves the recovered Facebook post and retains unverified items without any provider call',async()=>{
  const result=await scoutMarketTrends({sessionId:'s',keyword:'Badminton Vietnam',platform:['Facebook'],geography:['TP. Hồ Chí Minh'],limit:5},{Facebook:[{url:'https://facebook.com/permalink.php?story_fbid=123&id=456',text:'Giải Cầu lông TP. Hồ Chí Minh',time:'2026-10-04T00:00:00Z'},{url:'https://facebook.com/groups/123/permalink/789',text:'Cầu lông',time:'2026-10-04T00:00:00Z'}]});
  expect(scrape).not.toHaveBeenCalled();expect(result.counts).toMatchObject({inserted:1,unverified:1});expect(result.skippedPosts[0]).toMatchObject({reviewState:'Needs Verification'});expect(result.posts[0].published_at).toBe('2026-10-04T00:00:00.000Z');
 });
});

describe('high engagement content scout',()=>{
 it('filters weak and unknown observations, ranks across platforms, and never fills with weak posts',async()=>{
  const row=(id:string,likes?:number,views?:number)=>({url:`https://facebook.com/posts/${id}`,text:'badminton Vietnam',time:'2026-10-04T00:00:00Z',likesCount:likes,videoViewCount:views});
  const result=await scoutMarketTrends({sessionId:'s',keyword:'badminton',platform:['Facebook'],limit:5,qualityMode:'high-engagement'}, {Facebook:[row('weak',2,10),row('good',200,10000),row('best',500,20000),row('unknown'),{...row('old',10000,100000),time:'2026-09-15T00:00:00Z'}]});
  expect(scrape).not.toHaveBeenCalled();expect(result.posts.map(p=>p.likes)).toEqual([500,200]);
  expect(result.counts).toMatchObject({inserted:2,excluded:1,unverified:2});
  expect(result.warnings.join(' ')).toContain('Only 2 posts');expect(result.qualityCriteria).toMatchObject({candidateLimit:15,recentDays:7});
  expect(result.skippedPosts).toHaveLength(3);
 });
 it('requests a bounded larger pool and uses a stable recency cutoff on resume',async()=>{
  vi.mocked(scrape).mockResolvedValue([]);
  const params={sessionId:'s',keyword:'badminton',platform:'Facebook',limit:30,qualityMode:'high-engagement' as const};
  const first=await scoutMarketTrends(params);const second=await scoutMarketTrends(params);
  expect(scrape).toHaveBeenCalledTimes(2);
  expect(vi.mocked(scrape).mock.calls[0][4]).toBe(60);
  expect(first.qualityCriteria.cutoff).toBe(second.qualityCriteria.cutoff);
 });
});


describe('Latest community sampling', () => {
  const communityId = '00000000-0000-0000-0000-000000000010';
  const row = (index: number, owner = 'club') => ({ url: `https://instagram.com/p/sample${index}`, ownerUsername: owner, caption: 'Original source caption', timestamp: new Date(Date.UTC(2026, 0, 1, 0, index)).toISOString(), likesCount: index, commentsCount: 0 });
  beforeEach(() => { state.tables.communities = [{ id: communityId, name: 'CLB chạy bộ', group_url: 'https://instagram.com/club', channels: [{ url: 'https://instagram.com/club' }, { url: 'https://instagram.com/secondclub' }], sports: ['Running'] }]; });
  it('merges channel samples, deduplicates, and saves only the newest 30 across the club without a watermark', async () => {
    vi.mocked(scrape).mockImplementation(async (_session, _platform, _task, url) => url.endsWith('/club') ? Array.from({ length: 30 }, (_, index) => row(index)) : Array.from({ length: 30 }, (_, index) => row(index + 15, 'secondclub')));
    const result = await scoutLatestCommunityPosts(communityId, ['Instagram'], 's');
    expect(result.counts.sampled).toBe(30); expect(state.tables.scouted_posts).toHaveLength(30);
    expect(state.tables.scouted_posts.every(p => p.community_id === communityId)).toBe(true);
    expect(state.tables.scouted_posts.map(p => p.post_url)).toEqual(Array.from({ length: 30 }, (_, i) => `https://instagram.com/p/sample${44-i}`));
    expect(scrape).toHaveBeenCalledWith('s', 'Instagram', 'profile-posts', 'https://instagram.com/club', 30);
  });
  it('keeps valid posts with missing metrics, excludes undated and unrelated-author posts, and reports partial coverage', async () => {
    vi.mocked(scrape).mockResolvedValue([row(1), { ...row(2), commentsCount: undefined }, { ...row(3), timestamp: undefined }, row(4, 'unrelated')]);
    const result = await scoutLatestCommunityPosts(communityId, ['Instagram'], 's', ['https://instagram.com/club']);
    expect(result.counts.sampled).toBe(2); expect(result.partial).toBe(true);
    expect(state.tables.scouted_posts.find(p => p.post_url.endsWith('sample2')).scout_missing_metrics).toContain('comments');
    expect(state.tables.scouted_posts.find(p => p.post_url.endsWith('sample1')).comments).toBe(0);
  });
  it('preserves stored posts and available-channel data when another channel is private or unverified', async () => {
    state.tables.scouted_posts = [{ id: 'old', community_id: communityId, post_url: 'https://instagram.com/p/old' }];
    vi.mocked(scrape).mockImplementation(async (_s, _p, _t, url) => { if (url.endsWith('/secondclub')) throw new Error('Private channel'); return [row(1)]; });
    const result = await scoutLatestCommunityPosts(communityId, ['Instagram'], 's');
    expect(result.success).toBe(true); expect(result.channelCoverage.map(c => c.status)).toEqual(['collected', 'unavailable']);
    expect(state.tables.scouted_posts).toHaveLength(2);
  });
  it('rejects an injected unconnected URL before provider execution', async () => {
    await expect(scoutLatestCommunityPosts(communityId, ['Instagram'], 's', ['https://instagram.com/unrelated'])).rejects.toMatchObject({ code: 'INVALID_CHANNEL' });
    expect(scrape).not.toHaveBeenCalled();
  });
});

it('requires a persisted approval even when the candidate is Qualified',async()=>{
 await expect(ingestSelectedCandidates({sessionId:'s',actorId:state.owner,selected:[{candidateId:'c1'}]})).rejects.toMatchObject({code:'REVIEW_REQUIRED'});
 expect(state.tables.kols).toHaveLength(0);
});

it('blocks upper follower bounds and missing member counts despite saved approval',async()=>{
 const session=state.tables.scout_sessions[0];
 session.params={...session.params,assessmentRevision:6,maxFollowers:10};
 session.review_decisions={c1:{decision:'approved',classification:'Individual',relevant:true,locationConfirmed:true}};
 session.candidates[0].followers=11;
 await expect(ingestSelectedCandidates({sessionId:'s',actorId:state.owner,selected:[{candidateId:'c1'}]})).rejects.toMatchObject({code:'FOLLOWER_THRESHOLD_REQUIRED'});
 session.params={...session.params,maxFollowers:undefined,sizeMetric:'members',minMembers:100};
 session.candidates[0].followers=1000;session.candidates[0].members=null;
 await expect(ingestSelectedCandidates({sessionId:'s',actorId:state.owner,selected:[{candidateId:'c1'}]})).rejects.toMatchObject({code:'FOLLOWER_THRESHOLD_REQUIRED'});
 expect(state.tables.kols).toHaveLength(0);
});
it('imports group followers and members into separate CRM fields',async()=>{
 const session=state.tables.scout_sessions[0];
 session.params={keyword:'Running',platform:'Facebook',targetType:'Communities & Clubs',geography:'Any location',assessmentRevision:6,sizeMetric:'members',minMembers:100,maxMembers:100};
 session.candidates=[{...candidate,platform:'Facebook',classification:'Community',bio:'Running community',name:'Running Community',category:'',entityType:'group',posts:[],url:'https://facebook.com/groups/123',accountKey:'Facebook:https://facebook.com/groups/123',followers:25,members:100,provenance:{}}];
 session.review_decisions={c1:{decision:'approved',classification:'Community',relevant:true,locationConfirmed:true}};
 const result=await ingestSelectedCandidates({sessionId:'s',actorId:state.owner,selected:[{candidateId:'c1'}]});
 expect(result.insertedCommunities).toBe(1);expect(state.tables.communities[0]).toMatchObject({members_count:100,account_followers:25});
});


describe('Experimental saved review through real API handlers and CRM persistence',()=>{
 const sid='00000000-0000-4000-8000-000000000010',cid='00000000-0000-4000-8000-000000000011';
 function setup(){
  const session=state.tables.scout_sessions[0];
  Object.assign(session,{id:sid,params:{keyword:'badminton',geography:'Ho Chi Minh City',targetType:'Individual KOLs',assessmentRevision:7,minFollowers:1000},candidates:[{...parseProfile({profileUrl:'https://instagram.com/alex',followers:1200},'Instagram')!,candidateId:cid,accountKey:'Instagram:https://instagram.com/alex',assessmentVersion:7,provenance:{platform:'Instagram'},entityAssessment:{suggestedType:'Individual',reviewedType:'Individual',status:'supported',source:'review',evidence:[],missingInformation:[]}}],review_decisions:{},progress:{}});
  return session;
 }
 const req=(path:string,body:any)=>new NextRequest(`http://localhost/api/sport-hub/scout/${path}`,{method:'POST',body:JSON.stringify({sessionId:sid,candidateId:cid,...body})});
 async function confirm(){
  const saved=await saveAttributes(req('attributes',{topic:'passed',geography:'passed'}));expect(saved.status).toBe(200);
  const approved=await saveReview(req('review',{decision:'approved',entityType:'Individual',typeConfirmed:true,relevant:true,locationConfirmed:true}));expect(approved.status).toBe(200);
 }
 it('manual correction supersedes older negative feedback for both approval and import and is persisted in CRM',async()=>{
  const session=setup();
  state.tables.scout_feedback=[{account_key:session.candidates[0].accountKey,context_key:contextKey('badminton','Ho Chi Minh City'),reason:'Not Relevant',created_at:'2026-10-12T10:00:00Z'}];
  await confirm();
  expect((await ingestSelectedCandidates({sessionId:sid,actorId:state.owner,selected:[{candidateId:cid}]})).insertedKols).toBe(1);
  expect(state.tables.kols[0].scout_provenance.manualAttributeReview).toMatchObject({actorId:state.owner,topic:'passed',geography:'passed'});
  expect(scrape).not.toHaveBeenCalled();
 });
 it('reassessment keeps a saved manual review without discovery keywords and preserves the reviewed type',async()=>{
  const session=setup();await confirm();
  const preview=await previewDiscoveryCandidates({...session.params,accountPolicyVersion:5,platform:'Instagram',sessionId:sid,savedExperimentalProfiles:structuredClone(session.candidates)});
  expect(preview.candidates).toHaveLength(1);
  expect(preview.candidates[0]).toMatchObject({resultGroup:'Qualified',entityAssessment:{source:'review',reviewedType:'Individual'},assessment:{topic:{state:'passed'},geography:{state:'passed'}}});
  expect(scrape).not.toHaveBeenCalled();
 });
 it('reassessment does not reapply superseded rejection feedback but enforces newer rejection',async()=>{
  const session=setup();session.candidates[0].name='Badminton Creator';await confirm();
  const reviewTime=session.candidates[0].manualAttributeReview.confirmedAt;
  const feedback={account_key:session.candidates[0].accountKey,context_key:contextKey('badminton','Ho Chi Minh City'),reason:'Not Relevant',created_at:new Date(Date.parse(reviewTime)-1000).toISOString()};
  state.tables.scout_feedback=[feedback];
  const run=()=>previewDiscoveryCandidates({...session.params,accountPolicyVersion:5,platform:'Instagram',sessionId:sid,savedExperimentalProfiles:structuredClone(session.candidates)});
  expect((await run()).candidates[0]).toMatchObject({resultGroup:'Qualified'});
  feedback.created_at='2099-01-01T00:00:00Z';
  expect((await run()).candidates[0]).toMatchObject({resultGroup:'Excluded'});
  expect(scrape).not.toHaveBeenCalled();
 });
 it('new negative feedback after approval blocks import without CRM writes',async()=>{
  const session=setup();await confirm();
  state.tables.scout_feedback=[{account_key:session.candidates[0].accountKey,context_key:contextKey('badminton','Ho Chi Minh City'),reason:'Wrong Location',created_at:'2099-01-01T00:00:00Z'}];
  await expect(ingestSelectedCandidates({sessionId:sid,actorId:state.owner,selected:[{candidateId:cid}]})).rejects.toMatchObject({code:'PREVIEW_STALE'});
  expect(state.tables.kols).toHaveLength(0);
 });
 it('uses audience evidence changed before the import lease claim',async()=>{
  const session=setup();await confirm();
  state.beforeClaim=()=>{session.candidates[0]={...session.candidates[0],followers:999};};
  await expect(ingestSelectedCandidates({sessionId:sid,actorId:state.owner,selected:[{candidateId:cid}]})).rejects.toMatchObject({code:'FOLLOWER_THRESHOLD_REQUIRED'});
  expect(state.tables.kols).toHaveLength(0);
 });
 it('does not approve unsaved topic/location checkbox values',async()=>{
  setup();
  const response=await saveReview(req('review',{decision:'approved',entityType:'Individual',typeConfirmed:true,relevant:true,locationConfirmed:true}));
  expect(response.status).toBe(400);expect(state.tables.scout_sessions[0].review_decisions).toEqual({});
 });
 it('approves a qualified batch and rejects an invalid batch without partially saving approvals',async()=>{
  const session=setup();await confirm();
  const secondId='00000000-0000-4000-8000-000000000012';
  session.candidates.push({...session.candidates[0],candidateId:secondId,url:'https://instagram.com/second',accountKey:'Instagram:https://instagram.com/second'});
  const body={sessionId:sid,reviews:[cid,secondId].map(candidateId=>({candidateId,decision:'approved',entityType:'Individual',typeConfirmed:true,relevant:true,locationConfirmed:true}))};
  const response=await saveReview(new NextRequest('http://localhost/api/sport-hub/scout/review',{method:'POST',body:JSON.stringify(body)}));
  expect(response.status).toBe(200);expect((await response.json()).count).toBe(2);
  session.review_decisions={};session.candidates[1].followers=null;
  const blocked=await saveReview(new NextRequest('http://localhost/api/sport-hub/scout/review',{method:'POST',body:JSON.stringify(body)}));
  expect(blocked.status).toBe(400);expect(session.review_decisions).toEqual({});
 });
 it('persists reject, pending and a later explicit approval independently of qualification',async()=>{
  const session=setup();await confirm();
  for(const decision of ['rejected','pending','approved']){
   const response=await saveReview(req('review',{decision,entityType:'Individual',typeConfirmed:true,relevant:true,locationConfirmed:true}));expect(response.status).toBe(200);
   expect(session.review_decisions[cid].decision).toBe(decision);
  }
 });
});
