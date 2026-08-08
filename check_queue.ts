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
  const waiting = await remixQueue.getWaiting();
  const delayed = await remixQueue.getDelayed();
  const failed = await remixQueue.getFailed();
  const completed = await remixQueue.getCompleted();

  console.log(`Active: ${active.length}`);
  console.log(`Waiting: ${waiting.length}`);
  console.log(`Delayed: ${delayed.length}`);
  console.log(`Failed: ${failed.length}`);
  console.log(`Completed: ${completed.length}`);
  
  if (active.length > 0) {
    console.log('Active jobs:', active.map(j => ({ id: j.id, data: j.data })));
  }
  
  await remixQueue.close();
}
run();
