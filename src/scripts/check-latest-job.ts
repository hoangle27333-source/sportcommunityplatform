import { createClient } from '@supabase/supabase-js';

const db = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

async function check() {
  const { data, error } = await db
    .from('remix_jobs')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(1);

  if (error) {
    console.error('Error:', error);
    process.exit(1);
  }
  
  if (data?.length) {
    console.log('--- LATEST JOB ---');
    console.log('ID:', data[0].id);
    console.log('Status:', data[0].status);
    console.log('Error:', data[0].error_message);
    console.log('Output Data:', JSON.stringify(data[0].output_data, null, 2));
    console.log('Output URL:', data[0].output_url);
  } else {
    console.log('No jobs found.');
  }
}

check();
