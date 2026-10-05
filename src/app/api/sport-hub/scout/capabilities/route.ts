import { NextResponse } from 'next/server';
import { scoutReadAccess, scoutFailure } from '@/lib/apify/sessions';
import { workspaceCapabilities } from '@/lib/apify/workspace-capabilities';
export const dynamic = 'force-dynamic';
export async function GET() {
  try { await scoutReadAccess(); return NextResponse.json({ success: true, capabilities: await workspaceCapabilities() }); }
  catch (e) { return scoutFailure(e); }
}
