import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { scoutAccess, scoutFailure } from '@/lib/apify/sessions';
import { createAdminClient } from '@/lib/supabase/admin';
import { contextKey } from '@/lib/apify/discovery-quality';
const schema = z.object({ sessionId: z.string().uuid(), candidateId: z.string().uuid(), reason: z.enum(['Wrong Entity Type','Not Relevant','Wrong Location','Correct Classification']), classification: z.enum(['Individual','Community','Brand/Business','Unknown']).optional() });
export async function POST(req: NextRequest) {
  try {
    const actor = await scoutAccess(); const b = schema.parse(await req.json()); const db = createAdminClient();
    const { data: s, error } = await db.from('scout_sessions').select('*').eq('id', b.sessionId).eq('owner_id', actor).single(); if (error) throw error;
    const c = s.candidates.find((c: any) => c.candidateId === b.candidateId); if (!c) return NextResponse.json({ success: false, error: 'Candidate not found' }, { status: 400 });
    if (['Wrong Entity Type', 'Correct Classification'].includes(b.reason) && !b.classification) return NextResponse.json({ success: false, error: 'Choose the corrected entity type' }, { status: 400 });
    const { error: writeError } = await db.from('scout_feedback').insert({ account_key: c.accountKey, context_key: contextKey(s.params.keyword, s.params.geography), reason: b.reason, classification: b.classification || null, actor_id: actor }); if (writeError) throw writeError;
    return NextResponse.json({ success: true });
  } catch (e) { return scoutFailure(e); }
}
