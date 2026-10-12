import { NextRequest } from 'next/server';
import { z } from 'zod';
import { reassessSession } from '@/lib/apify/reassessment';
import { scoutFailure } from '@/lib/apify/sessions';
export const dynamic='force-dynamic';
export async function POST(req:NextRequest) {
 try { const {sessionId}=z.object({sessionId:z.string().uuid()}).parse(await req.json());return await reassessSession(sessionId); }
 catch(error) {return scoutFailure(error);}
}
