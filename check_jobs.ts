import { createClient } from '@supabase/supabase-js';
import { config } from 'dotenv';
config({ path: '.env.local' });

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

async function run() {
  const { data, error } = await supabase
    .from('remix_jobs')
    .select('id, status, error, created_at, source_url, updated_at')
    .order('created_at', { ascending: false })
    .limit(3);
    
  if (error) console.error(error);
  else console.log(JSON.stringify(data, null, 2));
}
run();
