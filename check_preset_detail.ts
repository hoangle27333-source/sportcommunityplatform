import { createClient } from '@supabase/supabase-js';
import { config } from 'dotenv';
config({ path: '.env.local' });

async function run() {
  const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
  const { data, error } = await supabase.from('remix_presets').select(
    'id, name, sub_font, sub_font_size, sub_position, sub_custom_y, subtitle_animation, subtitle_preset, auto_vietsub, dub_mode, auto_dub'
  ).order('updated_at', { ascending: false }).limit(5);
  console.log(JSON.stringify(error || data, null, 2));
}
run();
