/** Brave-only configuration. Dry-run unless --apply; never buys credit or changes administrative budgets. */
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {createAdminClient} from '../../src/lib/supabase/admin';
import {BRAVE_ADAPTER_REVISION,BRAVE_PRICING_REVISION,BRAVE_REQUEST_USD} from '../../src/lib/scout-experimental/brave';
const db=createAdminClient();
const pilot=JSON.parse(await readFile('docs/scout/brave-live-receipt.json','utf8'));
if(pilot.adapterRevision!==BRAVE_ADAPTER_REVISION || pilot.pricingRevision!==BRAVE_PRICING_REVISION || !pilot.accountVerified || pilot.requests>6)throw new Error('A verified bounded Brave receipt is required.');
const {data:budget,error}=await db.rpc('scout_brave_budget');if(error)throw error;
if(Number(budget.limitUsd)>4.5)throw new Error('Unexpected Brave budget policy.');
const rows=Object.entries(pilot.platforms).map(([platform,value]:[string,any])=>({provider:'brave',operation:'discovery',platform,revision:'brave-verified-20261013-1',verified:value.usableLeads>0 && value.requestsSucceeded===2,expires_at:'2027-10-13T00:00:00Z',total_units:10800,units_per_request:1,max_value_usd:BRAVE_REQUEST_USD,config:{paidSearch:true,adapterRevision:BRAVE_ADAPTER_REVISION,pricingRevision:BRAVE_PRICING_REVISION,receiptUrl:'https://api-dashboard.search.brave.com/app/subscriptions/active',...(value.usableLeads===0?{blockedReason:'Live Brave verification returned no usable account leads.'}:{})}}));
if(process.argv.includes('--apply'))for(const row of rows){
 const {data:previous,error}=await db.from('scout_trial_capabilities').select('id,used_units').eq('provider','brave').eq('operation','discovery').eq('platform',row.platform).maybeSingle();if(error)throw error;
 const {error:save}=await db.from('scout_trial_capabilities').upsert({...row,...(previous?{id:previous.id,used_units:previous.used_units}:{})},{onConflict:'provider,operation,platform'});if(save)throw save;
}
await mkdir('docs/scout',{recursive:true});
const receipt={applied:process.argv.includes('--apply'),budget,platforms:rows.map(({platform,verified})=>({platform,verified})),adminBudgetsChanged:false,observedAt:new Date().toISOString()};
if(receipt.applied)await writeFile('docs/scout/brave-activation-receipt.json',JSON.stringify(receipt,null,2)+'\n');
console.log(JSON.stringify(receipt));
