import { createClient } from '@supabase/supabase-js';
const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
async function run() {
  const { data, error } = await db.rpc('get_enum_values', { enum_name: 'remix_status' });
  if (error) {
    const { data: jobs } = await db.from('remix_jobs').select('status').limit(10);
    console.log('Sample statuses:', new Set(jobs?.map(j => j.status)));
  } else {
    console.log(data);
  }
}
run();
