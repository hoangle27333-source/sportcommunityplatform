import { createClient } from '@supabase/supabase-js';
import { config } from 'dotenv';
config({ path: '.env.local' });

async function run() {
  const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
  
  const updateData = {
    dub_mode: 'heygen',
  };
  
  const { data, error } = await supabase.from('remix_presets').update(updateData).eq('id', 'e0b18089-18f7-42c1-a632-73ecb6657617').select('*').single();
  console.log(error);
}
run();
