import { createClient } from '@supabase/supabase-js';
import { config } from 'dotenv';
config({ path: '.env.local' });

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

async function run() {
  const insertPayload = {
    org_id: "00000000-0000-0000-0000-000000000000",
    name: "Test",
    target_language: "vi",
    voice_name: "vi-VN-WaveNet-A",
    speaking_rate: 1.0,
    sub_font: "Arial",
    sub_font_size: 24,
    sub_color: "#ffffff",
    sub_bg_color: "#000000",
    sub_bold: false,
    sub_italic: false,
    sub_outline: 2,
    sub_border_style: 3,
    sub_position: "auto",
    subtitle_preset: "tiktok_bold",
    subtitle_animation: "word_highlight",
    sub_highlight_color: "#FFF200",
    watermark_defaults: {},
    blur_original_sub: false,
    auto_detect_subtitle_region: false,
    blur_region: null,
    bg_volume: 0.3,
    output_format: "mp4",
    output_ratio: "9:16",
    output_crf: 18,
    intro_enabled: false,
    intro_media_id: null,
    outro_enabled: false,
    outro_media_id: null,
    auto_vietsub: false,
    translate_on_screen_text: false,
    on_screen_text_preset: "meme",
    on_screen_text_font: "Impact",
    on_screen_text_size: 34,
    on_screen_text_color: "#ffffff",
    on_screen_text_bg_color: "#000000",
    on_screen_text_outline_color: "#000000",
    on_screen_text_bold: true,
    auto_dub: false,
    dub_mode: "none"
  };
  
  const { data, error } = await supabase.from('remix_presets').insert(insertPayload).select('*');
  console.log(error || "OK");
}
run();
