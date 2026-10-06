/** Bounded live content acceptance. Resume persisted sessions; never restart a paid run. */
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { createAdminClient } from '../../src/lib/supabase/admin';
import { providerPlans } from '../../src/lib/apify/providers';
import { capabilityKey } from '../../src/lib/apify/runtime';
import { executeSession } from '../../src/lib/apify/sessions';
const db = createAdminClient();
const output = 'artifacts/content-flows/runtime-receipt.json';
if (!process.argv.includes('--run')) throw new Error('Use --run to authorize the bounded live acceptance checks.');
await mkdir('artifacts/content-flows', { recursive: true });
let receipt: any = { recordedAt: new Date().toISOString(), checks: [] };
try { receipt = JSON.parse(await readFile(output, 'utf8')); } catch (error: any) { if (error.code !== 'ENOENT') throw error; }
const save = () => writeFile(output, JSON.stringify(receipt, null, 2) + '\n');
const { data: owner, error: ownerError } = await db.from('profiles').select('id').eq('role', 'admin').limit(1).single();
if (ownerError) throw ownerError;
for (const criteria of [
  { platform: ['Instagram'], searchMode: 'hashtag', keyword: '#chaybo', sport: ['Chạy bộ / Marathon'], geography: ['Toàn quốc'], limit: 5 },
  { platform: ['TikTok'], searchMode: 'keyword', keyword: 'cầu lông', sport: ['Cầu lông'], geography: ['Toàn quốc'], limit: 5 },
]) {
 const plan = providerPlans(criteria.platform[0], criteria.searchMode as 'hashtag' | 'keyword', criteria.keyword, criteria.limit)[0];
 const { data: capability, error: capabilityError } = await db.from('scout_provider_capabilities').select('verified,build').eq('capability_key', capabilityKey(plan, criteria.searchMode)).single();
 if (capabilityError || !capability?.verified) throw new Error('A verified content capability is required.');
 let check = receipt.checks.find((item: any) => item.platform === criteria.platform[0]);
 if (!check) {
  const { data, error } = await db.from('scout_sessions').insert({ owner_id: owner.id, kind: 'trends', verification: true, runtime_version: 2, params: { ...criteria, verificationBuild: capability.build, uiContext: { source: 'content-flow-acceptance' } } }).select('id').single();
  if (error) throw error;
  check = { platform: criteria.platform[0], sessionId: data.id, criteria }; receipt.checks.push(check); await save();
 }
 const deadline = Date.now() + 240000;
 while (await executeSession(check.sessionId)) { if (Date.now() > deadline) throw new Error(`Resume session ${check.sessionId}; no replacement run was started.`); await new Promise(resolve => setTimeout(resolve, 5000)); }
 const { data: session, error } = await db.from('scout_sessions').select('status,result').eq('id', check.sessionId).single(); if (error) throw error;
 const { data: runs, error: runError } = await db.from('scout_provider_runs').select('provider_run_id,build,state,actual_usd,reserved_usd').eq('session_id', check.sessionId); if (runError) throw runError;
 const ids = (session.result?.posts || []).map((post: any) => post.id);
 const persisted = ids.length ? await db.from('scouted_posts').select('id').in('id', ids) : { data: [], error: null }; if (persisted.error) throw persisted.error;
 Object.assign(check, { status: session.status, success: session.result?.success, counts: session.result?.counts, warnings: session.result?.warnings, error: session.result?.error, runs, persistedPosts: persisted.data?.length || 0 });
 await save(); console.log(JSON.stringify(check));
}
