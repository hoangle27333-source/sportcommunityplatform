import { NextRequest } from 'next/server';
import { startSession, scoutFailure } from '@/lib/apify/sessions';
export const dynamic = 'force-dynamic';
export async function POST(req: NextRequest) {
  try { return await startSession('account-posts', await req.json()); }
  catch (error) { return scoutFailure(error); }
}
