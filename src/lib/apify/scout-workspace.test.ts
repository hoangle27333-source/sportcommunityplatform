import { describe, expect, it } from 'vitest';
import { connectedPlatforms, sessionSummary, taskRequest } from './scout-workspace';

describe('Scout workspace public contracts', () => {
  it('derives review separately from execution and excludes already imported and excluded candidates', () => {
    const session = { id: 's', kind: 'preview', status: 'complete', params: { keyword: 'Cầu lông', platform: 'Facebook', budgetUsd: 100, token: 'secret' }, candidates: [{candidateId:'a',reviewState:'Matched'}, {candidateId:'b',reviewState:'Needs Review'}, {candidateId:'c',reviewState:'Excluded'}], progress: { importedCandidateIds: ['a'] }, result: { counts: { found: 2, billing: { total: 50 } } } };
    const summary = sessionSummary(session);
    expect(summary.status).toBe('complete'); expect(summary.reviewState).toBe('needs-review'); expect(summary.remainingCandidates).toBe(1);
    expect(summary.subject).toBe('Cầu lông'); expect(summary.params).not.toHaveProperty('token'); expect(summary.params).not.toHaveProperty('budgetUsd');
    expect(summary.counts).toEqual({ found: 2 });
    expect(sessionSummary({...session,progress:{importedCandidateIds:['a','b']}}).reviewState).toBe('reviewed');
  });
  it('does not turn running or failed previews into review tasks', () => {
    for(const status of ['pending','running','failed']) expect(sessionSummary({kind:'preview',status,candidates:[{candidateId:'a'}]}).reviewState).toBe('none');
  });
  it('uses entity names and multiple IDs for refresh subjects', () => {
    expect(sessionSummary({kind:'sync',params:{entityType:'community',ids:['1','2','3']}},{'1':'CLB Hà Nội','2':'Saigon Club'}).subject).toBe('CLB Hà Nội, Saigon Club +1');
  });
  it('selects only connected supported domains without guessing from a display label', () => {
    expect(connectedPlatforms({channels:[{url:'https://m.facebook.com/groups/123'},{url:'https://instagram.com/runner'}],profileUrl:'https://tiktok.com.evil.example/@x'})).toEqual(['Instagram','Facebook']);
    expect(connectedPlatforms({profileUrl:'not a url'})).toEqual([]);
  });
  it('maps shared intent to existing typed task endpoints', () => {
    expect(taskRequest({intent:'content',mode:'entity',entityType:'community',ids:['club'],source:'/community'},{platform:['Facebook'],limit:10})).toEqual({url:'/api/sport-hub/scout/community-posts',body:{communityId:'club',platform:['Facebook'],limit:10,uiContext:{source:'/community'}}});
    expect(taskRequest({intent:'refresh',entityType:'kol',ids:['1','2']},{}).body).toMatchObject({type:'kol',action:'sync',ids:['1','2']});
    expect(taskRequest({intent:'refresh',entityType:'tracked',ids:['1']},{}).url).toBe('/api/tracked-accounts/1/scrape');
  });
});
