import {afterEach,describe,it,expect,vi} from 'vitest';
import {getRedisUrl,QUEUE_NAMES} from './index';
afterEach(()=>vi.unstubAllEnvs());
describe('queue connection configuration',()=>{
 it('isolates Scout while preserving other queues and falls back when unset',()=>{vi.stubEnv('REDIS_URL','redis://remote.example:6379');vi.stubEnv('SOCIAL_SCOUT_REDIS_URL','redis://127.0.0.1:6379');vi.stubEnv('VERCEL','');expect(getRedisUrl(QUEUE_NAMES.socialScout)).toBe('redis://127.0.0.1:6379');expect(getRedisUrl(QUEUE_NAMES.publish)).toBe('redis://remote.example:6379');vi.stubEnv('SOCIAL_SCOUT_REDIS_URL','');expect(getRedisUrl(QUEUE_NAMES.socialScout)).toBe('redis://remote.example:6379');});
 it('rejects local Scout Redis in deployment even if the general queue is external',()=>{vi.stubEnv('REDIS_URL','redis://remote.example:6379');vi.stubEnv('SOCIAL_SCOUT_REDIS_URL','redis://127.0.0.1:6379');vi.stubEnv('VERCEL','1');expect(()=>getRedisUrl(QUEUE_NAMES.socialScout)).toThrow('Configure an external REDIS_URL');});
 it('uses local Redis for local development without a configured URL',()=>{vi.stubEnv('REDIS_URL','');vi.stubEnv('VERCEL','');expect(getRedisUrl()).toBe('redis://127.0.0.1:6379');});
 it('uses the explicit producer/worker URL',()=>{vi.stubEnv('REDIS_URL','redis://redis.example:6379');expect(getRedisUrl()).toBe('redis://redis.example:6379');});
 it('requires an external URL in a deployed process',()=>{vi.stubEnv('REDIS_URL','redis://localhost:6379');vi.stubEnv('VERCEL','1');expect(()=>getRedisUrl()).toThrow('Configure an external REDIS_URL');});
});
