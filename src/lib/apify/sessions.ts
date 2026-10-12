import { ENTITY_TYPES } from './account-evidence';
import { buildSearchPlan } from './search-plan';
import { canonicalScopes } from './geography';
import {explainSavedProviderWarnings} from './provider-warnings';
import {scoutOutcome} from './scout-outcome';
import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { getServerUserRole } from '@/lib/auth/financial-sanitizer';
import { ScoutError } from './providers';
import { queryGeographyConflict } from './discovery-quality';
import { dispatchScoutSession } from './workflow-dispatch';
import { z } from 'zod';
export const requestSchema = z.object({ assessmentRevision:z.literal(6).optional(), sizeMetric:z.enum(['followers','members']).optional(), maxFollowers:z.number().int().min(0).max(1000000000).optional(), minMembers:z.number().int().min(0).max(1000000000).optional(), maxMembers:z.number().int().min(0).max(1000000000).optional(), minFollowers:z.number().int().min(0).max(1000000000).optional(), entityTypes:z.array(z.enum(ENTITY_TYPES)).min(1).max(7).optional(), geographyMode:z.enum(['profile','profile-or-recent-posts']).optional(), accountPolicyVersion:z.literal(5).optional(), planHash:z.string().regex(/^[0-9a-f]{64}$/).optional(), maxSessionUsd:z.number().positive().max(100).optional(), parentSessionId:z.string().uuid().optional(), queryVariants:z.array(z.string().trim().min(1).max(100)).max(3).optional(), collectionMode: z.enum(['incremental', 'latest-30']).default('incremental'), channelUrls:z.array(z.string().url()).min(1).max(20).optional(), keyword: z.string().trim().min(1).max(300).optional(), targetType: z.enum(['Individual KOLs', 'Communities & Clubs']).default('Individual KOLs'), platform: z.union([z.enum(['Instagram', 'Facebook', 'TikTok']), z.array(z.enum(['Instagram', 'Facebook', 'TikTok'])).min(1).max(3).refine(values => new Set(values).size === values.length, 'Select each platform once.')]).default('Instagram'), geography: z.union([z.string().max(100), z.array(z.string().max(100)).min(1).max(4)]).default('Nationwide'), limit: z.number().int().min(1).max(50).default(5), searchMode: z.enum(['hashtag', 'keyword']).optional(), qualityMode:z.enum(['high-engagement','topic']).default('high-engagement'), minInteractions:z.number().int().min(1).max(1000000).default(100), minViews:z.number().int().min(1).max(1000000000).default(10000), recentDays:z.number().int().min(1).max(30).default(7), sport: z.union([z.string().max(100), z.array(z.string().max(100)).max(10)]).optional(), kolId: z.string().uuid().optional(), communityId: z.string().uuid().optional(), forceRefresh:z.boolean().default(false), ids:z.array(z.string().uuid()).min(1).max(50).optional(), entityType:z.enum(['kol','community']).optional(), trackedAccountId:z.string().uuid().optional(), url:z.string().url().optional(), selectedPostIds:z.array(z.string().uuid()).min(1).max(5).refine(ids=>new Set(ids).size===ids.length,'Select each post once.').optional(), uiContext: z.object({source:z.string().max(200)}).optional(), notes: z.string().max(5000).optional() }).superRefine((value,context)=>{
 const followers=value.minFollowers!==undefined || value.maxFollowers!==undefined;
 const members=value.minMembers!==undefined || value.maxMembers!==undefined;
 if(followers && members || value.sizeMetric==='members' && followers || value.sizeMetric==='followers' && members)context.addIssue({code:z.ZodIssueCode.custom,message:'Choose one audience metric.',path:['sizeMetric']});
 for(const [minimum,maximum,key] of [[value.minFollowers,value.maxFollowers,'maxFollowers'],[value.minMembers,value.maxMembers,'maxMembers']] as const)if(minimum!==undefined && maximum!==undefined && minimum>maximum)context.addIssue({code:z.ZodIssueCode.custom,message:'Maximum must be at least the minimum.',path:[key]});
 if(members && value.sizeMetric!=='members')context.addIssue({code:z.ZodIssueCode.custom,message:'Select Members for member thresholds.',path:['sizeMetric']});
});
export async function scoutReadAccess() { const user = await getServerUserRole(); if (!user.userId) throw new ScoutError('Please log in', 'UNAUTHORIZED', 401); return user.userId; }
export async function scoutAccess() { const user = await getServerUserRole(); if (!user.userId) throw new ScoutError('Please log in', 'UNAUTHORIZED', 401); if (!['admin','editor'].includes(user.role)) throw new ScoutError('Editor access required', 'FORBIDDEN', 403); return user.userId; }
export function scoutFailure(e: any) { return NextResponse.json({ success: false, error: e.name === 'ZodError' ? 'Invalid scout criteria' : e.message || 'Scout failed', code: e.code || 'SCOUT_ERROR', ...(e.approvalUrl ? {approvalUrl:e.approvalUrl} : {}) }, { status: e.status || (e.name === 'ZodError' ? 400 : 500) }); }
/** Kept for callers that resume an existing durable session. No Redis is used. */
export const enqueueScoutSession = dispatchScoutSession;
export async function startSession(kind: string, value: unknown) {
  const owner = await scoutAccess();
  if(!['preview','trends','kol-posts','community-posts','sync','tracked','comments','inspect'].includes(kind)) throw new ScoutError('Invalid scout task.','INVALID_TASK',400);
  const params:ReturnType<typeof requestSchema.parse> & {searchPlan?:Awaited<ReturnType<typeof buildSearchPlan>>;providerBuilds?:Record<string,string>} = requestSchema.parse(value);
  params.geography = canonicalScopes(params.geography);
  if(kind==='preview' && !params.planHash)throw new ScoutError('Review the search plan before starting this account search.','PLAN_REQUIRED',400);
  if (!params.planHash && params.queryVariants?.length && ((Array.isArray(params.platform) ? params.platform : [params.platform]).some(p=>p!=='Facebook') || !['preview','trends'].includes(kind) || (kind==='trends' && (params.searchMode || (params.keyword?.startsWith('#')?'hashtag':'keyword'))==='hashtag'))) throw new ScoutError('Query variants require Facebook profile or keyword search.', 'INVALID_QUERY', 400);
  if(kind==='sync' && (!params.ids || !params.entityType) || kind==='tracked' && !params.trackedAccountId || kind==='comments' && (!params.kolId || !params.selectedPostIds) || kind==='inspect' && !params.url) throw new ScoutError('Missing task parameters.','INVALID_TASK',400);
  if ((kind === 'preview' || kind === 'trends') && !params.keyword) throw new ScoutError('Enter a search query', 'INVALID_QUERY', 400);
  if (kind === 'preview' && Array.isArray(params.geography)) throw new ScoutError('Select one location', 'INVALID_QUERY', 400);
  if (kind === 'kol-posts' && !params.kolId || kind === 'community-posts' && !params.communityId) throw new ScoutError('Missing profile ID', 'INVALID_QUERY', 400);
  if(params.collectionMode==='latest-30' && kind!=='community-posts') throw new ScoutError('Latest-post sampling is available for communities only.','INVALID_TASK',400);
  if(params.keyword && typeof params.geography==='string' && queryGeographyConflict(params.keyword,params.geography)) throw new ScoutError('Query location conflicts with the selected geography.','GEOGRAPHY_CONFLICT',400);
  if(params.parentSessionId) { const {data:source,error:sourceError}=await createAdminClient().from('scout_sessions').select('kind,status,result').eq('id',params.parentSessionId).eq('owner_id',owner).single(); if(sourceError || !source || source.kind!==kind || source.status!=='complete' || source.result?.success===false) throw new ScoutError('Source search not found or not complete.','INVALID_SOURCE',409); }
  if(params.planHash && ['preview','trends'].includes(kind)) {
    const plan=await buildSearchPlan(kind as 'preview'|'trends',params);
    if(plan.hash!==params.planHash)throw new ScoutError('The search plan changed. Review the updated plan before starting.', 'PLAN_STALE',409);
    params.searchPlan=plan;
    params.providerBuilds=Object.assign({},...plan.sources.map(source=>source.builds));
  }
  const { data, error } = await createAdminClient().from('scout_sessions').insert({ owner_id: owner, kind, params, runtime_version:3,execution_engine:'workflow' }).select('id').single(); if (error) throw error;
  try { await enqueueScoutSession(data.id); } catch { /* Dispatch records infrastructure errors; the saved session remains recoverable. */ }
  return resumeSession(data.id, owner);
}
export async function resumeSession(id: string, owner: string) {
  const db = createAdminClient(); const { data: s, error } = await db.from('scout_sessions').select('*').eq('id', id).eq('owner_id', owner).single(); if (error || !s) throw new ScoutError('Scout session not found', 'NOT_FOUND', 404);
  let result=scoutOutcome(s.kind,s.params,s.result);
  if (result?.warnings?.includes('Provider item unavailable')) {
    const {data:runs,error:runError}=await db.from('scout_provider_runs').select('platform,raw_rows,warnings').eq('session_id',id);
    if(runError) throw runError;
    result={...result,warnings:explainSavedProviderWarnings(result.warnings,runs || [])};
  }
  if (s.status === 'complete' && result?.success!==false) return NextResponse.json({...result,sessionId:id,criteria:s.params,reviewDecisions:s.review_decisions || {},importedCandidateIds:s.progress?.importedCandidateIds || []});
  if (s.status === 'failed' || s.status==='complete' && result?.success===false) return NextResponse.json({...result,sessionId:id,criteria:s.params}, { status: result?.httpStatus || 502 });
  return NextResponse.json({success:true,pending:true,sessionId:id,progress:s.progress,status:s.status,warnings:s.warnings}, {status:202});
}
export { executeSession } from './session-executor';
