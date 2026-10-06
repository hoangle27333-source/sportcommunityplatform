import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { createAdminClient } from '@/lib/supabase/admin';
import { scoutReadAccess, scoutFailure } from '@/lib/apify/sessions';
import { sessionSummary } from '@/lib/apify/scout-workspace';

export const dynamic = 'force-dynamic';
const querySchema = z.object({
  page: z.coerce.number().int().min(1).max(10000).default(1),
  pageSize: z.coerce.number().int().min(1).max(50).default(20),
  status: z.enum(['pending', 'running', 'complete', 'failed']).optional(),
  sessionId: z.string().uuid().optional(),
});
export async function GET(req: NextRequest) {
  try {
    const owner = await scoutReadAccess();
    const { page, pageSize, status, sessionId } = querySchema.parse(Object.fromEntries(req.nextUrl.searchParams));
    const db = createAdminClient();
    function list(runtimeReady: boolean) {
      let query = runtimeReady
        ? db.from('scout_sessions').select('id,kind,params,status,candidates,review_decisions,result,progress,warnings,created_at', { count: 'exact' })
        : db.from('scout_sessions').select('id,kind,params,status,candidates,review_decisions,result,created_at', { count: 'exact' });
      query = query.eq('owner_id', owner).neq('kind', 'verification').order('created_at', { ascending: false }).order('id', { ascending: false });
      if (runtimeReady) query = query.eq('verification', false);
      if (status) query = query.eq('status', status);
      if (sessionId) query = query.eq('id', sessionId);
      return query.range((page - 1) * pageSize, page * pageSize - 1);
    }
    let response = await list(true);
    let runtimeReady = true;
    if (response.error?.code === '42703' || response.error?.code === 'PGRST204') { runtimeReady = false; response = await list(false); }
    const { data, error, count } = response;
    if (error) throw error;
    const sessionRows = (data || []) as unknown as any[];
    const subjects: Record<string, string> = {};
    for (const [kind, table, nameColumn] of [['kol', 'kols', 'name'], ['community', 'communities', 'name'], ['tracked', 'tracked_accounts', 'display_name']] as const) {
      const ids = [...new Set<string>(sessionRows.flatMap(s => {
        const p = s.params || {};
        return kind === 'tracked' ? [p.trackedAccountId].filter(Boolean) : [...(p.entityType === kind ? p.ids || [] : []), p[kind === 'kol' ? 'kolId' : 'communityId']].filter(Boolean);
      }))];
      if (!ids.length) continue;
      const { data: rows, error: subjectError } = await db.from(table).select(`id,${nameColumn}`).in('id', ids);
      if (subjectError) throw subjectError;
      for (const row of rows || []) subjects[(row as any).id] = (row as any)[nameColumn];
    }
    return NextResponse.json({ success: true, runtimeReady, sessions: sessionRows.map(s => sessionSummary(s, subjects)), page, pageSize, total: count || 0, hasMore: page * pageSize < (count || 0) });
  } catch (e) { return scoutFailure(e); }
}
