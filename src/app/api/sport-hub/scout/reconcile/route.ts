import { NextRequest,NextResponse } from 'next/server';
import { z } from 'zod';
import { scoutAccess,scoutFailure } from '@/lib/apify/sessions';
import { reconcileUnconfirmedStarts } from '@/lib/apify/start-reconciliation';

export async function POST(req: NextRequest) {
  try {
    const owner = await scoutAccess();
    const {sessionId} = z.object({sessionId:z.string().uuid()}).parse(await req.json());
    return NextResponse.json(await reconcileUnconfirmedStarts(sessionId,owner));
  } catch(error) {return scoutFailure(error);}
}
