import { createClient } from '@supabase/supabase-js';
import { Queue } from 'bullmq';
import Redis from 'ioredis';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const db = createClient(supabaseUrl, supabaseKey);

const connection = new Redis('redis://localhost:6379', { maxRetriesPerRequest: null });
const remixQueue = new Queue('remix', { connection });

async function run() {
  const { data: jobs, error } = await db
    .from('remix_jobs')
    .select('id, status')
    .eq('status', 'queued');
    
  if (error) {
    console.error('Error fetching jobs:', error);
    process.exit(1);
  }
  
  console.log(`Found ${jobs?.length} pending jobs`);
  
  for (const job of jobs || []) {
    console.log(`Re-queueing job ${job.id}`);
    await remixQueue.add(job.id, { remixJobId: job.id, isRevision: false }, {
      jobId: `remix:${job.id}:0`
    });
  }
  
  console.log('Done');
  process.exit(0);
}

run();
