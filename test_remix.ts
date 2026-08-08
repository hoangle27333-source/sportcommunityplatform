import { runRemixJob } from './src/lib/remix/remix-service';
import pino from 'pino';

async function run() {
  const logger = pino({ level: 'debug' });
  try {
    const res = await runRemixJob('21ece117-c9f9-4e95-b6c8-c09440510534', logger);
    console.log(res);
  } catch (e) {
    console.error(e);
  }
}
run();
