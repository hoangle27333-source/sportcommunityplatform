import {sessionSnapshot} from './session-snapshot';
import { createHash,randomUUID } from 'node:crypto';
import { createAdminClient } from '@/lib/supabase/admin';
import {ACTOR_CONTRACTS} from './registry';
import { PendingScout, ScoutError } from './errors';
export const ADAPTER_VERSION = '2';
export interface ProviderPlan { actor: string; input: Record<string, any>; }
export interface Provenance { actor: string; runId: string; datasetId: string; buildId: string; fetchedAt: string; adapterVersion: string; cached?: boolean; missingFields?:string[]; warnings?:string[]; }
export function stableJson(value: any): string {
  if (Array.isArray(value)) return '[' + value.map(stableJson).join(',') + ']';
  if (value && typeof value === 'object') return '{' + Object.keys(value).sort().filter(k => value[k] !== undefined).map(k => JSON.stringify(k) + ':' + stableJson(value[k])).join(',') + '}';
  return JSON.stringify(value);
}
export function inputKey(actor: string, build: string, task: string, input: any) {
  return createHash('sha256').update(stableJson({ actor, build, task, input, adapter: ADAPTER_VERSION })).digest('hex');
}
export function capabilityKey(plan: ProviderPlan, task: string) { return [plan.actor, task, plan.input.searchType || plan.input.resultsType || 'default'].join(':'); }
export async function apifyApi(path: string, body?: unknown) {
  if (!process.env.APIFY_TOKEN) throw new ScoutError('Apify is not configured.', 'NOT_CONFIGURED', 503);
  const res = await fetch(`https://api.apify.com/v2/${path}`, { method: body === undefined ? 'GET' : 'POST', headers: { Authorization: `Bearer ${process.env.APIFY_TOKEN}`, ...(body === undefined ? {} : { 'Content-Type': 'application/json' }) }, ...(body === undefined ? {} : { body: JSON.stringify(body) }), signal: AbortSignal.timeout(15000) }).catch(()=>{throw new ScoutError('Provider connection failed.','PROVIDER_UNAVAILABLE',502);});
  const payload = await res.json().catch(() => ({}));
  if (!res.ok) {
    let approvalUrl: string | undefined;
    try { const u = new URL(payload.error?.data?.approvalUrl); if (u.origin === 'https://console.apify.com' && u.pathname.startsWith('/actors/')) approvalUrl = u.href; } catch {}
    const code = res.status === 402 ? 'BILLING_REQUIRED' : res.status === 429 ? 'RATE_LIMITED' : res.status === 403 && payload.error?.type === 'full-permission-actor-not-approved' ? 'APPROVAL_REQUIRED' : res.status >= 500 ? 'PROVIDER_UNAVAILABLE' : 'PROVIDER_ERROR';
    throw new ScoutError(code === 'APPROVAL_REQUIRED' ? 'Approve this Actor in Apify Console before running it.' : `Scout provider returned HTTP ${res.status}`, code, res.status === 403 ? 403 : 502, approvalUrl);
  }
  return payload;
}
export function validateProviderItem(actor: string, task: string, item: any): boolean {
  if (!item || typeof item !== 'object' || Array.isArray(item)) return false;
  const contract=ACTOR_CONTRACTS[actor];
  if(!contract || !contract.tasks.includes(task) || contract.numericFields.some(k=>item[k]!=null && (typeof item[k]!=='number' || !Number.isFinite(item[k]) || item[k]<0))) return false;
  if(actor.includes('tiktok') && ['fans','followers'].some(k=>item.authorMeta?.[k]!=null && (typeof item.authorMeta[k]!=='number' || item.authorMeta[k]<0))) return false;
  if (task === 'comments') return typeof (item.text ?? item.commentText ?? item.comment ?? item.content) === 'string';
  if (actor.includes('instagram')) return ['username','url','profileUrl','ownerUsername','id'].some(k => typeof item[k] === 'string') && !['followersCount','likesCount','commentsCount'].some(k => item[k] != null && (typeof item[k] !== 'number' || item[k] < 0));
  if (actor.includes('tiktok')) return !!(item.authorMeta?.name || item.authorMeta?.uniqueId || item.uniqueId || item.webVideoUrl || item.profileUrl || item.username);
  return !!(item.url || item.facebookUrl || item.profileUrl || item.groupUrl) && !['followersCount','membersCount','likesCount'].some(k => item[k] != null && (typeof item[k] !== 'number' || item[k] < 0));
}
export function knownCharge(state: any): number | null {
  // Authenticated requests read runs owned by this integration. Apify documents
  // usageTotalUsd as the owner's total actual charge, including applicable fees.
  const amount=state.usageTotalUsd ?? state.chargedTotalUsd;
  if(typeof amount==='number' && Number.isFinite(amount) && amount>=0) return amount;
  return null;
}
export async function executePlan(sessionId: string, platform: string, task: string, plan: ProviderPlan): Promise<any[]> {
  const db = createAdminClient();
  const { data: session, error: se } = await db.from('scout_sessions').select('*').eq('id', sessionId).single(); if (se) throw se;
  if(session.runtime_version===1) {
    const legacyKey=JSON.stringify([platform,task,session.params?.keyword || session.params?.url || '',plan.actor]);
    const legacy=session.runs?.[legacyKey];
    if(!legacy?.id) throw new ScoutError('This legacy task cannot be identified safely. Start a new verified session.','LEGACY_SESSION',409);
    if(legacy.rows) return legacy.rows;
    const state=(await apifyApi(`actor-runs/${legacy.id}`)).data;
    if(!['SUCCEEDED','FAILED','ABORTED','TIMED-OUT'].includes(state.status)) throw new PendingScout();
    if(state.status!=='SUCCEEDED') throw new ScoutError(`Legacy provider run ${state.status.toLowerCase()}`,state.status);
    const input=await apifyApi(`key-value-stores/${state.defaultKeyValueStoreId}/records/INPUT`);
    if(stableJson(input)!==stableJson(plan.input)) throw new ScoutError('Legacy input differs from this task; no replacement paid run was started.','LEGACY_SESSION',409);
    const rows=await apifyApi(`datasets/${legacy.defaultDatasetId}/items?clean=true&format=json`);
    if(!Array.isArray(rows)) throw new ScoutError('Invalid legacy dataset.','SCHEMA_MISMATCH');
    const valid=rows.filter(r=>!r.error && validateProviderItem(plan.actor,task,r));
    const {error}=await db.from('scout_sessions').update({runs:{...session.runs,[legacyKey]:{...legacy,rows:valid}}}).eq('id',sessionId); if(error) throw error;
    return valid;
  }
  const key = capabilityKey(plan, task);
  const { data: capability, error: ce } = await db.from('scout_provider_capabilities').select('*').eq('capability_key', key).maybeSingle(); if (ce) throw ce;
  if (!session.verification && !capability?.verified) throw new ScoutError('This provider capability has not passed live verification.', 'CAPABILITY_UNVERIFIED', 503);
  const selectedBuild = session.verification ? session.params?.verificationBuild : capability?.build;
  if(!selectedBuild || ['latest','beta','stable'].includes(selectedBuild))throw new ScoutError('A verified immutable Actor build is required.', 'BUILD_UNVERIFIED', 503);
  const build=session.verification ? selectedBuild : await sessionSnapshot(sessionId,'providerBuilds',key,async()=>selectedBuild);
  if (!build || build === 'latest' || build === 'beta' || build === 'stable') throw new ScoutError('A verified immutable Actor build is required.', 'BUILD_UNVERIFIED', 503);
  const hash = inputKey(plan.actor, build, task, {...plan.input,...(session.verification && session.params?.memory ? {_verificationMemory:session.params.memory} : {})});
  const { data: existing, error: re } = await db.from('scout_provider_runs').select('*').eq('session_id',sessionId).eq('task_key',hash).maybeSingle(); if (re) throw re;
  let run = existing;
  if (run?.normalized_rows) return run.normalized_rows;
  if (!run && !session.params?.forceRefresh && !session.verification) {
    const { data: cache, error } = await db.from('scout_provider_cache').select('*').eq('cache_key',hash).gt('expires_at',new Date().toISOString()).maybeSingle(); if (error) throw error;
    if (cache) return cache.rows.map((r: any) => ({ ...r, _provenance: { ...r._provenance, cached: true } }));
  }
  if (!run) {
    const { data: reservation, error } = await db.rpc('reserve_scout_run', { p_session:sessionId,p_key:hash,p_cache:hash,p_actor:plan.actor,p_platform:platform,p_task:task,p_build:build,p_input:plan.input });
    if (error) throw new ScoutError(error.message.includes('BUDGET_EXHAUSTED') ? 'Scout budget exhausted.' : error.message, error.message.includes('BUDGET_EXHAUSTED') ? 'BUDGET_EXHAUSTED' : 'RESERVATION_FAILED', 409);
    run = reservation.run;
    if(run.normalized_rows)return run.normalized_rows.map((row:any)=>({...row,_provenance:{...row._provenance,cached:true}}));
    if (reservation.claimed) {
      // Persist before transmitting start; a lost response must never trigger another paid start.
      const { error: save } = await db.from('scout_provider_runs').update({state:'starting'}).eq('id',run.id); if (save) throw save;
      try {
        const started = (await apifyApi(`acts/${plan.actor}/runs?build=${encodeURIComponent(build)}&timeout=180&maxTotalChargeUsd=${run.reserved_usd}&restartOnError=false${session.verification && session.params?.memory ? `&memory=${session.params.memory}` : ''}${capability?.receipt?.pricingModel==='PAY_PER_RESULT' ? `&maxItems=${plan.input.resultsLimit || plan.input.maxProfilesPerQuery || plan.input.resultsPerPage || 1}` : ''}`,plan.input)).data;
        if(typeof started?.id!=='string' || !started.defaultDatasetId) throw new Error('Start response has no run identity.');
        const { error } = await db.from('scout_provider_runs').update({provider_run_id:started.id,dataset_id:started.defaultDatasetId,build_id:started.buildId,state:'running'}).eq('id',run.id); if (error) throw error;
        run = {...run,provider_run_id:started.id,dataset_id:started.defaultDatasetId,build_id:started.buildId,state:'running'};
      } catch (e) {
        if (e instanceof ScoutError && ['BILLING_REQUIRED','RATE_LIMITED','APPROVAL_REQUIRED','PROVIDER_ERROR'].includes(e.code)) {
          const {error} = await db.rpc('settle_scout_run',{p_run:run.id,p_state:`rejected:${e.code}`,p_amount:0,p_pricing:null,p_usage:null,p_events:null}); if(error) throw error;
          throw e;
        }
        await db.from('scout_provider_runs').update({state:'start-unknown'}).eq('id',run.id);
        throw new ScoutError('Provider start outcome is unknown. The reservation remains held; no new paid run will be started.', 'START_UNKNOWN', 409);
      }
    }
  }
  if(run.state?.startsWith('rejected:'))throw new ScoutError('Provider start was rejected. Start a new session after resolving the provider restriction.',run.state.slice('rejected:'.length),502);
  if(!run.provider_run_id && ['reserved','starting'].includes(run.state)) throw new PendingScout();
  if (!run.provider_run_id) throw new ScoutError('Provider start needs reconciliation; no duplicate run was started.', 'START_UNKNOWN',409);
  const state = (await apifyApi(`actor-runs/${run.provider_run_id}`)).data;
  if (!['SUCCEEDED','FAILED','ABORTED','TIMED-OUT'].includes(state.status)) throw new PendingScout();
  const {error: settlement} = await db.rpc('settle_scout_run',{p_run:run.id,p_state:state.status.toLowerCase(),p_amount:knownCharge(state),p_pricing:state.pricingInfo || null,p_usage:state.usageUsd || state.usage ? {usd:state.usageUsd,units:state.usage,totalUsd:state.usageTotalUsd} : null,p_events:state.chargedEventCounts || null}); if(settlement) throw settlement;
  if (state.status !== 'SUCCEEDED') throw new ScoutError(`Provider run ${state.status.toLowerCase()}`,state.status);
  const {data:fresh,error:readNormalized}=await db.from('scout_provider_runs').select('normalized_rows').eq('id',run.id).single();if(readNormalized)throw readNormalized;if(fresh?.normalized_rows)return fresh.normalized_rows;
  const datasetToken=randomUUID();
  const {data:claimedDataset,error:datasetClaim}=await db.from('scout_provider_runs').update({dataset_token:datasetToken,dataset_lease_until:new Date(Date.now()+120000).toISOString()}).eq('id',run.id).or(`dataset_lease_until.is.null,dataset_lease_until.lt.${new Date().toISOString()}`).select('id').maybeSingle();if(datasetClaim)throw datasetClaim;if(!claimedDataset)throw new PendingScout();
  const datasetHeartbeat=setInterval(()=>void db.from('scout_provider_runs').update({dataset_lease_until:new Date(Date.now()+120000).toISOString()}).eq('id',run.id).eq('dataset_token',datasetToken).then(({error})=>{if(error)console.error('[social-scout] Dataset lease renewal failed',error.code);}),30000);
  try {
  const ids = state.storageIds?.datasets || {default:run.dataset_id};
  const dataAliases = capability?.receipt?.dataAliases || ['default'];
  const warnings: string[] = []; const raw: any[] = []; const rows: any[] = [];
  const observedAt = state.finishedAt || new Date().toISOString();
  for (const alias of dataAliases) {
    const id = ids[alias] || (alias === 'default' ? run.dataset_id : null); if(!id) { warnings.push(`Missing dataset: ${alias}`); continue; }
    let offset=0;
    while(true) {
      const items = await apifyApi(`datasets/${id}/items?clean=true&format=json&offset=${offset}&limit=1000`);
      if(!Array.isArray(items)) throw new ScoutError('Invalid provider dataset.','SCHEMA_MISMATCH');
      raw.push(...(task==='comments' ? items.map(item=>({id:item.id || item.cid || item.commentId,text:item.text ?? item.commentText ?? item.comment ?? item.content,timestamp:item.timestamp || item.createTimeISO || item.createTime,error:item.error})) : items));
      for(const item of items) {
        if(item.error === 'no_items') continue;
        if(item.error || !validateProviderItem(plan.actor,task,item)) { warnings.push(item.error ? 'Provider item unavailable' : 'Provider schema mismatch'); continue; }
        const normalized=task==='comments' ? {id:item.id || item.cid || item.commentId,text:item.text ?? item.commentText ?? item.comment ?? item.content,timestamp:item.timestamp || item.createTimeISO || item.createTime} : item;
        rows.push({...normalized,_provenance:{actor:plan.actor,runId:run.provider_run_id,datasetId:id,buildId:state.buildId || run.build_id,fetchedAt:observedAt,adapterVersion:ADAPTER_VERSION}});
      }
      if(items.length<1000) break;
      offset+=items.length;
    }
  }
  if(raw.length && !rows.length && warnings.length) {
    const {error}=await db.from('scout_provider_runs').update({raw_rows:raw,warnings,state:'schema-mismatch'}).eq('id',run.id);if(error) throw error;
    throw new ScoutError('Provider output could not be validated.','SCHEMA_MISMATCH');
  }
  if(warnings.length)for(const row of rows)row._provenance.warnings=warnings;
  const {error: save} = await db.from('scout_provider_runs').update({normalized_rows:rows,raw_rows:raw,dataset_ids:ids,observed_at:observedAt,warnings}).eq('id',run.id).eq('dataset_token',datasetToken).select('id').single(); if(save) throw save;
  if(!warnings.length && !session.verification) {
    const ttl = task === 'profile-details' || task === 'comments' ? 86400000 : 3600000;
    const {error} = await db.from('scout_provider_cache').upsert({cache_key:hash,rows,provenance:{observedAt},expires_at:new Date(Date.now()+ttl).toISOString()}); if(error) throw error;
  }
  return rows;
  } finally {clearInterval(datasetHeartbeat);const {error}=await db.from('scout_provider_runs').update({dataset_token:null,dataset_lease_until:null}).eq('id',run.id).eq('dataset_token',datasetToken);if(error)throw error;}
}

/** Billing recovery also covers known runs whose session completed via public fallback. */
export async function reconcileProviderBilling(){
  const db=createAdminClient();
  const {data:runs,error}=await db.from('scout_provider_runs').select('id,provider_run_id').not('provider_run_id','is',null).is('actual_usd',null).in('state',['running','succeeded','failed','aborted','timed-out']).order('created_at',{ascending:true}).limit(20);if(error)throw error;
  for(const run of runs || []) {
    try {
      const state=(await apifyApi(`actor-runs/${run.provider_run_id}`)).data;
      if(!['SUCCEEDED','FAILED','ABORTED','TIMED-OUT'].includes(state?.status))continue;
      const {error}=await db.rpc('settle_scout_run',{p_run:run.id,p_state:state.status.toLowerCase(),p_amount:knownCharge(state),p_pricing:state.pricingInfo || null,p_usage:state.usageUsd || state.usage ? {usd:state.usageUsd,units:state.usage,totalUsd:state.usageTotalUsd} : null,p_events:state.chargedEventCounts || null});if(error)throw error;
    }catch(error:any){console.error('[social-scout] Billing reconciliation deferred',error.code || 'PROVIDER_UNAVAILABLE');}
  }
}
