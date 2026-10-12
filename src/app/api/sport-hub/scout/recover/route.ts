import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getServerUserRole } from '@/lib/auth/financial-sanitizer';
import { scoutFailure } from '@/lib/apify/sessions';
import { ScoutError } from '@/lib/apify/errors';
import { recoverScoutSessions } from '@/lib/apify/workflow-maintenance';

export const maxDuration = 300;
export async function POST(req: NextRequest) {
  try {
    const user = await getServerUserRole();
    if (!user.userId || user.role !== 'admin') throw new ScoutError('Admin access required.', 'FORBIDDEN', 403);
    const { sessionId } = z.object({ sessionId: z.string().uuid() }).parse(await req.json());
    return NextResponse.json({ success: true, recovery: await recoverScoutSessions(sessionId) });
  } catch (error) { return scoutFailure(error); }
}
