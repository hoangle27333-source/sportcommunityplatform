import { createClient } from '@supabase/supabase-js';
import { config } from 'dotenv';
config({ path: '.env.local' });

async function run() {
  const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
  const { data, error } = await supabase
    .from('remix_jobs')
    .select('id, status, preset_id, options, created_at')
    .order('created_at', { ascending: false })
    .limit(3);
  console.log(JSON.stringify(error || data, null, 2));
}
run();
