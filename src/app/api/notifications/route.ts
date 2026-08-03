import { NextResponse, type NextRequest } from 'next/server';
import { requireUser, AuthError } from '@/lib/auth/require-user';

export const dynamic = 'force-dynamic';

// GET: list notifications for current user
export async function GET(req: NextRequest) {
  try {
    const { db } = await requireUser();
    const unreadOnly = req.nextUrl.searchParams.get('unread') === 'true';
    const limit = Math.min(Number(req.nextUrl.searchParams.get('limit') ?? '50'), 100);

    let query = db
      .from('notifications')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(limit);

    if (unreadOnly) query = query.eq('is_read', false);

    const { data, error } = await query;
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    const unreadCount = data?.filter(n => !n.is_read).length ?? 0;
    return NextResponse.json({ notifications: data, unreadCount });
  } catch (e) {
    if (e instanceof AuthError) return NextResponse.json({ error: (e as any).message }, { status: (e as any).status ?? 401 });
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
