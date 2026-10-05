/** Read-only verification of remote runtime policy; never creates paid runs. */
import { createClient } from '@supabase/supabase-js';
import { createAdminClient } from '../../src/lib/supabase/admin';
import { writeFile } from 'node:fs/promises';
import assert from 'node:assert/strict';
const db = createAdminClient();
const anon = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {auth:{persistSession:false}});
const tables=['scout_budget_settings','scout_provider_capabilities','scout_provider_runs','scout_provider_cache','scout_usage_ledger','scout_watermarks','scout_comment_evidence'];
const checks=[];
for(const table of tables){
 const authorized=await db.from(table).select('*',{head:true,count:'exact'});assert.equal(authorized.error,null,`${table}: service role cannot read`);
 const denied=await anon.from(table).select('*').limit(1);assert.equal(denied.error?.code,'42501',`${table}: anonymous access must be denied`);
 checks.push({table,serviceRole:'pass',anonymous:'denied'});
}
const rpc=await anon.rpc('reserve_scout_run',{p_session:'00000000-0000-0000-0000-000000000001',p_key:'access-check',p_cache:'access-check',p_actor:'fixture',p_platform:'Instagram',p_task:'profiles',p_build:'fixture',p_input:{}});
assert.equal(rpc.error?.code,'42501','Anonymous reservation RPC must be denied');
const settings=await db.from('scout_budget_settings').select('session_usd,daily_usd,verification_usd,run_usd').single();assert.equal(settings.error,null);
const report={observedAt:new Date().toISOString(),checks,reservationRpc:'anonymous denied',settings:settings.data,paidRunsStarted:0};
await writeFile('artifacts/apify-runtime/remote-access-receipt.json',JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report,null,2));
