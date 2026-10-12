import { timingSafeEqual } from 'node:crypto';
import { NextRequest, NextResponse } from 'next/server';
import { start, getRun } from 'workflow/api';
import { scoutFixtureWorkflow } from '@/workflows/scout-fixture';

export const maxDuration = 300;
export const dynamic = 'force-dynamic';
function authorized(req: NextRequest) {
  if (process.env.VERCEL_ENV === 'production' || process.env.SCOUT_WORKFLOW_FIXTURE_ENABLED !== 'true') return false;
  const expected = Buffer.from(`Bearer ${process.env.SCOUT_WORKFLOW_FIXTURE_SECRET || ''}`);
  const actual = Buffer.from(req.headers.get('authorization') || '');
  return !!process.env.SCOUT_WORKFLOW_FIXTURE_SECRET && expected.length === actual.length && timingSafeEqual(expected, actual);
}
export async function POST(req: NextRequest) {
  if (!authorized(req)) return new NextResponse(null, { status: 404 });
  const delay = Math.max(5, Math.min(60, Number(req.nextUrl.searchParams.get('delay')) || 5));
  const run = await start(scoutFixtureWorkflow, [delay]);
  return NextResponse.json({ runId: run.runId }, { status: 202 });
}
export async function GET(req: NextRequest) {
  if (!authorized(req)) return new NextResponse(null, { status: 404 });
  const id = req.nextUrl.searchParams.get('runId');
  if (!id || !/^wrun_[a-zA-Z0-9]+$/.test(id)) return NextResponse.json({ error: 'Invalid fixture run ID' }, { status: 400 });
  const run = getRun(id);
  if (!(await run.workflowName).endsWith('scoutFixtureWorkflow')) return new NextResponse(null, { status: 404 });
  const status = await run.status;
  return NextResponse.json({ runId: id, status, ...(status === 'completed' ? { result: await run.returnValue } : {}) });
}
export async function PATCH(req: NextRequest) {
  if (!authorized(req)) return new NextResponse(null, { status: 404 });
  const id = req.nextUrl.searchParams.get('runId');
  if (!id || !/^wrun_[a-zA-Z0-9]+$/.test(id)) return NextResponse.json({ error: 'Invalid fixture run ID' }, { status: 400 });
  const run = getRun(id);
  if (!(await run.workflowName).endsWith('scoutFixtureWorkflow')) return new NextResponse(null, { status: 404 });
  return NextResponse.json(await run.wakeUp());
}
