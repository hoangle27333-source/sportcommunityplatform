import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { scoutAccess, scoutFailure } from '@/lib/apify/sessions';
import { assertPostWorkspaceSchema } from '@/lib/apify/post-metadata';
import { relinkPostAuthor } from '@/lib/apify/post-suggestions';
export const dynamic = 'force-dynamic';
export async function POST(req: NextRequest) {
  try { await scoutAccess(); await assertPostWorkspaceSchema(); const input = z.object({ entityType: z.enum(['kol', 'community']), id: z.string().uuid() }).parse(await req.json()); return NextResponse.json(await relinkPostAuthor(input.entityType, input.id)); }
  catch (error) { return scoutFailure(error); }
}
