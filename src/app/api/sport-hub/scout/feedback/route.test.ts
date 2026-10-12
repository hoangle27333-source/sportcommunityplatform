import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const state = vi.hoisted(() => ({
  actor: 'owner',
  forbidden: false,
  session: null as any,
  feedbackRows: [] as any[],
  updateFilters: [] as [string, any][],
  updatePayload: null as any,
}));

vi.mock('@/lib/apify/sessions', () => ({
  scoutAccess: async () => {
    if (state.forbidden) throw { message: 'Editor access required', status: 403 };
    return state.actor;
  },
  scoutFailure: (e: any) =>
    Response.json(
      { success: false, error: e.message, code: e.code },
      { status: e.status || (e.name === 'ZodError' ? 400 : 500) }
    ),
}));

vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({
    from: (table: string) => {
      const filters: [string, any][] = [];
      let payload: any;
      const query: any = {
        select: () => query,
        eq: (key: string, value: any) => {
          filters.push([key, value]);
          return query;
        },
        or: () => query,
        insert: async (data: any) => {
          if (table === 'scout_feedback') {
            state.feedbackRows.push(data);
          }
          return { data: null, error: null };
        },
        update: (value: any) => {
          payload = value;
          state.updatePayload = value;
          return query;
        },
        single: async () => ({
          data: state.session?.owner_id === state.actor ? structuredClone(state.session) : null,
          error: null,
        }),
        maybeSingle: async () => {
          state.updateFilters = [...filters];
          if (Date.parse(state.session.import_lease_until || '') > Date.now()) {
            return { data: null, error: null };
          }
          Object.assign(state.session, payload);
          return { data: { id: state.session.id }, error: null };
        },
      };
      return query;
    },
  }),
}));

import { POST } from './route';

const sessionId = '00000000-0000-0000-0000-000000000010';
const candidateId = '00000000-0000-0000-0000-000000000011';

function request(body: any) {
  return POST(
    new NextRequest('http://localhost/api/sport-hub/scout/feedback', {
      method: 'POST',
      body: JSON.stringify({ sessionId, candidateId, ...body }),
    })
  );
}

beforeEach(() => {
  state.actor = 'owner';
  state.forbidden = false;
  state.feedbackRows = [];
  state.updateFilters = [];
  state.updatePayload = null;
  state.session = {
    id: sessionId,
    owner_id: 'owner',
    kind: 'preview',
    status: 'complete',
    params: {
      keyword: 'running',
      geography: 'Nationwide',
      targetType: 'Individual KOLs',
      limit: 5,
    },
    candidates: [
      {
        candidateId,
        accountKey: 'Instagram:https://instagram.com/test',
        name: 'Test Runner',
        username: 'testrunner',
        url: 'https://instagram.com/test',
        platform: 'Instagram',
        bio: 'Marathon coach and runner',
        category: 'Athlete',
        location: 'Hanoi',
        posts: [],
        classification: 'Community',
        reviewState: 'Needs Review',
        resultGroup: 'Needs Verification',
        relevant: true,
        locationMatch: true,
        reasons: [],
        evidence: [],
        isExisting: false,
        entityAssessment: {
          suggestedType: 'Club',
          status: 'uncertain',
          source: 'rules',
          evidence: [],
          missingInformation: [],
          modelVersion: 'v5',
        },
        geographyAssessment: {
          state: 'passed',
          reason: 'Location verified',
          observations: [],
          coverage: { collected: 0, dated: 0, partial: false, latestVerified: true },
        },
      },
    ],
    review_decisions: { [candidateId]: { decision: 'rejected' } },
    result: { counts: { qualified: 0, unverified: 1, excluded: 0 } },
    progress: {},
  };
});

describe('scout feedback API route', () => {
  it('saves type correction without query param bloat and returns updated candidate', async () => {
    const res = await request({
      reason: 'Wrong Entity Type',
      entityType: 'Individual',
    });
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.success).toBe(true);
    expect(json.candidate).toBeDefined();
    expect(json.candidate.entityAssessment.reviewedType).toBe('Individual');
    expect(json.candidate.entityAssessment.suggestedType).toBe('Individual');

    // Ensure PostgREST query filters NEVER contain bloated candidates or review_decisions JSON
    const filterKeys = state.updateFilters.map(([k]) => k);
    expect(filterKeys).not.toContain('candidates');
    expect(filterKeys).not.toContain('review_decisions');
    expect(filterKeys).toContain('id');
    expect(filterKeys).toContain('owner_id');

    // Ensure scout_feedback recorded the correction
    expect(state.feedbackRows).toHaveLength(1);
    expect(state.feedbackRows[0]).toMatchObject({
      account_key: 'Instagram:https://instagram.com/test',
      reason: 'Wrong Entity Type',
      entity_type: 'Individual',
      classification: 'Individual',
    });

    // Ensure review decision was reset for this candidate
    expect(state.session.review_decisions[candidateId]).toBeUndefined();
  });

  it('records negative feedback, excludes profile, and omits candidate from response', async () => {
    const res = await request({
      reason: 'Not Relevant',
    });
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.success).toBe(true);
    expect(json.candidate).toBeUndefined();

    // Candidate in session should be excluded
    const updatedCandidate = state.session.candidates.find((c: any) => c.candidateId === candidateId);
    expect(updatedCandidate.reviewState).toBe('Excluded');
    expect(updatedCandidate.resultGroup).toBe('Excluded');

    // scout_feedback recorded
    expect(state.feedbackRows).toHaveLength(1);
    expect(state.feedbackRows[0].reason).toBe('Not Relevant');
  });

  it('safely handles array geography in session params', async () => {
    state.session.params.geography = ['Hanoi', 'Ho Chi Minh City'];
    const res = await request({
      reason: 'Wrong Location',
    });
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.success).toBe(true);
    expect(json.candidate).toBeUndefined();
    expect(state.feedbackRows[0].context_key).toContain('running|');
  });

  it('rejects with 409 when an import lease is active', async () => {
    state.session.import_lease_until = new Date(Date.now() + 60000).toISOString();
    const res = await request({
      reason: 'Wrong Entity Type',
      entityType: 'Individual',
    });
    expect(res.status).toBe(409);
    const json = await res.json();
    expect(json.success).toBe(false);
  });

  it('validates that corrected type is provided for Wrong Entity Type', async () => {
    const res = await request({
      reason: 'Wrong Entity Type',
    });
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.success).toBe(false);
    expect(json.error).toContain('Choose the corrected entity type');
  });
});
