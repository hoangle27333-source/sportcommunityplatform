import { NextResponse, type NextRequest } from 'next/server';
import { requireEditor, AuthError } from '@/lib/auth/require-user';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { db, user } = await requireEditor();
    const { id } = await params;
    
    // reset all to false for this org_id
    const { error: resetError } = await db
      .from('remix_presets')
      .update({ is_default: false })
      .eq('org_id', user.id);
      
    if (resetError) return NextResponse.json({ error: resetError.message }, { status: 500 });
    
    // set to true for the specific preset
    const { data, error } = await db
      .from('remix_presets')
      .update({ is_default: true })
      .eq('id', id)
      .eq('org_id', user.id)
      .select('*')
      .single();
      
    if (error || !data) return NextResponse.json({ error: error?.message ?? 'Cập nhật default thất bại' }, { status: 500 });
    return NextResponse.json({ preset: data });
  } catch (e) {
    if (e instanceof AuthError) return NextResponse.json({ error: (e as any).message }, { status: (e as any).status ?? 401 });
    return NextResponse.json({ error: (e as Error).message ?? 'internal error' }, { status: 500 });
  }
}
