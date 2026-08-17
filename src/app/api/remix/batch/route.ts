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
import { buildRemixOptionsFromPreset } from '@/lib/remix/preset-options';

export const dynamic = 'force-dynamic';
const logger = pino({ name: 'api:remix-batch' });

const defaultBatchOptions = {
  vietsub: true,
  dubVi: true,
  dubMode: 'full' as const,
  vertical: true,
  targetLanguage: 'vi' as const,
  translateOnScreenText: true,
  autoDetectSubtitleRegion: true,
  blurOriginalSub: true,
};

const batchSchema = z.object({
  urls: z.array(z.string().url()).min(1).max(10),
  mode: z.enum(['auto', 'manual']).default('auto'),
  presetId: z.string().uuid().optional(),
  folderId: z.string().uuid().nullable().optional(),
});

export async function POST(req: NextRequest) {
  try {
    const { db, user } = await requireEditor();
    const body = batchSchema.parse(await req.json());
    const batchId = crypto.randomUUID();
    const jobs: { id: string; url: string }[] = [];
    const presetId = body.presetId
      ? await verifyPresetId(db, user.id, body.presetId)
      : await findDefaultPresetId(db, user.id);
    let presetConfig: Record<string, any> | null = null;
    if (presetId) {
      const { data: preset, error } = await db
        .from('remix_presets')
        .select('*')
        .eq('id', presetId)
        .maybeSingle();
      if (error) throw new Error(`Không đọc được preset đã chọn: ${error.message}`);
      presetConfig = preset ?? null;
    }
    const options = presetId
      ? buildRemixOptionsFromPreset(presetConfig)
      : defaultBatchOptions;
    const needsVoicePipeline = presetConfig
      ? requiresVoicePipelineForRemix({
          outputKind: 'video',
          vietsub: Boolean(presetConfig.auto_vietsub),
          dubVi: Boolean(presetConfig.auto_dub),
          dubMode: String(presetConfig.dub_mode ?? (presetConfig.auto_dub ? 'full' : 'none')),
        })
      : requiresVoicePipelineForRemix({
          outputKind: 'video',
          ...defaultBatchOptions,
        });

    if (needsVoicePipeline && requireVoicePipelineV2ForLocalization()) {
      const health = await getRemixServiceHealth();
      if (!health.voicePipeline.reachable) {
        logger.warn({ health, urlCount: body.urls.length }, 'voice pipeline unavailable for remix batch');
        return NextResponse.json(
          {
            error:
              "Voice Pipeline V2 chưa sẵn sàng trong profile hiện tại. " +
              `Kiểm tra ${health.voicePipeline.url ?? "VOICE_PIPELINE_URL"} hoặc bật media sidecars trước khi batch generate.`,
            preflight: health,
          },
          { status: 503 },
        );
      }
    }

    for (let i = 0; i < body.urls.length; i++) {
      const url = body.urls[i];
      const { data: job, error } = await db
        .from('remix_jobs')
        .insert({
          source_type: 'own_link',
          source_url: url,
          ownership_confirmed: true,
          output_kind: 'video',
          folder_id: body.folderId ?? null,
          options,
          status: 'queued',
          created_by: user.id,
          batch_id: batchId,
          batch_index: i,
          preset_id: presetId,
          generation_mode: body.mode,
        })
        .select('id')
        .single<{ id: string }>();

      if (error || !job) continue;
      jobs.push({ id: job.id, url });
      await enqueue(QUEUE_NAMES.remix, 'run', { kind: 'run', remixJobId: job.id }, { jobId: `remix:${job.id}:0` });
    }

    return NextResponse.json({ batchId, jobs, presetId }, { status: 201 });
  } catch (e) {
    if (e instanceof AuthError) return NextResponse.json({ error: (e as any).message }, { status: (e as any).status ?? 401 });
    if (e instanceof z.ZodError) return NextResponse.json({ error: 'validation', issues: e.issues }, { status: 422 });
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}

async function findDefaultPresetId(db: Awaited<ReturnType<typeof requireEditor>>['db'], userId: string) {
  const { data, error } = await db
    .from('remix_presets')
    .select('id')
    .eq('is_default', true)
    .order('updated_at', { ascending: false })
    .limit(1);

  if (error) throw new Error(`Không đọc được preset mặc định: ${error.message}`);
  return data?.[0]?.id ?? null;
}

async function verifyPresetId(
  db: Awaited<ReturnType<typeof requireEditor>>['db'],
  userId: string,
  presetId: string,
) {
  const { data, error } = await db
    .from('remix_presets')
    .select('id')
    .eq('id', presetId)
    .maybeSingle<{ id: string }>();

  if (error) throw new Error(`Không đọc được preset đã chọn: ${error.message}`);
  if (!data) throw new Error('Preset đã chọn không tồn tại hoặc không thuộc tài khoản hiện tại.');
  return data.id;
}
