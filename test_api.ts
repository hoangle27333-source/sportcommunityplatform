import { config } from 'dotenv';
config({ path: '.env.local' });
import fetch from 'node-fetch';

async function run() {
  const url = 'http://localhost:3000/api/remix/presets/e0b18089-18f7-42c1-a632-73ecb6657617';
  const payload = {
    dubMode: 'full',
    voiceName: 'vi-VN-WaveNet-A',
    targetLanguage: 'vi',
  };
  
  // Wait, API requires authentication (AuthError)
  // Let me mock a fake user or just read the response. Since it's AuthError, it's hard to test via curl without a cookie.
}
run();
