import { timingSafeEqual } from 'node:crypto';
import { NextRequest, NextResponse } from 'next/server';
import { maintainScoutWorkflows } from '@/lib/apify/workflow-maintenance';

export const maxDuration = 300;
export const dynamic = 'force-dynamic';
export async function GET(req: NextRequest) {
  const expected = process.env.CRON_SECRET ? Buffer.from(`Bearer ${process.env.CRON_SECRET}`) : null;
  const actual = Buffer.from(req.headers.get('authorization') || '');
  if (!expected || expected.length !== actual.length || !timingSafeEqual(expected, actual))
    return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
  try { return NextResponse.json({ success: true, recovery: await maintainScoutWorkflows() }); }
  catch (error:any) { console.error('[scout-maintenance]',error.code || 'MAINTENANCE_FAILED'); return NextResponse.json({ success: false, error: 'Scout maintenance failed. Check server logs.' }, { status: 500 }); }
}
