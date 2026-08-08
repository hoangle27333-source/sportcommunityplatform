import { createClient } from '@supabase/supabase-js';
import { config } from 'dotenv';
config({ path: '.env.local' });

async function run() {
  const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
  const { data, error } = await supabase.rpc('execute_sql', { sql_query: "SELECT trigger_name FROM information_schema.triggers WHERE event_object_table = 'remix_presets'" });
  console.log(error || data);
}
run();
