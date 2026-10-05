import { NextRequest } from 'next/server';
import { startSession, scoutFailure } from '@/lib/apify/sessions';
export const dynamic = 'force-dynamic';
export async function POST(req: NextRequest) {
  try { return await startSession('trends', await req.json()); }
  catch (e) { return scoutFailure(e); }
}
