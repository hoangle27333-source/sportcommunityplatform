import {createSocialScoutWorker} from './processors/social-scout';
import {closeQueues} from '@/lib/queue';
const worker=createSocialScoutWorker();
worker.on('ready',()=>console.log('[social-scout] Worker ready.'));
worker.on('error',error=>console.error('[social-scout]',error.message));
let closing=false;
async function close(){if(closing)return;closing=true;await worker.close();await worker.disconnect();await closeQueues();process.exit(0);}
process.on('SIGINT',()=>void close());process.on('SIGTERM',()=>void close());
