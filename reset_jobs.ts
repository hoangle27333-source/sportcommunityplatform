import { Queue } from 'bullmq';
import { createClient } from '@supabase/supabase-js';
import { config } from 'dotenv';
config({ path: '.env.local' });

const connection = {
  host: process.env.REDIS_HOST || 'localhost',
  port: parseInt(process.env.REDIS_PORT || '6379'),
};

const remixQueue = new Queue('remix', { connection });
const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

async function run() {
  const active = await remixQueue.getActive();
  console.log(`Active jobs: ${active.length}`);
  
  for (const job of active) {
    console.log(`Moving job ${job.id} back to waiting...`);
    await job.moveToFailed(new Error('System restart'), 'system', false);
    await job.retry();
    
    // reset supabase status to pending
    const remixJobId = job.data.remixJobId;
    if (remixJobId) {
      await supabase.from('remix_jobs').update({ status: 'pending', error: null }).eq('id', remixJobId);
      console.log(`Reset Supabase job ${remixJobId} to pending`);
    }
  }
  
  await remixQueue.close();
}
run();
