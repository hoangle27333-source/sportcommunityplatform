import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { ingestSelectedCandidates } from '@/lib/apify/scout';
import { scoutAccess, scoutReadAccess, scoutFailure, startSession, resumeSession } from '@/lib/apify/sessions';
import { z } from 'zod';
export const dynamic = 'force-dynamic';
const confirm = z.object({ sessionId: z.string().uuid(), selected: z.array(z.object({ candidateId: z.string().uuid(), classification: z.enum(['Individual','Community','Brand/Business','Unknown']).optional(), relevant: z.boolean().optional(), locationConfirmed: z.boolean().optional() })).min(1).max(50) });
export async function GET(req: NextRequest) {
  try { const owner = await scoutReadAccess(); const id = req.nextUrl.searchParams.get('sessionId');
    if (id) return await resumeSession(z.string().uuid().parse(id), owner);
    const { data, error } = await createAdminClient().from('scout_requests').select('*').eq('created_by', owner).order('created_at', { ascending: false }).limit(30); if (error) throw error;
    return NextResponse.json({ success: true, data });
  } catch (e) { return scoutFailure(e); }
}
export async function POST(req: NextRequest) {
  try { const body = await req.json();
    if (body.action === 'resume') return await resumeSession(z.string().uuid().parse(body.sessionId), await scoutAccess());
    if (body.action === 'confirm') { const actorId = await scoutAccess(); return NextResponse.json(await ingestSelectedCandidates({ ...confirm.parse(body), actorId })); }
    return await startSession('preview', body);
  } catch (e) { return scoutFailure(e); }
}
