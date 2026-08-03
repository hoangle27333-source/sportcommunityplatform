import { NextResponse, type NextRequest } from 'next/server';
import { requireUser, AuthError } from '@/lib/auth/require-user';
import { z } from 'zod';

export const dynamic = 'force-dynamic';

const schema = z.object({
  /** Array of notification IDs to mark read. Empty = mark ALL read. */
  ids: z.array(z.string().uuid()).optional(),
});

export async function POST(req: NextRequest) {
  try {
    const { db } = await requireUser();
    const body = schema.parse(await req.json());

    let query = db.from('notifications').update({ is_read: true });
    if (body.ids && body.ids.length > 0) {
      query = query.in('id', body.ids);
    }
    const { error } = await query;
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true });
  } catch (e) {
    if (e instanceof AuthError) return NextResponse.json({ error: (e as any).message }, { status: (e as any).status ?? 401 });
    if (e instanceof z.ZodError) return NextResponse.json({ error: 'validation', issues: e.issues }, { status: 422 });
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
