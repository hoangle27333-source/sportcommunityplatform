import { createClient } from '@supabase/supabase-js';
import { config } from 'dotenv';
config({ path: '.env.local' });

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

async function run() {
  const { data } = await supabase.from('remix_jobs').select('*').eq('id', '21ece117-c9f9-4e95-b6c8-c09440510534').single();
  console.log(data);
}
run();
