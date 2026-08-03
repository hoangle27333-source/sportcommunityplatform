import { NextResponse } from 'next/server';
import { requireUser, AuthError } from '@/lib/auth/require-user';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const { db } = await requireUser();
    
    // Using head to only get the count for performance
    const { count, error } = await db
      .from('notifications')
      .select('id', { count: 'exact', head: true })
      .eq('is_read', false);
      
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    return NextResponse.json({ count: count ?? 0 });
  } catch (e) {
    if (e instanceof AuthError) return NextResponse.json({ error: (e as any).message }, { status: (e as any).status ?? 401 });
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
