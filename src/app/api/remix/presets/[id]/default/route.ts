import { NextResponse, type NextRequest } from 'next/server';
import { requireEditor, AuthError } from '@/lib/auth/require-user';
import { createAdminClient } from '@/lib/supabase/admin';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    await requireEditor();
    const { id } = await params;
    const adminDb = createAdminClient();

    const { data: targetPreset, error: targetError } = await adminDb
      .from('remix_presets')
      .select('id')
      .eq('id', id)
      .maybeSingle();

    if (targetError) return NextResponse.json({ error: targetError.message }, { status: 500 });
    if (!targetPreset) return NextResponse.json({ error: 'Preset không tồn tại.' }, { status: 404 });

    // Reset all presets to is_default = false
    const { error: resetError } = await adminDb
      .from('remix_presets')
      .update({ is_default: false })
      .neq('id', id);
      
    if (resetError) return NextResponse.json({ error: resetError.message }, { status: 500 });
    
    // Set target preset to is_default = true
    const { data, error } = await adminDb
      .from('remix_presets')
      .update({ is_default: true })
      .eq('id', id)
      .select('*')
      .single();
      
    if (error || !data) return NextResponse.json({ error: error?.message ?? 'Cập nhật default thất bại' }, { status: 500 });
    return NextResponse.json({ preset: data });
  } catch (e) {
    if (e instanceof AuthError) return NextResponse.json({ error: (e as any).message }, { status: (e as any).status ?? 401 });
    return NextResponse.json({ error: (e as Error).message ?? 'internal error' }, { status: 500 });
  }
}
