import {scoutOutcome} from './scout-outcome';
import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { getServerUserRole } from '@/lib/auth/financial-sanitizer';
import { ScoutError, PendingScout } from './providers';
import { previewDiscoveryCandidates, scoutMarketTrends, scoutSingleKolPosts, scoutSingleCommunityPosts } from './scout';
import { enqueue, QUEUE_NAMES } from '@/lib/queue';
import { queryGeographyConflict } from './discovery-quality';
import { executeExtendedSession } from './tasks';
import { z } from 'zod';
import { randomUUID } from 'node:crypto';
const requestSchema = z.object({ keyword: z.string().trim().min(1).max(300).optional(), targetType: z.enum(['Individual KOLs', 'Communities & Clubs']).default('Individual KOLs'), platform: z.union([z.enum(['Instagram', 'Facebook', 'TikTok']), z.array(z.enum(['Instagram', 'Facebook', 'TikTok'])).min(1).max(3)]).default('Instagram'), geography: z.union([z.string().max(100), z.array(z.string().max(100)).max(4)]).default('Nationwide'), limit: z.number().int().min(1).max(50).default(5), searchMode: z.enum(['hashtag', 'keyword']).optional(), sport: z.union([z.string().max(100), z.array(z.string().max(100)).max(10)]).optional(), kolId: z.string().uuid().optional(), communityId: z.string().uuid().optional(), forceRefresh:z.boolean().default(false), ids:z.array(z.string().uuid()).min(1).max(50).optional(), entityType:z.enum(['kol','community']).optional(), trackedAccountId:z.string().uuid().optional(), url:z.string().url().optional(), selectedPostIds:z.array(z.string().uuid()).min(1).max(5).refine(ids=>new Set(ids).size===ids.length,'Select each post once.').optional(), uiContext: z.object({source:z.string().max(200)}).optional(), notes: z.string().max(5000).optional() });
export async function scoutReadAccess() { const user = await getServerUserRole(); if (!user.userId) throw new ScoutError('Please log in', 'UNAUTHORIZED', 401); return user.userId; }
export async function scoutAccess() { const user = await getServerUserRole(); if (!user.userId) throw new ScoutError('Please log in', 'UNAUTHORIZED', 401); if (!['admin','editor'].includes(user.role)) throw new ScoutError('Editor access required', 'FORBIDDEN', 403); return user.userId; }
export function scoutFailure(e: any) { return NextResponse.json({ success: false, error: e.name === 'ZodError' ? 'Invalid scout criteria' : e.message || 'Scout failed', code: e.code || 'SCOUT_ERROR', ...(e.approvalUrl ? {approvalUrl:e.approvalUrl} : {}) }, { status: e.status || (e.name === 'ZodError' ? 400 : 500) }); }
export async function enqueueScoutSession(id: string) {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    await Promise.race([
      enqueue(QUEUE_NAMES.socialScout,'session',{sessionId:id},{jobId:id,attempts:180,backoff:{type:'scout',delay:5000},removeOnComplete:true,removeOnFail:true}),
      new Promise<never>((_,reject)=>{timer=setTimeout(()=>reject(new Error('Scout queue connection timed out.')),3000);}),
    ]);
  } finally {if(timer)clearTimeout(timer);}
}
export async function startSession(kind: string, value: unknown) {
  const owner = await scoutAccess();
  if(!['preview','trends','kol-posts','community-posts','sync','tracked','comments','inspect'].includes(kind)) throw new ScoutError('Invalid scout task.','INVALID_TASK',400);
  const params = requestSchema.parse(value);
  if(kind==='sync' && (!params.ids || !params.entityType) || kind==='tracked' && !params.trackedAccountId || kind==='comments' && (!params.kolId || !params.selectedPostIds) || kind==='inspect' && !params.url) throw new ScoutError('Missing task parameters.','INVALID_TASK',400);
  if ((kind === 'preview' || kind === 'trends') && !params.keyword) throw new ScoutError('Enter a search query', 'INVALID_QUERY', 400);
  if (kind === 'preview' && (Array.isArray(params.platform) || Array.isArray(params.geography))) throw new ScoutError('Select one platform and location', 'INVALID_QUERY', 400);
  if (kind === 'kol-posts' && !params.kolId || kind === 'community-posts' && !params.communityId) throw new ScoutError('Missing profile ID', 'INVALID_QUERY', 400);
  if(params.keyword && typeof params.geography==='string' && queryGeographyConflict(params.keyword,params.geography)) throw new ScoutError('Query location conflicts with the selected geography.','GEOGRAPHY_CONFLICT',400);
  const { data, error } = await createAdminClient().from('scout_sessions').insert({ owner_id: owner, kind, params, runtime_version:2 }).select('id').single(); if (error) throw error;
  try { await enqueueScoutSession(data.id); } catch {const {error}=await createAdminClient().from('scout_sessions').update({warnings:['Waiting for the worker queue to recover.']}).eq('id',data.id);if(error)throw error;}
  return resumeSession(data.id, owner);
}
export async function resumeSession(id: string, owner: string) {
  const db = createAdminClient(); const { data: s, error } = await db.from('scout_sessions').select('*').eq('id', id).eq('owner_id', owner).single(); if (error || !s) throw new ScoutError('Scout session not found', 'NOT_FOUND', 404);
  const result=scoutOutcome(s.kind,s.params,s.result);
  if (s.status === 'complete' && result?.success!==false) return NextResponse.json({...result,sessionId:id,criteria:s.params,importedCandidateIds:s.progress?.importedCandidateIds || []});
  if (s.status === 'failed' || s.status==='complete' && result?.success===false) return NextResponse.json({...result,sessionId:id,criteria:s.params}, { status: result?.httpStatus || 502 });
  return NextResponse.json({success:true,pending:true,sessionId:id,progress:s.progress,status:s.status,warnings:s.warnings}, {status:202});
}
export async function executeSession(id: string) {
  const db=createAdminClient(); const {data:s,error}=await db.from('scout_sessions').select('*').eq('id',id).single(); if(error) throw error;
  if(['complete','failed'].includes(s.status)) return false;
  if(s.next_poll_at && Date.parse(s.next_poll_at)>Date.now()) return true;
  const now=new Date().toISOString(); const leaseToken=randomUUID();
  const {data:claim,error:claimError}=await db.from('scout_sessions').update({lease_until:new Date(Date.now()+120000).toISOString(),status:'running',lease_token:leaseToken,warnings:(s.warnings || []).filter((warning:string)=>warning!=='Waiting for the worker queue to recover.')}).eq('id',id).in('status',['pending','running']).or(`lease_until.is.null,lease_until.lt.${now}`).select('id').maybeSingle(); if(claimError) throw claimError; if(!claim) return true;
  const heartbeat=setInterval(()=>void db.from('scout_sessions').update({lease_until:new Date(Date.now()+120000).toISOString()}).eq('id',id).eq('lease_token',leaseToken).then(({error})=>{if(error) console.error('[social-scout] Lease renewal failed',error.code);}),30000);
  try {
    const {data:profile,error:roleError}=await db.from('profiles').select('role').eq('id',s.owner_id).single(); if(roleError || !['admin','editor'].includes(profile?.role)) throw new ScoutError('Editor access required.','FORBIDDEN',403);
    const p={...s.params,sessionId:id}; let result:any;
    if(s.kind==='preview') result=await previewDiscoveryCandidates(p);
    else if(s.kind==='trends') result=await scoutMarketTrends(p);
    else if(s.kind==='kol-posts') result=await scoutSingleKolPosts(p.kolId,p.limit,p.platform,id);
    else if(s.kind==='community-posts') result=await scoutSingleCommunityPosts(p.communityId,p.limit,p.platform,id);
    else result=await executeExtendedSession(s);
    const {data:runs,error:runError}=await db.from('scout_provider_runs').select('warnings,state,observed_at').eq('session_id',id); if(runError) throw runError;
    const runWarnings=(runs || []).flatMap(r=>r.warnings || []);
    const evidence=[...(result.candidates || []),...(result.posts || []),...(result.updatedRecords || []),...(result.data ? [result.data] : [])];
    const warnings=[...new Set([...runWarnings,...evidence.flatMap(e=>e.provenance?.warnings || e.scout_provenance?.warnings || [])])] as string[];
    const sourceFreshness=[...new Set([...(runs || []).map(r=>r.observed_at),...evidence.map(e=>e.provenance?.fetchedAt || e.scout_provenance?.fetchedAt)].filter(Boolean))];
    const coverage={tasks:(runs || []).length,completedTasks:(runs || []).filter(r=>r.state==='succeeded').length,warningCount:warnings.length,cachedEvidence:evidence.filter(e=>e.provenance?.cached).length,missingFields:evidence.flatMap(e=>e.missingMetrics || e.provenance?.missingFields || [])};
    result={...result,progress:{stage:'complete'},coverage,counts:result.counts || {found:result.totalFound || 0,excluded:result.excludedCount || 0},sessionId:id,partial:!!result.partial || warnings.length>0,warnings:[...(result.warnings || []),...warnings],sourceFreshness};
    const outcome=result.success===false ? 'failed' : 'complete';
    const {error:save}=await db.from('scout_sessions').update({status:outcome,result,warnings:result.warnings,lease_until:null,lease_token:null,progress:{stage:outcome}}).eq('id',id).eq('lease_token',leaseToken); if(save) throw save;
    return false;
  } catch(e:any) {
    const transient=e instanceof PendingScout || ['RATE_LIMITED','PROVIDER_UNAVAILABLE'].includes(e.code) || e.name==='TimeoutError';
    const age=Date.now()-Date.parse(s.created_at);
    if(transient && age<15*60000) {
      const attempts=(s.progress?.polls || 0)+1;
      const {error}=await db.from('scout_sessions').update({lease_until:null,lease_token:null,progress:{stage:'running',polls:attempts},next_poll_at:new Date(Date.now()+Math.min(30000,5000*attempts)).toISOString()}).eq('id',id).eq('lease_token',leaseToken); if(error) throw error;
      return true;
    }
    const {error}=await db.from('scout_sessions').update({status:'failed',warnings:[],lease_until:null,lease_token:null,result:{success:false,error:e.message,code:e.code || 'SCOUT_ERROR',httpStatus:e.status || 502,...(e.approvalUrl ? {approvalUrl:e.approvalUrl} : {})}}).eq('id',id).eq('lease_token',leaseToken); if(error) throw error;
    return false;
  } finally { clearInterval(heartbeat); }
}
