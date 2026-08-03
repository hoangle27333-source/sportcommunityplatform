import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { requireEditor, AuthError } from '@/lib/auth/require-user';
import { enqueue, QUEUE_NAMES } from '@/lib/queue';

export const dynamic = 'force-dynamic';

const batchSchema = z.object({
  urls: z.array(z.string().url()).min(1).max(10),
  mode: z.enum(['auto', 'manual']).default('auto'),
  presetId: z.string().uuid().optional(),
});

export async function POST(req: NextRequest) {
  try {
    const { db, user } = await requireEditor();
    const body = batchSchema.parse(await req.json());
    const batchId = crypto.randomUUID();
    const jobs: { id: string; url: string }[] = [];

    for (let i = 0; i < body.urls.length; i++) {
      const url = body.urls[i];
      const { data: job, error } = await db
        .from('remix_jobs')
        .insert({
          source_type: 'own_link',
          source_url: url,
          ownership_confirmed: true,
          output_kind: 'video',
          options: { vietsub: true, dubVi: true, vertical: true },
          status: 'queued',
          created_by: user.id,
          batch_id: batchId,
          batch_index: i,
          preset_id: body.presetId ?? null,
          generation_mode: body.mode,
        })
        .select('id')
        .single<{ id: string }>();

      if (error || !job) continue;
      jobs.push({ id: job.id, url });
      await enqueue(QUEUE_NAMES.remix, 'run', { kind: 'run', remixJobId: job.id }, { jobId: `remix:${job.id}:0` });
    }

    return NextResponse.json({ batchId, jobs }, { status: 201 });
  } catch (e) {
    if (e instanceof AuthError) return NextResponse.json({ error: (e as any).message }, { status: (e as any).status ?? 401 });
    if (e instanceof z.ZodError) return NextResponse.json({ error: 'validation', issues: e.issues }, { status: 422 });
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
