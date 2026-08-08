/**
 * Kiểm tra luồng remix pipeline trực tiếp (bypass worker queue).
 * Chạy: npx tsx --env-file=.env.local src/scripts/test-remix-pipeline.ts
 */

import { createClient } from '@supabase/supabase-js';
import path from 'path';
import { tmpdir } from 'os';
import { mkdir, rm, stat } from 'fs/promises';
import { randomUUID } from 'crypto';
import { readdir } from 'fs/promises';

const YOUTUBE_URL = 'https://youtube.com/shorts/xySpgZjT5DY?si=YMIgJk9WH0TzXtEV';

async function main() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
  const db = createClient(supabaseUrl, supabaseKey);

  console.log('\n══════════════════════════════════════════════');
  console.log('🎬 REMIX PIPELINE TEST — TRACE MODE');
  console.log('══════════════════════════════════════════════\n');

  // ---- STEP 0: Tìm preset mặc định ----
  console.log('📋 STEP 0: Tải preset mặc định...');
  const { data: presets, error: pErr } = await db.from('remix_presets').select('*').limit(5);
  if (pErr || !presets?.length) {
    console.error('❌ Không có preset nào:', pErr?.message ?? 'empty');
    process.exit(1);
  }
  const preset = presets.find((p: any) => p.is_default) ?? presets[0];
  console.log('✅ Preset:', preset.name);
  console.log('   output_ratio:', preset.output_ratio);
  console.log('   auto_vietsub:', preset.auto_vietsub);
  console.log('   auto_dub:', preset.auto_dub, '| dub_mode:', preset.dub_mode);
  console.log('   voice_name:', preset.voice_name);
  console.log('   blur_original_sub:', preset.blur_original_sub);
  console.log('   sub_position:', preset.sub_position);

  // ---- STEP 1: Kiểm tra env vars ----
  console.log('\n🔑 STEP 1: Kiểm tra env vars...');
  const geminiKey = !!process.env.GEMINI_API_KEY;
  const ttsKey = !!process.env.GOOGLE_CLOUD_TTS_API_KEY || !!process.env.GOOGLE_TTS_API_KEY;
  console.log(`   ${geminiKey ? '✅' : '❌'} GEMINI_API_KEY`);
  console.log(`   ${ttsKey ? '✅' : '❌'} GOOGLE_CLOUD_TTS_API_KEY`);
  console.log(`   ✅ SUPABASE connected`);

  // ---- STEP 2: Download YouTube video ----
  console.log('\n📥 STEP 2: Download video từ YouTube...');
  const workDir = path.join(tmpdir(), `remix-test-${randomUUID()}`);
  await mkdir(workDir, { recursive: true });
  let sourcePath: string | null = null;

  try {
    const ytdlFactory = (await import('youtube-dl-exec')).default;
    const ytdl = ytdlFactory.create('./node_modules/youtube-dl-exec/bin/yt-dlp');
    const tempId = `dl-${randomUUID()}`;
    const outTemplate = path.join(workDir, `${tempId}.%(ext)s`);
    console.log('   Đang tải... (có thể mất 30-60s)');

    const ytOptions: Record<string, any> = {
      output: outTemplate,
      format: 'best[ext=mp4]/bestvideo[ext=mp4]/best',
      noWarnings: true,
    };

    if (process.env.YTDL_COOKIES) {
      ytOptions.cookies = process.env.YTDL_COOKIES;
    } else if (process.env.YTDL_COOKIES_FROM_BROWSER) {
      ytOptions["cookies-from-browser"] = process.env.YTDL_COOKIES_FROM_BROWSER;
    }

    await ytdl(YOUTUBE_URL, ytOptions);

    const files = await readdir(workDir);
    const downloaded = files.filter(f => f.startsWith(tempId)).map(f => path.join(workDir, f));
    if (!downloaded.length) throw new Error('yt-dlp xong nhưng không thấy file output');

    sourcePath = downloaded[0];
    const info = await stat(sourcePath);
    console.log(`✅ Download OK: ${path.basename(sourcePath)} (${(info.size / 1024 / 1024).toFixed(1)} MB)`);
  } catch (err) {
    console.error('❌ Download thất bại:', (err as Error).message.slice(0, 200));
    await rm(workDir, { recursive: true, force: true });
    process.exit(1);
  }

  // ---- STEP 3: Probe video ----
  console.log('\n🔍 STEP 3: Probe video info...');
  let videoInfo: any = null;
  try {
    const { probeVideo } = await import('../lib/remix/video-ops.js');
    videoInfo = await probeVideo(sourcePath!);
    console.log('✅ Video info:');
    console.log('   Kích thước:', `${videoInfo.width}x${videoInfo.height}`);
    console.log('   Thời lượng:', `${videoInfo.durationSec.toFixed(1)}s`);
    console.log('   FPS:', videoInfo.fps);
    console.log('   Có audio:', videoInfo.hasAudio);
  } catch (err) {
    console.error('❌ Probe thất bại:', (err as Error).message);
  }

  // ---- STEP 4: ASR ----
  if (videoInfo?.hasAudio) {
    console.log('\n🎤 STEP 4: ASR — Trích xuất audio + phiên âm + dịch...');
    try {
      const { extractAudio, transcribeToSrt } = await import('../lib/remix/asr.js');
      const audioPath = await extractAudio({ inputPath: sourcePath!, workDir });
      if (audioPath) {
        const audioStat = await stat(audioPath);
        console.log(`   Audio: ${path.basename(audioPath)} (${(audioStat.size / 1024).toFixed(0)} KB)`);
        if (!geminiKey) {
          console.warn('⚠️  GEMINI_API_KEY không có — bỏ qua bước gọi Gemini ASR');
        } else {
          console.log('   Gọi Gemini để nhận dạng giọng nói... (có thể mất 10-30s)');
          const asrResult = await transcribeToSrt(audioPath);
          if (asrResult.srt) {
            const lines = asrResult.srt.trim().split('\n').length;
            console.log(`✅ ASR + dịch OK! (${lines} dòng SRT)`);
            console.log('   Nội dung (200 ký tự đầu):');
            console.log('   ', asrResult.srt.slice(0, 200).replace(/\n/g, ' | '));
          } else {
            console.warn('⚠️  ASR trả về lỗi:', asrResult.error);
          }
        }
      } else {
        console.warn('⚠️  Không trích xuất được audio');
      }
    } catch (err) {
      console.error('❌ ASR thất bại:', (err as Error).message.slice(0, 200));
    }
  } else {
    console.log('\n⏭️  STEP 4: Video không có audio — bỏ qua ASR');
  }

  // ---- STEP 5: TTS provider ----
  console.log('\n🔊 STEP 5: Kiểm tra TTS provider...');
  try {
    const { getTtsProvider } = await import('../lib/remix/tts.js');
    const tts = getTtsProvider();
    if (tts) {
      console.log('✅ TTS provider ready:', (tts as any).constructor?.name ?? 'GoogleTtsProvider');
    } else {
      console.warn('❌ Không có TTS provider!');
      console.warn('   → Kiểm tra TTS_PROVIDER và GOOGLE_CLOUD_TTS_API_KEY trong .env.local');
    }
  } catch (err) {
    console.error('❌ TTS check thất bại:', (err as Error).message);
  }

  // ---- STEP 6: Effective Options ----
  console.log('\n⚙️  STEP 6: Effective options (từ preset)...');
  const effectiveOptions: any = {
    voiceName: preset.voice_name,
    blurOriginalSub: preset.blur_original_sub,
    blurRegion: preset.blur_region ?? null,
    targetLanguage: preset.target_language,
    outputRatio: preset.output_ratio,
    vietsub: preset.auto_vietsub,
    dubMode: preset.dub_mode ?? (preset.auto_dub ? 'full' : 'none'),
    subPosition: preset.sub_position,
    subtitleConfig: {
      position: preset.sub_position,
      size: preset.sub_font_size,
      color: preset.sub_color,
      bold: preset.sub_bold,
    },
  };
  for (const [k, v] of Object.entries(effectiveOptions)) {
    const ok = v !== null && v !== undefined && v !== false;
    console.log(`   ${ok ? '✅' : '⚪'} ${k}: ${JSON.stringify(v)}`);
  }

  // ---- STEP 7: Blur logic ----
  console.log('\n🔲 STEP 7: Kiểm tra blur logic...');
  const shouldBlur = effectiveOptions.vietsub && effectiveOptions.blurOriginalSub !== false;
  console.log('   Sẽ blur sub gốc:', shouldBlur ? '✅ CÓ' : '❌ KHÔNG');
  if (shouldBlur) {
    const region = effectiveOptions.blurRegion ?? { x: 0, y: 0.82, w: 1, h: 0.18 };
    console.log('   Vùng blur (normalized):', JSON.stringify(region));
    if (videoInfo) {
      const px = Math.round(region.x * videoInfo.width);
      const py = Math.round(region.y * videoInfo.height);
      const pw = Math.round(region.w * videoInfo.width);
      const ph = Math.round(region.h * videoInfo.height);
      console.log(`   Vùng blur (pixels): x=${px}, y=${py}, w=${pw}, h=${ph}`);
    }
  }

  // ---- Cleanup ----
  await rm(workDir, { recursive: true, force: true });

  console.log('\n══════════════════════════════════════════════');
  console.log('✅ TRACE HOÀN TẤT');
  console.log('══════════════════════════════════════════════\n');
}

main().catch(err => {
  console.error('\n💥 Fatal error:', err.message ?? err);
  process.exit(1);
});
