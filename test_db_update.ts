import { createClient } from '@supabase/supabase-js';
import { config } from 'dotenv';
config({ path: '.env.local' });

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

async function run() {
  const updateData = {
    name: "Test Update",
    sub_highlight_color: "#FFF200",
    watermark_defaults: {}
  };
  
  let { data, error } = await supabase.from('remix_presets').update(updateData).eq('id', '19ca4a41-0337-4e50-9219-fcaf5c5c6d19').select('*').single();
  
  if (error && error.message.includes('in the schema cache')) {
    const fallbackData: any = { ...updateData };
    delete fallbackData.sub_highlight_color;
    delete fallbackData.watermark_defaults;
    const retry = await supabase.from('remix_presets').update(fallbackData).eq('id', '19ca4a41-0337-4e50-9219-fcaf5c5c6d19').select('*').single();
    error = retry.error;
    data = retry.data;
  }
  
  console.log(error || "OK");
}
run();
