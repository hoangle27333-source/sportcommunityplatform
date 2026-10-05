import { NextRequest, NextResponse } from 'next/server';
import { getServerUserRole } from '@/lib/auth/financial-sanitizer';
import { createAdminClient } from '@/lib/supabase/admin';
import { ScoutError } from '@/lib/apify/errors';
import { scoutFailure } from '@/lib/apify/sessions';
import { z } from 'zod';
async function admin() {const user=await getServerUserRole();if(!user.userId || user.role!=='admin')throw new ScoutError('Administrator access required.','FORBIDDEN',403);return createAdminClient();}
export async function GET() {try {const db=await admin();const {data:settings,error}=await db.from('scout_budget_settings').select('*').single();if(error)throw error;
 const {data:runs,error:re}=await db.from('scout_provider_runs').select('session_id,provider_run_id,actor,platform,task,actual_usd,reserved_usd,state,budget_day,created_at').order('created_at',{ascending:false}).limit(1000);if(re)throw re;
 const {data:sessions,error:se}=await db.from('scout_sessions').select('id,kind,result,progress');if(se)throw se;
 const {data:audits,error:ae}=await db.from('kols').select('audience_audit');if(ae)throw ae;
 const usedIds=[...new Set((audits || []).flatMap(a=>a.audience_audit?.commentClassifications || []).map((c:any)=>c.evidenceId).filter((id:string)=>/^[0-9a-f-]{36}$/i.test(id)))];
 const {data:evidence,error:ee}=usedIds.length ? await db.from('scout_comment_evidence').select('id,provenance').in('id',usedIds) : {data:[],error:null};if(ee)throw ee;
 const summaries=(sessions || []).map(s=>{const own=(runs || []).filter(r=>r.session_id===s.id);const known=own.every(r=>r.actual_usd!==null);const spend=known ? own.reduce((n,r)=>n+Number(r.actual_usd),0) : null;const accepted=s.progress?.importedCandidateIds?.length || 0;const inserted=s.result?.counts?.inserted || s.result?.insertedCount || 0;const comments=s.result?.counts?.comments || 0;const used=(evidence || []).filter(e=>own.some(r=>r.provider_run_id===e.provenance?.runId)).length;return {sessionId:s.id,module:s.kind,actualUsd:spend,costPerAcceptedCandidate:spend!==null && accepted ? spend/accepted : null,costPerNewPost:spend!==null && inserted ? spend/inserted : null,commentsUsedInAudit:used,costPerCommentUsedInAudit:spend!==null && used ? spend/used : null,costPerCollectedComment:spend!==null && comments ? spend/comments : null};});
 return NextResponse.json({success:true,settings,runs,summaries,window:{maxRuns:1000,truncated:runs?.length===1000}});}catch(e){return scoutFailure(e);}}
export async function PUT(req:NextRequest) {try {const db=await admin();const settings=z.object({sessionUsd:z.number().positive().max(100),dailyUsd:z.number().positive().max(1000),verificationUsd:z.number().positive().max(100),enabled:z.boolean()}).parse(await req.json());const {error}=await db.rpc('update_scout_budget',{p_settings:settings});if(error)throw error;return NextResponse.json({success:true});}catch(e){return scoutFailure(e);}}
