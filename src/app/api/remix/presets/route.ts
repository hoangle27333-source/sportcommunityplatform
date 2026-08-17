import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { requireUser, requireEditor, AuthError } from '@/lib/auth/require-user';

export const dynamic = 'force-dynamic';

const presetSchema = z.object({
  name: z.string().optional().transform(val => (val && val.trim() !== '' ? val.trim() : 'Default')),
  targetLanguage: z.string().default('vi'),
  voiceName: z.string().default('vi-VN-WaveNet-A'),
  speakingRate: z.coerce.number().min(0.25).max(4.0).default(1.0),
  subFont: z.string().default('Arial'),
  subFontSize: z.coerce.number().int().min(8).max(100).default(24),
  subColor: z.string().default('#FFFFFF'),
  subBgColor: z.string().default('#80000000'),
  subBold: z.boolean().default(false),
  subItalic: z.boolean().default(false),
  subOutline: z.coerce.number().int().min(0).max(10).default(2),
  subBorderStyle: z.coerce.number().int().min(0).max(4).default(3),
  subPosition: z.enum(['top', 'bottom', 'auto', 'custom']).default('auto'),
  subCustomY: z.coerce.number().min(0.05).max(0.9).default(0.78),
  subBackgroundBlur: z.boolean().default(false),
  subtitlePreset: z.enum(["tiktok_bold", "meme", "pop", "bubble", "neon", "clean"]).default("tiktok_bold"),
  subtitleAnimation: z.enum(["static", "word_highlight", "reveal_words"]).default("word_highlight"),
  subHighlightColor: z.string().default("#FFF200"),
  watermarkDefaults: z.record(z.unknown()).default({}),
  blurRegion: z.object({
    x: z.coerce.number(),
    y: z.coerce.number(),
    w: z.coerce.number(),
    h: z.coerce.number(),
  }).optional().nullable(),
  blurOriginalSub: z.boolean().default(true),
  autoDetectSubtitleRegion: z.boolean().default(false),
  bgVolume: z.coerce.number().min(0).max(1).default(0.3),
  outputFormat: z.string().default('mp4'),
  outputRatio: z.string().default('9:16'),
  outputCrf: z.coerce.number().int().min(1).max(51).default(18),
  introEnabled: z.boolean().default(false),
  introMediaId: z.string().optional().nullable().transform(val => (val && val.trim() !== '' ? val.trim() : null)),
  outroEnabled: z.boolean().default(false),
  outroMediaId: z.string().optional().nullable().transform(val => (val && val.trim() !== '' ? val.trim() : null)),
  autoVietsub: z.boolean().default(true),
  translateOnScreenText: z.boolean().default(false),
  onScreenTextPreset: z.enum(["meme", "pop", "bubble", "neon", "clean"]).default("meme"),
  onScreenTextFont: z.string().default("Anton"),
  onScreenTextSize: z.coerce.number().int().min(16).max(72).default(34),
  onScreenTextSizeMode: z.enum(["auto_fit", "fixed"]).default("auto_fit"),
  onScreenTextColor: z.string().default("#FFFFFF"),
  onScreenTextBgColor: z.string().default("#000000"),
  onScreenTextBackgroundStyle: z.enum(["solid", "blur"]).default("solid"),
  onScreenTextBackgroundOpacity: z.coerce.number().min(0).max(1).default(0.72),
  onScreenTextOutlineColor: z.string().default("#000000"),
  onScreenTextOutlineWidth: z.coerce.number().min(0).max(10).default(2),
  onScreenTextBold: z.boolean().default(true),
  onScreenTextItalic: z.boolean().default(false),
  autoDub: z.boolean().default(false),
  dubMode: z.enum(['none', 'full', 'preserve_bgm', 'heygen']).default('none'),
});

// GET: list all presets
export async function GET(_req: NextRequest) {
  try {
    const { db } = await requireUser();
    const { data, error } = await db
      .from('remix_presets')
      .select('*')
      .order('created_at', { ascending: false });
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ presets: data });
  } catch (e) { return handleError(e); }
}

// POST: create preset
export async function POST(req: NextRequest) {
  try {
    const { db, user } = await requireEditor();
    const body = presetSchema.parse(await req.json());
    const insertPayload: Record<string, any> = {
      org_id: user.id, // use user.id as org_id for single-tenant
      name: body.name,
      target_language: body.targetLanguage,
      voice_name: body.voiceName,
      speaking_rate: body.speakingRate,
      sub_font: body.subFont,
      sub_font_size: body.subFontSize,
      sub_color: body.subColor,
      sub_bg_color: body.subBgColor,
      sub_bold: body.subBold,
      sub_italic: body.subItalic,
      sub_outline: body.subOutline,
      sub_border_style: body.subBorderStyle,
      sub_background_blur: body.subBackgroundBlur,
      sub_position: body.subPosition,
      sub_custom_y: body.subCustomY,
      subtitle_preset: body.subtitlePreset,
      subtitle_animation: body.subtitleAnimation,
      sub_highlight_color: body.subHighlightColor,
      watermark_defaults: body.watermarkDefaults,
      blur_original_sub: body.blurOriginalSub,
      auto_detect_subtitle_region: body.autoDetectSubtitleRegion,
      blur_region: body.blurRegion ?? null,
      bg_volume: body.bgVolume,
      output_format: body.outputFormat,
      output_ratio: body.outputRatio,
      output_crf: body.outputCrf,
      intro_enabled: body.introEnabled,
      intro_media_id: body.introMediaId ?? null,
      outro_enabled: body.outroEnabled,
      outro_media_id: body.outroMediaId ?? null,
      auto_vietsub: body.autoVietsub,
      translate_on_screen_text: body.translateOnScreenText,
      on_screen_text_preset: body.onScreenTextPreset,
      on_screen_text_font: body.onScreenTextFont,
      on_screen_text_size: body.onScreenTextSize,
      on_screen_text_size_mode: body.onScreenTextSizeMode,
      on_screen_text_color: body.onScreenTextColor,
      on_screen_text_bg_color: body.onScreenTextBgColor,
      on_screen_text_background_style: body.onScreenTextBackgroundStyle,
      on_screen_text_background_opacity: body.onScreenTextBackgroundOpacity,
      on_screen_text_outline_color: body.onScreenTextOutlineColor,
      on_screen_text_outline_width: body.onScreenTextOutlineWidth,
      on_screen_text_bold: body.onScreenTextBold,
      on_screen_text_italic: body.onScreenTextItalic,
      auto_dub: body.dubMode !== 'none',
      dub_mode: body.dubMode,
    };

    const { data, error } = await db
      .from('remix_presets')
      .insert(insertPayload)
      .select('*')
      .single();

    if (error || !data) return NextResponse.json({ error: error?.message ?? 'Lưu preset thất bại.' }, { status: 500 });
    return NextResponse.json({ preset: data }, { status: 201 });
  } catch (e) { return handleError(e); }
}

function handleError(e: unknown) {
  if (e instanceof AuthError) return NextResponse.json({ error: e.message }, { status: (e as any).status ?? 401 });
  if (e instanceof z.ZodError) {
    const msg = e.issues.map(i => `${i.path.join('.')}: ${i.message}`).join(', ');
    return NextResponse.json({ error: `Dữ liệu không hợp lệ: ${msg}`, issues: e.issues }, { status: 422 });
  }
  return NextResponse.json({ error: (e as Error).message ?? 'internal error' }, { status: 500 });
}
