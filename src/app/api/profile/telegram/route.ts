import { NextResponse, type NextRequest } from 'next/server';
import { requireUser, AuthError } from '@/lib/auth/require-user';
import { z } from 'zod';

export const dynamic = 'force-dynamic';

const schema = z.object({
  telegramChatId: z.string().min(1).max(50).nullable(),
});

// GET: get current telegram_chat_id
export async function GET() {
  try {
    const { db, user } = await requireUser();
    const { data } = await db
      .from('profiles')
      .select('telegram_chat_id')
      .eq('id', user.id)
      .maybeSingle<{ telegram_chat_id: string | null }>();
    return NextResponse.json({ telegramChatId: data?.telegram_chat_id ?? null });
  } catch (e) {
    if (e instanceof AuthError) return NextResponse.json({ error: (e as any).message }, { status: (e as any).status ?? 401 });
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}

// PUT: save telegram_chat_id
export async function PUT(req: NextRequest) {
  try {
    const { db, user } = await requireUser();
    const { telegramChatId } = schema.parse(await req.json());

    // Upsert profile row
    const { error } = await db
      .from('profiles')
      .upsert({ id: user.id, telegram_chat_id: telegramChatId }, { onConflict: 'id' });

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true, telegramChatId });
  } catch (e) {
    if (e instanceof AuthError) return NextResponse.json({ error: (e as any).message }, { status: (e as any).status ?? 401 });
    if (e instanceof z.ZodError) return NextResponse.json({ error: 'validation', issues: e.issues }, { status: 422 });
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
