import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { requireEditor, AuthError } from '@/lib/auth/require-user';

export const dynamic = 'force-dynamic';

const presetSchema = z.object({
  name: z.string().optional().transform(val => (val && val.trim() !== '' ? val.trim() : 'Default')),
  targetLanguage: z.string().optional(),
  voiceName: z.string().optional(),
  speakingRate: z.coerce.number().min(0.25).max(4.0).optional(),
  subFont: z.string().optional(),
  subFontSize: z.coerce.number().int().min(8).max(100).optional(),
  subColor: z.string().optional(),
  subBgColor: z.string().optional(),
  subBold: z.boolean().optional(),
  subItalic: z.boolean().optional(),
  subOutline: z.coerce.number().int().min(0).max(10).optional(),
  subBorderStyle: z.coerce.number().int().min(0).max(4).optional(),
  subPosition: z.string().optional(),
  blurRegion: z.object({
    x: z.coerce.number(),
    y: z.coerce.number(),
    w: z.coerce.number(),
    h: z.coerce.number(),
  }).optional().nullable(),
  blurOriginalSub: z.boolean().optional(),
  autoDetectSubtitleRegion: z.boolean().optional(),
  bgVolume: z.coerce.number().min(0).max(1).optional(),
  outputFormat: z.string().optional(),
  outputRatio: z.string().optional(),
  outputCrf: z.coerce.number().int().min(1).max(51).optional(),
  introEnabled: z.boolean().optional(),
  introMediaId: z.string().optional().nullable().transform(val => (val && val.trim() !== '' ? val.trim() : null)),
  outroEnabled: z.boolean().optional(),
  outroMediaId: z.string().optional().nullable().transform(val => (val && val.trim() !== '' ? val.trim() : null)),
  autoVietsub: z.boolean().optional(),
  autoDub: z.boolean().optional(),
  dubMode: z.enum(['none', 'full', 'preserve_bgm']).optional(),
});

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { db } = await requireEditor();
    const { id } = await params;
    const body = presetSchema.parse(await req.json());
    
    const updateData: any = {};
    if (body.name !== undefined) updateData.name = body.name;
    if (body.targetLanguage !== undefined) updateData.target_language = body.targetLanguage;
    if (body.voiceName !== undefined) updateData.voice_name = body.voiceName;
    if (body.speakingRate !== undefined) updateData.speaking_rate = body.speakingRate;
    if (body.subFont !== undefined) updateData.sub_font = body.subFont;
    if (body.subFontSize !== undefined) updateData.sub_font_size = body.subFontSize;
    if (body.subColor !== undefined) updateData.sub_color = body.subColor;
    if (body.subBgColor !== undefined) updateData.sub_bg_color = body.subBgColor;
    if (body.subBold !== undefined) updateData.sub_bold = body.subBold;
    if (body.subItalic !== undefined) updateData.sub_italic = body.subItalic;
    if (body.subOutline !== undefined) updateData.sub_outline = body.subOutline;
    if (body.subBorderStyle !== undefined) updateData.sub_border_style = body.subBorderStyle;
    if (body.subPosition !== undefined) updateData.sub_position = body.subPosition;
    if (body.blurOriginalSub !== undefined) updateData.blur_original_sub = body.blurOriginalSub;
    if (body.blurRegion !== undefined) updateData.blur_region = body.blurRegion;
    if (body.autoDetectSubtitleRegion !== undefined) updateData.auto_detect_subtitle_region = body.autoDetectSubtitleRegion;
    if (body.bgVolume !== undefined) updateData.bg_volume = body.bgVolume;
    if (body.outputFormat !== undefined) updateData.output_format = body.outputFormat;
    if (body.outputRatio !== undefined) updateData.output_ratio = body.outputRatio;
    if (body.outputCrf !== undefined) updateData.output_crf = body.outputCrf;
    if (body.introEnabled !== undefined) updateData.intro_enabled = body.introEnabled;
    if (body.introMediaId !== undefined) updateData.intro_media_id = body.introMediaId;
    if (body.outroEnabled !== undefined) updateData.outro_enabled = body.outroEnabled;
    if (body.outroMediaId !== undefined) updateData.outro_media_id = body.outroMediaId;
    if (body.autoVietsub !== undefined) updateData.auto_vietsub = body.autoVietsub;
    if (body.autoDub !== undefined) updateData.auto_dub = body.autoDub;
    if (body.dubMode !== undefined) {
      updateData.dub_mode = body.dubMode;
      updateData.auto_dub = body.dubMode !== 'none';
    }

    const { data, error } = await db
      .from('remix_presets')
      .update(updateData)
      .eq('id', id)
      .select('*')
      .single();

    if (error || !data) return NextResponse.json({ error: error?.message ?? 'Cập nhật preset thất bại.' }, { status: 500 });
    return NextResponse.json({ preset: data });
  } catch (e) {
    return handleError(e);
  }
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { db } = await requireEditor();
    const { id } = await params;
    
    const { error } = await db
      .from('remix_presets')
      .delete()
      .eq('id', id);

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ success: true });
  } catch (e) {
    return handleError(e);
  }
}

function handleError(e: unknown) {
  if (e instanceof AuthError) return NextResponse.json({ error: e.message }, { status: (e as any).status ?? 401 });
  if (e instanceof z.ZodError) {
    const msg = e.issues.map(i => `${i.path.join('.')}: ${i.message}`).join(', ');
    return NextResponse.json({ error: `Dữ liệu không hợp lệ: ${msg}`, issues: e.issues }, { status: 422 });
  }
  return NextResponse.json({ error: (e as Error).message ?? 'internal error' }, { status: 500 });
}
