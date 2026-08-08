import { createClient } from '@supabase/supabase-js';
import { config } from 'dotenv';
config({ path: '.env.local' });

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

async function run() {
  const { data, error } = await supabase
    .from('remix_jobs')
    .update({ status: 'failed', error: 'Worker killed by system restart. Please retry.' })
    .eq('status', 'analyzing')
    .select();
    
  if (error) console.error(error);
  else console.log('Updated to failed:', data);
}
run();
