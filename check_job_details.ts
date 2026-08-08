import { Queue } from 'bullmq';
import { config } from 'dotenv';
config({ path: '.env.local' });

const connection = {
  host: process.env.REDIS_HOST || 'localhost',
  port: parseInt(process.env.REDIS_PORT || '6379'),
};

const remixQueue = new Queue('remix', { connection });

async function run() {
  const active = await remixQueue.getActive();
  if (active.length > 0) {
    const job = active[0];
    console.log('Job:', job.id);
    console.log('State:', await job.getState());
    console.log('Progress:', job.progress);
    console.log('FailedReason:', job.failedReason);
    console.log('Returnvalue:', job.returnvalue);
    console.log('Data:', job.data);
    const logs = await remixQueue.getJobLogs(job.id!);
    console.log('Logs:', logs);
  } else {
    console.log('No active jobs.');
  }
  await remixQueue.close();
}
run();
