import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { createAdminClient } from '@/lib/supabase/admin';
import { scoutAccess, scoutFailure } from '@/lib/apify/sessions';
import { ScoutError } from '@/lib/apify/providers';
import { profileReviewDecision } from '@/lib/apify/profile-review';

const itemSchema = z.object({
  candidateId: z.string().uuid(),
  decision: z.enum(['approved', 'rejected', 'pending']),
  typeConfirmed: z.boolean().optional(),
  relevant: z.boolean().optional(),
  locationConfirmed: z.boolean().optional()
});

const schema = z.union([
  itemSchema.extend({ sessionId: z.string().uuid() }),
  z.object({
    sessionId: z.string().uuid(),
    reviews: z.array(itemSchema).min(1).max(100),
  }),
]);

export async function POST(req: NextRequest) {
  try {
    const actorId = await scoutAccess();
    const input = schema.parse(await req.json());
    const db = createAdminClient();
    const { data: session, error } = await db.from('scout_sessions').select('*').eq('id', input.sessionId).eq('owner_id', actorId).single();
    if (error || !session) throw new ScoutError('Preview not found.', 'NOT_FOUND', 404);
    if (session.kind !== 'preview' || session.status !== 'complete') throw new ScoutError('The preview is not ready for review.', 'INVALID_PREVIEW', 400);

    const isBatch = 'reviews' in input;
    const items = isBatch ? input.reviews : [input];
    const previous = session.review_decisions || {};
    const next = { ...previous };
    const applied: Record<string, any> = {};

    for (const item of items) {
      if ((session.progress?.importedCandidateIds || []).includes(item.candidateId)) {
        if (!isBatch) throw new ScoutError('This profile has already been imported.', 'ALREADY_IMPORTED', 409);
        continue;
      }
      const candidate = session.candidates?.find((c: any) => c.candidateId === item.candidateId);
      if (!candidate) {
        if (!isBatch) throw new ScoutError('Candidate not found in this preview.', 'INVALID_SELECTION', 400);
        continue;
      }
      const decision = profileReviewDecision(candidate, session.params.targetType, item, actorId);
      next[item.candidateId] = decision;
      applied[item.candidateId] = decision;
    }

    if (Object.keys(applied).length === 0) {
      throw new ScoutError('No eligible candidates to review.', 'INVALID_SELECTION', 400);
    }

    // Compare the snapshot to prevent another tab's decision from being overwritten.
    const { data: saved, error: saveError } = await db.from('scout_sessions')
      .update({ review_decisions: next })
      .eq('id', session.id).eq('owner_id', actorId).eq('review_decisions', JSON.stringify(previous))
      .or(`import_lease_until.is.null,import_lease_until.lt.${new Date().toISOString()}`).select('id').maybeSingle();
    if (saveError) throw saveError;
    if (!saved) throw new ScoutError('The review changed or an import is in progress. Reopen the preview before trying again.', 'REVIEW_STALE', 409);

    if (isBatch) {
      return NextResponse.json({ success: true, decisions: applied, count: Object.keys(applied).length });
    }
    return NextResponse.json({ success: true, candidateId: input.candidateId, decision: applied[input.candidateId] });
  } catch (error) { return scoutFailure(error); }
}
