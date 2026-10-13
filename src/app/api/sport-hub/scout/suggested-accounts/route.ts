import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { createAdminClient } from '@/lib/supabase/admin';
import { scoutReadAccess, scoutAccess, scoutFailure } from '@/lib/apify/sessions';
import { assertPostWorkspaceSchema } from '@/lib/apify/post-metadata';
import { createSuggestedAccountPreview, readSuggestedAccounts } from '@/lib/apify/post-suggestions';
import { guardReviewSnapshot, nextReviewProgress } from '@/lib/apify/review-snapshot';
import { ScoutError } from '@/lib/apify/errors';
export const dynamic = 'force-dynamic';
const inputSchema = z.object({ identity: z.string().min(1).max(500), entityType: z.enum(['kol', 'community']), keyword: z.string().trim().min(1).max(300).optional(), geography: z.string().trim().min(1).max(100).optional(), name: z.string().trim().min(1).max(300).optional(), bio: z.string().max(5000).optional(), verificationSessionId: z.string().uuid().optional() });
export async function GET() {
  try { await scoutReadAccess(); await assertPostWorkspaceSchema(); return NextResponse.json({ success: true, suggestedAccounts: await readSuggestedAccounts() }); }
  catch (error) { return scoutFailure(error); }
}
export async function POST(req: NextRequest) {
  try { const owner = await scoutAccess(); await assertPostWorkspaceSchema(); return NextResponse.json(await createSuggestedAccountPreview(owner, inputSchema.parse(await req.json()))); }
  catch (error) { return scoutFailure(error); }
}
export async function PATCH(req: NextRequest) {
  try {
    const owner = await scoutAccess();
    const input = z.object({ sessionId: z.string().uuid(), candidateId: z.string().uuid(), name: z.string().trim().min(1).max(300).optional(), bio: z.string().max(5000).optional(), geography: z.string().trim().min(1).max(100).optional() }).parse(await req.json());
    const db = createAdminClient();
    const { data: session, error } = await db.from('scout_sessions').select('*').eq('id', input.sessionId).eq('owner_id', owner).single();
    if (error || !session) throw new ScoutError('Preview not found.', 'NOT_FOUND', 404);
    if (!session.params.suggestionIdentity || session.kind !== 'preview' || session.status !== 'complete') throw new ScoutError('This is not a suggestion preview.', 'INVALID_PREVIEW', 400);
    if (session.progress?.importedCandidateIds?.includes(input.candidateId)) throw new ScoutError('This account has already been imported.', 'ALREADY_IMPORTED', 409);
    const candidate = session.candidates.find((c: any) => c.candidateId === input.candidateId);
    if (!candidate) throw new ScoutError('Candidate not found.', 'INVALID_SELECTION', 400);
    const edits = { ...(input.name ? { name: input.name } : {}), ...(input.bio !== undefined ? { bio: input.bio } : {}) };
    const updated = { ...candidate, ...edits, verifiedGeography: input.geography || candidate.verifiedGeography, reviewState: 'Needs Review', provenance: { ...candidate.provenance, manualEdits: { ...candidate.provenance?.manualEdits, ...edits, ...(input.geography ? { geography: input.geography } : {}) } } };
    const candidates = session.candidates.map((c: any) => c.candidateId === input.candidateId ? updated : c), decisions = { ...session.review_decisions }; delete decisions[input.candidateId];
    const { data: saved, error: writeError } = await guardReviewSnapshot(db.from('scout_sessions').update({ candidates, params: { ...session.params, ...(input.geography ? { geography: input.geography } : {}) }, result: { ...session.result, candidates, groups: { qualified: [], needsVerification: candidates, excluded: [] } }, review_decisions: decisions, progress: nextReviewProgress(session) }).eq('id', session.id).eq('owner_id', owner), session).or(`import_lease_until.is.null,import_lease_until.lt.${new Date().toISOString()}`).select('id').maybeSingle();
    if (writeError) throw writeError;
    if (!saved) throw new ScoutError('The review changed or an import is in progress.', 'REVIEW_STALE', 409);
    return NextResponse.json({ success: true, candidate: updated });
  } catch (error) { return scoutFailure(error); }
}
