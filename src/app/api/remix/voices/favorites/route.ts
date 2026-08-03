import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { requireUser, AuthError } from '@/lib/auth/require-user';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  try {
    const { db, user } = await requireUser();
    
    const { data, error } = await db
      .from('favorite_voices')
      .select('*')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false });
      
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ favorites: data });
  } catch (e) {
    if (e instanceof AuthError) return NextResponse.json({ error: (e as any).message }, { status: (e as any).status ?? 401 });
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}

const favSchema = z.object({
  voiceName: z.string().min(1),
  displayName: z.string().optional(),
  gender: z.string().optional(),
  languageCode: z.string().default('vi-VN'),
});

export async function POST(req: NextRequest) {
  try {
    const { db, user } = await requireUser();
    const body = favSchema.parse(await req.json());
    
    const { data, error } = await db
      .from('favorite_voices')
      .insert({
        user_id: user.id,
        voice_name: body.voiceName,
        display_name: body.displayName ?? null,
        gender: body.gender ?? null,
        language_code: body.languageCode,
      })
      .select('*')
      .single();
      
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ favorite: data }, { status: 201 });
  } catch (e) {
    if (e instanceof AuthError) return NextResponse.json({ error: (e as any).message }, { status: (e as any).status ?? 401 });
    if (e instanceof z.ZodError) return NextResponse.json({ error: 'validation', issues: e.issues }, { status: 422 });
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const { db, user } = await requireUser();
    const sp = req.nextUrl.searchParams;
    const id = sp.get('id');
    
    if (!id) return NextResponse.json({ error: 'Missing id' }, { status: 400 });
    
    const { error } = await db
      .from('favorite_voices')
      .delete()
      .eq('id', id)
      .eq('user_id', user.id);
      
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ success: true });
  } catch (e) {
    if (e instanceof AuthError) return NextResponse.json({ error: (e as any).message }, { status: (e as any).status ?? 401 });
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
