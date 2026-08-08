import { createClient } from '@supabase/supabase-js';
import { config } from 'dotenv';
config({ path: '.env.local' });

async function run() {
  const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
  // Check job 0178a2c2 result
  const { data, error } = await supabase
    .from('remix_jobs')
    .select('id, status, result_media_id, error, plan, created_at, updated_at')
    .eq('id', '0178a2c2-9bb6-49b0-b989-091d743a7b14')
    .single();
  if (data) {
    // Print without plan to keep it readable
    const { plan, ...rest } = data as any;
    console.log(JSON.stringify(rest, null, 2));
    // Print videoOps from plan
    if (plan?.videoOps) {
      const subOp = plan.videoOps.find((o: any) => o.op === 'subtitles');
      console.log('\n--- plan.videoOps subtitles op ---');
      console.log(JSON.stringify(subOp, null, 2));
    }
  } else {
    console.log(JSON.stringify(error, null, 2));
  }
}
run();
