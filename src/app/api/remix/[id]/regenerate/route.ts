import { NextResponse, type NextRequest } from 'next/server';
import pino from 'pino';
import { z } from 'zod';
import { requireEditor, AuthError } from '@/lib/auth/require-user';
import { enqueue, QUEUE_NAMES } from '@/lib/queue';
import { requiresVoicePipelineForRemix } from '@/lib/remix/preflight';
import {
  getRemixServiceHealth,
  requireVoicePipelineV2ForLocalization,
} from '@/lib/remix/service-health';

export const dynamic = 'force-dynamic';
const logger = pino({ name: 'api:remix-regenerate' });

const regenSchema = z.object({
  editedScript: z.string().optional(),
  options: z.record(z.string(), z.unknown()).optional(),
});

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { db } = await requireEditor();
    const { id } = await params;
    const body = regenSchema.parse(await req.json());
    
    // Get existing job to update options
    const { data: job, error: getError } = await db
      .from('remix_jobs')
      .select('output_kind, options')
      .eq('id', id)
      .single();
      
    if (getError || !job) {
      return NextResponse.json({ error: 'Job not found' }, { status: 404 });
    }
    
    const newOptions: Record<string, unknown> = {
      ...(job.options as Record<string, unknown>),
      ...(body.options ?? {}),
      regenerateOnly: true,
      ...(body.editedScript !== undefined
        ? {
            scriptInputMode: 'manual_script',
            manualScript: body.editedScript,
            editedScript: body.editedScript,
            generatedScript: body.editedScript,
          }
        : {}),
    };

    const needsVoicePipeline = requiresVoicePipelineForRemix({
      outputKind: String(job.output_kind ?? 'video') as 'video' | 'image' | 'caption',
      ...(newOptions as Record<string, unknown>),
    });
    if (needsVoicePipeline && requireVoicePipelineV2ForLocalization()) {
      const health = await getRemixServiceHealth();
      if (!health.voicePipeline.reachable) {
        logger.warn({ id, health }, 'voice pipeline unavailable for remix regenerate');
        return NextResponse.json(
          {
            error:
              "Voice Pipeline V2 chưa sẵn sàng trong profile hiện tại. " +
              `Kiểm tra ${health.voicePipeline.url ?? "VOICE_PIPELINE_URL"} hoặc bật media sidecars trước khi regenerate job này.`,
            preflight: health,
          },
          { status: 503 },
        );
      }
    }
    
    const { error: updateError } = await db
      .from('remix_jobs')
      .update({ options: newOptions, status: 'queued' })
      .eq('id', id);
      
    if (updateError) {
      return NextResponse.json({ error: updateError.message }, { status: 500 });
    }
    
    // Unique jobId so it runs immediately
    const runId = crypto.randomUUID();
    await enqueue(
      QUEUE_NAMES.remix, 
      'run', 
      { kind: 'run', remixJobId: id }, 
      { jobId: `remix:${id}:${runId}` }
    );
    
    return NextResponse.json({ id, status: 'queued' });
  } catch (e) {
    if (e instanceof AuthError) return NextResponse.json({ error: (e as any).message }, { status: (e as any).status ?? 401 });
    if (e instanceof z.ZodError) return NextResponse.json({ error: 'validation', issues: e.issues }, { status: 422 });
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
