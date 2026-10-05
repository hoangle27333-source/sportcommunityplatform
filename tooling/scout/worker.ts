/** Enqueue/recover durable sessions; the social-scout worker executes them. */
import dotenv from 'dotenv';
dotenv.config({path:'.env.local'});
const {reconcileScoutSessions}=await import('../../src/worker/processors/social-scout');
const {closeQueues}=await import('../../src/lib/queue');
try {await reconcileScoutSessions();console.log('Scout sessions reconciled. Run the core worker to execute queued tasks.');}finally{await closeQueues();}
