/** Recover Workflow dispatch using existing session IDs. No Redis producer. */
import dotenv from 'dotenv';
dotenv.config({path:'.env.local'});
const {recoverScoutSessions}=await import('../../src/lib/apify/workflow-maintenance');
console.log(await recoverScoutSessions());
