import IORedis from 'ioredis';
import { config } from 'dotenv';
config({ path: '.env.local' });

async function run() {
  const url = process.env.REDIS_URL;
  console.log(`Testing Redis connection: ${url}`);
  const client = new IORedis(url!, { maxRetriesPerRequest: 3, connectTimeout: 5000, lazyConnect: true });
  try {
    await client.connect();
    
    // Check all bullmq keys
    const keys = await client.keys('bull:*');
    console.log(`Found ${keys.length} bull keys.`);
    
    const waitRemix = await client.llen('bull:remix:wait');
    const waitVideo = await client.llen('bull:video-render:wait');
    console.log(`bull:remix:wait length: ${waitRemix}`);
    console.log(`bull:video-render:wait length: ${waitVideo}`);

    if (keys.length > 0) {
      console.log('Sample keys:');
      console.log(keys.slice(0, 10));
    }
  } catch (e) {
    console.error(`❌ Redis ERROR: ${(e as Error).message}`);
  } finally {
    await client.quit();
  }
}
run();
