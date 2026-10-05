import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { getServerUserRole } from '@/lib/auth/financial-sanitizer';
import { saveGMV } from '@/lib/sport-hub/gmv';
export const dynamic = 'force-dynamic';
async function access() {
  const user = await getServerUserRole();
  if (!user.userId || !user.isAdmin) throw Object.assign(new Error('Admin access required'), { status: user.userId ? 403 : 401 });
  return user.userId;
}
function failure(e: any) { return NextResponse.json({ success: false, error: e.name === 'ZodError' ? 'Invalid GMV amount, month or source' : e.message }, { status: e.status || (e.name === 'ZodError' ? 400 : 500) }); }
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    await access(); const { id } = await params;
    const { data, error } = await createAdminClient().from('kol_gmv_monthly').select('*').eq('kol_id', id).order('month', { ascending: false });
    if (error) throw error;
    return NextResponse.json({ success: true, records: data });
  } catch (e) { return failure(e); }
}
export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try { const actor = await access(); const { id } = await params;
    return NextResponse.json({ success: true, record: await saveGMV(id, await req.json(), actor) });
  } catch (e) { return failure(e); }
}
